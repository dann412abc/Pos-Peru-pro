# Mi Carrito POS v1.44.54

## Recuperación de cobros con respuesta ambigua

- Amplía `pos_venta_idempotencia_consultar_auth` con una respuesta de solo lectura que incluye el comprobante y el desglose de pagos.
- Valida usuario, empresa, sucursal asignada y SHA-256 de la carga original.
- La consulta no exige caja abierta y no altera inventario, pagos, caja, correlativos ni crédito.
- El adaptador frontend consulta automáticamente el estado tras timeout, corte de red o respuesta 5xx.
- Si la venta ya fue confirmada, recupera serie, correlativo, total y comprobante sin repetir la creación.
- Si no se encuentra, conserva carrito y clave; `NOT_FOUND_YET` no se interpreta como fracaso definitivo.
- Añade pruebas estáticas para la recuperación y tests frontend de éxito recuperado y estado aún pendiente.

## Seguridad / límites

- La migración es preview-only; no fue ejecutada en Supabase.
- `VITE_SUPABASE_SALES_ENABLED=false` permanece desactivado.
- No se desplegó Cloudflare y no se activó Cobrar.
- Las pruebas runtime en staging siguen pendientes.

## Validación realizada

- Suite estática Node: 117 aprobadas, 0 fallidas y 2 omitidas por requerir una conexión real de staging.
- Transpilación sintáctica TypeScript/TSX de `supabaseSales.ts`, sus pruebas y `VentaRapida.tsx`: correcta.
- No se ejecutó `npm ci`, build Vite ni prueba contra Supabase; no se declara validación runtime.
