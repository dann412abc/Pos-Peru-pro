# Mi Carrito POS v1.44.61

## Resumen autenticado de caja en Supabase
- Añade la RPC `pos_caja_resumen_auth(p_caja_id)` para obtener conteo y total de comprobantes no anulados, desglose por efectivo/tarjeta/Yape/Plin/crédito y efectivo esperado.
- La identidad, empresa, sucursal y propietario se resuelven en SQL desde `auth.uid()`; el navegador solo entrega el identificador de caja.
- Añade la ruta Cloudflare `GET /api/edge/cash/summary` con Bearer obligatorio y manejo explícito de migración faltante.
- Añade el cliente `fetchSupabaseCashSummary` con validación estricta de respuesta.
- La RPC no concede ejecución a `PUBLIC` ni `anon`; solo a `authenticated`.

## Límites conocidos
- Esta etapa incorpora lectura de resumen, no apertura, registro de movimientos ni cierre transaccional de caja en Supabase.
- El resumen informa `totalDevoluciones: 0` provisionalmente; la integración de devoluciones y reembolsos por medio de pago queda para una etapa posterior.
- No se ejecutaron migraciones, no se llamó a un proyecto Supabase remoto y no se desplegó Cloudflare.
- No activar cobros ni migrar el cierre de caja en producción hasta completar las RPC de escritura y pruebas de staging.
