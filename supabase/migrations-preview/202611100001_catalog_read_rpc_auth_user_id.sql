-- PREVIEW SOLAMENTE. No ejecutar en Producción.
-- Corrige el contrato de lectura del catálogo para el esquema real de POS AYNI PERÚ.
-- La identidad se resuelve mediante los helpers existentes y auth.uid().
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_catalogo_base_auth(p_sucursal_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_usuario_id integer := public.mi_usuario_id();
  v_empresa_id integer := public.mi_empresa_id();
  v_sucursal_id integer;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_usuario_id IS NULL OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Sesión no autenticada o usuario POS no vinculado/inactivo'
      USING ERRCODE = '42501';
  END IF;

  IF p_sucursal_id IS NULL THEN
    SELECT s.id INTO v_sucursal_id
    FROM public.sucursal s
    WHERE s.empresa_id = v_empresa_id
      AND public.mi_puede_ver_sucursal(s.id)
    ORDER BY s.id
    LIMIT 1;
  ELSE
    IF public.mi_puede_ver_sucursal(p_sucursal_id)
       AND EXISTS (
         SELECT 1 FROM public.sucursal s
         WHERE s.id = p_sucursal_id AND s.empresa_id = v_empresa_id
       ) THEN
      v_sucursal_id := p_sucursal_id;
    END IF;
  END IF;

  IF v_sucursal_id IS NULL THEN
    RAISE EXCEPTION 'Sucursal no autorizada para este usuario'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'empresa_id', v_empresa_id,
    'sucursal_id', v_sucursal_id,
    'sucursales', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.id)
      FROM public.sucursal s
      WHERE s.empresa_id = v_empresa_id
        AND public.mi_puede_ver_sucursal(s.id)
    ), '[]'::jsonb),
    'categorias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'activo', c.activo) ORDER BY c.nombre)
      FROM public.categoria c
      WHERE c.empresa_id = v_empresa_id AND c.activo = TRUE
    ), '[]'::jsonb),
    'productos', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.nombre)
      FROM public.producto p
      WHERE p.empresa_id = v_empresa_id AND p.activo = TRUE
    ), '[]'::jsonb),
    'variantes', COALESCE((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v.producto_id, v.nombre)
      FROM public.producto_variante v
      WHERE v.empresa_id = v_empresa_id AND v.activo = TRUE
    ), '[]'::jsonb),
    'stock', COALESCE((
      SELECT jsonb_agg(to_jsonb(ps) ORDER BY ps.producto_id)
      FROM public.producto_stock ps
      WHERE ps.empresa_id = v_empresa_id AND ps.sucursal_id = v_sucursal_id
    ), '[]'::jsonb),
    'stock_variantes', COALESCE((
      SELECT jsonb_agg(to_jsonb(vs) ORDER BY vs.variante_id)
      FROM public.producto_variante_stock vs
      WHERE vs.empresa_id = v_empresa_id AND vs.sucursal_id = v_sucursal_id
    ), '[]'::jsonb),
    'clientes', COALESCE((
      SELECT jsonb_agg(to_jsonb(cl) ORDER BY cl.nombre)
      FROM (
        SELECT c.* FROM public.cliente c
        WHERE c.empresa_id = v_empresa_id
        ORDER BY c.nombre
        LIMIT 500
      ) cl
    ), '[]'::jsonb),
    'proveedores', COALESCE((
      SELECT jsonb_agg(to_jsonb(pr) ORDER BY pr.nombre)
      FROM public.proveedor pr
      WHERE pr.empresa_id = v_empresa_id AND pr.activo = TRUE
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_catalogo_base_auth(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_catalogo_base_auth(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_catalogo_base_auth(integer) TO authenticated;

COMMENT ON FUNCTION public.pos_catalogo_base_auth(integer) IS
'Lectura del catálogo limitada a empresa y sucursal derivadas del usuario autenticado mediante auth.uid().';

COMMIT;
