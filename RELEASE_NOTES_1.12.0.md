# Mi Carrito POS 1.12.0

## Etapa 12 — preparación de aislamiento multiempresa
- Añadida regla pura de acceso por empresa y sucursal.
- Añadido decorador `@TenantScope` y guard opt-in `TenantScopeGuard`.
- Añadidas pruebas unitarias para los casos permitidos y denegados.
- Añadido diagnóstico SQL de RLS de solo lectura.
- Añadida documentación de los límites del modelo actual TypeORM + PostgreSQL.

## Seguridad y migraciones
No se ejecutaron migraciones ni SQL. No se modificó Supabase. RLS no se habilitó ni modificó. El guard no se aplica automáticamente a rutas existentes.
