-- PREVIEW SOLAMENTE. Verificar columnas y permisos en staging antes de ejecutar.
-- Consulta de lotes vencidos y próximos a vencer; no modifica stock ni registra mermas.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_inventario_vencimientos_auth(p_sucursal_id integer, p_dias integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_auth uuid:=auth.uid();
  v_user integer;
  v_empresa integer;
  v_result jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000';
  END IF;
  SELECT id,empresa_id INTO v_user,v_empresa
  FROM public.usuario WHERE supabase_auth_user_id=v_auth AND activo=true;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501';
  END IF;
  IF p_sucursal_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuario_sucursal us
    JOIN public.sucursal s ON s.id=us.sucursal_id
    WHERE us.usuario_id=v_user AND us.sucursal_id=p_sucursal_id AND s.empresa_id=v_empresa
  ) THEN
    RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501';
  END IF;
  IF p_dias IS NULL OR p_dias NOT IN (30,60,90,180,365) THEN
    RAISE EXCEPTION 'Rango de días inválido' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',l.id,'sucursalId',l.sucursal_id,'sucursalNombre',s.nombre,
    'productoId',l.producto_id,'varianteId',NULL,'varianteNombre',NULL,
    'codigo',p.codigo,'codigoPresentacion',p.codigo,'productoNombre',p.nombre,
    'codigoLote',l.codigo_lote,'fechaVencimiento',l.fecha_vencimiento,
    'cantidadDisponible',l.cantidad_disponible,'costoUnitario',l.costo_unitario,
    'valorEnRiesgo',ROUND(l.cantidad_disponible*l.costo_unitario,2),
    'diasRestantes',(l.fecha_vencimiento-CURRENT_DATE),
    'estado',CASE
      WHEN l.fecha_vencimiento<CURRENT_DATE THEN 'VENCIDO'
      WHEN l.fecha_vencimiento=CURRENT_DATE THEN 'VENCE_HOY'
      WHEN l.fecha_vencimiento<=CURRENT_DATE+7 THEN 'CRITICO'
      WHEN l.fecha_vencimiento<=CURRENT_DATE+15 THEN 'PROXIMO'
      ELSE 'VIGENTE' END
  ) ORDER BY l.fecha_vencimiento,l.id),'[]'::jsonb)
  INTO v_result
  FROM public.inventario_lote l
  JOIN public.producto p ON p.id=l.producto_id AND p.empresa_id=l.empresa_id
  JOIN public.sucursal s ON s.id=l.sucursal_id AND s.empresa_id=l.empresa_id
  WHERE l.empresa_id=v_empresa AND l.sucursal_id=p_sucursal_id
    AND l.cantidad_disponible>0 AND l.fecha_vencimiento IS NOT NULL
    AND l.fecha_vencimiento<=CURRENT_DATE+p_dias
  ;
  RETURN jsonb_build_object('lotes',COALESCE(v_result,'[]'::jsonb));
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_inventario_vencimientos_auth(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_inventario_vencimientos_auth(integer,integer) TO authenticated;
COMMIT;
