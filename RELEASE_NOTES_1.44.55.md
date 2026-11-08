# Mi Carrito POS v1.44.55

- Persistencia durable de clave de idempotencia de ventas entre recargas y reinicios de pestaña.
- Snapshot del payload de venta guardado antes de la RPC para reintentos exactos.
- Bloqueo preventivo si existe un cobro ambiguo y el usuario intenta enviar un carrito diferente.
- Limpieza del intento solo tras confirmación completa.
- Ventas Supabase continúan deshabilitadas por defecto.
- Sin migraciones ejecutadas ni despliegue Cloudflare.

Ver `docs/VENTAS-SUPABASE-RECUPERACION-PERSISTENTE-v1.44.55.md`.
