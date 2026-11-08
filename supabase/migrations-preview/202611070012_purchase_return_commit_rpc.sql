-- PREVIEW: devolución real a proveedor. Requiere el esquema de compras, lotes y variantes.
-- Todo el proceso se ejecuta en una transacción PostgreSQL.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_compra_devolucion_registrar_auth(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
 v_auth uuid:=auth.uid(); v_empresa integer; v_usuario integer; v_compra_id bigint;
 v_compra public.compra%ROWTYPE; v_motivo text; v_key text; v_hash text;
 v_line jsonb; v_linea_id bigint; v_cantidad numeric(12,3); v_total numeric(12,2):=0;
 v_total_linea numeric(12,2); v_aplicado numeric(12,2); v_favor numeric(12,2);
 v_dev_id bigint; v_row record; v_stock record; v_tomar numeric(12,3); v_pendiente numeric(12,3);
 v_stock_nuevo numeric(12,3); v_costo_nuevo numeric(12,4); v_valor numeric(16,4);
 v_variante integer; v_producto integer; v_sucursal integer; v_subtotal numeric(12,2);
 v_lineas jsonb; v_prev record;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
 SELECT id,empresa_id INTO v_usuario,v_empresa FROM public.usuario WHERE supabase_auth_user_id=v_auth AND activo=true;
 IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_payload)<>'object' OR jsonb_typeof(p_payload->'lineas')<>'array'
    OR jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'Datos de devolución inválidos' USING ERRCODE='22023'; END IF;
 v_compra_id:=NULLIF(p_payload->>'compraId','')::bigint;
 v_motivo:=left(btrim(COALESCE(p_payload->>'motivo','')),500);
 v_key:=NULLIF(p_payload->>'idempotencyKey','');
 IF v_compra_id IS NULL OR length(v_motivo)<5 OR v_key IS NULL OR v_key !~ '^[A-Za-z0-9._:-]{12,100}$' THEN
   RAISE EXCEPTION 'Compra, motivo o clave de idempotencia inválidos' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'lineas') x GROUP BY x->>'compraLineaId' HAVING count(*)>1) THEN
   RAISE EXCEPTION 'No repita líneas de compra' USING ERRCODE='22023'; END IF;
 v_hash:=md5(jsonb_build_object('compraId',v_compra_id,'motivo',v_motivo,'lineas',p_payload->'lineas')::text);
 PERFORM pg_advisory_xact_lock(hashtextextended('supplier-return:'||v_empresa||':'||v_usuario||':'||v_key,0));
 SELECT id,request_hash,total,aplicado_cuenta,saldo_a_favor INTO v_prev FROM public.devolucion_proveedor WHERE empresa_id=v_empresa AND usuario_id=v_usuario AND idempotency_key=v_key;
 IF FOUND THEN
   IF v_prev.request_hash<>v_hash THEN RAISE EXCEPTION 'Clave de idempotencia reutilizada con otros datos' USING ERRCODE='23505'; END IF;
   RETURN jsonb_build_object('ok',true,'duplicado',true,'devolucionId',v_prev.id,'compraId',v_compra_id,'total',v_prev.total,'aplicadoCuenta',v_prev.aplicado_cuenta,'saldoAFavor',v_prev.saldo_a_favor);
 END IF;
 SELECT * INTO v_compra FROM public.compra WHERE id=v_compra_id AND empresa_id=v_empresa FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Compra no encontrada' USING ERRCODE='P0002'; END IF;
 IF v_compra.estado<>'RECIBIDA' THEN RAISE EXCEPTION 'La compra no está recibida' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuario_sucursal WHERE usuario_id=v_usuario AND sucursal_id=v_compra.sucursal_id) THEN
   RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501'; END IF;
 v_sucursal:=v_compra.sucursal_id;
 -- Primera pasada: valida las cantidades contra lo comprado y lo ya devuelto.
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
   v_linea_id:=NULLIF(v_line->>'compraLineaId','')::bigint;
   v_cantidad:=NULLIF(v_line->>'cantidad','')::numeric;
   IF v_linea_id IS NULL OR v_cantidad IS NULL OR v_cantidad<=0 OR round(v_cantidad,3)<>v_cantidad THEN
     RAISE EXCEPTION 'Línea o cantidad inválida' USING ERRCODE='22023'; END IF;
   PERFORM 1 FROM public.compra_linea WHERE id=v_linea_id AND compra_id=v_compra_id AND empresa_id=v_empresa FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Línea no pertenece a la compra' USING ERRCODE='22023'; END IF;
   SELECT cl.cantidad,cl.costo_unitario,cl.producto_id,cl.variante_id,
     COALESCE((SELECT sum(dl.cantidad) FROM public.devolucion_proveedor_linea dl JOIN public.devolucion_proveedor d ON d.id=dl.devolucion_id WHERE dl.compra_linea_id=cl.id AND d.empresa_id=v_empresa),0) AS cantidad_devuelta
     INTO v_row FROM public.compra_linea cl WHERE cl.id=v_linea_id AND cl.compra_id=v_compra_id AND cl.empresa_id=v_empresa;
   IF v_cantidad>v_row.cantidad-v_row.cantidad_devuelta+0.0005 THEN RAISE EXCEPTION 'Cantidad a devolver excede lo adquirido' USING ERRCODE='22023'; END IF;
   -- Se verifica stock total de los lotes de la compra (o lotes del producto para compras históricas).
   SELECT COALESCE(sum(il.cantidad_disponible),0) INTO v_pendiente FROM public.inventario_lote il
    WHERE il.empresa_id=v_empresa AND il.sucursal_id=v_sucursal AND il.producto_id=v_row.producto_id
      AND il.variante_id IS NOT DISTINCT FROM v_row.variante_id
      AND (il.compra_linea_id=v_linea_id OR (NOT EXISTS(SELECT 1 FROM public.inventario_lote own WHERE own.compra_linea_id=v_linea_id AND own.empresa_id=v_empresa)));
   IF v_cantidad>v_pendiente+0.0005 THEN RAISE EXCEPTION 'Stock insuficiente para devolver esta línea' USING ERRCODE='22023'; END IF;
   v_total:=v_total+round(v_cantidad*v_row.costo_unitario,2);
 END LOOP;
 v_total:=round(v_total,2);
 IF v_total<=0 THEN RAISE EXCEPTION 'El total de devolución debe ser mayor a cero' USING ERRCODE='22023'; END IF;
 v_aplicado:=least(v_total,greatest(v_compra.saldo_pendiente,0)); v_favor:=greatest(v_total-v_aplicado,0);
 INSERT INTO public.devolucion_proveedor(empresa_id,sucursal_id,compra_id,proveedor_id,usuario_id,motivo,total,aplicado_cuenta,saldo_a_favor,idempotency_key,request_hash)
 VALUES(v_empresa,v_sucursal,v_compra_id,v_compra.proveedor_id,v_usuario,v_motivo,v_total,v_aplicado,v_favor,v_key,v_hash)
 RETURNING id INTO v_dev_id;
 -- Segunda pasada: bloquea y consume lotes FEFO, ajusta stock/costo y audita movimiento.
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
   v_linea_id:=(v_line->>'compraLineaId')::bigint; v_pendiente:=(v_line->>'cantidad')::numeric;
   SELECT producto_id,variante_id,costo_unitario INTO v_row FROM public.compra_linea WHERE id=v_linea_id AND compra_id=v_compra_id AND empresa_id=v_empresa;
   v_producto:=v_row.producto_id; v_variante:=v_row.variante_id;
   IF v_variante IS NOT NULL THEN
     SELECT stock,costo_promedio INTO v_stock FROM public.producto_variante_stock WHERE empresa_id=v_empresa AND sucursal_id=v_sucursal AND producto_id=v_producto AND variante_id=v_variante FOR UPDATE;
   ELSE
     SELECT stock,costo_promedio INTO v_stock FROM public.producto_stock WHERE empresa_id=v_empresa AND sucursal_id=v_sucursal AND producto_id=v_producto FOR UPDATE;
   END IF;
   IF NOT FOUND OR v_stock.stock<v_pendiente THEN RAISE EXCEPTION 'Stock insuficiente para completar devolución' USING ERRCODE='22023'; END IF;
   FOR v_row IN SELECT il.id,il.cantidad_disponible FROM public.inventario_lote il
     WHERE il.empresa_id=v_empresa AND il.sucursal_id=v_sucursal AND il.producto_id=v_producto
       AND il.variante_id IS NOT DISTINCT FROM v_variante AND il.cantidad_disponible>0
       AND (il.compra_linea_id=v_linea_id OR (NOT EXISTS(SELECT 1 FROM public.inventario_lote own WHERE own.compra_linea_id=v_linea_id AND own.empresa_id=v_empresa)))
     ORDER BY il.fecha_vencimiento ASC NULLS LAST,il.id FOR UPDATE
   LOOP
     EXIT WHEN v_pendiente<=0.0005;
     v_tomar:=least(v_pendiente,v_row.cantidad_disponible);
     v_subtotal:=round(v_tomar*(SELECT costo_unitario FROM public.compra_linea WHERE id=v_linea_id),2);
     UPDATE public.inventario_lote SET cantidad_disponible=cantidad_disponible-v_tomar WHERE id=v_row.id AND cantidad_disponible>=v_tomar;
     IF NOT FOUND THEN RAISE EXCEPTION 'El lote cambió durante la devolución; reintente' USING ERRCODE='40001'; END IF;
     INSERT INTO public.devolucion_proveedor_linea(devolucion_id,empresa_id,sucursal_id,compra_linea_id,lote_id,producto_id,variante_id,cantidad,costo_unitario,subtotal)
       VALUES(v_dev_id,v_empresa,v_sucursal,v_linea_id,v_row.id,v_producto,v_variante,v_tomar,(SELECT costo_unitario FROM public.compra_linea WHERE id=v_linea_id),v_subtotal);
     v_pendiente:=round(v_pendiente-v_tomar,3);
   END LOOP;
   IF v_pendiente>0.0005 THEN RAISE EXCEPTION 'No hay lotes suficientes para completar devolución' USING ERRCODE='22023'; END IF;
   v_stock_nuevo:=round(v_stock.stock-(v_line->>'cantidad')::numeric,3);
   v_valor:=v_stock.stock*v_stock.costo_promedio-((v_line->>'cantidad')::numeric)*(SELECT costo_unitario FROM public.compra_linea WHERE id=v_linea_id);
   IF v_valor < -0.01 THEN RAISE EXCEPTION 'El costo promedio no permite reconstruir esta devolución; requiere revisión' USING ERRCODE='22023'; END IF;
   v_costo_nuevo:=CASE WHEN v_stock_nuevo>0 THEN round(greatest(v_valor,0)/v_stock_nuevo,4) ELSE 0 END;
   IF v_variante IS NOT NULL THEN
     UPDATE public.producto_variante_stock SET stock=v_stock_nuevo,costo_promedio=v_costo_nuevo,updated_at=now() WHERE empresa_id=v_empresa AND sucursal_id=v_sucursal AND producto_id=v_producto AND variante_id=v_variante;
   ELSE
     UPDATE public.producto_stock SET stock=v_stock_nuevo,costo_promedio=v_costo_nuevo,updated_at=now() WHERE empresa_id=v_empresa AND sucursal_id=v_sucursal AND producto_id=v_producto;
   END IF;
   INSERT INTO public.movimiento_inventario(empresa_id,sucursal_id,producto_id,variante_id,compra_id,usuario_id,tipo,cantidad,stock_anterior,stock_posterior,motivo)
     VALUES(v_empresa,v_sucursal,v_producto,v_variante,v_compra_id,v_usuario,'SALIDA',(v_line->>'cantidad')::numeric,v_stock.stock,v_stock_nuevo,left('Devolución proveedor #'||v_dev_id||': '||v_motivo,200));
 END LOOP;
 UPDATE public.compra SET saldo_pendiente=greatest(0,round(saldo_pendiente-v_aplicado,2)) WHERE id=v_compra_id AND empresa_id=v_empresa;
 RETURN jsonb_build_object('ok',true,'duplicado',false,'devolucionId',v_dev_id,'compraId',v_compra_id,'total',v_total,'aplicadoCuenta',v_aplicado,'saldoAFavor',v_favor);
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_compra_devolucion_registrar_auth(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_compra_devolucion_registrar_auth(jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_compra_devolucion_registrar_auth(jsonb) IS 'Registra devolución proveedor atómica: lotes, stock, costo promedio, deuda y trazabilidad.';
COMMIT;
