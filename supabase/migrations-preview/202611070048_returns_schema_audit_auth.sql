-- PREVIEW ONLY: auditoría de esquema para devoluciones. No lee datos comerciales ni escribe datos.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_devolucion_esquema_verificar_auth()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_auth uuid:=auth.uid();
  v_usuario integer;
  v_empresa integer;
  v_requeridos jsonb;
  v_faltantes jsonb;
  v_total integer;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
  SELECT id,empresa_id INTO v_usuario,v_empresa
  FROM public.usuario WHERE supabase_auth_user_id=v_auth AND activo=true;
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;

  v_requeridos := jsonb_build_array(
    jsonb_build_object('tabla','comprobante','columnas',jsonb_build_array('id','empresa_id','sucursal_id','cliente_id','caja_id','tipo','serie','correlativo','total','estado','metodo_pago','devolucion_venta_id')),
    jsonb_build_object('tabla','comprobante_linea','columnas',jsonb_build_array('id','comprobante_id','producto_id','variante_id','cantidad','precio_unitario','costo_unitario','descuento','tipo_igv','subtotal')),
    jsonb_build_object('tabla','comprobante_pago','columnas',jsonb_build_array('comprobante_id','metodo_pago','monto')),
    jsonb_build_object('tabla','devolucion_venta','columnas',jsonb_build_array('id','empresa_id','sucursal_id','comprobante_id','cliente_id','usuario_id','caja_id','motivo','total_devolucion','credito_revertido','monto_reembolsado','idempotency_key','request_hash','estado','created_at')),
    jsonb_build_object('tabla','devolucion_venta_linea','columnas',jsonb_build_array('id','devolucion_id','empresa_id','sucursal_id','comprobante_linea_id','producto_id','variante_id','cantidad','monto','reingresar_stock')),
    jsonb_build_object('tabla','devolucion_venta_pago','columnas',jsonb_build_array('devolucion_id','empresa_id','sucursal_id','metodo_pago','monto','referencia')),
    jsonb_build_object('tabla','devolucion_venta_lote','columnas',jsonb_build_array('devolucion_linea_id','lote_id','cantidad')),
    jsonb_build_object('tabla','caja','columnas',jsonb_build_array('id','sucursal_id','usuario_id','estado','saldo_inicial')),
    jsonb_build_object('tabla','caja_movimiento','columnas',jsonb_build_array('caja_id','usuario_id','tipo','metodo_pago','monto','motivo','comprobante_id','devolucion_venta_id')),
    jsonb_build_object('tabla','producto_stock','columnas',jsonb_build_array('producto_id','sucursal_id','empresa_id','stock','costo_promedio','updated_at')),
    jsonb_build_object('tabla','producto_variante_stock','columnas',jsonb_build_array('variante_id','producto_id','sucursal_id','empresa_id','stock','updated_at')),
    jsonb_build_object('tabla','inventario_lote','columnas',jsonb_build_array('id','empresa_id','sucursal_id','producto_id','variante_id','cantidad_disponible','codigo_lote','costo_unitario')),
    jsonb_build_object('tabla','comprobante_lote_salida','columnas',jsonb_build_array('id','empresa_id','comprobante_id','producto_id','variante_id','lote_id','cantidad')),
    jsonb_build_object('tabla','movimiento_inventario','columnas',jsonb_build_array('empresa_id','sucursal_id','producto_id','variante_id','comprobante_id','usuario_id','tipo','cantidad','stock_anterior','stock_posterior','motivo')),
    jsonb_build_object('tabla','cuenta_cobrar','columnas',jsonb_build_array('id','comprobante_id','empresa_id','sucursal_id','saldo_pendiente','monto_revertido','estado','updated_at')),
    jsonb_build_object('tabla','cliente','columnas',jsonb_build_array('id','empresa_id','saldo_credito')),
    jsonb_build_object('tabla','usuario_sucursal','columnas',jsonb_build_array('usuario_id','sucursal_id')),
    jsonb_build_object('tabla','usuario','columnas',jsonb_build_array('id','empresa_id','supabase_auth_user_id','activo'))
  );

  SELECT count(*) INTO v_total FROM jsonb_array_elements(v_requeridos) t;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'tabla',r->>'tabla',
    'columnasFaltantes',(SELECT COALESCE(jsonb_agg(col), '[]'::jsonb)
      FROM jsonb_array_elements_text(r->'columnas') col
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=r->>'tabla' AND c.column_name=col
      ))
  ) ORDER BY r->>'tabla'),'[]'::jsonb)
  INTO v_faltantes
  FROM jsonb_array_elements(v_requeridos) r
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables t
    WHERE t.table_schema='public' AND t.table_name=r->>'tabla'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(r->'columnas') col
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=r->>'tabla' AND c.column_name=col
    )
  );

  RETURN jsonb_build_object(
    'ok',jsonb_array_length(v_faltantes)=0,
    'usuarioVerificado',true,
    'empresaId',v_empresa,
    'tablasRevisadas',v_total,
    'tablasCompatibles',v_total-jsonb_array_length(v_faltantes),
    'faltantes',v_faltantes,
    'puedeHabilitarRegistro',false,
    'mensaje',CASE WHEN jsonb_array_length(v_faltantes)=0
      THEN 'Las columnas requeridas están presentes. Aún falta validar restricciones, tipos, claves foráneas y pruebas transaccionales.'
      ELSE 'El esquema no está listo: faltan tablas o columnas. No habilite el registro de devoluciones.' END
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_devolucion_esquema_verificar_auth() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_devolucion_esquema_verificar_auth() TO authenticated;
COMMIT;
