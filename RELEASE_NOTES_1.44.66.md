# Mi Carrito POS 1.44.66

## Protección de devoluciones durante la migración Supabase
- Se exporta el indicador `ES_SUPABASE_AUTH` desde el cliente API.
- La pantalla de devoluciones deja de consultar o escribir contra la API anterior cuando Supabase Auth está activo.
- Se muestra un aviso explícito hasta completar las RPC transaccionales autenticadas.
- El flujo legado se conserva para instalaciones que aún usan el backend anterior.

## Estado
- Esta etapa es una protección de integridad: evita operaciones parciales en caja, inventario y crédito.
- No activa aún registro de devoluciones en Supabase.
- No ejecutar migraciones ni desplegar hasta completar las RPC de consulta y registro idempotente.
