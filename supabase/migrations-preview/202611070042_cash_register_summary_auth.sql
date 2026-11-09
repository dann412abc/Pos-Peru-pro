-- PREVIEW ONLY: resumen autenticado de caja para migración Supabase.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_caja_resumen_auth(p_caja_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_auth uuid := auth.uid();
  v_usuario integer;
  v_empresa integer;
  v_sucursal integer;
  v_saldo numeric(12,2);
  v_ventas integer;
  v_total numeric(12,2);
  v_efectivo numeric(12,2);
  v_tarjeta numeric(12,2);
  v_yape numeric(12,2);
  v_plin numeric(12,2);
  v_credito numeric(12,2);
  v_mov_efectivo numeric(12,2);
  v_efectivo_esperado numeric(12,2);
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
  SELECT u.id,u.empresa_id INTO v_usuario,v_empresa
  FROM public.usuario u
  WHERE u.auth_user_id=v_auth AND u.activo=true;
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;

  SELECT c.sucursal_id,c.saldo_inicial INTO v_sucursal,v_saldo
  FROM public.caja c
  JOIN public.sucursal s ON s.id=c.sucursal_id AND s.empresa_id=v_empresa
  JOIN public.usuario_sucursal us ON us.sucursal_id=c.sucursal_id AND us.usuario_id=v_usuario
  WHERE c.id=p_caja_id AND c.usuario_id=v_usuario;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja no encontrada o no autorizada' USING ERRCODE='42501'; END IF;

  SELECT COUNT(*)::integer,
         COALESCE(SUM(c.total),0)::numeric(12,2)
    INTO v_ventas,v_total
  FROM public.comprobante c
  WHERE c.caja_id=p_caja_id AND c.empresa_id=v_empresa AND c.estado <> 'ANULADA';

  -- Desglose de cobros: comprobantes nuevos usan comprobante_pago;
  -- documentos antiguos sin detalle usan el medio e importe principal.
  SELECT
    COALESCE(SUM(p.monto) FILTER (WHERE p.metodo='EFECTIVO'),0),
    COALESCE(SUM(p.monto) FILTER (WHERE p.metodo='TARJETA'),0),
    COALESCE(SUM(p.monto) FILTER (WHERE p.metodo='YAPE'),0),
    COALESCE(SUM(p.monto) FILTER (WHERE p.metodo='PLIN'),0),
    COALESCE(SUM(p.monto) FILTER (WHERE p.metodo='CREDITO'),0)
  INTO v_efectivo,v_tarjeta,v_yape,v_plin,v_credito
  FROM (
    SELECT cp.metodo_pago AS metodo,cp.monto
    FROM public.comprobante_pago cp
    JOIN public.comprobante c ON c.id=cp.comprobante_id
    WHERE c.caja_id=p_caja_id AND c.empresa_id=v_empresa AND c.estado <> 'ANULADA'
    UNION ALL
    SELECT c.metodo_pago,c.total
    FROM public.comprobante c
    WHERE c.caja_id=p_caja_id AND c.empresa_id=v_empresa AND c.estado <> 'ANULADA'
      AND NOT EXISTS (SELECT 1 FROM public.comprobante_pago cp WHERE cp.comprobante_id=c.id)
  ) p;

  SELECT COALESCE(SUM(CASE WHEN cm.tipo='INGRESO' THEN cm.monto ELSE -cm.monto END)
      FILTER (WHERE cm.metodo_pago='EFECTIVO'),0)::numeric(12,2)
    INTO v_mov_efectivo
  FROM public.caja_movimiento cm WHERE cm.caja_id=p_caja_id AND cm.usuario_id=v_usuario;

  v_efectivo_esperado := round(COALESCE(v_saldo,0)+COALESCE(v_efectivo,0)+COALESCE(v_mov_efectivo,0),2);
  RETURN jsonb_build_object(
    'cantidadVentas',v_ventas,'totalVentas',v_total,'totalDevoluciones',0,
    'porMetodo',jsonb_build_object(
      'EFECTIVO',round(COALESCE(v_efectivo,0),2),
      'TARJETA',round(COALESCE(v_tarjeta,0),2),
      'YAPE',round(COALESCE(v_yape,0),2),
      'PLIN',round(COALESCE(v_plin,0),2),
      'CREDITO',round(COALESCE(v_credito,0),2)
    ),
    'efectivoEsperado',v_efectivo_esperado
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_caja_resumen_auth(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_caja_resumen_auth(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_caja_resumen_auth(integer) TO authenticated;
COMMIT;
