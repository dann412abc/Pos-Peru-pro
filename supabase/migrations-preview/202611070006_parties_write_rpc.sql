-- PREVIEW SOLAMENTE. NO EJECUTAR EN PRODUCCION.
-- CRUD transaccional de clientes y proveedores. La empresa se deriva de auth.uid().
-- La tabla cliente original no tiene email ni activo; se agrega activo para baja lógica.
BEGIN;
ALTER TABLE public.cliente ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_cliente_empresa_nombre_activo ON public.cliente(empresa_id, lower(nombre)) WHERE activo=true;
CREATE INDEX IF NOT EXISTS idx_proveedor_empresa_nombre_activo ON public.proveedor(empresa_id, lower(nombre)) WHERE activo=true;

CREATE OR REPLACE FUNCTION public.pos_terceros_mutar_auth(p_action text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $fn$
DECLARE v_auth uuid:=auth.uid(); v_empresa integer; v_id integer; v_tipo text; v_numero text; v_nombre text; v_result jsonb; v_limite numeric;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
 SELECT empresa_id INTO v_empresa FROM public.usuario WHERE supabase_auth_user_id=v_auth AND activo=true;
 IF v_empresa IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_payload)<>'object' OR p_action NOT IN ('customer_create','customer_update','customer_deactivate','supplier_create','supplier_update','supplier_deactivate') THEN RAISE EXCEPTION 'Operación inválida' USING ERRCODE='22023'; END IF;
 v_id:=NULLIF(p_payload->>'id','')::integer; v_tipo:=upper(COALESCE(NULLIF(btrim(p_payload->>'tipoDoc'),''),'RUC')); v_numero:=btrim(COALESCE(p_payload->>'numero','')); v_nombre:=btrim(COALESCE(p_payload->>'nombre',''));
 IF p_action LIKE 'customer_%' THEN
   IF p_action IN ('customer_create','customer_update') THEN
     IF v_tipo NOT IN ('DNI','RUC') OR (v_tipo='DNI' AND v_numero !~ '^[0-9]{8}$') OR (v_tipo='RUC' AND v_numero !~ '^(10|15|17|20)[0-9]{9}$') OR v_nombre='' OR length(v_nombre)>200 THEN RAISE EXCEPTION 'Documento o nombre de cliente inválido' USING ERRCODE='22023'; END IF;
     v_limite:=COALESCE(NULLIF(p_payload->>'limiteCredito','')::numeric,0);
     IF v_limite<0 OR v_limite>9999999999 THEN RAISE EXCEPTION 'Límite de crédito inválido' USING ERRCODE='22023'; END IF;
   END IF;
   IF p_action='customer_create' THEN
     INSERT INTO public.cliente(empresa_id,tipo_doc,numero,nombre,direccion,telefono,limite_credito,saldo_credito,activo)
     VALUES(v_empresa,v_tipo,v_numero,v_nombre,NULLIF(btrim(p_payload->>'direccion'),''),NULLIF(btrim(p_payload->>'telefono'),''),v_limite,0,true)
     RETURNING to_jsonb(cliente) INTO v_result;
   ELSIF p_action='customer_update' THEN
     UPDATE public.cliente SET tipo_doc=v_tipo,numero=v_numero,nombre=v_nombre,direccion=NULLIF(btrim(p_payload->>'direccion'),''),telefono=NULLIF(btrim(p_payload->>'telefono'),''),limite_credito=v_limite
     WHERE id=v_id AND empresa_id=v_empresa AND activo=true AND saldo_credito<=v_limite RETURNING to_jsonb(cliente) INTO v_result;
   ELSE
     IF EXISTS(SELECT 1 FROM public.cliente WHERE id=v_id AND empresa_id=v_empresa AND numero='00000000') THEN RAISE EXCEPTION 'No se puede desactivar Consumidor Final' USING ERRCODE='22023'; END IF;
     UPDATE public.cliente SET activo=false WHERE id=v_id AND empresa_id=v_empresa AND activo=true AND saldo_credito=0 RETURNING to_jsonb(cliente) INTO v_result;
   END IF;
 ELSE
   IF p_action IN ('supplier_create','supplier_update') THEN
     IF v_tipo NOT IN ('RUC','DNI','OTRO') OR v_numero='' OR length(v_numero)>15 OR v_numero !~ '^[0-9A-Za-z-]+$' OR v_nombre='' OR length(v_nombre)>200 THEN RAISE EXCEPTION 'Documento o nombre de proveedor inválido' USING ERRCODE='22023'; END IF;
   END IF;
   IF p_action='supplier_create' THEN
     INSERT INTO public.proveedor(empresa_id,tipo_doc,numero,nombre,direccion,telefono,email,contacto,activo)
     VALUES(v_empresa,v_tipo,v_numero,v_nombre,NULLIF(btrim(p_payload->>'direccion'),''),NULLIF(btrim(p_payload->>'telefono'),''),NULLIF(btrim(p_payload->>'email'),''),NULLIF(btrim(p_payload->>'contacto'),''),true)
     RETURNING to_jsonb(proveedor) INTO v_result;
   ELSIF p_action='supplier_update' THEN
     UPDATE public.proveedor SET tipo_doc=v_tipo,numero=v_numero,nombre=v_nombre,direccion=NULLIF(btrim(p_payload->>'direccion'),''),telefono=NULLIF(btrim(p_payload->>'telefono'),''),email=NULLIF(btrim(p_payload->>'email'),''),contacto=NULLIF(btrim(p_payload->>'contacto'),'')
     WHERE id=v_id AND empresa_id=v_empresa AND activo=true RETURNING to_jsonb(proveedor) INTO v_result;
   ELSE
     UPDATE public.proveedor SET activo=false,updated_at=now() WHERE id=v_id AND empresa_id=v_empresa AND activo=true
       AND NOT EXISTS(SELECT 1 FROM public.compra c WHERE c.proveedor_id=proveedor.id AND c.empresa_id=v_empresa AND c.estado='RECIBIDA' AND c.saldo_pendiente>0)
     RETURNING to_jsonb(proveedor) INTO v_result;
   END IF;
 END IF;
 IF v_result IS NULL THEN RAISE EXCEPTION 'Registro no encontrado, inactivo o con saldo pendiente' USING ERRCODE='P0002'; END IF;
 RETURN v_result;
END; $fn$;
REVOKE ALL ON FUNCTION public.pos_terceros_mutar_auth(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_terceros_mutar_auth(text,jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_terceros_mutar_auth(text,jsonb) IS 'CRUD de clientes/proveedores aislado por empresa derivada de auth.uid(); preserva saldos y compras históricas.';
COMMIT;
