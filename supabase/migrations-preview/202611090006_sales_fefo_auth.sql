-- PREVIEW ONLY. Requires migrations 002 and 005. Do not apply to production.
-- Wraps the existing atomic sale RPC and consumes FEFO lots in the same transaction.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.inventario_lote') IS NULL
     OR to_regclass('public.comprobante_lote_salida') IS NULL
     OR to_regclass('public.comprobante_linea') IS NULL
     OR to_regprocedure('public.pos_registrar_venta(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'SALE_FEFO_PREREQUISITES_MISSING: apply preview migration 002 and verify sale RPC first';
  END IF;
END
$guard$;

-- A sale may contain repeated product/variant rows. Every lot allocation must
-- point to the exact comprobante_linea, not only to the product aggregate.
ALTER TABLE public.comprobante_lote_salida
  ADD COLUMN IF NOT EXISTS comprobante_linea_id integer;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='fk_lote_salida_comprobante_linea'
      AND conrelid='public.comprobante_lote_salida'::regclass
  ) THEN
    ALTER TABLE public.comprobante_lote_salida
      ADD CONSTRAINT fk_lote_salida_comprobante_linea
      FOREIGN KEY (comprobante_linea_id)
      REFERENCES public.comprobante_linea(id) ON DELETE RESTRICT;
  END IF;
END
$fk$;

CREATE INDEX IF NOT EXISTS idx_lote_salida_comprobante_linea
  ON public.comprobante_lote_salida(empresa_id,comprobante_linea_id);

CREATE OR REPLACE FUNCTION public.pos_registrar_venta_fefo_auth(p_venta jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_usuario integer;
  v_empresa integer;
  v_key text;
  v_hash text;
  v_existente record;
  v_result jsonb;
  v_comprobante integer;
  v_sucursal integer;
  v_line record;
  v_lote record;
  v_pendiente numeric(12,3);
  v_tomar numeric(12,3);
  v_asignaciones integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501';
  END IF;
  v_usuario:=public.mi_usuario_id();
  v_empresa:=public.mi_empresa_id();
  IF v_usuario IS NULL OR v_empresa IS NULL
     OR COALESCE(public.mi_rol(),'') NOT IN ('ADMIN','CAJERO') THEN
    RAISE EXCEPTION 'SALE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_venta IS NULL OR jsonb_typeof(p_venta) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_SALE_PAYLOAD' USING ERRCODE='22023';
  END IF;

  v_key:=NULLIF(btrim(p_venta->>'idempotencyKey'),'');
  IF v_key IS NULL OR v_key !~ '^[A-Za-z0-9._:-]{8,100}$' THEN
    RAISE EXCEPTION 'SALE_IDEMPOTENCY_KEY_INVALID' USING ERRCODE='22023';
  END IF;
  -- Match the legacy sale writer exactly: MD5 of the complete JSON payload, including idempotencyKey.
  v_hash:=md5(p_venta::text);

  -- Serialize retries with the exact lock namespace used by pos_registrar_venta.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos:venta:'||v_empresa||':'||v_key,0)
  );

  SELECT c.id,c.sucursal_id,c.request_hash,c.tipo,c.serie,c.correlativo,c.fecha_emision,c.caja_id,c.total,c.estado
    INTO v_existente
  FROM public.comprobante c
  WHERE c.empresa_id=v_empresa AND c.idempotency_key=v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existente.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'SALE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.comprobante_linea cl
      WHERE cl.comprobante_id=v_existente.id
        AND NOT EXISTS (
          SELECT 1 FROM public.comprobante_lote_salida cls
          WHERE cls.comprobante_linea_id=cl.id
            AND cls.empresa_id=v_empresa
        )
    ) THEN
      RAISE EXCEPTION 'SALE_LOT_TRACE_MISSING: historical sale requires controlled reconciliation'
        USING ERRCODE='23514';
    END IF;
    RETURN jsonb_build_object(
      'ok',true,
      'decision','SALE_CONFIRMED',
      'id',v_existente.id,
      'comprobanteId',v_existente.id,
      'tipo',v_existente.tipo,
      'serie',v_existente.serie,
      'correlativo',v_existente.correlativo,
      'fechaEmision',v_existente.fecha_emision,
      'cajaId',v_existente.caja_id,
      'total',v_existente.total,
      'estado',v_existente.estado,
      'repetida',true,
      'idempotentReplay',true,
      'trazabilidadFEFO',true
    );
  END IF;

  -- Existing sale RPC validates catalog, price, payment, cashbox, stock and
  -- idempotency. Any FEFO failure below rolls back that sale in this transaction.
  v_result:=public.pos_registrar_venta(p_venta);
  v_comprobante:=NULLIF(v_result->>'id','')::integer;
  IF v_comprobante IS NULL THEN
    RAISE EXCEPTION 'SALE_RPC_INVALID_RESULT' USING ERRCODE='P0001';
  END IF;

  SELECT c.sucursal_id INTO v_sucursal
  FROM public.comprobante c
  WHERE c.id=v_comprobante AND c.empresa_id=v_empresa
    AND c.idempotency_key=v_key
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_SCOPE_MISMATCH' USING ERRCODE='42501';
  END IF;

  FOR v_line IN
    SELECT cl.id,cl.producto_id,cl.variante_id,cl.cantidad
    FROM public.comprobante_linea cl
    WHERE cl.comprobante_id=v_comprobante
    ORDER BY cl.id
  LOOP
    v_pendiente:=v_line.cantidad;

    FOR v_lote IN
      SELECT il.id,il.cantidad_disponible
      FROM public.inventario_lote il
      WHERE il.empresa_id=v_empresa
        AND il.sucursal_id=v_sucursal
        AND il.producto_id=v_line.producto_id
        AND il.variante_id IS NOT DISTINCT FROM v_line.variante_id
        AND il.cantidad_disponible>0
        AND (il.fecha_vencimiento IS NULL
             OR il.fecha_vencimiento >= (now() AT TIME ZONE 'America/Lima')::date)
      ORDER BY il.fecha_vencimiento ASC NULLS LAST,il.created_at ASC,il.id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_pendiente<=0.0005;
      v_tomar:=LEAST(v_pendiente,v_lote.cantidad_disponible);
      IF v_tomar<=0 THEN CONTINUE; END IF;

      UPDATE public.inventario_lote
      SET cantidad_disponible=cantidad_disponible-v_tomar
      WHERE id=v_lote.id AND empresa_id=v_empresa
        AND cantidad_disponible>=v_tomar;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALE_FEFO_LOT_RACE: lot % changed during allocation',v_lote.id
          USING ERRCODE='40001';
      END IF;

      INSERT INTO public.comprobante_lote_salida(
        empresa_id,comprobante_id,comprobante_linea_id,lote_id,producto_id,variante_id,cantidad
      ) VALUES (
        v_empresa,v_comprobante,v_line.id,v_lote.id,v_line.producto_id,v_line.variante_id,v_tomar
      );

      v_pendiente:=round(v_pendiente-v_tomar,3);
      v_asignaciones:=v_asignaciones+1;
    END LOOP;

    IF v_pendiente>0.0005 THEN
      RAISE EXCEPTION 'SALE_FEFO_STOCK_MISMATCH: line %, missing quantity %',
        v_line.id,v_pendiente USING ERRCODE='23514';
    END IF;
  END LOOP;

  RETURN v_result || jsonb_build_object(
    'ok',true,
    'decision','SALE_CONFIRMED',
    'comprobanteId',v_comprobante,
    'lotesConsumidos',v_asignaciones,
    'trazabilidadFEFO',true,
    'repetida',false,
    'idempotentReplay',false
  );
END;
$fn$;


-- Recovery RPC used after an ambiguous network response. It never mutates data
-- and confirms only sales whose complete FEFO trace committed with the receipt.
CREATE OR REPLACE FUNCTION public.pos_venta_idempotencia_consultar_auth(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $recovery$
DECLARE
  v_uid uuid:=auth.uid();
  v_usuario integer;
  v_empresa integer;
  v_key text;
  v_hash text;
  v_sale record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501';
  END IF;
  v_usuario:=public.mi_usuario_id();
  v_empresa:=public.mi_empresa_id();
  IF v_usuario IS NULL OR v_empresa IS NULL
     OR COALESCE(public.mi_rol(),'') NOT IN ('ADMIN','CAJERO') THEN
    RAISE EXCEPTION 'SALE_IDEMPOTENCY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_SALE_PAYLOAD' USING ERRCODE='22023';
  END IF;
  v_key:=NULLIF(btrim(p_payload->>'idempotencyKey'),'');
  IF v_key IS NULL OR v_key !~ '^[A-Za-z0-9._:-]{8,100}$' THEN
    RAISE EXCEPTION 'SALE_IDEMPOTENCY_KEY_INVALID' USING ERRCODE='22023';
  END IF;
  -- Recovery uses the same complete-payload fingerprint as pos_registrar_venta.
  v_hash:=md5(p_payload::text);

  SELECT c.id,c.sucursal_id,c.request_hash,c.tipo,c.serie,c.correlativo,
         c.total,c.estado,c.caja_id,c.fecha_emision
  INTO v_sale
  FROM public.comprobante c
  WHERE c.empresa_id=v_empresa AND c.idempotency_key=v_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',true,'existente',false,'decision','NOT_FOUND');
  END IF;
  IF v_sale.request_hash IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'SALE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
  END IF;
  IF NOT public.mi_puede_ver_sucursal(v_sale.sucursal_id) THEN
    RAISE EXCEPTION 'SALE_IDEMPOTENCY_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.comprobante_linea cl
    WHERE cl.comprobante_id=v_sale.id
      AND NOT EXISTS (
        SELECT 1 FROM public.comprobante_lote_salida cls
        WHERE cls.comprobante_linea_id=cl.id
          AND cls.empresa_id=v_empresa
      )
  ) THEN
    RETURN jsonb_build_object('ok',false,'existente',false,'decision','TRACE_INCOMPLETE');
  END IF;

  RETURN jsonb_build_object(
    'ok',true,'existente',true,'decision','SALE_CONFIRMED',
    'comprobanteId',v_sale.id,'tipo',v_sale.tipo,'serie',v_sale.serie,
    'correlativo',v_sale.correlativo,'total',v_sale.total,'estado',v_sale.estado,
    'cajaId',v_sale.caja_id,'idempotentReplay',true
  );
END;
$recovery$;

REVOKE ALL ON FUNCTION public.pos_venta_idempotencia_consultar_auth(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_venta_idempotencia_consultar_auth(jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_venta_idempotencia_consultar_auth(jsonb) IS
  'PREVIEW: read-only sale recovery; confirms only matching payloads with complete FEFO line trace.';

-- Prevent authenticated clients from bypassing FEFO through the legacy entry point.
REVOKE ALL ON FUNCTION public.pos_registrar_venta(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pos_registrar_venta_fefo_auth(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_registrar_venta_fefo_auth(jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_registrar_venta_fefo_auth(jsonb) IS
  'PREVIEW: atomic sale wrapper; delegates sale validation then consumes non-expired inventory lots by FEFO and records exact sale-line trace.';

COMMIT;
