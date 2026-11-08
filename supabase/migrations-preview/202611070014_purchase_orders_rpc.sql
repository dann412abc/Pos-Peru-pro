-- PREVIEW SOLAMENTE. Revisar esquema y ejecutar primero en staging.
-- Órdenes de compra y recepciones parciales; la recepción reutiliza la RPC transaccional de compras.
BEGIN;
CREATE TABLE IF NOT EXISTS public.orden_compra (
 id BIGSERIAL PRIMARY KEY, empresa_id integer NOT NULL REFERENCES public.empresa(id) ON DELETE CASCADE,
 sucursal_id integer NOT NULL REFERENCES public.sucursal(id), proveedor_id integer NOT NULL REFERENCES public.proveedor(id),
 usuario_id integer NOT NULL REFERENCES public.usuario(id), numero_orden varchar(30) NOT NULL,
 estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK(estado IN ('BORRADOR','ENVIADA','RECIBIDA_PARCIAL','RECIBIDA','CANCELADA')),
 fecha_orden date NOT NULL DEFAULT CURRENT_DATE, fecha_entrega_esperada date, observaciones varchar(1000),
 total_estimado numeric(14,2) NOT NULL DEFAULT 0 CHECK(total_estimado>=0), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(empresa_id,numero_orden)
);
CREATE TABLE IF NOT EXISTS public.orden_compra_linea (
 id BIGSERIAL PRIMARY KEY, empresa_id integer NOT NULL REFERENCES public.empresa(id) ON DELETE CASCADE,
 orden_compra_id bigint NOT NULL REFERENCES public.orden_compra(id) ON DELETE CASCADE,
 producto_id integer NOT NULL REFERENCES public.producto(id), variante_id integer REFERENCES public.producto_variante(id),
 descripcion varchar(240) NOT NULL, codigo varchar(80), cantidad_solicitada numeric(14,3) NOT NULL CHECK(cantidad_solicitada>0),
 cantidad_recibida numeric(14,3) NOT NULL DEFAULT 0 CHECK(cantidad_recibida>=0),
 costo_unitario_estimado numeric(14,4) NOT NULL DEFAULT 0 CHECK(costo_unitario_estimado>=0),
 tipo_igv integer NOT NULL DEFAULT 10 CHECK(tipo_igv IN (10,20,30)), unidad_compra varchar(20) NOT NULL DEFAULT 'UNIDAD',
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(cantidad_recibida<=cantidad_solicitada)
);
CREATE TABLE IF NOT EXISTS public.orden_compra_recepcion (
 id BIGSERIAL PRIMARY KEY, empresa_id integer NOT NULL REFERENCES public.empresa(id) ON DELETE CASCADE,
 orden_compra_id bigint NOT NULL REFERENCES public.orden_compra(id), compra_id bigint NOT NULL REFERENCES public.compra(id),
 usuario_id integer NOT NULL REFERENCES public.usuario(id), idempotency_key varchar(100) NOT NULL,
 total numeric(14,2) NOT NULL DEFAULT 0 CHECK(total>=0), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(empresa_id,idempotency_key), UNIQUE(empresa_id,compra_id)
);
CREATE INDEX IF NOT EXISTS idx_orden_compra_empresa_sucursal_fecha ON public.orden_compra(empresa_id,sucursal_id,fecha_orden DESC);
CREATE INDEX IF NOT EXISTS idx_orden_compra_linea_orden ON public.orden_compra_linea(orden_compra_id);
CREATE INDEX IF NOT EXISTS idx_orden_compra_recepcion_orden ON public.orden_compra_recepcion(orden_compra_id);

CREATE OR REPLACE FUNCTION public.pos_ordenes_compra_auth(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $fn$
DECLARE
 v_auth uuid:=auth.uid(); v_user integer; v_empresa integer; v_sucursal integer; v_proveedor integer; v_id bigint;
 v_estado text; v_total numeric(14,2):=0; v_line jsonb; v_input_line jsonb; v_producto record; v_variante record; v_variante_nombre text; v_variante_codigo text; v_order_line record; v_line_id bigint;
 v_order record; v_key text; v_compra_payload jsonb; v_compra_result jsonb; v_compra_id bigint; v_count integer:=0;
 v_detalle jsonb; v_result jsonb; v_qty numeric(14,3); v_cost numeric(14,4); v_pending numeric(14,3);
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
 SELECT id,empresa_id INTO v_user,v_empresa FROM public.usuario WHERE supabase_auth_user_id=v_auth AND activo=true;
 IF v_user IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(COALESCE(p_payload,'{}'::jsonb))<>'object' THEN RAISE EXCEPTION 'Payload inválido' USING ERRCODE='22023'; END IF;
 IF p_action='list' THEN
   v_sucursal:=NULLIF(p_payload->>'sucursalId','')::integer;
   IF v_sucursal IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.usuario_sucursal us JOIN public.sucursal s ON s.id=us.sucursal_id WHERE us.usuario_id=v_user AND us.sucursal_id=v_sucursal AND s.empresa_id=v_empresa) THEN RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501'; END IF;
   SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'numeroOrden',q.numero_orden,'estado',q.estado,'fechaOrden',q.fecha_orden,'fechaEntregaEsperada',q.fecha_entrega_esperada,'totalEstimado',q.total_estimado,'sucursalId',q.sucursal_id,'proveedorId',q.proveedor_id,'proveedorNombre',q.proveedor_nombre,'totalLineas',q.total_lineas,'unidadesPendientes',q.pendientes) ORDER BY q.created_at DESC),'[]'::jsonb)
   INTO v_result FROM (SELECT o.*,p.nombre proveedor_nombre,COUNT(l.id)::integer total_lineas,COALESCE(SUM(l.cantidad_solicitada-l.cantidad_recibida),0) pendientes FROM public.orden_compra o JOIN public.proveedor p ON p.id=o.proveedor_id AND p.empresa_id=o.empresa_id LEFT JOIN public.orden_compra_linea l ON l.orden_compra_id=o.id AND l.empresa_id=o.empresa_id WHERE o.empresa_id=v_empresa AND (v_sucursal IS NULL OR o.sucursal_id=v_sucursal) AND EXISTS(SELECT 1 FROM public.usuario_sucursal us WHERE us.usuario_id=v_user AND us.sucursal_id=o.sucursal_id) GROUP BY o.id,p.nombre ORDER BY o.created_at DESC LIMIT 500) q;
   RETURN jsonb_build_object('ordenes',v_result);
 ELSIF p_action='create' THEN
   v_sucursal:=(p_payload->>'sucursalId')::integer; v_proveedor:=(p_payload->>'proveedorId')::integer;
   IF NOT EXISTS(SELECT 1 FROM public.usuario_sucursal us JOIN public.sucursal s ON s.id=us.sucursal_id WHERE us.usuario_id=v_user AND us.sucursal_id=v_sucursal AND s.empresa_id=v_empresa) THEN RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.proveedor WHERE id=v_proveedor AND empresa_id=v_empresa AND activo=true) THEN RAISE EXCEPTION 'Proveedor no encontrado o inactivo' USING ERRCODE='P0002'; END IF;
   IF jsonb_typeof(p_payload->'lineas')<>'array' OR jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'La orden requiere entre 1 y 200 líneas' USING ERRCODE='22023'; END IF;
   FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
     v_id:=(v_line->>'productoId')::bigint; v_qty:=(v_line->>'cantidad')::numeric; v_cost:=COALESCE(NULLIF(v_line->>'costoUnitarioEstimado','')::numeric,0);
     IF v_qty<=0 OR v_qty>999999999 OR v_cost<0 OR v_cost>99999999 THEN RAISE EXCEPTION 'Cantidad o costo estimado inválido' USING ERRCODE='22023'; END IF;
     SELECT id,nombre,codigo,tipo_igv,tiene_variantes INTO v_producto FROM public.producto WHERE id=v_id AND empresa_id=v_empresa AND activo=true;
     IF NOT FOUND THEN RAISE EXCEPTION 'Producto inexistente o inactivo' USING ERRCODE='P0002'; END IF;
     IF NULLIF(v_line->>'varianteId','') IS NOT NULL THEN
       SELECT id,nombre,codigo,producto_id INTO v_variante FROM public.producto_variante WHERE id=(v_line->>'varianteId')::integer AND producto_id=v_id AND empresa_id=v_empresa AND activo=true;
       IF NOT FOUND THEN RAISE EXCEPTION 'Variante no válida para el producto' USING ERRCODE='22023'; END IF;
     ELSIF COALESCE(v_producto.tiene_variantes,false) THEN RAISE EXCEPTION 'Debe seleccionar una variante para %',v_producto.nombre USING ERRCODE='22023'; END IF;
     v_total:=v_total+(v_qty*v_cost);
   END LOOP;
   v_id:=nextval(pg_get_serial_sequence('public.orden_compra','id'));
   INSERT INTO public.orden_compra(id,empresa_id,sucursal_id,proveedor_id,usuario_id,numero_orden,fecha_entrega_esperada,observaciones,total_estimado)
   VALUES(v_id,v_empresa,v_sucursal,v_proveedor,v_user,'OC-'||to_char(current_date,'YYYY')||'-'||lpad(v_id::text,7,'0'),NULLIF(p_payload->>'fechaEntregaEsperada','')::date,left(COALESCE(p_payload->>'observaciones',''),1000),round(v_total,2));
   FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
     SELECT id,nombre,codigo,tipo_igv INTO v_producto FROM public.producto WHERE id=(v_line->>'productoId')::integer AND empresa_id=v_empresa;
     v_variante_nombre:=NULL; v_variante_codigo:=NULL;
     IF NULLIF(v_line->>'varianteId','') IS NOT NULL THEN SELECT nombre,codigo INTO v_variante_nombre,v_variante_codigo FROM public.producto_variante WHERE id=(v_line->>'varianteId')::integer AND empresa_id=v_empresa; END IF;
     INSERT INTO public.orden_compra_linea(empresa_id,orden_compra_id,producto_id,variante_id,descripcion,codigo,cantidad_solicitada,costo_unitario_estimado,unidad_compra,tipo_igv)
     VALUES(v_empresa,v_id,v_producto.id,NULLIF(v_line->>'varianteId','')::integer,left(v_producto.nombre||CASE WHEN v_variante_nombre IS NOT NULL THEN ' · '||v_variante_nombre ELSE '' END,240),COALESCE(v_variante_codigo,v_producto.codigo), (v_line->>'cantidad')::numeric,COALESCE(NULLIF(v_line->>'costoUnitarioEstimado','')::numeric,0),upper(COALESCE(NULLIF(v_line->>'unidadCompra',''),'UNIDAD')),COALESCE(v_producto.tipo_igv,10));
   END LOOP;
   RETURN public.pos_ordenes_compra_auth('detail',jsonb_build_object('ordenId',v_id));
 ELSIF p_action IN ('send','cancel','detail','receive') THEN
   v_id:=(p_payload->>'ordenId')::bigint;
   SELECT o.* INTO v_order FROM public.orden_compra o WHERE o.id=v_id AND o.empresa_id=v_empresa AND EXISTS(SELECT 1 FROM public.usuario_sucursal us WHERE us.usuario_id=v_user AND us.sucursal_id=o.sucursal_id) FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Orden no encontrada o sucursal no autorizada' USING ERRCODE='P0002'; END IF;
   IF p_action='send' THEN
     IF v_order.estado<>'BORRADOR' THEN RAISE EXCEPTION 'Solo se pueden enviar órdenes en borrador' USING ERRCODE='22023'; END IF;
     UPDATE public.orden_compra SET estado='ENVIADA',updated_at=now() WHERE id=v_id AND empresa_id=v_empresa;
   ELSIF p_action='cancel' THEN
     IF v_order.estado NOT IN ('BORRADOR','ENVIADA') THEN RAISE EXCEPTION 'No se puede cancelar una orden que ya registra recepción' USING ERRCODE='22023'; END IF;
     UPDATE public.orden_compra SET estado='CANCELADA',updated_at=now() WHERE id=v_id AND empresa_id=v_empresa;
   ELSIF p_action='receive' THEN
     IF v_order.estado NOT IN ('ENVIADA','RECIBIDA_PARCIAL') THEN RAISE EXCEPTION 'Solo se reciben órdenes enviadas' USING ERRCODE='22023'; END IF;
     v_key:=p_payload->>'idempotencyKey';
     IF v_key IS NULL OR v_key !~ '^[A-Za-z0-9._:-]{12,80}$' THEN RAISE EXCEPTION 'Clave de recepción inválida' USING ERRCODE='22023'; END IF;
     SELECT compra_id INTO v_compra_id FROM public.orden_compra_recepcion WHERE empresa_id=v_empresa AND idempotency_key=v_key;
     IF v_compra_id IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'duplicada',true,'compraId',v_compra_id,'ordenId',v_id); END IF;
     IF jsonb_typeof(p_payload->'lineas')<>'array' OR jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'La recepción requiere líneas' USING ERRCODE='22023'; END IF;
     v_compra_payload:=jsonb_build_object('sucursalId',v_order.sucursal_id,'proveedorId',v_order.proveedor_id,'tipoDocumento',COALESCE(p_payload->>'tipoDocumento','01'),'serie',COALESCE(p_payload->>'serie',''),'numero',COALESCE(p_payload->>'numero',v_order.numero_orden||'-R'),'fechaDocumento',COALESCE(p_payload->>'fechaDocumento',current_date::text),'condicionPago','CREDITO','fechaVencimiento',COALESCE(p_payload->>'fechaVencimiento',p_payload->>'fechaDocumento',current_date::text),'idempotencyKey','order-receipt-'||v_key,'pagos','[]'::jsonb);
     v_compra_payload:=v_compra_payload||jsonb_build_object('lineas','[]'::jsonb);
     FOR v_input_line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
       v_line_id:=(v_input_line->>'ordenLineaId')::bigint; v_qty:=(v_input_line->>'cantidad')::numeric; v_cost:=COALESCE(NULLIF(v_input_line->>'costoUnitario','')::numeric,0);
       SELECT l.*, (l.cantidad_solicitada-l.cantidad_recibida) AS pendiente INTO v_order_line FROM public.orden_compra_linea l WHERE l.id=v_line_id AND l.orden_compra_id=v_id AND l.empresa_id=v_empresa FOR UPDATE;
       IF NOT FOUND OR v_qty<=0 OR v_qty>v_order_line.pendiente+0.0005 OR v_cost<=0 THEN RAISE EXCEPTION 'Cantidad, costo o línea de recepción inválida' USING ERRCODE='22023'; END IF;
       v_compra_payload:=jsonb_set(v_compra_payload,'{lineas}',(v_compra_payload->'lineas')||jsonb_build_array(jsonb_build_object('productoId',v_order_line.producto_id,'varianteId',v_order_line.variante_id,'cantidad',v_qty,'unidadCompra',v_order_line.unidad_compra,'unidadesPorEmpaque',1,'costoEmpaque',v_cost,'costoUnitario',v_cost,'tipoIgv',v_order_line.tipo_igv,'codigoLote',v_input_line->>'codigoLote','fechaVencimiento',v_input_line->>'fechaVencimiento')));
       UPDATE public.orden_compra_linea SET cantidad_recibida=cantidad_recibida+v_qty WHERE id=v_line_id AND empresa_id=v_empresa;
       v_count:=v_count+1;
     END LOOP;
     v_compra_result:=public.pos_compra_recibir_auth(v_compra_payload);
     v_compra_id:=(v_compra_result->>'compraId')::bigint;
     INSERT INTO public.orden_compra_recepcion(empresa_id,orden_compra_id,compra_id,usuario_id,idempotency_key,total)
     VALUES(v_empresa,v_id,v_compra_id,v_user,v_key,COALESCE((v_compra_result->>'total')::numeric,0));
     IF EXISTS(SELECT 1 FROM public.orden_compra_linea WHERE orden_compra_id=v_id AND empresa_id=v_empresa AND cantidad_recibida+0.0005<cantidad_solicitada) THEN
       UPDATE public.orden_compra SET estado='RECIBIDA_PARCIAL',updated_at=now() WHERE id=v_id AND empresa_id=v_empresa;
     ELSE UPDATE public.orden_compra SET estado='RECIBIDA',updated_at=now() WHERE id=v_id AND empresa_id=v_empresa; END IF;
     RETURN jsonb_build_object('ok',true,'ordenId',v_id,'compraId',v_compra_id,'total',v_compra_result->'total','estado',(SELECT estado FROM public.orden_compra WHERE id=v_id),'lineasRecibidas',v_count);
   END IF;
   SELECT jsonb_build_object('id',o.id,'numeroOrden',o.numero_orden,'estado',o.estado,'fechaOrden',o.fecha_orden,'fechaEntregaEsperada',o.fecha_entrega_esperada,'observaciones',o.observaciones,'totalEstimado',o.total_estimado,'sucursalId',o.sucursal_id,'proveedorId',o.proveedor_id,'proveedorNombre',p.nombre,'proveedorNumero',p.numero,
    'lineas',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'productoId',l.producto_id,'varianteId',l.variante_id,'descripcion',l.descripcion,'codigo',l.codigo,'cantidadSolicitada',l.cantidad_solicitada,'cantidadRecibida',l.cantidad_recibida,'pendiente',l.cantidad_solicitada-l.cantidad_recibida,'costoUnitarioEstimado',l.costo_unitario_estimado,'unidadCompra',l.unidad_compra,'tipoIgv',l.tipo_igv) ORDER BY l.id) FROM public.orden_compra_linea l WHERE l.orden_compra_id=o.id AND l.empresa_id=v_empresa),'[]'::jsonb),
    'recepciones',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'compraId',r.compra_id,'total',r.total,'fechaRecepcion',r.created_at) ORDER BY r.id) FROM public.orden_compra_recepcion r WHERE r.orden_compra_id=o.id AND r.empresa_id=v_empresa),'[]'::jsonb)) INTO v_detalle
   FROM public.orden_compra o JOIN public.proveedor p ON p.id=o.proveedor_id AND p.empresa_id=o.empresa_id WHERE o.id=v_id AND o.empresa_id=v_empresa;
   RETURN jsonb_build_object('orden',v_detalle);
 END IF;
 RAISE EXCEPTION 'Acción de órdenes no permitida' USING ERRCODE='22023';
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_ordenes_compra_auth(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_ordenes_compra_auth(text,jsonb) TO authenticated;
COMMIT;
