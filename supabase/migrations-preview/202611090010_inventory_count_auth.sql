-- PREVIEW ONLY — Inventario físico autenticado en Supabase.
-- Requiere 202611090002_inventory_lots_returns_compat.sql y
-- 202611090007_inventory_adjustments_lots_auth.sql.
-- No ejecutar en producción; validar primero en staging.
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.pos_inventario_ajustar_lote_auth(jsonb)') IS NULL
     OR to_regclass('public.producto_stock') IS NULL
     OR to_regclass('public.producto_variante_stock') IS NULL
     OR to_regclass('public.inventario_lote') IS NULL
     OR to_regclass('public.movimiento_inventario') IS NULL
     OR to_regclass('public.producto') IS NULL
     OR to_regclass('public.producto_variante') IS NULL
     OR to_regclass('public.sucursal') IS NULL
     OR to_regclass('public.usuario') IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_PREREQUISITES_MISSING';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.inventario_conteo (
  id bigserial PRIMARY KEY,
  empresa_id integer NOT NULL,
  sucursal_id integer NOT NULL,
  usuario_apertura_id integer NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT,
  usuario_cierre_id integer REFERENCES public.usuario(id) ON DELETE RESTRICT,
  estado varchar(12) NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO','CERRADO','CANCELADO')),
  observacion varchar(200) NOT NULL,
  total_lineas integer NOT NULL DEFAULT 0 CHECK (total_lineas >= 0),
  lineas_contadas integer NOT NULL DEFAULT 0 CHECK (lineas_contadas >= 0),
  diferencia_unidades numeric(14,3) NOT NULL DEFAULT 0,
  costo_diferencia numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  FOREIGN KEY (sucursal_id,empresa_id) REFERENCES public.sucursal(id,empresa_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_inventario_conteo_empresa_sucursal_fecha
  ON public.inventario_conteo(empresa_id,sucursal_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventario_conteo_abierto_sucursal
  ON public.inventario_conteo(empresa_id,sucursal_id) WHERE estado='ABIERTO';

CREATE TABLE IF NOT EXISTS public.inventario_conteo_linea (
  id bigserial PRIMARY KEY,
  conteo_id bigint NOT NULL REFERENCES public.inventario_conteo(id) ON DELETE RESTRICT,
  empresa_id integer NOT NULL,
  sucursal_id integer NOT NULL,
  producto_id integer NOT NULL,
  variante_id bigint,
  codigo varchar(80),
  producto_nombre varchar(200) NOT NULL,
  variante_nombre varchar(120),
  stock_sistema numeric(12,3) NOT NULL CHECK (stock_sistema >= 0),
  cantidad_contada numeric(12,3) CHECK (cantidad_contada >= 0),
  diferencia numeric(12,3),
  costo_unitario numeric(12,4) NOT NULL DEFAULT 0,
  costo_diferencia numeric(14,2),
  movimiento_id integer REFERENCES public.movimiento_inventario(id) ON DELETE RESTRICT,
  contado_at timestamptz,
  FOREIGN KEY (sucursal_id,empresa_id) REFERENCES public.sucursal(id,empresa_id) ON DELETE RESTRICT,
  FOREIGN KEY (producto_id,empresa_id) REFERENCES public.producto(id,empresa_id) ON DELETE RESTRICT,
  FOREIGN KEY (variante_id,producto_id,empresa_id)
    REFERENCES public.producto_variante(id,producto_id,empresa_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventario_conteo_linea_sku
  ON public.inventario_conteo_linea(conteo_id,producto_id,coalesce(variante_id,0));
CREATE INDEX IF NOT EXISTS ix_inventario_conteo_linea_conteo
  ON public.inventario_conteo_linea(conteo_id,id);
ALTER TABLE public.inventario_conteo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_conteo_linea ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventario_conteo,public.inventario_conteo_linea FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pos_inventario_conteo_detalle_auth(p_conteo_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_usuario integer:=public.mi_usuario_id();
        v_empresa integer:=public.mi_empresa_id(); v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_usuario IS NULL OR v_empresa IS NULL THEN RAISE EXCEPTION 'INVENTORY_AUTH_REQUIRED'; END IF;
  IF public.mi_rol() IS DISTINCT FROM 'ADMIN' THEN RAISE EXCEPTION 'INVENTORY_ADMIN_REQUIRED'; END IF;
  SELECT jsonb_build_object(
    'id',c.id,'sucursalId',c.sucursal_id,'sucursalNombre',s.nombre,'estado',c.estado,
    'observacion',c.observacion,'totalLineas',c.total_lineas,'lineasContadas',c.lineas_contadas,
    'diferenciaUnidades',c.diferencia_unidades,'costoDiferencia',c.costo_diferencia,
    'createdAt',c.created_at,'closedAt',c.closed_at,
    'lineas',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'lineaId',l.id,'productoId',l.producto_id,'varianteId',l.variante_id,'codigo',l.codigo,
      'productoNombre',l.producto_nombre,'varianteNombre',l.variante_nombre,
      'stockSistema',l.stock_sistema,'cantidadContada',l.cantidad_contada,
      'diferencia',l.diferencia,'costoUnitario',l.costo_unitario,
      'costoDiferencia',l.costo_diferencia) ORDER BY l.producto_nombre,l.variante_nombre NULLS FIRST,l.id)
      FROM public.inventario_conteo_linea l WHERE l.conteo_id=c.id),'[]'::jsonb)
  ) INTO v_result
  FROM public.inventario_conteo c JOIN public.sucursal s ON s.id=c.sucursal_id AND s.empresa_id=c.empresa_id
  WHERE c.id=p_conteo_id AND c.empresa_id=v_empresa AND public.mi_puede_ver_sucursal(c.sucursal_id);
  IF v_result IS NULL THEN RAISE EXCEPTION 'INVENTORY_COUNT_NOT_FOUND'; END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_inventario_conteos_listar_auth()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_usuario integer:=public.mi_usuario_id();
        v_empresa integer:=public.mi_empresa_id(); v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_usuario IS NULL OR v_empresa IS NULL THEN RAISE EXCEPTION 'INVENTORY_AUTH_REQUIRED'; END IF;
  IF public.mi_rol() IS DISTINCT FROM 'ADMIN' THEN RAISE EXCEPTION 'INVENTORY_ADMIN_REQUIRED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'sucursalId',c.sucursal_id,'sucursalNombre',s.nombre,'estado',c.estado,
    'observacion',c.observacion,'totalLineas',c.total_lineas,'lineasContadas',c.lineas_contadas,
    'diferenciaUnidades',c.diferencia_unidades,'costoDiferencia',c.costo_diferencia,
    'createdAt',c.created_at,'closedAt',c.closed_at) ORDER BY c.created_at DESC),'[]'::jsonb)
  INTO v_result
  FROM public.inventario_conteo c JOIN public.sucursal s ON s.id=c.sucursal_id AND s.empresa_id=c.empresa_id
  WHERE c.empresa_id=v_empresa AND public.mi_puede_ver_sucursal(c.sucursal_id);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_inventario_conteo_abrir_auth(p_sucursal_id integer,p_observacion text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_usuario integer:=public.mi_usuario_id();
        v_empresa integer:=public.mi_empresa_id(); v_id bigint;
BEGIN
  IF v_uid IS NULL OR v_usuario IS NULL OR v_empresa IS NULL THEN RAISE EXCEPTION 'INVENTORY_AUTH_REQUIRED'; END IF;
  IF public.mi_rol() IS DISTINCT FROM 'ADMIN' THEN RAISE EXCEPTION 'INVENTORY_ADMIN_REQUIRED'; END IF;
  IF p_sucursal_id IS NULL OR p_sucursal_id<=0 OR NOT public.mi_puede_ver_sucursal(p_sucursal_id)
     OR length(trim(coalesce(p_observacion,'')))<5 OR length(trim(p_observacion))>200 THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_INVALID';
  END IF;
  INSERT INTO public.inventario_conteo(empresa_id,sucursal_id,usuario_apertura_id,observacion)
  VALUES(v_empresa,p_sucursal_id,v_usuario,trim(p_observacion)) RETURNING id INTO v_id;

  INSERT INTO public.inventario_conteo_linea
    (conteo_id,empresa_id,sucursal_id,producto_id,variante_id,codigo,producto_nombre,variante_nombre,stock_sistema,costo_unitario)
  SELECT v_id,ps.empresa_id,ps.sucursal_id,p.id,NULL,coalesce(p.codigo_barras,p.codigo),p.nombre,NULL,ps.stock,ps.costo_promedio
  FROM public.producto_stock ps JOIN public.producto p ON p.id=ps.producto_id AND p.empresa_id=ps.empresa_id
  WHERE ps.empresa_id=v_empresa AND ps.sucursal_id=p_sucursal_id AND p.activo=true
    AND coalesce(p.tiene_variantes,false)=false
  ON CONFLICT DO NOTHING;

  INSERT INTO public.inventario_conteo_linea
    (conteo_id,empresa_id,sucursal_id,producto_id,variante_id,codigo,producto_nombre,variante_nombre,stock_sistema,costo_unitario)
  SELECT v_id,vs.empresa_id,vs.sucursal_id,p.id,pv.id,coalesce(pv.codigo_barras,pv.codigo,p.codigo_barras,p.codigo),
    p.nombre,pv.nombre,vs.stock,vs.costo_promedio
  FROM public.producto_variante_stock vs
  JOIN public.producto_variante pv ON pv.id=vs.variante_id AND pv.empresa_id=vs.empresa_id
  JOIN public.producto p ON p.id=pv.producto_id AND p.empresa_id=pv.empresa_id
  WHERE vs.empresa_id=v_empresa AND vs.sucursal_id=p_sucursal_id AND pv.activo=true AND p.activo=true
  ON CONFLICT DO NOTHING;

  UPDATE public.inventario_conteo SET total_lineas=(SELECT count(*)::int FROM public.inventario_conteo_linea WHERE conteo_id=v_id)
  WHERE id=v_id;
  RETURN public.pos_inventario_conteo_detalle_auth(v_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_inventario_conteo_contar_auth(p_linea_id bigint,p_cantidad numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_usuario integer:=public.mi_usuario_id();
        v_empresa integer:=public.mi_empresa_id(); v_conteo bigint;
BEGIN
  IF v_uid IS NULL OR v_usuario IS NULL OR v_empresa IS NULL THEN RAISE EXCEPTION 'INVENTORY_AUTH_REQUIRED'; END IF;
  IF public.mi_rol() IS DISTINCT FROM 'ADMIN' THEN RAISE EXCEPTION 'INVENTORY_ADMIN_REQUIRED'; END IF;
  IF p_linea_id IS NULL OR p_linea_id<=0 OR p_cantidad IS NULL OR p_cantidad<0 OR p_cantidad<>round(p_cantidad,3) THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_INVALID_LINE';
  END IF;
  SELECT c.id INTO v_conteo FROM public.inventario_conteo c
  JOIN public.inventario_conteo_linea l ON l.conteo_id=c.id
  WHERE l.id=p_linea_id AND c.empresa_id=v_empresa AND public.mi_puede_ver_sucursal(c.sucursal_id)
  FOR UPDATE OF c,l;
  IF v_conteo IS NULL THEN RAISE EXCEPTION 'INVENTORY_COUNT_LINE_NOT_FOUND'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.inventario_conteo WHERE id=v_conteo AND estado='ABIERTO') THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_CLOSED';
  END IF;
  UPDATE public.inventario_conteo_linea SET cantidad_contada=p_cantidad,
    diferencia=p_cantidad-stock_sistema,
    costo_diferencia=round((p_cantidad-stock_sistema)*costo_unitario,2),contado_at=now()
  WHERE id=p_linea_id;
  UPDATE public.inventario_conteo SET lineas_contadas=(
    SELECT count(*)::int FROM public.inventario_conteo_linea WHERE conteo_id=v_conteo AND cantidad_contada IS NOT NULL)
  WHERE id=v_conteo;
  RETURN public.pos_inventario_conteo_detalle_auth(v_conteo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_inventario_conteo_cerrar_auth(p_conteo_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_usuario integer:=public.mi_usuario_id();
        v_empresa integer:=public.mi_empresa_id(); v_cab record; v_line record;
        v_actual numeric(12,3); v_delta numeric(12,3); v_key text; v_adjust jsonb;
        v_total numeric(14,3):=0; v_costo numeric(14,2):=0;
BEGIN
  IF v_uid IS NULL OR v_usuario IS NULL OR v_empresa IS NULL THEN RAISE EXCEPTION 'INVENTORY_AUTH_REQUIRED'; END IF;
  IF public.mi_rol() IS DISTINCT FROM 'ADMIN' THEN RAISE EXCEPTION 'INVENTORY_ADMIN_REQUIRED'; END IF;
  SELECT * INTO v_cab FROM public.inventario_conteo
  WHERE id=p_conteo_id AND empresa_id=v_empresa AND public.mi_puede_ver_sucursal(sucursal_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_COUNT_NOT_FOUND'; END IF;
  IF v_cab.estado<>'ABIERTO' THEN RAISE EXCEPTION 'INVENTORY_COUNT_NOT_OPEN'; END IF;
  IF EXISTS(SELECT 1 FROM public.inventario_conteo_linea WHERE conteo_id=p_conteo_id AND cantidad_contada IS NULL) THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_LINES_PENDING';
  END IF;

  FOR v_line IN SELECT * FROM public.inventario_conteo_linea
    WHERE conteo_id=p_conteo_id ORDER BY producto_id,variante_id NULLS FIRST,id FOR UPDATE
  LOOP
    IF v_line.variante_id IS NULL THEN
      SELECT stock INTO v_actual FROM public.producto_stock
      WHERE empresa_id=v_empresa AND sucursal_id=v_cab.sucursal_id AND producto_id=v_line.producto_id FOR UPDATE;
    ELSE
      SELECT stock INTO v_actual FROM public.producto_variante_stock
      WHERE empresa_id=v_empresa AND sucursal_id=v_cab.sucursal_id AND producto_id=v_line.producto_id
        AND variante_id=v_line.variante_id FOR UPDATE;
    END IF;
    IF v_actual IS NULL THEN RAISE EXCEPTION 'INVENTORY_COUNT_STOCK_MISSING'; END IF;
    v_delta:=round(v_line.cantidad_contada-v_actual,3);
    IF v_delta<>0 THEN
      v_key:='COUNT-INV-'||p_conteo_id||'-'||v_line.id;
      v_adjust:=public.pos_inventario_ajustar_lote_auth(jsonb_build_object(
        'sucursalId',v_cab.sucursal_id,'productoId',v_line.producto_id,'varianteId',v_line.variante_id,
        'tipo',CASE WHEN v_delta>0 THEN 'ENTRADA' ELSE 'SALIDA' END,
        'cantidad',abs(v_delta),'motivo','INVENTARIO FISICO #'||p_conteo_id,
        'idempotencyKey',v_key));
      UPDATE public.inventario_conteo_linea SET movimiento_id=(v_adjust->>'movimientoId')::integer,
        diferencia=v_delta,costo_diferencia=round(v_delta*coalesce(v_line.costo_unitario,0),2)
      WHERE id=v_line.id;
    ELSE
      UPDATE public.inventario_conteo_linea SET diferencia=0,costo_diferencia=0 WHERE id=v_line.id;
    END IF;
    v_total:=v_total+v_delta;
    v_costo:=v_costo+round(v_delta*coalesce(v_line.costo_unitario,0),2);
  END LOOP;

  UPDATE public.inventario_conteo SET estado='CERRADO',usuario_cierre_id=v_usuario,closed_at=now(),
    diferencia_unidades=v_total,costo_diferencia=v_costo
  WHERE id=p_conteo_id;
  RETURN public.pos_inventario_conteo_detalle_auth(p_conteo_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_inventario_conteo_detalle_auth(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pos_inventario_conteos_listar_auth() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pos_inventario_conteo_abrir_auth(integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pos_inventario_conteo_contar_auth(bigint,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pos_inventario_conteo_cerrar_auth(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_inventario_conteo_detalle_auth(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_inventario_conteos_listar_auth() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_inventario_conteo_abrir_auth(integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_inventario_conteo_contar_auth(bigint,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_inventario_conteo_cerrar_auth(bigint) TO authenticated;

COMMIT;
