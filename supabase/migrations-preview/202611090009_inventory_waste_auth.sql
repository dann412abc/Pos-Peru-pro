-- PREVIEW ONLY — Registro de mermas Supabase con salida FEFO e historial.
-- Requiere 202611090002_inventory_lots_returns_compat.sql y 202611090007_inventory_adjustments_lots_auth.sql.
-- Aplicar primero en una copia de staging; NO ejecutar en producción.
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.pos_inventario_ajustar_lote_auth(jsonb)') IS NULL
     OR to_regclass('public.inventario_lote') IS NULL
     OR to_regclass('public.producto') IS NULL
     OR to_regclass('public.sucursal') IS NULL
     OR to_regclass('public.producto_variante') IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_WASTE_PREREQUISITES_MISSING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='producto' AND column_name='nombre')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sucursal' AND column_name='nombre')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='producto_variante' AND column_name='nombre') THEN
    RAISE EXCEPTION 'INVENTORY_WASTE_DISPLAY_COLUMNS_MISSING';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.inventario_merma (
  id bigserial PRIMARY KEY,
  empresa_id integer NOT NULL,
  sucursal_id integer NOT NULL,
  producto_id integer NOT NULL,
  variante_id integer,
  usuario_id integer NOT NULL,
  movimiento_id integer NOT NULL,
  idempotency_key varchar(100) NOT NULL,
  motivo_tipo varchar(30) NOT NULL CHECK (motivo_tipo IN ('VENCIDO','DANADO','PERDIDA','CONTAMINACION','OTRO')),
  observacion varchar(500) NOT NULL,
  cantidad numeric(12,3) NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric(12,4) NOT NULL DEFAULT 0,
  costo_total numeric(18,4) NOT NULL DEFAULT 0,
  producto_nombre varchar(180) NOT NULL,
  variante_nombre varchar(160),
  sucursal_nombre varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inventario_merma_idempotency UNIQUE (empresa_id,usuario_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_inventario_merma_sucursal_fecha
  ON public.inventario_merma(empresa_id,sucursal_id,created_at DESC);
ALTER TABLE public.inventario_merma ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventario_merma FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pos_inventario_merma_registrar_auth(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_usuario integer := public.mi_usuario_id();
  v_empresa integer := public.mi_empresa_id();
  v_sucursal integer;
  v_producto integer;
  v_variante integer;
  v_cantidad numeric(12,3);
  v_tipo text;
  v_obs text;
  v_key text;
  v_ajuste jsonb;
  v_merma_id bigint;
  v_movimiento integer;
  v_costo numeric(12,4);
  v_producto_nombre text;
  v_variante_nombre text;
  v_sucursal_nombre text;
BEGIN
  IF v_uid IS NULL OR v_usuario IS NULL OR v_empresa IS NULL THEN RAISE EXCEPTION 'INVENTORY_AUTH_REQUIRED'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVENTORY_WASTE_INVALID_PAYLOAD'; END IF;
  v_sucursal := (p_payload->>'sucursalId')::integer;
  v_producto := (p_payload->>'productoId')::integer;
  v_variante := NULLIF(p_payload->>'varianteId','')::integer;
  v_cantidad := (p_payload->>'cantidad')::numeric;
  v_tipo := upper(trim(coalesce(p_payload->>'motivoTipo','')));
  v_obs := trim(coalesce(p_payload->>'observacion',''));
  v_key := trim(coalesce(p_payload->>'idempotencyKey',''));
  IF v_sucursal IS NULL OR v_sucursal<=0 OR v_producto IS NULL OR v_producto<=0
     OR v_cantidad IS NULL OR v_cantidad<=0 OR v_cantidad<>round(v_cantidad,3)
     OR v_tipo NOT IN ('VENCIDO','DANADO','PERDIDA','CONTAMINACION','OTRO')
     OR length(v_obs)<5 OR length(v_obs)>500 OR v_key !~ '^[A-Za-z0-9._:-]{12,100}$' THEN
    RAISE EXCEPTION 'INVENTORY_WASTE_INVALID_INPUT';
  END IF;
  IF NOT public.mi_puede_ver_sucursal(v_sucursal) THEN RAISE EXCEPTION 'INVENTORY_BRANCH_FORBIDDEN'; END IF;

  -- El escritor existente valida ADMIN, permisos, stock, idempotencia y consume lotes FEFO.
  v_ajuste := public.pos_inventario_ajustar_lote_auth(jsonb_build_object(
    'sucursalId',v_sucursal,'productoId',v_producto,'varianteId',v_variante,
    'tipo','SALIDA','cantidad',v_cantidad,
    'motivo',left('MERMA '||v_tipo||': '||v_obs,200),'idempotencyKey',v_key
  ));
  v_movimiento := (v_ajuste->>'movimientoId')::integer;

  SELECT p.nombre INTO v_producto_nombre FROM public.producto p
  WHERE p.id=v_producto AND p.empresa_id=v_empresa;
  IF v_producto_nombre IS NULL THEN RAISE EXCEPTION 'INVENTORY_PRODUCT_INVALID'; END IF;
  IF v_variante IS NOT NULL THEN
    SELECT pv.nombre INTO v_variante_nombre FROM public.producto_variante pv
    WHERE pv.id=v_variante AND pv.producto_id=v_producto AND pv.empresa_id=v_empresa;
    IF v_variante_nombre IS NULL THEN RAISE EXCEPTION 'INVENTORY_VARIANT_INVALID'; END IF;
  END IF;
  SELECT s.nombre INTO v_sucursal_nombre FROM public.sucursal s
  WHERE s.id=v_sucursal AND s.empresa_id=v_empresa;
  IF v_sucursal_nombre IS NULL THEN RAISE EXCEPTION 'INVENTORY_BRANCH_INVALID'; END IF;
  SELECT coalesce(il.costo_unitario,0) INTO v_costo
  FROM public.inventario_lote il
  WHERE il.empresa_id=v_empresa AND il.sucursal_id=v_sucursal AND il.producto_id=v_producto
    AND il.variante_id IS NOT DISTINCT FROM v_variante
  ORDER BY il.created_at DESC,il.id DESC LIMIT 1;
  -- Costo unitario tomado del costo promedio anterior comunicado por el movimiento no se inventa:
  -- se usa el promedio vigente del saldo como estimación contable de la baja.
  IF v_variante IS NULL THEN
    SELECT coalesce(ps.costo_promedio,0) INTO v_costo FROM public.producto_stock ps
    WHERE ps.empresa_id=v_empresa AND ps.sucursal_id=v_sucursal AND ps.producto_id=v_producto;
  ELSE
    SELECT coalesce(vs.costo_promedio,0) INTO v_costo FROM public.producto_variante_stock vs
    WHERE vs.empresa_id=v_empresa AND vs.sucursal_id=v_sucursal AND vs.variante_id=v_variante;
  END IF;

  INSERT INTO public.inventario_merma
    (empresa_id,sucursal_id,producto_id,variante_id,usuario_id,movimiento_id,idempotency_key,
     motivo_tipo,observacion,cantidad,costo_unitario,costo_total,producto_nombre,variante_nombre,sucursal_nombre)
  VALUES(v_empresa,v_sucursal,v_producto,v_variante,v_usuario,v_movimiento,v_key,
    v_tipo,v_obs,v_cantidad,coalesce(v_costo,0),v_cantidad*coalesce(v_costo,0),
    v_producto_nombre,v_variante_nombre,v_sucursal_nombre)
  ON CONFLICT(empresa_id,usuario_id,idempotency_key) DO NOTHING
  RETURNING id INTO v_merma_id;
  IF v_merma_id IS NULL THEN
    SELECT id INTO v_merma_id FROM public.inventario_merma
    WHERE empresa_id=v_empresa AND usuario_id=v_usuario AND idempotency_key=v_key;
  END IF;
  RETURN jsonb_build_object('ok',true,'mermaId',v_merma_id,'movimientoId',v_movimiento,
    'cantidad',v_cantidad,'costoUnitario',coalesce(v_costo,0),'costoTotal',v_cantidad*coalesce(v_costo,0),
    'trazabilidadLotes',true,'repetida',coalesce((v_ajuste->>'repetida')::boolean,false));
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_inventario_lotes_merma_auth(p_sucursal_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_empresa integer := public.mi_empresa_id();
BEGIN
  IF auth.uid() IS NULL OR v_empresa IS NULL THEN RAISE EXCEPTION 'INVENTORY_AUTH_REQUIRED'; END IF;
  IF p_sucursal_id IS NULL OR p_sucursal_id<=0 OR NOT public.mi_puede_ver_sucursal(p_sucursal_id) THEN
    RAISE EXCEPTION 'INVENTORY_BRANCH_FORBIDDEN';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',l.id,'sucursalNombre',s.nombre,'productoNombre',p.nombre,
    'varianteNombre',pv.nombre,'codigoLote',l.codigo_lote,'fechaVencimiento',l.fecha_vencimiento,
    'cantidadDisponible',l.cantidad_disponible,'costoUnitario',l.costo_unitario,
    'productoId',l.producto_id,'varianteId',l.variante_id
  ) ORDER BY l.fecha_vencimiento ASC NULLS LAST,l.created_at,l.id)
  FROM public.inventario_lote l
  JOIN public.producto p ON p.id=l.producto_id AND p.empresa_id=l.empresa_id
  JOIN public.sucursal s ON s.id=l.sucursal_id AND s.empresa_id=l.empresa_id
  LEFT JOIN public.producto_variante pv ON pv.id=l.variante_id AND pv.producto_id=l.producto_id
  WHERE l.empresa_id=v_empresa AND l.sucursal_id=p_sucursal_id AND l.cantidad_disponible>0), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_inventario_mermas_listar_auth(p_sucursal_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_empresa integer := public.mi_empresa_id();
BEGIN
  IF auth.uid() IS NULL OR v_empresa IS NULL THEN RAISE EXCEPTION 'INVENTORY_AUTH_REQUIRED'; END IF;
  IF p_sucursal_id IS NULL OR p_sucursal_id<=0 OR NOT public.mi_puede_ver_sucursal(p_sucursal_id) THEN
    RAISE EXCEPTION 'INVENTORY_BRANCH_FORBIDDEN';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',m.id,'sucursalNombre',m.sucursal_nombre,'productoNombre',m.producto_nombre,
    'varianteNombre',m.variante_nombre,'codigoLote','FEFO','fechaVencimiento',NULL,
    'motivoTipo',m.motivo_tipo,'observacion',m.observacion,'cantidad',m.cantidad,
    'costoUnitario',m.costo_unitario,'costoTotal',m.costo_total,
    'usuarioNombre','Usuario #'||m.usuario_id,'createdAt',m.created_at
  ) ORDER BY m.created_at DESC,m.id DESC)
  FROM public.inventario_merma m
  WHERE m.empresa_id=v_empresa AND m.sucursal_id=p_sucursal_id), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_inventario_merma_registrar_auth(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pos_inventario_mermas_listar_auth(integer) FROM PUBLIC,anon;\nREVOKE ALL ON FUNCTION public.pos_inventario_lotes_merma_auth(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_inventario_merma_registrar_auth(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_inventario_mermas_listar_auth(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_inventario_lotes_merma_auth(integer) TO authenticated;
COMMIT;
