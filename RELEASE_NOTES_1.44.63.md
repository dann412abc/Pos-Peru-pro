# Mi Carrito POS 1.44.63

## Integración de Caja con Supabase Auth + Cloudflare

- La pantalla Cierre de Caja detecta `VITE_AUTH_PROVIDER=supabase` y usa las rutas Edge protegidas para abrir, registrar movimientos y cerrar caja.
- La caja abierta se obtiene mediante la RPC autenticada ya utilizada por Compras.
- El resumen del turno usa `pos_caja_resumen_auth`.
- Se conserva el flujo API anterior para instalaciones que no usan Supabase Auth y el modo demo local.
- Se agregan validaciones de respuesta y pruebas de contrato de la integración UI.

## Alcance y límites

- No se ejecutaron migraciones ni se modificó ningún proyecto remoto de Supabase.
- La migración de ciclo de caja sigue en `supabase/migrations-preview/`; debe revisarse y probarse en staging antes de producción.
- El historial de movimientos de caja se conserva en pantalla durante la sesión actual; su consulta persistente tras recargar requiere una RPC de lectura dedicada y queda como siguiente mejora.
- Devoluciones en el resumen de caja siguen pendientes de integración contable; no se debe interpretar el total provisional como liquidación final.
- No se desplegó en Cloudflare.
