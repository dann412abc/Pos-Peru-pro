-- PREVIEW / DIAGNOSTICO SOLAMENTE. NO MODIFICA DATOS NI ESQUEMA.
-- Inspecciona los prerrequisitos del esquema para la futura RPC transaccional.
WITH required_columns(table_name,column_name) AS (
 VALUES
 ('usuario','id'),('usuario','empresa_id'),('usuario','supabase_auth_user_id'),('usuario','activo'),('usuario','rol'),
 ('usuario_sucursal','usuario_id'),('usuario_sucursal','sucursal_id'),('sucursal','id'),('sucursal','empresa_id'),
 ('caja','id'),('caja','sucursal_id'),('caja','usuario_id'),('caja','estado'),('caja','saldo_inicial'),
 ('producto','id'),('producto','empresa_id'),('producto','nombre'),('producto','precio'),('producto','tipo_igv'),('producto','activo'),('producto','tiene_variantes'),
 ('producto_stock','producto_id'),('producto_stock','sucursal_id'),('producto_stock','empresa_id'),('producto_stock','stock'),('producto_stock','costo_promedio'),
 ('producto_variante','id'),('producto_variante','producto_id'),('producto_variante','empresa_id'),('producto_variante','nombre'),('producto_variante','codigo'),('producto_variante','precio'),('producto_variante','activo'),
 ('producto_variante_stock','variante_id'),('producto_variante_stock','producto_id'),('producto_variante_stock','sucursal_id'),('producto_variante_stock','empresa_id'),('producto_variante_stock','stock'),('producto_variante_stock','costo_promedio'),
 ('cliente','id'),('cliente','empresa_id'),('cliente','tipo_doc'),('cliente','numero'),('cliente','nombre'),('cliente','limite_credito'),('cliente','saldo_credito'),
 ('serie_correlativo','sucursal_id'),('serie_correlativo','tipo_comprobante'),('serie_correlativo','serie'),('serie_correlativo','ultimo_correlativo'),
 ('comprobante','id'),('comprobante','empresa_id'),('comprobante','sucursal_id'),('comprobante','caja_id'),('comprobante','usuario_id'),('comprobante','cliente_id'),('comprobante','tipo'),('comprobante','serie'),('comprobante','correlativo'),('comprobante','op_gravadas'),('comprobante','op_exoneradas'),('comprobante','op_inafectas'),('comprobante','descuento_global'),('comprobante','total_igv'),('comprobante','total'),('comprobante','metodo_pago'),('comprobante','estado'),('comprobante','idempotency_key'),('comprobante','request_hash'),
 ('comprobante_linea','comprobante_id'),('comprobante_linea','empresa_id'),('comprobante_linea','numero_linea'),('comprobante_linea','producto_id'),('comprobante_linea','variante_id'),('comprobante_linea','cantidad'),('comprobante_linea','precio_unitario'),('comprobante_linea','costo_unitario'),('comprobante_linea','descuento'),('comprobante_linea','tipo_igv'),('comprobante_linea','base_imponible'),('comprobante_linea','igv'),('comprobante_linea','subtotal'),
 ('comprobante_pago','comprobante_id'),('comprobante_pago','metodo_pago'),('comprobante_pago','monto'),('comprobante_pago','monto_recibido'),('comprobante_pago','vuelto'),
 ('movimiento_inventario','empresa_id'),('movimiento_inventario','sucursal_id'),('movimiento_inventario','producto_id'),('movimiento_inventario','variante_id'),('movimiento_inventario','comprobante_id'),('movimiento_inventario','usuario_id'),('movimiento_inventario','tipo'),('movimiento_inventario','cantidad'),('movimiento_inventario','stock_anterior'),('movimiento_inventario','stock_posterior'),('movimiento_inventario','motivo'),
 ('caja_movimiento','caja_id'),('caja_movimiento','usuario_id'),('caja_movimiento','tipo'),('caja_movimiento','metodo_pago'),('caja_movimiento','monto'),('caja_movimiento','motivo'),('caja_movimiento','comprobante_id'),
 ('inventario_lote','id'),('inventario_lote','empresa_id'),('inventario_lote','sucursal_id'),('inventario_lote','producto_id'),('inventario_lote','variante_id'),('inventario_lote','fecha_vencimiento'),('inventario_lote','cantidad_disponible'),('inventario_lote','costo_unitario'),
 ('comprobante_lote_salida','empresa_id'),('comprobante_lote_salida','comprobante_id'),('comprobante_lote_salida','lote_id'),('comprobante_lote_salida','producto_id'),('comprobante_lote_salida','variante_id'),('comprobante_lote_salida','cantidad'),
 ('cuenta_cobrar','empresa_id'),('cuenta_cobrar','sucursal_id'),('cuenta_cobrar','comprobante_id'),('cuenta_cobrar','cliente_id'),('cuenta_cobrar','total_credito'),('cuenta_cobrar','saldo_pendiente'),('cuenta_cobrar','fecha_vencimiento'),('cuenta_cobrar','estado')
), missing AS (
 SELECT r.table_name,r.column_name,
 CASE WHEN to_regclass('public.'||r.table_name) IS NULL THEN 'TABLA AUSENTE' ELSE 'COLUMNA AUSENTE' END issue
 FROM required_columns r LEFT JOIN information_schema.columns c
 ON c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
 WHERE c.column_name IS NULL
)
SELECT 'MISSING' result_type,table_name,column_name,issue FROM missing
UNION ALL
SELECT 'SUMMARY',NULL,NULL,
 CASE WHEN COUNT(*)=0 THEN 'ESQUEMA COMPLETO PARA AUDITORIA; LA RPC AUN NO ESTA IMPLEMENTADA'
 ELSE COUNT(*)::text||' prerrequisito(s) ausente(s); NO CONTINUAR CON LA RPC' END
FROM missing
ORDER BY result_type,table_name NULLS LAST,column_name NULLS LAST;
