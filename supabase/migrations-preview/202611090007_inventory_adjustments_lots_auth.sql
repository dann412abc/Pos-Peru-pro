-- PREVIEW ONLY — Ajustes de inventario con trazabilidad de lotes e idempotencia.
-- Requiere 202611090002_inventory_lots_returns_compat.sql.
-- No aplicar en producción sin validación integral en un entorno de pruebas.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.inventario_lote') IS NULL
     OR to_regclass('public.producto_stock') IS NULL
     OR to_regclass('public.producto_variante_stock') IS NULL
     OR to_regclass('public.movimiento_inventario') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='movimiento_inventario' AND column_name='variante_id'
     ) THEN
    RAISE EXCEPTION 'INVENTORY_ADJUSTMENT_PREREQUISITES_MISSING';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.inventario_ajuste_idempotencia (
  id bigserial PRIMARY KEY,
  empresa_id integer NOT NULL,
  usuario_id integer NOT NULL,
  idempotency_key varchar(100) NOT NULL,
  request_hash varchar(32) NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inventario_ajuste_idempotencia UNIQUE (empresa_id,usuario_id,idempotency_key)
);
ALTER TABLE public.inventario_ajuste_idempotencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventario_ajuste_idempotencia FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pos_inventario_ajustar_lote_auth(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_usuario_id integer := public.mi_usuario_id();
  v_empresa_id integer := public.mi_empresa_id();
  v_sucursal_id integer;
  v_producto_id integer;
  v_variante_id bigint;
  v_tipo text;
  v_cantidad numeric(12,3);
  v_motivo text;
  v_key text;
  v_hash varchar(32);
  v_existing_hash varchar(32);
  v_existing_response jsonb;
  v_adjust_id bigint;
  v_stock numeric(12,3);
  v_nuevo numeric(12,3);
  v_costo numeric(12,4);
  v_tomar numeric(12,3);
  v_pendiente numeric(12,3);
  v_lote record;
  v_movimiento_id integer;
  v_producto_variante_id integer;
  v_response jsonb;
BEGIN
  IF v_uid IS NULL OR v_usuario_id IS NULL OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_AUTH_REQUIRED';
  END IF;
  IF public.mi_rol() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'INVENTORY_ADMIN_REQUIRED';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'INVENTORY_INVALID_PAYLOAD';
  END IF;

  v_sucursal_id := (p_payload->>'sucursalId')::integer;
  v_producto_id := (p_payload->>'productoId')::integer;
  v_variante_id := NULLIF(p_payload->>'varianteId','')::bigint;
  v_tipo := upper(trim(coalesce(p_payload->>'tipo','')));
  v_cantidad := (p_payload->>'cantidad')::numeric;
  v_motivo := trim(coalesce(p_payload->>'motivo',''));
  v_key := trim(coalesce(p_payload->>'idempotencyKey',''));

  IF v_sucursal_id IS NULL OR v_sucursal_id <= 0 OR v_producto_id IS NULL OR v_producto_id <= 0
     OR v_tipo NOT IN ('ENTRADA','SALIDA') OR v_cantidad IS NULL OR v_cantidad <= 0
     OR v_cantidad > 999999999 OR v_cantidad <> round(v_cantidad,3)
     OR length(v_motivo) < 5 OR length(v_motivo) > 200
     OR v_key !~ '^[A-Za-z0-9._:-]{12,100}$' THEN
    RAISE EXCEPTION 'INVENTORY_INVALID_ADJUSTMENT';
  END IF;
  IF NOT public.mi_puede_ver_sucursal(v_sucursal_id) THEN
    RAISE EXCEPTION 'INVENTORY_BRANCH_FORBIDDEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.producto p
    WHERE p.id=v_producto_id AND p.empresa_id=v_empresa_id AND p.activo=true
  ) THEN RAISE EXCEPTION 'INVENTORY_PRODUCT_INVALID'; END IF;

  IF v_variante_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.producto_variante pv
    WHERE pv.id=v_variante_id AND pv.producto_id=v_producto_id
      AND pv.empresa_id=v_empresa_id AND pv.activo=true
  ) THEN RAISE EXCEPTION 'INVENTORY_VARIANT_INVALID'; END IF;

  v_hash := md5(jsonb_build_object(
    'sucursalId',v_sucursal_id,'productoId',v_producto_id,'varianteId',v_variante_id,
    'tipo',v_tipo,'cantidad',v_cantidad,'motivo',v_motivo
  )::text);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pos:inventario:ajuste:'||v_empresa_id||':'||v_usuario_id||':'||v_key,0
  ));

  INSERT INTO public.inventario_ajuste_idempotencia
    (empresa_id,usuario_id,idempotency_key,request_hash)
  VALUES (v_empresa_id,v_usuario_id,v_key,v_hash)
  ON CONFLICT (empresa_id,usuario_id,idempotency_key) DO NOTHING
  RETURNING id INTO v_adjust_id;

  IF v_adjust_id IS NULL THEN
    SELECT request_hash,response INTO v_existing_hash,v_existing_response
    FROM public.inventario_ajuste_idempotencia
    WHERE empresa_id=v_empresa_id AND usuario_id=v_usuario_id AND idempotency_key=v_key
    FOR UPDATE;
    IF v_existing_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'INVENTORY_IDEMPOTENCY_CONFLICT';
    END IF;
    IF v_existing_response IS NULL THEN
      RAISE EXCEPTION 'INVENTORY_IDEMPOTENCY_INCOMPLETE';
    END IF;
    RETURN v_existing_response || jsonb_build_object('repetida',true);
  END IF;

  IF v_variante_id IS NULL THEN
    SELECT ps.stock,ps.costo_promedio INTO v_stock,v_costo
    FROM public.producto_stock ps
    WHERE ps.empresa_id=v_empresa_id AND ps.sucursal_id=v_sucursal_id AND ps.producto_id=v_producto_id
    FOR UPDATE;
  ELSE
    SELECT vs.stock,vs.costo_promedio INTO v_stock,v_costo
    FROM public.producto_variante_stock vs
    WHERE vs.empresa_id=v_empresa_id AND vs.sucursal_id=v_sucursal_id AND vs.variante_id=v_variante_id
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_STOCK_ROW_MISSING'; END IF;

  IF v_tipo='SALIDA' AND v_stock < v_cantidad THEN
    RAISE EXCEPTION 'INVENTORY_STOCK_INSUFFICIENT';
  END IF;

  IF v_tipo='SALIDA' THEN
    SELECT coalesce(sum(il.cantidad_disponible),0) INTO v_pendiente
    FROM public.inventario_lote il
    WHERE il.empresa_id=v_empresa_id AND il.sucursal_id=v_sucursal_id
      AND il.producto_id=v_producto_id
      AND il.variante_id IS NOT DISTINCT FROM v_variante_id
      AND il.cantidad_disponible > 0;
    IF v_pendiente < v_cantidad THEN
      RAISE EXCEPTION 'INVENTORY_LOT_BALANCE_MISMATCH';
    END IF;
  END IF;

  v_nuevo := CASE WHEN v_tipo='ENTRADA' THEN v_stock+v_cantidad ELSE v_stock-v_cantidad END;

  IF v_variante_id IS NULL THEN
    UPDATE public.producto_stock SET stock=v_nuevo,updated_at=now()
    WHERE empresa_id=v_empresa_id AND sucursal_id=v_sucursal_id AND producto_id=v_producto_id;
  ELSE
    UPDATE public.producto_variante_stock SET stock=v_nuevo,updated_at=now()
    WHERE empresa_id=v_empresa_id AND sucursal_id=v_sucursal_id AND variante_id=v_variante_id;
  END IF;

  IF v_tipo='ENTRADA' THEN
    INSERT INTO public.inventario_lote
      (empresa_id,sucursal_id,producto_id,variante_id,codigo_lote,fecha_vencimiento,
       cantidad_inicial,cantidad_disponible,costo_unitario)
    VALUES
      (v_empresa_id,v_sucursal_id,v_producto_id,v_variante_id,
       left('AJ-'||v_key,80),NULL,v_cantidad,v_cantidad,coalesce(v_costo,0));
  ELSE
    v_pendiente := v_cantidad;
    FOR v_lote IN
      SELECT il.id,il.cantidad_disponible
      FROM public.inventario_lote il
      WHERE il.empresa_id=v_empresa_id AND il.sucursal_id=v_sucursal_id
        AND il.producto_id=v_producto_id
        AND il.variante_id IS NOT DISTINCT FROM v_variante_id
        AND il.cantidad_disponible > 0
      ORDER BY il.fecha_vencimiento ASC NULLS LAST,il.created_at ASC,il.id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_pendiente <= 0;
      v_tomar := least(v_pendiente,v_lote.cantidad_disponible);
      UPDATE public.inventario_lote
      SET cantidad_disponible=cantidad_disponible-v_tomar
      WHERE id=v_lote.id;
      v_pendiente := v_pendiente-v_tomar;
    END LOOP;
    IF v_pendiente > 0 THEN RAISE EXCEPTION 'INVENTORY_LOT_BALANCE_MISMATCH'; END IF;
  END IF;

  INSERT INTO public.movimiento_inventario
    (empresa_id,sucursal_id,producto_id,variante_id,usuario_id,tipo,cantidad,motivo,stock_anterior,stock_posterior)
  VALUES
    (v_empresa_id,v_sucursal_id,v_producto_id,v_variante_id,v_usuario_id,v_tipo,v_cantidad,left(v_motivo,200),v_stock,v_nuevo)
  RETURNING id INTO v_movimiento_id;

  v_response := jsonb_build_object(
    'ok',true,'movimientoId',v_movimiento_id,'productoId',v_producto_id,
    'varianteId',v_variante_id,'sucursalId',v_sucursal_id,
    'stockAnterior',v_stock,'stockNuevo',v_nuevo,'cantidad',v_cantidad,
    'tipo',v_tipo,'trazabilidadLotes',true,'repetida',false
  );
  UPDATE public.inventario_ajuste_idempotencia
  SET response=v_response
  WHERE id=v_adjust_id;

  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_inventario_ajustar_lote_auth(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_inventario_ajustar_lote_auth(jsonb) TO authenticated;

COMMIT;
