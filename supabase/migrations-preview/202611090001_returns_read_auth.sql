-- PREVIEW ONLY: lecturas de historial y búsqueda de devoluciones.
-- No registra devoluciones ni modifica saldos, caja o inventario.
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_devoluciones_listar_auth(p_sucursal_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_usuario integer:=public.mi_usuario_id();
  v_empresa integer:=public.mi_empresa_id();
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_usuario IS NULL OR v_empresa IS NULL OR public.mi_rol() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo un administrador vinculado puede consultar devoluciones' USING ERRCODE='42501';
  END IF;
  IF p_sucursal_id IS NOT NULL AND NOT public.mi_puede_ver_sucursal(p_sucursal_id) THEN
    RAISE EXCEPTION 'No tiene acceso a esta sucursal' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT d.id,d.comprobante_id AS "comprobanteId",d.sucursal_id AS "sucursalId",
      d.motivo,d.total_devolucion AS "totalDevolucion",
      d.credito_revertido AS "creditoRevertido",d.monto_reembolsado AS "montoReembolsado",
      d.created_at AS "createdAt",c.tipo,c.serie,c.correlativo,
      cl.nombre AS "clienteNombre",u.nombre AS responsable,
      (SELECT count(*)::integer FROM public.devolucion_venta_linea dl WHERE dl.devolucion_id=d.id) AS lineas,
      nc.id AS "notaCreditoId",nc.serie AS "notaCreditoSerie",nc.correlativo AS "notaCreditoCorrelativo",
      d.created_at
    FROM public.devolucion_venta d
    JOIN public.comprobante c ON c.id=d.comprobante_id AND c.empresa_id=d.empresa_id
    JOIN public.cliente cl ON cl.id=d.cliente_id AND cl.empresa_id=d.empresa_id
    JOIN public.usuario u ON u.id=d.usuario_id AND u.empresa_id=d.empresa_id
    LEFT JOIN public.comprobante nc ON nc.devolucion_venta_id=d.id AND nc.empresa_id=d.empresa_id AND nc.tipo='07'
    WHERE d.empresa_id=v_empresa AND (p_sucursal_id IS NULL OR d.sucursal_id=p_sucursal_id)
      AND public.mi_puede_ver_sucursal(d.sucursal_id)
    ORDER BY d.created_at DESC,d.id DESC
    LIMIT 300
  ) q;
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.pos_devoluciones_buscar_auth(p_termino text,p_sucursal_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_usuario integer:=public.mi_usuario_id();
  v_empresa integer:=public.mi_empresa_id();
  v_q text:=btrim(coalesce(p_termino,''));
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_usuario IS NULL OR v_empresa IS NULL OR public.mi_rol() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo un administrador vinculado puede buscar comprobantes para devolución' USING ERRCODE='42501';
  END IF;
  IF length(v_q)<2 OR length(v_q)>80 THEN
    RAISE EXCEPTION 'Escriba entre 2 y 80 caracteres para buscar' USING ERRCODE='22023';
  END IF;
  IF p_sucursal_id IS NOT NULL AND NOT public.mi_puede_ver_sucursal(p_sucursal_id) THEN
    RAISE EXCEPTION 'No tiene acceso a esta sucursal' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.fecha_emision DESC,q.id DESC),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT c.id,c.tipo,c.serie,c.correlativo,c.total,c.estado,
      c.fecha_emision AS "fechaEmision",
      jsonb_build_object('nombre',cl.nombre) AS cliente,
      c.fecha_emision
    FROM public.comprobante c
    JOIN public.cliente cl ON cl.id=c.cliente_id AND cl.empresa_id=c.empresa_id
    WHERE c.empresa_id=v_empresa AND (p_sucursal_id IS NULL OR c.sucursal_id=p_sucursal_id)
      AND c.tipo IN ('01','03') AND c.estado<>'ANULADA'
      AND public.mi_puede_ver_sucursal(c.sucursal_id)
      AND (c.serie ILIKE '%'||v_q||'%' OR c.correlativo::text ILIKE '%'||v_q||'%'
        OR (c.serie||'-'||lpad(c.correlativo::text,8,'0')) ILIKE '%'||v_q||'%'
        OR cl.nombre ILIKE '%'||v_q||'%' OR coalesce(cl.numero,'') ILIKE '%'||v_q||'%')
    ORDER BY c.fecha_emision DESC,c.id DESC
    LIMIT 100
  ) q;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.pos_devoluciones_listar_auth(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pos_devoluciones_buscar_auth(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_devoluciones_listar_auth(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_devoluciones_buscar_auth(text,integer) TO authenticated;

COMMIT;
