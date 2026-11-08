-- PREVIEW, NO EJECUTAR SIN REVISIÓN Y PRUEBAS EN STAGING.
-- Esta función SOLO valida cantidades y estima importes; NO registra devoluciones.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_compra_devolucion_prevalidar_auth(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
 v_auth uuid:=auth.uid(); v_empresa integer; v_usuario integer; v_compra bigint;
 v_sucursal integer; v_saldo numeric; v_estado text; v_line jsonb; v_total numeric:=0;
 v_compra_linea bigint; v_lote bigint; v_cantidad numeric; v_costo numeric;
 v_comprado numeric; v_lote_disponible numeric; v_ya_devuelto numeric;
 v_aplicable numeric; v_favor numeric;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE='28000'; END IF;
 SELECT id,empresa_id INTO v_usuario,v_empresa FROM public.usuario WHERE supabase_auth_user_id=v_auth AND activo=true;
 IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario no autorizado' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_payload)<>'object' OR jsonb_typeof(p_payload->'lineas')<>'array'
    OR jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'Formato de devolución inválido' USING ERRCODE='22023'; END IF;
 v_compra:=NULLIF(p_payload->>'compraId','')::bigint;
 SELECT sucursal_id,saldo_pendiente,estado INTO v_sucursal,v_saldo,v_estado
 FROM public.compra WHERE id=v_compra AND empresa_id=v_empresa;
 IF v_sucursal IS NULL OR v_estado<>'RECIBIDA' THEN RAISE EXCEPTION 'Compra no válida para devolución' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuario_sucursal WHERE usuario_id=v_usuario AND sucursal_id=v_sucursal) THEN
   RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501'; END IF;
 -- Rechaza repetir lote y línea en una misma solicitud: evita sobreestimar disponibilidad.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'lineas') x
    GROUP BY x->>'compraLineaId',x->>'loteId' HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Línea y lote duplicados' USING ERRCODE='22023'; END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
   v_compra_linea:=NULLIF(v_line->>'compraLineaId','')::bigint;
   v_lote:=NULLIF(v_line->>'loteId','')::bigint;
   v_cantidad:=NULLIF(v_line->>'cantidad','')::numeric;
   IF v_cantidad IS NULL OR v_cantidad<=0 THEN RAISE EXCEPTION 'Cantidad inválida' USING ERRCODE='22023'; END IF;
   SELECT cl.cantidad,cl.costo_unitario,il.cantidad_disponible
     INTO v_comprado,v_costo,v_lote_disponible
   FROM public.compra_linea cl JOIN public.inventario_lote il
     ON il.compra_linea_id=cl.id AND il.compra_id=cl.compra_id
   WHERE cl.id=v_compra_linea AND cl.compra_id=v_compra AND cl.empresa_id=v_empresa
     AND il.id=v_lote AND il.empresa_id=v_empresa AND il.sucursal_id=v_sucursal;
   IF NOT FOUND THEN RAISE EXCEPTION 'Lote no pertenece a la compra' USING ERRCODE='22023'; END IF;
   SELECT COALESCE(sum(dl.cantidad),0) INTO v_ya_devuelto
   FROM public.devolucion_proveedor_linea dl JOIN public.devolucion_proveedor d ON d.id=dl.devolucion_id
   WHERE dl.compra_linea_id=v_compra_linea AND dl.lote_id=v_lote AND d.empresa_id=v_empresa;
   IF v_cantidad>v_lote_disponible OR v_cantidad>v_comprado-v_ya_devuelto THEN
      RAISE EXCEPTION 'Cantidad supera stock disponible o cantidad comprada' USING ERRCODE='22023'; END IF;
   v_total:=v_total+round(v_cantidad*v_costo,2);
 END LOOP;
 v_total:=round(v_total,2);
 v_aplicable:=least(v_total,greatest(v_saldo,0)); v_favor:=greatest(v_total-v_aplicable,0);
 RETURN jsonb_build_object('valida',true,'totalEstimado',v_total,'saldoAplicable',v_aplicable,'saldoFavorEstimado',v_favor,
  'advertencia','Estimación de solo lectura: volver a validar con bloqueos durante el registro definitivo.');
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_compra_devolucion_prevalidar_auth(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_compra_devolucion_prevalidar_auth(jsonb) TO authenticated;
COMMIT;
