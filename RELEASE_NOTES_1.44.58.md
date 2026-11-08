# Mi Carrito POS v1.44.58

## Recuperación oficial del comprobante validada en staging
- Amplía el harness transaccional para consultar el detalle oficial después de crear una venta usando el contexto JWT autenticado.
- Verifica empresa, sucursal, cliente, líneas, pagos y consistencia entre pagos y total.
- Añade prueba estática para proteger la RPC de detalle como lectura `STABLE`, sin escrituras y con permisos restringidos.
- La integración remota sigue siendo opt-in: requiere staging aislado, fixture y confirmación explícita.

## Estado
- No se ejecutaron migraciones en Supabase.
- No se desplegó Cloudflare.
- No se habilitaron cobros reales; `VITE_SUPABASE_SALES_ENABLED=false` se conserva.
