-- PREVIEW ONLY — Transferencias Supabase entre sucursales con lotes FEFO y variantes.
-- Depende de 202611090002_inventory_lots_returns_compat.sql.
-- No aplicar en producción. Ejecutar primero en una copia de staging.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.inventario_lote') IS NULL
     OR to_regclass('public.producto_stock') IS NULL
     OR to_regclass('public.producto_variante_stock') IS NULL
     OR to_regclass('public.movimiento_inventario') IS NULL
     OR to_regclass('public.producto_variante') IS NULL
     OR to_regclass('public.transferencia_inventario') IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_PREREQUISITES_MISSING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='movimiento_inventario' AND column_name='variante_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='movimiento_inventario' AND column_name='transferencia_id') THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_MOVEMENT_COLUMNS_MISSING';
  END IF;
END
$guard$;

ALTER TABLE public.transferencia_inventario
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(100);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transferencia_inventario_idempotency
  ON public.transferencia_inventario(empresa_id,usuario_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.inventario_transferencia_idempotencia (
  id bigserial PRIMARY KEY,
  empresa_id integer NOT NULL,
  usuario_id integer NOT NULL,
  idempotency_key varchar(100) NOT NULL,
  request_hash varchar(32) NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inventario_transferencia_idempotencia UNIQUE (empresa_id,usuario_id,idempotency_key)
);
ALTER TABLE public.inventario_transferencia_idempotencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventario_transferencia_idempotencia FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pos_inventario_transferir_auth(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_usuario_id integer := public.mi_usuario_id();
  v_empresa_id integer := public.mi_empresa_id();
  v_origen integer;
  v_destino integer;
  v_motivo text;
  v_key text;
  v_hash varchar(32);
  v_old_hash varchar(32);
  v_old_response jsonb;
  v_idempotencia_id bigint;
  v_transferencia_id bigint;
  v_line jsonb;
  v_producto integer;
  v_variante bigint;
  v_cantidad numeric(12,3);
  v_stock_origen numeric(12,3);
  v_stock_destino numeric(12,3);
  v_costo_origen numeric(12,4);
  v_costo_destino numeric(12,4);
  v_stock_nuevo_origen numeric(12,3);
  v_stock_nuevo_destino numeric(12,3);
  v_pendiente numeric(12,3);
  v_tomar numeric(12,3);
  v_costo_total numeric(18,4);
  v_lote record;
  v_mov_salida integer;
  v_mov_entrada integer;
  v_lineas jsonb := '[]'::jsonb;
  v_response jsonb;
BEGIN
  IF v_uid IS NULL OR v_usuario_id IS NULL OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_AUTH_REQUIRED';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_INVALID_PAYLOAD';
  END IF;

  v_origen := (p_payload->>'sucursalOrigenId')::integer;
  v_destino := (p_payload->>'sucursalDestinoId')::integer;
  v_motivo := trim(coalesce(p_payload->>'motivo',''));
  v_key := trim(coalesce(p_payload->>'idempotencyKey',''));

  IF v_origen IS NULL OR v_destino IS NULL OR v_origen <= 0 OR v_destino <= 0 OR v_origen=v_destino
     OR length(v_motivo)<5 OR length(v_motivo)>200
     OR v_key !~ '^[A-Za-z0-9._:-]{12,100}$'
     OR jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_INVALID_INPUT';
  END IF;
  IF NOT public.mi_puede_ver_sucursal(v_origen) OR NOT public.mi_puede_ver_sucursal(v_destino) THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_BRANCH_FORBIDDEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sucursal WHERE id=v_origen AND empresa_id=v_empresa_id)
     OR NOT EXISTS (SELECT 1 FROM public.sucursal WHERE id=v_destino AND empresa_id=v_empresa_id) THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_BRANCH_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_payload->'lineas') x
    WHERE jsonb_typeof(x) <> 'object'
       OR coalesce(x->>'productoId','') !~ '^[1-9][0-9]*$'
       OR coalesce(x->>'cantidad','') !~ '^[0-9]+([.][0-9]{1,3})?$'
       OR (x->>'cantidad')::numeric <= 0
       OR (x->>'cantidad')::numeric > 999999999
       OR (x->>'varianteId' IS NOT NULL AND x->>'varianteId' <> '' AND x->>'varianteId' !~ '^[1-9][0-9]*$')
  ) THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_INVALID_LINE'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_payload->'lineas') x
    GROUP BY (x->>'productoId')::integer, NULLIF(x->>'varianteId','')::bigint HAVING COUNT(*)>1
  ) THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_DUPLICATE_LINE'; END IF;

  v_hash := md5(jsonb_build_object('sucursalOrigenId',v_origen,'sucursalDestinoId',v_destino,
    'motivo',v_motivo,'lineas',p_payload->'lineas')::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pos:inventario:transferencia:'||v_empresa_id||':'||v_usuario_id||':'||v_key,0
  ));
  INSERT INTO public.inventario_transferencia_idempotencia(empresa_id,usuario_id,idempotency_key,request_hash)
  VALUES(v_empresa_id,v_usuario_id,v_key,v_hash)
  ON CONFLICT(empresa_id,usuario_id,idempotency_key) DO NOTHING
  RETURNING id INTO v_idempotencia_id;
  IF v_idempotencia_id IS NULL THEN
    SELECT request_hash,response INTO v_old_hash,v_old_response
    FROM public.inventario_transferencia_idempotencia
    WHERE empresa_id=v_empresa_id AND usuario_id=v_usuario_id AND idempotency_key=v_key FOR UPDATE;
    IF v_old_hash IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_IDEMPOTENCY_CONFLICT'; END IF;
    IF v_old_response IS NULL THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_IDEMPOTENCY_INCOMPLETE'; END IF;
    RETURN v_old_response || jsonb_build_object('repetida',true);
  END IF;

  INSERT INTO public.transferencia_inventario(empresa_id,sucursal_origen_id,sucursal_destino_id,usuario_id,motivo,idempotency_key)
  VALUES(v_empresa_id,v_origen,v_destino,v_usuario_id,v_motivo,v_key)
  RETURNING id INTO v_transferencia_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') ORDER BY (value->>'productoId')::integer, NULLIF(value->>'varianteId','')::bigint NULLS FIRST
  LOOP
    v_producto := (v_line->>'productoId')::integer;
    v_variante := NULLIF(v_line->>'varianteId','')::bigint;
    v_cantidad := (v_line->>'cantidad')::numeric;

    IF NOT EXISTS (SELECT 1 FROM public.producto p WHERE p.id=v_producto AND p.empresa_id=v_empresa_id AND p.activo=true) THEN
      RAISE EXCEPTION 'INVENTORY_TRANSFER_PRODUCT_INVALID';
    END IF;

    IF v_variante IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.producto WHERE id=v_producto AND empresa_id=v_empresa_id AND coalesce(tiene_variantes,false)=true) THEN
        RAISE EXCEPTION 'INVENTORY_TRANSFER_VARIANT_REQUIRED';
      END IF;
      SELECT stock,costo_promedio INTO v_stock_origen,v_costo_origen FROM public.producto_stock
      WHERE empresa_id=v_empresa_id AND sucursal_id=v_origen AND producto_id=v_producto FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_SOURCE_STOCK_MISSING'; END IF;
      SELECT stock,costo_promedio INTO v_stock_destino,v_costo_destino FROM public.producto_stock
      WHERE empresa_id=v_empresa_id AND sucursal_id=v_destino AND producto_id=v_producto FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_DESTINATION_STOCK_MISSING'; END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.producto_variante pv WHERE pv.id=v_variante AND pv.producto_id=v_producto AND pv.empresa_id=v_empresa_id AND pv.activo=true) THEN
        RAISE EXCEPTION 'INVENTORY_TRANSFER_VARIANT_INVALID';
      END IF;
      SELECT stock,costo_promedio INTO v_stock_origen,v_costo_origen FROM public.producto_variante_stock
      WHERE empresa_id=v_empresa_id AND sucursal_id=v_origen AND producto_id=v_producto AND variante_id=v_variante FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_SOURCE_VARIANT_STOCK_MISSING'; END IF;
      SELECT stock,costo_promedio INTO v_stock_destino,v_costo_destino FROM public.producto_variante_stock
      WHERE empresa_id=v_empresa_id AND sucursal_id=v_destino AND producto_id=v_producto AND variante_id=v_variante FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_DESTINATION_VARIANT_STOCK_MISSING'; END IF;
    END IF;

    IF v_stock_origen < v_cantidad THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_INSUFFICIENT_STOCK'; END IF;
    SELECT coalesce(sum(cantidad_disponible),0) INTO v_pendiente
    FROM public.inventario_lote
    WHERE empresa_id=v_empresa_id AND sucursal_id=v_origen AND producto_id=v_producto
      AND variante_id IS NOT DISTINCT FROM v_variante AND cantidad_disponible>0;
    IF v_pendiente < v_cantidad THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_LOT_BALANCE_MISMATCH'; END IF;

    v_pendiente := v_cantidad;
    v_costo_total := 0;
    FOR v_lote IN
      SELECT id,codigo_lote,fecha_vencimiento,cantidad_disponible,costo_unitario
      FROM public.inventario_lote
      WHERE empresa_id=v_empresa_id AND sucursal_id=v_origen AND producto_id=v_producto
        AND variante_id IS NOT DISTINCT FROM v_variante AND cantidad_disponible>0
      ORDER BY fecha_vencimiento ASC NULLS LAST,created_at ASC,id ASC FOR UPDATE
    LOOP
      EXIT WHEN v_pendiente<=0;
      v_tomar := least(v_pendiente,v_lote.cantidad_disponible);
      UPDATE public.inventario_lote SET cantidad_disponible=cantidad_disponible-v_tomar WHERE id=v_lote.id;
      INSERT INTO public.inventario_lote(empresa_id,sucursal_id,producto_id,variante_id,codigo_lote,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario)
      VALUES(v_empresa_id,v_destino,v_producto,v_variante,
        left('TR-'||v_transferencia_id||'-'||v_lote.id,80),v_lote.fecha_vencimiento,v_tomar,v_tomar,v_lote.costo_unitario);
      v_costo_total := v_costo_total + v_tomar*v_lote.costo_unitario;
      v_pendiente := v_pendiente-v_tomar;
    END LOOP;
    IF v_pendiente>0 THEN RAISE EXCEPTION 'INVENTORY_TRANSFER_LOT_BALANCE_MISMATCH'; END IF;

    v_stock_nuevo_origen := v_stock_origen-v_cantidad;
    v_stock_nuevo_destino := v_stock_destino+v_cantidad;
    IF v_variante IS NULL THEN
      UPDATE public.producto_stock SET stock=v_stock_nuevo_origen,updated_at=now()
      WHERE empresa_id=v_empresa_id AND sucursal_id=v_origen AND producto_id=v_producto;
      UPDATE public.producto_stock SET stock=v_stock_nuevo_destino,
        costo_promedio=CASE WHEN v_stock_nuevo_destino>0 THEN ((v_stock_destino*v_costo_destino)+v_costo_total)/v_stock_nuevo_destino ELSE v_costo_origen END,
        updated_at=now()
      WHERE empresa_id=v_empresa_id AND sucursal_id=v_destino AND producto_id=v_producto;
    ELSE
      UPDATE public.producto_variante_stock SET stock=v_stock_nuevo_origen,updated_at=now()
      WHERE empresa_id=v_empresa_id AND sucursal_id=v_origen AND producto_id=v_producto AND variante_id=v_variante;
      UPDATE public.producto_variante_stock SET stock=v_stock_nuevo_destino,
        costo_promedio=CASE WHEN v_stock_nuevo_destino>0 THEN ((v_stock_destino*v_costo_destino)+v_costo_total)/v_stock_nuevo_destino ELSE v_costo_origen END,
        updated_at=now()
      WHERE empresa_id=v_empresa_id AND sucursal_id=v_destino AND producto_id=v_producto AND variante_id=v_variante;
    END IF;

    INSERT INTO public.movimiento_inventario(empresa_id,sucursal_id,producto_id,variante_id,comprobante_id,usuario_id,tipo,cantidad,stock_anterior,stock_posterior,transferencia_id,motivo)
    VALUES(v_empresa_id,v_origen,v_producto,v_variante,NULL,v_usuario_id,'SALIDA',v_cantidad,v_stock_origen,v_stock_nuevo_origen,v_transferencia_id,
      left('Traslado #'||v_transferencia_id||' hacia sucursal '||v_destino||': '||v_motivo,200))
    RETURNING id INTO v_mov_salida;
    INSERT INTO public.movimiento_inventario(empresa_id,sucursal_id,producto_id,variante_id,comprobante_id,usuario_id,tipo,cantidad,stock_anterior,stock_posterior,transferencia_id,motivo)
    VALUES(v_empresa_id,v_destino,v_producto,v_variante,NULL,v_usuario_id,'ENTRADA',v_cantidad,v_stock_destino,v_stock_nuevo_destino,v_transferencia_id,
      left('Traslado #'||v_transferencia_id||' desde sucursal '||v_origen||': '||v_motivo,200))
    RETURNING id INTO v_mov_entrada;

    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'productoId',v_producto,'varianteId',v_variante,'cantidad',v_cantidad,
      'stockOrigen',v_stock_nuevo_origen,'stockDestino',v_stock_nuevo_destino,
      'movimientoSalidaId',v_mov_salida,'movimientoEntradaId',v_mov_entrada
    ));
  END LOOP;

  v_response := jsonb_build_object('ok',true,'id',v_transferencia_id,'sucursalOrigenId',v_origen,
    'sucursalDestinoId',v_destino,'motivo',v_motivo,'lineas',v_lineas,'repetida',false,
    'trazabilidadLotes',true,'incluyeVariantes',true);
  UPDATE public.inventario_transferencia_idempotencia SET response=v_response WHERE id=v_idempotencia_id;
  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_inventario_transferir_auth(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_inventario_transferir_auth(jsonb) TO authenticated;
COMMIT;
