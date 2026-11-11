-- PREVIEW ONLY — motor transaccional base de devoluciones.
-- Orden requerido: aplicar 202611090002_inventory_lots_returns_compat.sql,
-- después 202611090003_returns_register_fefo_auth.sql y finalmente esta migración.
-- Así, la anulación de notas de venta ya queda conectada al wrapper FEFO antes de
-- convertir este escritor en una función interna sin EXECUTE para authenticated.
-- No aplicar en producción sin validación funcional y respaldo.
BEGIN;

-- Fallar antes de crear la RPC si el esquema o las funciones de identidad no coinciden.
DO $schema_guard$
DECLARE
  v_missing text;
BEGIN
  IF to_regprocedure('public.mi_usuario_id()') IS NULL
     OR to_regprocedure('public.mi_empresa_id()') IS NULL
     OR to_regprocedure('public.mi_rol()') IS NULL
     OR to_regprocedure('public.mi_puede_ver_sucursal(integer)') IS NULL THEN
    RAISE EXCEPTION 'RETURNS_AUTH_PREREQUISITES_MISSING: faltan funciones de identidad o autorización';
  END IF;

  SELECT string_agg(format('%I.%I',r.table_name,r.column_name),', ' ORDER BY r.table_name,r.column_name)
    INTO v_missing
  FROM (VALUES
    ('comprobante','id'),('comprobante','empresa_id'),('comprobante','sucursal_id'),
    ('comprobante','cliente_id'),('comprobante','tipo'),('comprobante','estado'),
    ('comprobante_linea','id'),('comprobante_linea','comprobante_id'),
    ('comprobante_linea','producto_id'),('comprobante_linea','variante_id'),
    ('comprobante_linea','cantidad'),('comprobante_linea','subtotal'),('comprobante_linea','descuento'),
    ('comprobante_pago','comprobante_id'),('comprobante_pago','metodo_pago'),('comprobante_pago','monto'),
    ('caja','id'),('caja','sucursal_id'),('caja','usuario_id'),('caja','estado'),('caja','saldo_inicial'),
    ('caja_movimiento','caja_id'),('caja_movimiento','usuario_id'),('caja_movimiento','tipo'),
    ('caja_movimiento','metodo_pago'),('caja_movimiento','monto'),('caja_movimiento','motivo'),('caja_movimiento','comprobante_id'),
    ('producto_stock','producto_id'),('producto_stock','sucursal_id'),('producto_stock','empresa_id'),
    ('producto_stock','stock'),('producto_stock','updated_at'),
    ('producto_variante_stock','variante_id'),('producto_variante_stock','producto_id'),
    ('producto_variante_stock','sucursal_id'),('producto_variante_stock','empresa_id'),
    ('producto_variante_stock','stock'),('producto_variante_stock','updated_at'),
    ('movimiento_inventario','empresa_id'),('movimiento_inventario','sucursal_id'),
    ('movimiento_inventario','producto_id'),('movimiento_inventario','variante_id'),
    ('movimiento_inventario','comprobante_id'),('movimiento_inventario','usuario_id'),
    ('movimiento_inventario','tipo'),('movimiento_inventario','cantidad'),
    ('movimiento_inventario','stock_anterior'),('movimiento_inventario','stock_posterior'),('movimiento_inventario','motivo'),
    ('cuenta_cobrar','id'),('cuenta_cobrar','comprobante_id'),('cuenta_cobrar','empresa_id'),
    ('cuenta_cobrar','sucursal_id'),('cuenta_cobrar','saldo_pendiente'),('cuenta_cobrar','monto_revertido'),('cuenta_cobrar','estado'),('cuenta_cobrar','updated_at'),
    ('cliente','id'),('cliente','empresa_id'),('cliente','saldo_credito'),
    ('devolucion_venta','id'),('devolucion_venta','empresa_id'),('devolucion_venta','usuario_id'),
    ('devolucion_venta','caja_id'),('devolucion_venta','request_hash'),('devolucion_venta','idempotency_key'),
    ('devolucion_venta_linea','devolucion_id'),('devolucion_venta_linea','comprobante_linea_id'),
    ('devolucion_venta_linea','variante_id'),('devolucion_venta_linea','cantidad'),('devolucion_venta_linea','monto'),
    ('devolucion_venta_pago','devolucion_id'),('devolucion_venta_pago','metodo_pago'),('devolucion_venta_pago','monto')
  ) AS r(table_name,column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'RETURNS_SCHEMA_MISMATCH: faltan columnas requeridas: %',v_missing;
  END IF;
END
$schema_guard$;

-- El ledger de caja enlaza cada salida con la devolución que la originó.
ALTER TABLE public.caja_movimiento
  ADD COLUMN IF NOT EXISTS devolucion_venta_id bigint;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='fk_caja_movimiento_devolucion_venta_caja'
      AND conrelid='public.caja_movimiento'::regclass
  ) THEN
    ALTER TABLE public.caja_movimiento
      ADD CONSTRAINT fk_caja_movimiento_devolucion_venta_caja
      FOREIGN KEY (devolucion_venta_id,caja_id)
      REFERENCES public.devolucion_venta(id,caja_id) ON DELETE RESTRICT;
  END IF;
END
$fk$;

CREATE INDEX IF NOT EXISTS idx_caja_movimiento_devolucion_venta
  ON public.caja_movimiento(devolucion_venta_id)
  WHERE devolucion_venta_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pos_registrar_devolucion(
  p_comprobante_id integer,
  p_motivo text,
  p_lineas jsonb,
  p_pagos jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_usuario integer:=public.mi_usuario_id();
  v_empresa integer:=public.mi_empresa_id();
  v_motivo text:=left(btrim(coalesce(p_motivo,'')),500);
  v_key text:=btrim(coalesce(p_idempotency_key,''));
  v_hash text;
  v_existente record;
  v_venta record;
  v_caja record;
  v_original record;
  v_item jsonb;
  v_pago jsonb;
  v_linea_id integer;
  v_cantidad numeric(12,3);
  v_disponible numeric(12,3);
  v_importe_disponible numeric(12,2);
  v_importe numeric(12,2);
  v_total numeric(12,2):=0;
  v_credito numeric(12,2):=0;
  v_reembolso numeric(12,2):=0;
  v_total_pagos numeric(12,2):=0;
  v_efectivo numeric(12,2):=0;
  v_efectivo_disponible numeric(12,2):=0;
  v_caja_id integer;
  v_devolucion_id bigint;
  v_linea_devolucion_id bigint;
  v_reingresar boolean;
  v_stock numeric(12,3);
  v_nuevo_stock numeric(12,3);
  v_variante bigint;
  v_cuenta record;
BEGIN
  IF auth.uid() IS NULL OR v_usuario IS NULL OR v_empresa IS NULL
     OR public.mi_rol() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo un administrador vinculado puede registrar devoluciones' USING ERRCODE='42501';
  END IF;
  IF p_comprobante_id IS NULL OR length(v_motivo)<5
     OR v_key !~ '^[A-Za-z0-9._:-]{8,100}$'
     OR jsonb_typeof(p_lineas)<>'array' OR jsonb_array_length(p_lineas) NOT BETWEEN 1 AND 100
     OR jsonb_typeof(coalesce(p_pagos,'[]'::jsonb))<>'array'
     OR jsonb_array_length(coalesce(p_pagos,'[]'::jsonb))>4 THEN
    RAISE EXCEPTION 'Datos de devolución inválidos' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lineas) x
    GROUP BY x->>'comprobanteLineaId' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'No repita líneas en la misma devolución' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_pagos,'[]'::jsonb)) x
    WHERE coalesce(x->>'metodoPago','') NOT IN ('EFECTIVO','TARJETA','YAPE','PLIN')
       OR coalesce((x->>'monto')::numeric,0)<=0
       OR round((x->>'monto')::numeric,2)<>(x->>'monto')::numeric
       OR (x->>'metodoPago' IN ('YAPE','PLIN') AND length(btrim(coalesce(x->>'referencia','')))=0)
       OR length(coalesce(x->>'referencia',''))>120) THEN
    RAISE EXCEPTION 'Medio, monto o referencia de reembolso inválidos' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_pagos,'[]'::jsonb)) x
    GROUP BY x->>'metodoPago' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Consolide los importes de un mismo medio de reembolso' USING ERRCODE='22023';
  END IF;

  -- Canoniza el payload para que un reintento exacto no duplique caja ni stock.
  SELECT md5(jsonb_build_object(
    'comprobanteId',p_comprobante_id,'motivo',v_motivo,
    'lineas',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'comprobanteLineaId',(x->>'comprobanteLineaId')::integer,
      'cantidad',round((x->>'cantidad')::numeric,3),
      'reingresarStock',coalesce((x->>'reingresarStock')::boolean,true)
    ) ORDER BY (x->>'comprobanteLineaId')::integer),'[]'::jsonb) FROM jsonb_array_elements(p_lineas) x),
    'pagos',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'metodoPago',x->>'metodoPago','monto',round((x->>'monto')::numeric,2),
      'referencia',nullif(btrim(coalesce(x->>'referencia','')),'')
    ) ORDER BY x->>'metodoPago'),'[]'::jsonb) FROM jsonb_array_elements(coalesce(p_pagos,'[]'::jsonb)) x)
  )::text) INTO v_hash;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pos-return:'||v_empresa||':'||v_usuario||':'||v_key,0));
  SELECT id,request_hash INTO v_existente FROM public.devolucion_venta
  WHERE empresa_id=v_empresa AND usuario_id=v_usuario AND idempotency_key=v_key;
  IF FOUND THEN
    IF v_existente.request_hash<>v_hash THEN
      RAISE EXCEPTION 'La clave ya fue utilizada con otros datos; revise el historial' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('id',v_existente.id,'comprobanteId',p_comprobante_id,
      'reintento',true,'mensaje','La devolución ya estaba registrada.');
  END IF;

  SELECT c.id,c.empresa_id,c.sucursal_id,c.cliente_id,c.tipo,c.estado,c.total
    INTO v_venta
  FROM public.comprobante c
  WHERE c.id=p_comprobante_id AND c.empresa_id=v_empresa
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comprobante no encontrado' USING ERRCODE='P0002'; END IF;
  IF NOT public.mi_puede_ver_sucursal(v_venta.sucursal_id) THEN
    RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501';
  END IF;
  IF v_venta.tipo NOT IN ('01','03','NV') OR v_venta.estado='ANULADA' THEN
    RAISE EXCEPTION 'Solo se pueden devolver boletas o facturas vigentes' USING ERRCODE='22023';
  END IF;

  SELECT c.id,c.saldo_inicial INTO v_caja
  FROM public.caja c
  WHERE c.sucursal_id=v_venta.sucursal_id AND c.usuario_id=v_usuario AND c.estado='ABIERTA'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Abra una caja en la sucursal de la venta' USING ERRCODE='22023'; END IF;
  v_caja_id:=v_caja.id;

  -- Bloquea las líneas originales y calcula el importe restante sin permitir sobredevolución.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lineas) ORDER BY (value->>'comprobanteLineaId')::integer LOOP
    IF coalesce(v_item->>'comprobanteLineaId','') !~ '^[0-9]+$'
       OR coalesce(v_item->>'cantidad','') !~ '^[0-9]+([.][0-9]{1,3})?$' THEN
      RAISE EXCEPTION 'Línea o cantidad inválida' USING ERRCODE='22023';
    END IF;
    v_linea_id:=(v_item->>'comprobanteLineaId')::integer;
    v_cantidad:=(v_item->>'cantidad')::numeric;
    IF v_linea_id<=0 OR v_cantidad<=0 THEN RAISE EXCEPTION 'Cantidad inválida' USING ERRCODE='22023'; END IF;
    SELECT cl.id,cl.producto_id,cl.variante_id,cl.cantidad,cl.subtotal,cl.descuento,p.nombre
      INTO v_original
    FROM public.comprobante_linea cl
    JOIN public.producto p ON p.id=cl.producto_id AND p.empresa_id=v_empresa
    WHERE cl.id=v_linea_id AND cl.comprobante_id=p_comprobante_id
    FOR UPDATE OF cl;
    IF NOT FOUND THEN RAISE EXCEPTION 'La línea no pertenece al comprobante' USING ERRCODE='22023'; END IF;
    SELECT greatest(0,v_original.cantidad-coalesce(sum(dl.cantidad) FILTER (WHERE d.id IS NOT NULL),0)),
           greatest(0,v_original.subtotal-v_original.descuento-coalesce(sum(dl.monto) FILTER (WHERE d.id IS NOT NULL),0))
      INTO v_disponible,v_importe_disponible
    FROM public.devolucion_venta_linea dl
    JOIN public.devolucion_venta d ON d.id=dl.devolucion_id
    WHERE dl.comprobante_linea_id=v_linea_id AND d.empresa_id=v_empresa AND d.estado='REGISTRADA';
    IF v_cantidad>v_disponible+0.0001 THEN
      RAISE EXCEPTION 'La cantidad solicitada supera la disponible de la línea %',v_linea_id USING ERRCODE='22023';
    END IF;
    v_importe:=CASE WHEN abs(v_cantidad-v_disponible)<0.0001 THEN v_importe_disponible
      ELSE least(v_importe_disponible,round((v_original.subtotal-v_original.descuento)*v_cantidad/v_original.cantidad,2)) END;
    v_total:=v_total+v_importe;
  END LOOP;
  v_total:=round(v_total,2);
  IF v_total<=0 THEN RAISE EXCEPTION 'El importe a devolver debe ser mayor a cero' USING ERRCODE='22023'; END IF;

  SELECT coalesce(sum(cp.monto) FILTER(WHERE cp.metodo_pago='CREDITO'),0)
    INTO v_credito FROM public.comprobante_pago cp WHERE cp.comprobante_id=p_comprobante_id;
  SELECT cc.id,cc.saldo_pendiente INTO v_cuenta
  FROM public.cuenta_cobrar cc
  WHERE cc.comprobante_id=p_comprobante_id AND cc.empresa_id=v_empresa
    AND cc.sucursal_id=v_venta.sucursal_id FOR UPDATE;
  IF v_credito>0 AND NOT FOUND THEN
    RAISE EXCEPTION 'La venta tiene crédito sin cuenta por cobrar asociada' USING ERRCODE='23514';
  END IF;
  v_credito:=least(v_total,coalesce(v_cuenta.saldo_pendiente,0));
  v_reembolso:=round(v_total-v_credito,2);

  SELECT round(coalesce(sum((x->>'monto')::numeric),0),2),
         round(coalesce(sum((x->>'monto')::numeric) FILTER(WHERE x->>'metodoPago'='EFECTIVO'),0),2)
    INTO v_total_pagos,v_efectivo
  FROM jsonb_array_elements(coalesce(p_pagos,'[]'::jsonb)) x;
  IF v_total_pagos<>v_reembolso THEN
    RAISE EXCEPTION 'Los reembolsos deben sumar S/ %; el crédito se ajusta por S/ %',
      to_char(v_reembolso,'FM999999990.00'),to_char(v_credito,'FM999999990.00') USING ERRCODE='22023';
  END IF;

  IF v_efectivo>0 THEN
    SELECT round(coalesce(v_caja.saldo_inicial,0)
      +coalesce((SELECT sum(cp.monto) FROM public.comprobante_pago cp
        JOIN public.comprobante c ON c.id=cp.comprobante_id
        WHERE c.caja_id=v_caja_id AND cp.metodo_pago='EFECTIVO'),0)
      +coalesce((SELECT sum(c.total) FROM public.comprobante c
        WHERE c.caja_id=v_caja_id AND c.metodo_pago='EFECTIVO'
          AND NOT EXISTS(SELECT 1 FROM public.comprobante_pago cp WHERE cp.comprobante_id=c.id)),0)
      +coalesce((SELECT sum(CASE WHEN cm.tipo='INGRESO' THEN cm.monto ELSE -cm.monto END)
        FROM public.caja_movimiento cm WHERE cm.caja_id=v_caja_id AND cm.metodo_pago='EFECTIVO'),0),2)
    INTO v_efectivo_disponible;
    IF v_efectivo>v_efectivo_disponible THEN
      RAISE EXCEPTION 'Efectivo disponible insuficiente: S/ %',
        to_char(v_efectivo_disponible,'FM999999990.00') USING ERRCODE='22023';
    END IF;
  END IF;

  INSERT INTO public.devolucion_venta
    (empresa_id,sucursal_id,comprobante_id,cliente_id,usuario_id,caja_id,motivo,
     total_devolucion,credito_revertido,monto_reembolsado,idempotency_key,request_hash)
  VALUES(v_empresa,v_venta.sucursal_id,p_comprobante_id,v_venta.cliente_id,v_usuario,
    v_caja_id,v_motivo,v_total,v_credito,v_reembolso,v_key,v_hash)
  RETURNING id INTO v_devolucion_id;

  -- Escritura de líneas, stock y movimientos: cualquier error revierte toda la operación.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lineas) ORDER BY (value->>'comprobanteLineaId')::integer LOOP
    v_linea_id:=(v_item->>'comprobanteLineaId')::integer;
    v_cantidad:=(v_item->>'cantidad')::numeric;
    v_reingresar:=coalesce((v_item->>'reingresarStock')::boolean,true);
    SELECT cl.producto_id,cl.variante_id INTO v_original
    FROM public.comprobante_linea cl WHERE cl.id=v_linea_id AND cl.comprobante_id=p_comprobante_id;
    SELECT round(least(greatest(0,cl.subtotal-cl.descuento-coalesce(sum(dl.monto) FILTER (WHERE d.id IS NOT NULL),0)),
      CASE WHEN abs(v_cantidad-(cl.cantidad-coalesce(sum(dl.cantidad) FILTER (WHERE d.id IS NOT NULL),0)))<0.0001
        THEN cl.subtotal-cl.descuento-coalesce(sum(dl.monto) FILTER (WHERE d.id IS NOT NULL),0)
        ELSE round((cl.subtotal-cl.descuento)*v_cantidad/cl.cantidad,2) END),2)
    INTO v_importe
    FROM public.comprobante_linea cl
    LEFT JOIN public.devolucion_venta_linea dl ON dl.comprobante_linea_id=cl.id
    LEFT JOIN public.devolucion_venta d ON d.id=dl.devolucion_id AND d.empresa_id=v_empresa AND d.estado='REGISTRADA'
    WHERE cl.id=v_linea_id GROUP BY cl.id;
    INSERT INTO public.devolucion_venta_linea
      (devolucion_id,empresa_id,sucursal_id,comprobante_linea_id,producto_id,variante_id,cantidad,monto,reingresar_stock)
    VALUES(v_devolucion_id,v_empresa,v_venta.sucursal_id,v_linea_id,
      v_original.producto_id,v_original.variante_id,v_cantidad,v_importe,v_reingresar)
    RETURNING id INTO v_linea_devolucion_id;

    IF v_reingresar THEN
      v_variante:=v_original.variante_id;
      IF v_variante IS NULL THEN
        SELECT stock INTO v_stock FROM public.producto_stock
        WHERE producto_id=v_original.producto_id AND sucursal_id=v_venta.sucursal_id AND empresa_id=v_empresa FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'No existe saldo de inventario para el producto %',v_original.producto_id USING ERRCODE='P0002'; END IF;
        UPDATE public.producto_stock SET stock=stock+v_cantidad,updated_at=now()
        WHERE producto_id=v_original.producto_id AND sucursal_id=v_venta.sucursal_id AND empresa_id=v_empresa RETURNING stock INTO v_nuevo_stock;
      ELSE
        SELECT stock INTO v_stock FROM public.producto_variante_stock
        WHERE variante_id=v_variante AND producto_id=v_original.producto_id
          AND sucursal_id=v_venta.sucursal_id AND empresa_id=v_empresa FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'No existe saldo de inventario para la variante %',v_variante USING ERRCODE='P0002'; END IF;
        UPDATE public.producto_variante_stock SET stock=stock+v_cantidad,updated_at=now()
        WHERE variante_id=v_variante AND producto_id=v_original.producto_id
          AND sucursal_id=v_venta.sucursal_id AND empresa_id=v_empresa RETURNING stock INTO v_nuevo_stock;
      END IF;
      INSERT INTO public.movimiento_inventario
        (empresa_id,sucursal_id,producto_id,variante_id,comprobante_id,usuario_id,tipo,cantidad,stock_anterior,stock_posterior,motivo)
      VALUES(v_empresa,v_venta.sucursal_id,v_original.producto_id,v_variante,p_comprobante_id,
        v_usuario,'ENTRADA',v_cantidad,v_stock,v_nuevo_stock,'Devolución #'||v_devolucion_id||': '||left(v_motivo,150));
    END IF;
  END LOOP;

  IF v_credito>0 AND v_cuenta.id IS NOT NULL THEN
    UPDATE public.cuenta_cobrar
    SET saldo_pendiente=greatest(0,saldo_pendiente-v_credito),
        monto_revertido=monto_revertido+v_credito,
        estado=CASE WHEN saldo_pendiente-v_credito<=0 THEN 'AJUSTADA' ELSE 'PARCIAL' END,
        updated_at=now()
    WHERE id=v_cuenta.id AND empresa_id=v_empresa;
    UPDATE public.cliente SET saldo_credito=greatest(0,saldo_credito-v_credito)
    WHERE id=v_venta.cliente_id AND empresa_id=v_empresa;
    IF v_cuenta.saldo_pendiente-v_credito<=0 THEN
      UPDATE public.comprobante SET estado='PAGADA'
      WHERE id=p_comprobante_id AND empresa_id=v_empresa AND estado='PENDIENTE';
    END IF;
  END IF;

  FOR v_pago IN SELECT value FROM jsonb_array_elements(coalesce(p_pagos,'[]'::jsonb)) LOOP
    INSERT INTO public.devolucion_venta_pago
      (devolucion_id,empresa_id,sucursal_id,metodo_pago,monto,referencia)
    VALUES(v_devolucion_id,v_empresa,v_venta.sucursal_id,v_pago->>'metodoPago',
      (v_pago->>'monto')::numeric,nullif(btrim(coalesce(v_pago->>'referencia','')),''));
    INSERT INTO public.caja_movimiento
      (caja_id,usuario_id,tipo,metodo_pago,monto,motivo,comprobante_id,devolucion_venta_id)
    VALUES(v_caja_id,v_usuario,'SALIDA',v_pago->>'metodoPago',(v_pago->>'monto')::numeric,
      'Reembolso por devolución #'||v_devolucion_id,p_comprobante_id,v_devolucion_id);
  END LOOP;

  RETURN jsonb_build_object('id',v_devolucion_id,'comprobanteId',p_comprobante_id,
    'totalDevolucion',v_total,'creditoRevertido',v_credito,'montoReembolsado',v_reembolso,
    'reintento',false,'mensaje','Devolución registrada correctamente.');
END;
$fn$;

REVOKE ALL ON FUNCTION public.pos_registrar_devolucion(integer,text,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION public.pos_registrar_devolucion(integer,text,jsonb,jsonb,text) IS
'Motor transaccional de devoluciones: idempotencia, saldo de crédito, stock base/variante y reembolsos de caja. El wrapper FEFO completa la trazabilidad de lotes en la misma transacción.';

COMMIT;
