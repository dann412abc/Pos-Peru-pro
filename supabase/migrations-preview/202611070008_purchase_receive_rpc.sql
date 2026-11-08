-- PREVIEW SOLAMENTE. NO EJECUTAR EN PRODUCCION.
-- Recepción atómica de compras. Empresa/usuario se derivan exclusivamente de auth.uid().
-- Requiere las migraciones base de compras, lotes, variantes y vínculo de identidad.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_compra_recibir_auth(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_auth uuid := auth.uid(); v_empresa integer; v_usuario integer; v_sucursal integer; v_proveedor integer;
  v_compra bigint; v_line jsonb; v_pago jsonb; v_idx integer := 0; v_producto integer; v_variante integer;
  v_tipo_igv integer; v_cantidad numeric(12,3); v_costo numeric(12,4); v_base numeric(12,2); v_igv numeric(12,2); v_subtotal numeric(12,2);
  v_total numeric(12,2) := 0; v_gravadas numeric(12,2) := 0; v_exoneradas numeric(12,2) := 0; v_inafectas numeric(12,2) := 0; v_total_igv numeric(12,2) := 0;
  v_pagado numeric(12,2) := 0; v_stock numeric(12,3); v_costo_prom numeric(12,4); v_stock_nuevo numeric(12,3); v_costo_nuevo numeric(12,4);
  v_producto_nombre text; v_variante_nombre text; v_variante_codigo text; v_codigo_lote text; v_fecha_venc date; v_linea_id bigint;
  v_condicion text; v_idem text; v_tipo_doc text; v_serie text; v_numero text; v_fecha date; v_result jsonb;
  v_caja integer; v_metodo text; v_monto numeric(12,2); v_ref text; v_caja_row record; v_efectivo numeric(12,2);
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
  SELECT u.id,u.empresa_id INTO v_usuario,v_empresa FROM public.usuario u WHERE u.supabase_auth_user_id=v_auth AND u.activo=true;
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_payload)<>'object' OR COALESCE(jsonb_typeof(p_payload->'lineas'),'null')<>'array' OR jsonb_array_length(COALESCE(p_payload->'lineas','[]'::jsonb)) NOT BETWEEN 1 AND 200
     OR COALESCE(jsonb_typeof(COALESCE(p_payload->'pagos','[]'::jsonb)),'null')<>'array' OR jsonb_array_length(COALESCE(p_payload->'pagos','[]'::jsonb))>20 THEN
    RAISE EXCEPTION 'Datos de compra inválidos' USING ERRCODE='22023';
  END IF;
  v_sucursal := (p_payload->>'sucursalId')::integer; v_proveedor := (p_payload->>'proveedorId')::integer;
  v_condicion := upper(COALESCE(p_payload->>'condicionPago',''));
  v_idem := p_payload->>'idempotencyKey'; v_tipo_doc := COALESCE(NULLIF(p_payload->>'tipoDocumento',''),'01');
  v_serie := COALESCE(p_payload->>'serie',''); v_numero := COALESCE(p_payload->>'numero','');
  v_fecha := COALESCE(NULLIF(p_payload->>'fechaDocumento','')::date,CURRENT_DATE);
  IF v_sucursal IS NULL OR v_proveedor IS NULL OR v_condicion NOT IN ('CONTADO','CREDITO') OR v_tipo_doc NOT IN ('01','03','NV','OT')
     OR v_idem IS NULL OR v_idem !~ '^[A-Za-z0-9._:-]{12,100}$' THEN RAISE EXCEPTION 'Cabecera de compra inválida' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.usuario_sucursal us WHERE us.usuario_id=v_usuario AND us.sucursal_id=v_sucursal)
     OR NOT EXISTS(SELECT 1 FROM public.sucursal s WHERE s.id=v_sucursal AND s.empresa_id=v_empresa)
     OR NOT EXISTS(SELECT 1 FROM public.proveedor p WHERE p.id=v_proveedor AND p.empresa_id=v_empresa AND p.activo=true) THEN
    RAISE EXCEPTION 'Sucursal o proveedor no autorizado' USING ERRCODE='42501';
  END IF;
  SELECT c.id INTO v_compra FROM public.compra c WHERE c.empresa_id=v_empresa AND c.idempotency_key=v_idem;
  IF v_compra IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'duplicada',true,'compraId',v_compra); END IF;
  -- Bloqueo de proveedor y sucursal para serializar la comprobación de duplicados/documento.
  PERFORM 1 FROM public.proveedor WHERE id=v_proveedor AND empresa_id=v_empresa FOR SHARE;
  IF v_numero<>'' AND EXISTS(SELECT 1 FROM public.compra WHERE empresa_id=v_empresa AND proveedor_id=v_proveedor AND tipo_documento=v_tipo_doc AND serie=v_serie AND numero=v_numero) THEN
    RAISE EXCEPTION 'El documento del proveedor ya fue registrado' USING ERRCODE='23505';
  END IF;
  -- Prevalidación y cálculo total. El costo unitario incluye IGV, como en el POS actual.
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
    v_producto := (v_line->>'productoId')::integer; v_variante := NULLIF(v_line->>'varianteId','')::integer;
    v_cantidad := (v_line->>'cantidad')::numeric; v_costo := (v_line->>'costoUnitario')::numeric;
    IF v_cantidad<=0 OR v_costo<=0 OR v_cantidad>999999999 OR v_costo>99999999 THEN RAISE EXCEPTION 'Cantidad o costo inválido' USING ERRCODE='22023'; END IF;
    SELECT p.tipo_igv,p.nombre INTO v_tipo_igv,v_producto_nombre FROM public.producto p WHERE p.id=v_producto AND p.empresa_id=v_empresa AND p.activo=true;
    IF v_producto_nombre IS NULL THEN RAISE EXCEPTION 'Producto inexistente o inactivo: %',v_producto USING ERRCODE='P0002'; END IF;
    IF v_variante IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.producto_variante pv WHERE pv.id=v_variante AND pv.producto_id=v_producto AND pv.empresa_id=v_empresa AND pv.activo=true) THEN RAISE EXCEPTION 'Variante inválida' USING ERRCODE='22023'; END IF;
    IF v_variante IS NULL AND EXISTS(SELECT 1 FROM public.producto_variante WHERE producto_id=v_producto AND empresa_id=v_empresa AND activo=true) THEN RAISE EXCEPTION 'Debe seleccionar una variante para %',v_producto_nombre USING ERRCODE='22023'; END IF;
    IF COALESCE(NULLIF(v_line->>'tipoIgv','')::integer,v_tipo_igv)<>v_tipo_igv THEN RAISE EXCEPTION 'Afectación IGV no coincide con catálogo' USING ERRCODE='22023'; END IF;
    v_subtotal := round(v_cantidad*v_costo,2);
    v_base := CASE WHEN v_tipo_igv=10 THEN round(v_subtotal/1.18,2) ELSE v_subtotal END;
    v_igv := CASE WHEN v_tipo_igv=10 THEN round(v_subtotal-v_base,2) ELSE 0 END;
    v_total := v_total+v_subtotal; v_total_igv := v_total_igv+v_igv;
    IF v_tipo_igv=10 THEN v_gravadas:=v_gravadas+v_base; ELSIF v_tipo_igv=20 THEN v_exoneradas:=v_exoneradas+v_base; ELSE v_inafectas:=v_inafectas+v_base; END IF;
  END LOOP;
  v_total:=round(v_total,2); v_total_igv:=round(v_total_igv,2); v_gravadas:=round(v_gravadas,2); v_exoneradas:=round(v_exoneradas,2); v_inafectas:=round(v_inafectas,2);
  -- Pagos no pueden exceder el total; contado debe quedar totalmente pagado.
  FOR v_pago IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'pagos','[]'::jsonb)) LOOP
    v_monto := (v_pago->>'monto')::numeric; v_metodo:=upper(v_pago->>'metodoPago');
    IF v_monto<=0 OR v_metodo NOT IN ('EFECTIVO','TARJETA','YAPE','PLIN','TRANSFERENCIA') THEN RAISE EXCEPTION 'Pago inválido' USING ERRCODE='22023'; END IF;
    v_pagado:=v_pagado+v_monto;
  END LOOP;
  v_pagado:=round(v_pagado,2);
  IF v_pagado>v_total OR (v_condicion='CONTADO' AND abs(v_pagado-v_total)>0.01) THEN RAISE EXCEPTION 'Los pagos no coinciden con la condición de compra' USING ERRCODE='22023'; END IF;
  INSERT INTO public.compra(empresa_id,sucursal_id,proveedor_id,usuario_id,tipo_documento,serie,numero,fecha_documento,condicion_pago,fecha_vencimiento,estado,op_gravadas,op_exoneradas,op_inafectas,total_igv,total,pagado,saldo_pendiente,idempotency_key)
  VALUES(v_empresa,v_sucursal,v_proveedor,v_usuario,v_tipo_doc,left(v_serie,12),left(v_numero,30),v_fecha,v_condicion,NULLIF(p_payload->>'fechaVencimiento','')::date,'RECIBIDA',v_gravadas,v_exoneradas,v_inafectas,v_total_igv,v_total,v_pagado,v_total-v_pagado,v_idem)
  RETURNING id INTO v_compra;
  v_idx:=0;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
    v_idx:=v_idx+1; v_producto:=(v_line->>'productoId')::integer; v_variante:=NULLIF(v_line->>'varianteId','')::integer;
    v_cantidad:=(v_line->>'cantidad')::numeric; v_costo:=(v_line->>'costoUnitario')::numeric;
    SELECT p.tipo_igv,p.nombre INTO v_tipo_igv,v_producto_nombre FROM public.producto p WHERE p.id=v_producto AND p.empresa_id=v_empresa FOR SHARE;
    v_subtotal:=round(v_cantidad*v_costo,2); v_base:=CASE WHEN v_tipo_igv=10 THEN round(v_subtotal/1.18,2) ELSE v_subtotal END; v_igv:=CASE WHEN v_tipo_igv=10 THEN round(v_subtotal-v_base,2) ELSE 0 END;
    v_variante_nombre:=NULL; v_variante_codigo:=NULL;
    IF v_variante IS NOT NULL THEN SELECT nombre,codigo INTO v_variante_nombre,v_variante_codigo FROM public.producto_variante WHERE id=v_variante AND producto_id=v_producto AND empresa_id=v_empresa; END IF;
    IF v_variante IS NULL THEN
      SELECT stock,costo_promedio INTO v_stock,v_costo_prom FROM public.producto_stock WHERE producto_id=v_producto AND sucursal_id=v_sucursal AND empresa_id=v_empresa FOR UPDATE;
    ELSE
      SELECT stock,costo_promedio INTO v_stock,v_costo_prom FROM public.producto_variante_stock WHERE variante_id=v_variante AND producto_id=v_producto AND sucursal_id=v_sucursal AND empresa_id=v_empresa FOR UPDATE;
    END IF;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'No existe saldo de inventario para %',v_producto_nombre USING ERRCODE='P0002'; END IF;
    v_stock_nuevo:=v_stock+v_cantidad; v_costo_nuevo:=CASE WHEN v_stock_nuevo=0 THEN v_costo ELSE round(((v_stock*v_costo_prom)+(v_cantidad*v_costo))/v_stock_nuevo,4) END;
    v_codigo_lote:=COALESCE(NULLIF(btrim(v_line->>'codigoLote'),''),'COMPRA-'||v_compra||'-'||v_idx); v_fecha_venc:=NULLIF(v_line->>'fechaVencimiento','')::date;
    INSERT INTO public.compra_linea(compra_id,empresa_id,producto_id,variante_id,variante_nombre,variante_codigo,numero_linea,cantidad,costo_unitario,tipo_igv,base_imponible,igv,subtotal,stock_anterior,stock_posterior,costo_promedio_anterior,costo_promedio_posterior,unidad_compra,cantidad_empaques,unidades_por_empaque,costo_empaque,codigo_lote,fecha_vencimiento)
    VALUES(v_compra,v_empresa,v_producto,v_variante,v_variante_nombre,v_variante_codigo,v_idx,v_cantidad,v_costo,v_tipo_igv,v_base,v_igv,v_subtotal,v_stock,v_stock_nuevo,v_costo_prom,v_costo_nuevo,COALESCE(NULLIF(v_line->>'unidadCompra',''),'UNIDAD'),COALESCE(NULLIF(v_line->>'cantidadEmpaques','')::numeric,v_cantidad),COALESCE(NULLIF(v_line->>'unidadesPorEmpaque','')::numeric,1),COALESCE(NULLIF(v_line->>'costoEmpaque','')::numeric,v_costo),v_codigo_lote,v_fecha_venc)
    RETURNING id INTO v_linea_id;
    INSERT INTO public.inventario_lote(empresa_id,sucursal_id,producto_id,variante_id,compra_id,compra_linea_id,codigo_lote,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario)
    VALUES(v_empresa,v_sucursal,v_producto,v_variante,v_compra,v_linea_id,v_codigo_lote,v_fecha_venc,v_cantidad,v_cantidad,v_costo);
    IF v_variante IS NULL THEN UPDATE public.producto_stock SET stock=v_stock_nuevo,costo_promedio=v_costo_nuevo,updated_at=now() WHERE producto_id=v_producto AND sucursal_id=v_sucursal AND empresa_id=v_empresa;
    ELSE UPDATE public.producto_variante_stock SET stock=v_stock_nuevo,costo_promedio=v_costo_nuevo,updated_at=now() WHERE variante_id=v_variante AND producto_id=v_producto AND sucursal_id=v_sucursal AND empresa_id=v_empresa; END IF;
    INSERT INTO public.movimiento_inventario(empresa_id,sucursal_id,producto_id,variante_id,compra_id,usuario_id,tipo,cantidad,stock_anterior,stock_posterior,motivo)
    VALUES(v_empresa,v_sucursal,v_producto,v_variante,v_compra,v_usuario,'ENTRADA',v_cantidad,v_stock,v_stock_nuevo,left('Recepción compra #'||v_compra||' · '||COALESCE(v_variante_nombre,v_producto_nombre),200));
  END LOOP;
  -- Los pagos se guardan siempre. Solo los pagos asociados a caja generan salida de caja.
  FOR v_pago IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'pagos','[]'::jsonb)) LOOP
    v_monto:=(v_pago->>'monto')::numeric; v_metodo:=upper(v_pago->>'metodoPago'); v_caja:=NULLIF(v_pago->>'cajaId','')::integer; v_ref:=NULLIF(left(COALESCE(v_pago->>'referencia',''),120),'');
    IF v_caja IS NOT NULL THEN
      SELECT c.id,c.saldo_inicial,c.sucursal_id,c.usuario_id INTO v_caja_row FROM public.caja c WHERE c.id=v_caja AND c.sucursal_id=v_sucursal AND c.usuario_id=v_usuario AND c.estado='ABIERTA' FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'La caja no está abierta o no pertenece al usuario/sucursal' USING ERRCODE='42501'; END IF;
      IF v_metodo NOT IN ('EFECTIVO','TARJETA','YAPE','PLIN') THEN RAISE EXCEPTION 'Transferencia bancaria no se registra como movimiento de caja' USING ERRCODE='22023'; END IF;
      IF v_metodo='EFECTIVO' THEN
        SELECT COALESCE(sum(x.monto),0) INTO v_efectivo FROM (
          SELECT cp.monto FROM public.comprobante_pago cp JOIN public.comprobante c ON c.id=cp.comprobante_id WHERE c.caja_id=v_caja AND cp.metodo_pago='EFECTIVO'
          UNION ALL SELECT c.total FROM public.comprobante c WHERE c.caja_id=v_caja AND c.metodo_pago='EFECTIVO' AND NOT EXISTS(SELECT 1 FROM public.comprobante_pago cp WHERE cp.comprobante_id=c.id)
          UNION ALL SELECT CASE WHEN cm.tipo='INGRESO' THEN cm.monto ELSE -cm.monto END FROM public.caja_movimiento cm WHERE cm.caja_id=v_caja AND cm.metodo_pago='EFECTIVO'
        ) x;
        IF v_monto>COALESCE(v_caja_row.saldo_inicial,0)+v_efectivo THEN RAISE EXCEPTION 'Efectivo insuficiente en caja' USING ERRCODE='22023'; END IF;
      END IF;
    END IF;
    INSERT INTO public.compra_pago(empresa_id,compra_id,usuario_id,caja_id,metodo_pago,monto,referencia,idempotency_key)
    VALUES(v_empresa,v_compra,v_usuario,v_caja,v_metodo,v_monto,v_ref,NULL);
    IF v_caja IS NOT NULL THEN INSERT INTO public.caja_movimiento(caja_id,usuario_id,tipo,metodo_pago,monto,motivo,compra_id) VALUES(v_caja,v_usuario,'SALIDA',v_metodo,v_monto,left('Pago a proveedor · compra #'||v_compra,200),v_compra); END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'duplicada',false,'compraId',v_compra,'total',v_total,'pagado',v_pagado,'saldoPendiente',round(v_total-v_pagado,2),'lineas',v_idx);
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_compra_recibir_auth(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_compra_recibir_auth(jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_compra_recibir_auth(jsonb) IS 'Recepción atómica de compras por empresa autenticada: inventario, variantes, lotes, costo promedio, pagos y caja.';
COMMIT;
