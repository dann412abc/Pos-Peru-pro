-- PREVIEW SOLAMENTE. Probar primero en una base staging; NO ejecutar en producción.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_variante_mutar_auth(p_action text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_auth uuid := auth.uid(); v_user integer; v_empresa integer; v_producto integer; v_id integer;
        v_codigo text; v_barras text; v_nombre text; v_precio numeric; v_mayoreo numeric; v_result jsonb;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
  SELECT id, empresa_id INTO v_user, v_empresa FROM public.usuario WHERE supabase_auth_user_id=v_auth AND activo=TRUE;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Payload inválido' USING ERRCODE='22023'; END IF;
  v_producto := NULLIF(p_payload->>'producto_id','')::integer;
  v_id := NULLIF(p_payload->>'id','')::integer;
  IF NOT EXISTS (SELECT 1 FROM public.producto WHERE id=v_producto AND empresa_id=v_empresa AND activo=TRUE AND tiene_variantes=TRUE) THEN
    RAISE EXCEPTION 'Producto con variantes no encontrado' USING ERRCODE='42501';
  END IF;
  IF p_action IN ('variant_create','variant_update') THEN
    v_codigo := NULLIF(btrim(p_payload->>'codigo'),''); v_barras := NULLIF(btrim(p_payload->>'codigoBarras'),'');
    v_nombre := NULLIF(btrim(p_payload->>'nombre'),''); v_precio := NULLIF(p_payload->>'precio','')::numeric;
    v_mayoreo := NULLIF(p_payload->>'precioMayoreo','')::numeric;
    IF v_codigo IS NULL OR length(v_codigo)>60 OR v_nombre IS NULL OR length(v_nombre)>120 OR v_precio IS NULL OR v_precio<=0 OR (v_mayoreo IS NOT NULL AND v_mayoreo<=0) THEN
      RAISE EXCEPTION 'Código, nombre y precio válido son obligatorios' USING ERRCODE='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.producto p WHERE p.empresa_id=v_empresa AND p.id<>v_producto AND (p.codigo=v_codigo OR (v_barras IS NOT NULL AND (p.codigo_barras=v_barras OR p.codigo=v_barras)))) THEN
      RAISE EXCEPTION 'Código o barras ya pertenece a otro producto' USING ERRCODE='23505';
    END IF;
    IF EXISTS (SELECT 1 FROM public.producto_variante v WHERE v.empresa_id=v_empresa AND (v.id IS DISTINCT FROM v_id) AND (v.codigo=v_codigo OR (v_barras IS NOT NULL AND (v.codigo_barras=v_barras OR v.codigo=v_barras)))) THEN
      RAISE EXCEPTION 'Código o barras ya pertenece a otra presentación' USING ERRCODE='23505';
    END IF;
  END IF;
  IF p_action='variant_create' THEN
    INSERT INTO public.producto_variante(empresa_id,producto_id,codigo,codigo_barras,nombre,precio,precio_mayoreo,activo)
    VALUES(v_empresa,v_producto,v_codigo,v_barras,v_nombre,v_precio,v_mayoreo,true) RETURNING to_jsonb(producto_variante) INTO v_result;
    RETURN v_result;
  ELSIF p_action='variant_update' THEN
    UPDATE public.producto_variante SET codigo=v_codigo,codigo_barras=v_barras,nombre=v_nombre,precio=v_precio,precio_mayoreo=v_mayoreo
      WHERE id=v_id AND producto_id=v_producto AND empresa_id=v_empresa AND activo=true RETURNING to_jsonb(producto_variante) INTO v_result;
  ELSIF p_action='variant_deactivate' THEN
    UPDATE public.producto_variante SET activo=false WHERE id=v_id AND producto_id=v_producto AND empresa_id=v_empresa AND activo=true RETURNING to_jsonb(producto_variante) INTO v_result;
  ELSE RAISE EXCEPTION 'Operación no permitida' USING ERRCODE='22023';
  END IF;
  IF v_result IS NULL THEN RAISE EXCEPTION 'Presentación no encontrada o inactiva' USING ERRCODE='P0002'; END IF;
  RETURN v_result;
END; $fn$;
REVOKE ALL ON FUNCTION public.pos_variante_mutar_auth(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_variante_mutar_auth(text,jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_variante_mutar_auth(text,jsonb) IS 'CRUD de variantes; empresa derivada de auth.uid(); no altera stock.';
COMMIT;
