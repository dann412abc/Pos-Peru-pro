-- PREVIEW ONLY. Depends on migrations 002 and 004. Do not apply to production.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('public.inventario_lote') IS NULL OR to_regclass('public.compra') IS NULL
 OR to_regclass('public.compra_linea') IS NULL OR to_regclass('public.compra_pago') IS NULL
 OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='compra' AND column_name='payload_hash')
 OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='compra_linea' AND column_name='variante_id')
 OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='producto_variante_stock' AND column_name='costo_promedio') THEN
  RAISE EXCEPTION 'PURCHASE_RECEIPT_SCHEMA_NOT_READY: apply preview migrations 002 and 004 first';
 END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.pos_compra_recibir_auth(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 uid uuid:=auth.uid(); user_id integer; company_id integer; role_name text;
 branch_id integer; supplier_id integer; doc_type text; doc_series text; doc_number text;
 doc_date date; due_date date; pay_condition text; idem_key text; payload_hash text;
 old_purchase record; line jsonb; payment jsonb; product_row record; variant_row record; variant_name text; variant_code text;
 product_id integer; variant_id bigint; line_key text; line_keys text[]:=ARRAY[]::text[];
 packs numeric; units_per_pack numeric; pack_cost numeric; qty numeric(12,3); unit_cost numeric(12,4);
 amount numeric(14,2); base_amount numeric(14,2); tax_amount numeric(14,2); line_total numeric(14,2);
 total_amount numeric(14,2):=0; taxable numeric(14,2):=0; exempt numeric(14,2):=0;
 unaffected numeric(14,2):=0; total_tax numeric(14,2):=0; paid numeric(14,2):=0;
 payment_sum numeric(14,2):=0; cash_out numeric(14,2):=0; cash_available numeric(14,2):=0;
 cash_ids integer[]:=ARRAY[]::integer[]; cash_id integer; cash_row record;
 stock_before numeric(12,3); avg_before numeric(12,4); stock_after numeric(12,3); avg_after numeric(12,4);
 purchase_id bigint; purchase_line_id bigint; line_no integer:=0; line_ordinal integer; batch_code text; expiry_date date; unit_name text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'INVALID_PURCHASE_PAYLOAD' USING ERRCODE='22023'; END IF;
 user_id:=public.mi_usuario_id(); company_id:=public.mi_empresa_id(); role_name:=public.mi_rol();
 IF user_id IS NULL OR company_id IS NULL OR role_name IS DISTINCT FROM 'ADMIN' THEN
  RAISE EXCEPTION 'PURCHASE_FORBIDDEN: ADMIN required' USING ERRCODE='42501';
 END IF;
 branch_id:=(p_payload->>'sucursalId')::integer; supplier_id:=(p_payload->>'proveedorId')::integer;
 doc_type:=p_payload->>'tipoDocumento'; doc_series:=btrim(COALESCE(p_payload->>'serie',''));
 doc_number:=btrim(COALESCE(p_payload->>'numero',''));
 doc_date:=COALESCE(NULLIF(p_payload->>'fechaDocumento','')::date,(now() AT TIME ZONE 'America/Lima')::date);
 due_date:=NULLIF(p_payload->>'fechaVencimiento','')::date; pay_condition:=p_payload->>'condicionPago';
 idem_key:=p_payload->>'idempotencyKey';
 IF branch_id IS NULL OR supplier_id IS NULL OR NOT public.mi_puede_ver_sucursal(branch_id)
 OR NOT EXISTS(SELECT 1 FROM public.sucursal s WHERE s.id=branch_id AND s.empresa_id=company_id)
 OR NOT EXISTS(SELECT 1 FROM public.proveedor p WHERE p.id=supplier_id AND p.empresa_id=company_id AND p.activo) THEN
  RAISE EXCEPTION 'PURCHASE_SCOPE_INVALID' USING ERRCODE='42501';
 END IF;
 IF doc_type IS NULL OR doc_type NOT IN ('01','03','NV','OT') OR doc_series='' OR length(doc_series)>12 OR doc_number='' OR length(doc_number)>30
 OR (doc_type IN ('01','03') AND (doc_series='' OR doc_number='')) THEN
  RAISE EXCEPTION 'PURCHASE_DOCUMENT_INVALID' USING ERRCODE='22023';
 END IF;
 IF doc_date>(now() AT TIME ZONE 'America/Lima')::date THEN RAISE EXCEPTION 'PURCHASE_DATE_FUTURE' USING ERRCODE='22023'; END IF;
 IF pay_condition IS NULL OR pay_condition NOT IN ('CONTADO','CREDITO')
 OR (pay_condition='CONTADO' AND due_date IS NOT NULL)
 OR (pay_condition='CREDITO' AND (due_date IS NULL OR due_date<doc_date)) THEN
  RAISE EXCEPTION 'PURCHASE_PAYMENT_CONDITION_INVALID' USING ERRCODE='22023';
 END IF;
 IF idem_key IS NULL OR idem_key !~ '^[A-Za-z0-9._:-]{8,100}$' THEN RAISE EXCEPTION 'PURCHASE_IDEMPOTENCY_KEY_INVALID' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array'
 OR jsonb_array_length(COALESCE(p_payload->'lineas','[]'::jsonb)) NOT BETWEEN 1 AND 200
 OR jsonb_typeof(COALESCE(p_payload->'pagos','[]'::jsonb)) IS DISTINCT FROM 'array'
 OR jsonb_array_length(COALESCE(p_payload->'pagos','[]'::jsonb))>8 THEN
  RAISE EXCEPTION 'PURCHASE_LINES_OR_PAYMENTS_INVALID' USING ERRCODE='22023';
 END IF;

 payload_hash:=pg_catalog.md5(p_payload::text);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(company_id::text||':purchase:'||idem_key,0));
 SELECT c.id,c.payload_hash INTO old_purchase FROM public.compra c
 WHERE c.empresa_id=company_id AND c.idempotency_key=idem_key LIMIT 1;
 IF FOUND THEN
  IF old_purchase.payload_hash IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION 'PURCHASE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('ok',true,'compraId',old_purchase.id,'repetida',true);
 END IF;

 -- Permite repetir producto/presentación si cada línea representa un lote distinto.
 -- Un código explícito repetido para la misma variante se rechaza; los códigos vacíos
 -- reciben identidad por línea y luego se generan como COMPRA-<compra>-<línea>.
 FOR line,line_ordinal IN
  SELECT item.value,item.ordinality
  FROM jsonb_array_elements(p_payload->'lineas') WITH ORDINALITY AS item(value,ordinality)
 LOOP
  product_id:=(line->>'productoId')::integer; variant_id:=NULLIF(line->>'varianteId','')::bigint;
  line_key:=product_id::text||':'||COALESCE(variant_id::text,'base')||':'||
   CASE WHEN NULLIF(btrim(line->>'codigoLote'),'') IS NULL
    THEN 'AUTO:'||line_ordinal::text
    ELSE 'LOT:'||upper(btrim(line->>'codigoLote'))
   END;
  IF line_key=ANY(line_keys) THEN RAISE EXCEPTION 'PURCHASE_DUPLICATE_LINE' USING ERRCODE='22023'; END IF;
  line_keys:=array_append(line_keys,line_key);
 END LOOP;

 -- Cashbox lock precedes inventory locks to match the legacy sales lock order.
 FOR payment IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'pagos','[]'::jsonb)) LOOP
  IF payment->>'metodoPago' IS NULL OR payment->>'metodoPago' NOT IN ('EFECTIVO','TARJETA','YAPE','PLIN','TRANSFERENCIA') THEN RAISE EXCEPTION 'PURCHASE_PAYMENT_METHOD_INVALID' USING ERRCODE='22023'; END IF;
  paid:=round((payment->>'monto')::numeric,2);
  IF paid<=0 OR length(COALESCE(payment->>'referencia',''))>120 THEN RAISE EXCEPTION 'PURCHASE_PAYMENT_AMOUNT_OR_REFERENCE_INVALID' USING ERRCODE='22023'; END IF;
  cash_id:=NULLIF(payment->>'cajaId','')::integer;
  IF payment->>'metodoPago'='TRANSFERENCIA' AND cash_id IS NOT NULL THEN RAISE EXCEPTION 'PURCHASE_TRANSFER_WITH_CASHBOX' USING ERRCODE='22023'; END IF;
  IF payment->>'metodoPago'<>'TRANSFERENCIA' AND cash_id IS NULL THEN RAISE EXCEPTION 'PURCHASE_CASHBOX_REQUIRED' USING ERRCODE='22023'; END IF;
  IF cash_id IS NOT NULL AND NOT cash_id=ANY(cash_ids) THEN cash_ids:=array_append(cash_ids,cash_id); END IF;
  payment_sum:=payment_sum+paid;
  IF payment->>'metodoPago'='EFECTIVO' THEN cash_out:=cash_out+paid; END IF;
 END LOOP;
 IF cardinality(cash_ids)>1 THEN RAISE EXCEPTION 'PURCHASE_MULTIPLE_CASHBOXES' USING ERRCODE='22023'; END IF;
 IF pay_condition='CREDITO' AND jsonb_array_length(COALESCE(p_payload->'pagos','[]'::jsonb))>0 THEN
  RAISE EXCEPTION 'PURCHASE_CREDIT_INITIAL_PAYMENT_NOT_ALLOWED' USING ERRCODE='22023';
 END IF;
 IF cardinality(cash_ids)=1 THEN
  SELECT c.id,c.saldo_inicial INTO cash_row FROM public.caja c
  JOIN public.sucursal s ON s.id=c.sucursal_id
  WHERE c.id=cash_ids[1] AND c.usuario_id=user_id AND c.sucursal_id=branch_id
  AND c.estado='ABIERTA' AND s.empresa_id=company_id FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_CASHBOX_NOT_OPEN' USING ERRCODE='22023'; END IF;
 END IF;

 -- First pass validates catalog, variant, stock row and IGV; computes tax totals.
 FOR line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') ORDER BY (value->>'productoId')::integer, NULLIF(value->>'varianteId','')::bigint NULLS FIRST LOOP
  product_id:=(line->>'productoId')::integer; variant_id:=NULLIF(line->>'varianteId','')::bigint;
  packs:=(line->>'cantidad')::numeric; units_per_pack:=COALESCE(NULLIF(line->>'unidadesPorEmpaque','')::numeric,1);
  pack_cost:=COALESCE(NULLIF(line->>'costoEmpaque','')::numeric,(line->>'costoUnitario')::numeric*units_per_pack);
  IF packs<=0 OR packs>999999 OR units_per_pack<=0 OR units_per_pack>999999 OR pack_cost<=0 OR pack_cost>99999999
  OR (line->>'tipoIgv') IS NULL OR (line->>'tipoIgv')::integer NOT IN (10,20,30)
  OR length(COALESCE(line->>'codigoLote',''))>80 THEN
   RAISE EXCEPTION 'PURCHASE_PACK_INVALID' USING ERRCODE='22023';
  END IF;
  qty:=round(packs*units_per_pack,3); unit_cost:=round(pack_cost/units_per_pack,4);
  SELECT p.id,p.nombre,p.tipo_igv,
    EXISTS(SELECT 1 FROM public.producto_variante pv WHERE pv.empresa_id=p.empresa_id AND pv.producto_id=p.id AND pv.activo) has_variants
  INTO product_row FROM public.producto p
  WHERE p.id=product_id AND p.empresa_id=company_id AND p.activo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_PRODUCT_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF (product_row.has_variants AND variant_id IS NULL) OR (NOT product_row.has_variants AND variant_id IS NOT NULL) THEN
   RAISE EXCEPTION 'PURCHASE_VARIANT_REQUIRED_OR_UNEXPECTED' USING ERRCODE='22023';
  END IF;
  IF variant_id IS NOT NULL THEN
   SELECT pv.id,pv.producto_id,pv.nombre,pv.codigo INTO variant_row FROM public.producto_variante pv
   WHERE pv.id=variant_id AND pv.empresa_id=company_id AND pv.producto_id=product_id AND pv.activo FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_VARIANT_INVALID' USING ERRCODE='22023'; END IF;
   SELECT vs.stock,vs.costo_promedio INTO stock_before,avg_before FROM public.producto_variante_stock vs
   WHERE vs.variante_id=variant_id AND vs.producto_id=product_id AND vs.empresa_id=company_id AND vs.sucursal_id=branch_id FOR UPDATE;
  ELSE
   SELECT ps.stock,ps.costo_promedio INTO stock_before,avg_before FROM public.producto_stock ps
   WHERE ps.producto_id=product_id AND ps.empresa_id=company_id AND ps.sucursal_id=branch_id FOR UPDATE;
  END IF;
  IF stock_before IS NULL THEN RAISE EXCEPTION 'PURCHASE_STOCK_ROW_MISSING' USING ERRCODE='22023'; END IF;
  IF (line->>'tipoIgv')::integer IS DISTINCT FROM product_row.tipo_igv THEN RAISE EXCEPTION 'PURCHASE_IGV_MISMATCH' USING ERRCODE='22023'; END IF;
  amount:=round(qty*unit_cost,2);
  IF product_row.tipo_igv=10 THEN base_amount:=round(amount/1.18,2); tax_amount:=round(amount-base_amount,2);
  ELSE base_amount:=amount; tax_amount:=0; END IF;
  line_total:=base_amount+tax_amount; total_amount:=total_amount+line_total; total_tax:=total_tax+tax_amount;
  IF product_row.tipo_igv=10 THEN taxable:=taxable+base_amount;
  ELSIF product_row.tipo_igv=20 THEN exempt:=exempt+base_amount;
  ELSE unaffected:=unaffected+base_amount; END IF;
 END LOOP;
 total_amount:=round(total_amount,2); paid:=round(payment_sum,2);
 IF total_amount<=0 OR paid-total_amount>0.01 OR (pay_condition='CONTADO' AND abs(paid-total_amount)>0.01) THEN
  RAISE EXCEPTION 'PURCHASE_TOTAL_OR_PAYMENT_MISMATCH' USING ERRCODE='22023';
 END IF;

 IF cash_out>0 AND cardinality(cash_ids)=1 THEN
  SELECT COALESCE(sum(t.amount),0)+cash_row.saldo_inicial INTO cash_available FROM (
   SELECT cp.monto amount FROM public.comprobante_pago cp JOIN public.comprobante c ON c.id=cp.comprobante_id
   WHERE c.caja_id=cash_row.id AND cp.metodo_pago='EFECTIVO'
   UNION ALL
   SELECT c.total amount FROM public.comprobante c WHERE c.caja_id=cash_row.id AND c.metodo_pago='EFECTIVO'
    AND NOT EXISTS(SELECT 1 FROM public.comprobante_pago cp WHERE cp.comprobante_id=c.id)
  ) t;
  SELECT cash_available+COALESCE(sum(CASE WHEN cm.tipo='INGRESO' THEN cm.monto ELSE -cm.monto END),0)
  INTO cash_available FROM public.caja_movimiento cm WHERE cm.caja_id=cash_row.id AND cm.metodo_pago='EFECTIVO';
  -- The current return writer also records each refund as SALIDA in caja_movimiento.
  -- Deduct only legacy refund payments that do not yet have a matching cash-ledger row.
  -- This prevents the same refund from reducing available cash twice.
  SELECT cash_available-COALESCE(sum(dp.monto),0)
  INTO cash_available
  FROM public.devolucion_venta_pago dp
  JOIN public.devolucion_venta d ON d.id=dp.devolucion_id AND d.empresa_id=dp.empresa_id
  WHERE d.caja_id=cash_row.id AND d.empresa_id=company_id
    AND d.estado='REGISTRADA' AND dp.metodo_pago='EFECTIVO'
    AND NOT EXISTS (
      SELECT 1
      FROM public.caja_movimiento cm
      WHERE cm.caja_id=d.caja_id
        AND cm.tipo='SALIDA'
        AND cm.metodo_pago='EFECTIVO'
        AND cm.monto=dp.monto
        AND (
          cm.devolucion_venta_id=d.id
          OR (
            cm.devolucion_venta_id IS NULL
            AND cm.comprobante_id=d.comprobante_id
            AND cm.motivo ILIKE 'Reembolso por devolución%'
          )
        )
    );
  cash_available:=round(cash_available,2);
  IF cash_out>cash_available THEN RAISE EXCEPTION 'PURCHASE_CASH_NOT_ENOUGH: disponible %, requerido %',cash_available,cash_out USING ERRCODE='22023'; END IF;
 END IF;

 INSERT INTO public.compra(empresa_id,sucursal_id,proveedor_id,usuario_id,tipo_documento,serie,numero,fecha_documento,
  condicion_pago,fecha_vencimiento,estado,op_gravadas,op_exoneradas,op_inafectas,total_igv,total,pagado,saldo_pendiente,idempotency_key,payload_hash)
 VALUES(company_id,branch_id,supplier_id,user_id,doc_type,doc_series,doc_number,doc_date,pay_condition,due_date,'RECIBIDA',
  round(taxable,2),round(exempt,2),round(unaffected,2),round(total_tax,2),total_amount,0,total_amount,idem_key,payload_hash)
 RETURNING id INTO purchase_id;

 -- Second pass creates purchase lines/lots, updates stock/cost average and records movement.
 FOR line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
  line_no:=line_no+1; product_id:=(line->>'productoId')::integer; variant_id:=NULLIF(line->>'varianteId','')::bigint;
  packs:=(line->>'cantidad')::numeric; units_per_pack:=COALESCE(NULLIF(line->>'unidadesPorEmpaque','')::numeric,1);
  pack_cost:=COALESCE(NULLIF(line->>'costoEmpaque','')::numeric,(line->>'costoUnitario')::numeric*units_per_pack);
  qty:=round(packs*units_per_pack,3); unit_cost:=round(pack_cost/units_per_pack,4);
  SELECT p.nombre,p.tipo_igv INTO product_row FROM public.producto p WHERE p.id=product_id AND p.empresa_id=company_id;
  IF variant_id IS NOT NULL THEN
   SELECT pv.id,pv.nombre,pv.codigo INTO variant_row FROM public.producto_variante pv WHERE pv.id=variant_id AND pv.empresa_id=company_id;
   variant_name:=variant_row.nombre; variant_code:=variant_row.codigo;
   SELECT vs.stock,vs.costo_promedio INTO stock_before,avg_before FROM public.producto_variante_stock vs
   WHERE vs.variante_id=variant_id AND vs.producto_id=product_id AND vs.empresa_id=company_id AND vs.sucursal_id=branch_id FOR UPDATE;
  ELSE
   variant_name:=NULL; variant_code:=NULL;
   SELECT ps.stock,ps.costo_promedio INTO stock_before,avg_before FROM public.producto_stock ps
   WHERE ps.producto_id=product_id AND ps.empresa_id=company_id AND ps.sucursal_id=branch_id FOR UPDATE;
  END IF;
  stock_after:=round(stock_before+qty,3);
  avg_after:=round(((stock_before*COALESCE(avg_before,0))+(qty*unit_cost))/(stock_before+qty),4);
  amount:=round(qty*unit_cost,2);
  IF product_row.tipo_igv=10 THEN base_amount:=round(amount/1.18,2);tax_amount:=round(amount-base_amount,2);
  ELSE base_amount:=amount;tax_amount:=0; END IF;
  line_total:=base_amount+tax_amount;
  batch_code:=left(COALESCE(NULLIF(btrim(line->>'codigoLote'),''),'COMPRA-'||purchase_id||'-'||line_no),80);
  expiry_date:=NULLIF(line->>'fechaVencimiento','')::date;
  unit_name:=left(upper(COALESCE(NULLIF(btrim(line->>'unidadCompra'),''),'UNIDAD')),20);
  INSERT INTO public.compra_linea(compra_id,empresa_id,producto_id,variante_id,variante_nombre,variante_codigo,numero_linea,
   cantidad,costo_unitario,tipo_igv,base_imponible,igv,subtotal,stock_anterior,stock_posterior,costo_promedio_anterior,
   costo_promedio_posterior,unidad_compra,cantidad_empaques,unidades_por_empaque,costo_empaque,codigo_lote,fecha_vencimiento)
  VALUES(purchase_id,company_id,product_id,variant_id,variant_name,variant_code,line_no,qty,unit_cost,
   product_row.tipo_igv,base_amount,tax_amount,line_total,stock_before,stock_after,avg_before,avg_after,
   unit_name,packs,units_per_pack,pack_cost,batch_code,expiry_date) RETURNING id INTO purchase_line_id;
  INSERT INTO public.inventario_lote(empresa_id,sucursal_id,producto_id,variante_id,compra_id,compra_linea_id,codigo_lote,
   fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario)
  VALUES(company_id,branch_id,product_id,variant_id,purchase_id,purchase_line_id,batch_code,expiry_date,qty,qty,unit_cost);
  IF variant_id IS NOT NULL THEN
   UPDATE public.producto_variante_stock SET stock=stock_after,costo_promedio=avg_after,updated_at=now()
   WHERE variante_id=variant_id AND producto_id=product_id AND empresa_id=company_id AND sucursal_id=branch_id;
  ELSE
   UPDATE public.producto_stock SET stock=stock_after,costo_promedio=avg_after,updated_at=now()
   WHERE producto_id=product_id AND empresa_id=company_id AND sucursal_id=branch_id;
  END IF;
  INSERT INTO public.movimiento_inventario(empresa_id,sucursal_id,producto_id,variante_id,compra_id,usuario_id,tipo,cantidad,
   stock_anterior,stock_posterior,motivo)
  VALUES(company_id,branch_id,product_id,variant_id,purchase_id,user_id,'ENTRADA',qty,stock_before,stock_after,
   left('Recepción compra #'||purchase_id||' · '||product_row.nombre||' · '||doc_type||' '||doc_series||'-'||doc_number,200));
 END LOOP;

 FOR payment IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'pagos','[]'::jsonb)) LOOP
  cash_id:=NULLIF(payment->>'cajaId','')::integer; paid:=round((payment->>'monto')::numeric,2);
  INSERT INTO public.compra_pago(empresa_id,compra_id,usuario_id,caja_id,metodo_pago,monto,referencia)
  VALUES(company_id,purchase_id,user_id,cash_id,payment->>'metodoPago',paid,
   NULLIF(left(btrim(COALESCE(payment->>'referencia','')),120),''));
  IF cash_id IS NOT NULL THEN
   INSERT INTO public.caja_movimiento(caja_id,usuario_id,tipo,metodo_pago,monto,motivo,compra_id)
   VALUES(cash_id,user_id,'SALIDA',payment->>'metodoPago',paid,left('Pago a proveedor · compra #'||purchase_id,200),purchase_id);
  END IF;
 END LOOP;
 UPDATE public.compra SET pagado=round(payment_sum,2),saldo_pendiente=round(total_amount-payment_sum,2)
 WHERE id=purchase_id AND empresa_id=company_id;
 RETURN jsonb_build_object('ok',true,'compraId',purchase_id,'total',total_amount,'pagado',round(payment_sum,2),
  'saldoPendiente',round(total_amount-payment_sum,2),'repetida',false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.pos_compra_recibir_auth(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_compra_recibir_auth(jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_compra_recibir_auth(jsonb) IS
 'PREVIEW: ADMIN-only atomic purchase receipt with idempotency, tax, stock, lots, weighted cost and cash movements.';
COMMIT;
