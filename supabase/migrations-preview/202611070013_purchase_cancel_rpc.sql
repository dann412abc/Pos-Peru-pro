-- PREVIEW: anulación segura de compras. Solo permite revertir compras sin pagos,
-- devoluciones ni consumo/modificación posterior del stock adquirido.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_compra_anular_auth(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_auth uuid:=auth.uid(); v_empresa integer; v_usuario integer; v_compra public.compra%ROWTYPE;
  v_compra_id bigint; v_motivo text; v_line record; v_stock numeric(12,3); v_costo numeric(12,4);
  v_count integer:=0;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
  SELECT id,empresa_id INTO v_usuario,v_empresa FROM public.usuario
   WHERE supabase_auth_user_id=v_auth AND activo=true;
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Solicitud inválida' USING ERRCODE='22023'; END IF;
  v_compra_id:=NULLIF(p_payload->>'compraId','')::bigint;
  v_motivo:=left(btrim(COALESCE(p_payload->>'motivo','')),500);
  IF v_compra_id IS NULL OR length(v_motivo)<5 THEN RAISE EXCEPTION 'Compra y motivo son obligatorios' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_compra FROM public.compra WHERE id=v_compra_id AND empresa_id=v_empresa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra no encontrada' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.usuario_sucursal WHERE usuario_id=v_usuario AND sucursal_id=v_compra.sucursal_id) THEN
    RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501'; END IF;
  IF v_compra.estado='ANULADA' THEN RETURN jsonb_build_object('ok',true,'duplicada',true,'compraId',v_compra_id,'estado','ANULADA'); END IF;
  IF v_compra.estado<>'RECIBIDA' THEN RAISE EXCEPTION 'Solo se anulan compras recibidas' USING ERRCODE='22023'; END IF;
  IF v_compra.pagado<>0 OR EXISTS(SELECT 1 FROM public.compra_pago WHERE compra_id=v_compra_id AND empresa_id=v_empresa)
     OR EXISTS(SELECT 1 FROM public.devolucion_proveedor WHERE compra_id=v_compra_id AND empresa_id=v_empresa) THEN
    RAISE EXCEPTION 'No se puede anular: la compra tiene pagos o devoluciones. Regularice esos movimientos primero.' USING ERRCODE='22023';
  END IF;
  -- Verifica que cada lote conserve toda la cantidad recibida y que el stock/costo
  -- siga exactamente en el estado posterior a la compra. Evita borrar ventas/ajustes posteriores.
  FOR v_line IN SELECT cl.* FROM public.compra_linea cl WHERE cl.compra_id=v_compra_id AND cl.empresa_id=v_empresa ORDER BY cl.id LOOP
    IF NOT EXISTS(SELECT 1 FROM public.inventario_lote il WHERE il.compra_linea_id=v_line.id AND il.compra_id=v_compra_id
       AND il.empresa_id=v_empresa AND il.sucursal_id=v_compra.sucursal_id
       AND il.cantidad_disponible=il.cantidad_inicial AND il.cantidad_inicial=v_line.cantidad) THEN
      RAISE EXCEPTION 'No se puede anular: el lote fue consumido o modificado. Use una devolución/regularización.' USING ERRCODE='22023';
    END IF;
    IF v_line.variante_id IS NULL THEN
      SELECT stock,costo_promedio INTO v_stock,v_costo FROM public.producto_stock
       WHERE empresa_id=v_empresa AND sucursal_id=v_compra.sucursal_id AND producto_id=v_line.producto_id FOR UPDATE;
    ELSE
      SELECT stock,costo_promedio INTO v_stock,v_costo FROM public.producto_variante_stock
       WHERE empresa_id=v_empresa AND sucursal_id=v_compra.sucursal_id AND producto_id=v_line.producto_id AND variante_id=v_line.variante_id FOR UPDATE;
    END IF;
    IF NOT FOUND OR abs(v_stock-v_line.stock_posterior)>0.0005 OR abs(v_costo-v_line.costo_promedio_posterior)>0.0005 THEN
      RAISE EXCEPTION 'No se puede anular: el inventario cambió después de recibir la compra.' USING ERRCODE='22023';
    END IF;
    v_count:=v_count+1;
  END LOOP;
  IF v_count=0 THEN RAISE EXCEPTION 'La compra no tiene líneas para revertir' USING ERRCODE='22023'; END IF;
  FOR v_line IN SELECT cl.* FROM public.compra_linea cl WHERE cl.compra_id=v_compra_id AND cl.empresa_id=v_empresa ORDER BY cl.id LOOP
    UPDATE public.inventario_lote SET cantidad_disponible=0
      WHERE compra_linea_id=v_line.id AND compra_id=v_compra_id AND empresa_id=v_empresa;
    IF v_line.variante_id IS NULL THEN
      UPDATE public.producto_stock SET stock=v_line.stock_anterior,costo_promedio=v_line.costo_promedio_anterior,updated_at=now()
       WHERE empresa_id=v_empresa AND sucursal_id=v_compra.sucursal_id AND producto_id=v_line.producto_id;
    ELSE
      UPDATE public.producto_variante_stock SET stock=v_line.stock_anterior,costo_promedio=v_line.costo_promedio_anterior,updated_at=now()
       WHERE empresa_id=v_empresa AND sucursal_id=v_compra.sucursal_id AND producto_id=v_line.producto_id AND variante_id=v_line.variante_id;
    END IF;
    INSERT INTO public.movimiento_inventario(empresa_id,sucursal_id,producto_id,variante_id,compra_id,usuario_id,tipo,cantidad,stock_anterior,stock_posterior,motivo)
    VALUES(v_empresa,v_compra.sucursal_id,v_line.producto_id,v_line.variante_id,v_compra_id,v_usuario,'SALIDA',v_line.cantidad,v_line.stock_posterior,v_line.stock_anterior,left('Anulación compra #'||v_compra_id||': '||v_motivo,200));
  END LOOP;
  UPDATE public.compra SET estado='ANULADA',motivo_anulacion=v_motivo,saldo_pendiente=0
   WHERE id=v_compra_id AND empresa_id=v_empresa;
  RETURN jsonb_build_object('ok',true,'duplicada',false,'compraId',v_compra_id,'estado','ANULADA','lineasRevertidas',v_count);
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_compra_anular_auth(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_compra_anular_auth(jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_compra_anular_auth(jsonb) IS 'Anulación atómica y conservadora: solo revierte compras sin pagos/devoluciones y con stock/lotes intactos.';
COMMIT;
