-- PREVIEW SOLAMENTE. NO EJECUTAR EN PRODUCCION.
-- CRUD acotado: usuario/empresa/sucursal se derivan de auth.uid(). No acepta empresa_id.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_catalogo_mutar_auth(p_action text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_auth uuid := auth.uid(); v_user integer; v_empresa integer; v_id integer; v_sucursal integer; v_nombre text; v_codigo text; v_result jsonb; v_rol text;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
  SELECT id, empresa_id, upper(rol) INTO v_user, v_empresa, v_rol FROM public.usuario WHERE auth_user_id=v_auth AND activo=TRUE;
  IF v_user IS NULL OR v_rol <> 'ADMIN' THEN RAISE EXCEPTION 'Usuario POS no vinculado, inactivo o sin rol administrador' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Payload inválido' USING ERRCODE='22023'; END IF;

  IF p_action LIKE 'product_%' THEN
    v_id := NULLIF(p_payload->>'id','')::integer;
    v_codigo := NULLIF(btrim(p_payload->>'codigo'),''); v_nombre := NULLIF(btrim(p_payload->>'nombre'),'');
    IF p_action IN ('product_create','product_update') THEN
      IF v_codigo IS NULL OR length(v_codigo)>30 OR v_nombre IS NULL OR length(v_nombre)>200 THEN RAISE EXCEPTION 'Código y nombre son obligatorios' USING ERRCODE='22023'; END IF;
      IF COALESCE((p_payload->>'precio')::numeric,0) < 0 OR COALESCE((p_payload->>'stock_minimo')::numeric,0) < 0 THEN RAISE EXCEPTION 'Precio o stock mínimo inválido' USING ERRCODE='22023'; END IF;
      IF COALESCE((p_payload->>'tipo_igv')::integer,10) NOT IN (10,20,30) THEN RAISE EXCEPTION 'Tipo IGV inválido' USING ERRCODE='22023'; END IF;
      IF NULLIF(p_payload->>'categoria_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categoria WHERE id=(p_payload->>'categoria_id')::integer AND empresa_id=v_empresa AND activo=TRUE) THEN RAISE EXCEPTION 'Categoría no pertenece a la empresa' USING ERRCODE='42501'; END IF;
    END IF;
    IF p_action='product_create' THEN
      v_sucursal := NULLIF(p_payload->>'sucursal_id','')::integer;
      IF v_sucursal IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.usuario_sucursal us
        JOIN public.sucursal s ON s.id=us.sucursal_id AND s.empresa_id=v_empresa
        WHERE us.usuario_id=v_user AND us.sucursal_id=v_sucursal
      ) THEN RAISE EXCEPTION 'Sucursal no autorizada para crear el producto' USING ERRCODE='42501'; END IF;
      INSERT INTO public.producto(empresa_id,codigo,nombre,categoria_id,codigo_barras,tiene_variantes,unidad,precio,precio_mayoreo,stock_minimo,tipo_igv,activo)
      VALUES(v_empresa,v_codigo,v_nombre,NULLIF(p_payload->>'categoria_id','')::integer,NULLIF(btrim(p_payload->>'codigo_barras'),''),COALESCE((p_payload->>'tiene_variantes')::boolean,false),COALESCE(NULLIF(p_payload->>'unidad',''),'NIU'),(p_payload->>'precio')::numeric,NULLIF(p_payload->>'precio_mayoreo','')::numeric,COALESCE((p_payload->>'stock_minimo')::numeric,0),COALESCE((p_payload->>'tipo_igv')::integer,10),true) RETURNING id INTO v_id;
      INSERT INTO public.producto_stock(empresa_id,sucursal_id,producto_id,stock,stock_minimo)
      VALUES(v_empresa,v_sucursal,v_id,0,COALESCE((p_payload->>'stock_minimo')::numeric,0))
      ON CONFLICT (producto_id,sucursal_id) DO NOTHING;
      SELECT to_jsonb(p) INTO v_result FROM public.producto p WHERE p.id=v_id;
      RETURN v_result;
    ELSIF p_action='product_update' THEN
      UPDATE public.producto SET codigo=v_codigo,nombre=v_nombre,categoria_id=NULLIF(p_payload->>'categoria_id','')::integer,codigo_barras=NULLIF(btrim(p_payload->>'codigo_barras'),''),tiene_variantes=COALESCE((p_payload->>'tiene_variantes')::boolean,false),unidad=COALESCE(NULLIF(p_payload->>'unidad',''),'NIU'),precio=(p_payload->>'precio')::numeric,precio_mayoreo=NULLIF(p_payload->>'precio_mayoreo','')::numeric,stock_minimo=COALESCE((p_payload->>'stock_minimo')::numeric,0),tipo_igv=COALESCE((p_payload->>'tipo_igv')::integer,10)
      WHERE id=v_id AND empresa_id=v_empresa AND activo=true RETURNING to_jsonb(producto) INTO v_result;
      IF v_result IS NULL THEN RAISE EXCEPTION 'Producto no encontrado o inactivo' USING ERRCODE='P0002'; END IF; RETURN v_result;
    ELSIF p_action='product_deactivate' THEN
      UPDATE public.producto SET activo=false WHERE id=v_id AND empresa_id=v_empresa AND activo=true RETURNING to_jsonb(producto) INTO v_result;
      IF v_result IS NULL THEN RAISE EXCEPTION 'Producto no encontrado o ya inactivo' USING ERRCODE='P0002'; END IF; RETURN v_result;
    END IF;
  ELSIF p_action LIKE 'category_%' THEN
    v_id := NULLIF(p_payload->>'id','')::integer; v_nombre := NULLIF(btrim(p_payload->>'nombre'),'');
    IF p_action IN ('category_create','category_update') AND (v_nombre IS NULL OR length(v_nombre)>100) THEN RAISE EXCEPTION 'Nombre de categoría obligatorio (máximo 100)' USING ERRCODE='22023'; END IF;
    IF p_action='category_create' THEN INSERT INTO public.categoria(empresa_id,nombre,activo) VALUES(v_empresa,v_nombre,true) RETURNING to_jsonb(categoria) INTO v_result; RETURN v_result;
    ELSIF p_action='category_update' THEN UPDATE public.categoria SET nombre=v_nombre WHERE id=v_id AND empresa_id=v_empresa AND activo=true RETURNING to_jsonb(categoria) INTO v_result;
    ELSE UPDATE public.categoria SET activo=false WHERE id=v_id AND empresa_id=v_empresa AND activo=true RETURNING to_jsonb(categoria) INTO v_result;
    END IF;
    IF v_result IS NULL THEN RAISE EXCEPTION 'Categoría no encontrada o inactiva' USING ERRCODE='P0002'; END IF; RETURN v_result;
  END IF;
  RAISE EXCEPTION 'Operación no permitida' USING ERRCODE='22023';
END; $fn$;
REVOKE ALL ON FUNCTION public.pos_catalogo_mutar_auth(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_catalogo_mutar_auth(text,jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_catalogo_mutar_auth(text,jsonb) IS 'CRUD acotado de productos/categorías; empresa derivada exclusivamente de auth.uid().';
COMMIT;
