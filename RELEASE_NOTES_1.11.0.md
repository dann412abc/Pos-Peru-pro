# Mi Carrito POS 1.11.0

## Etapa 11 — Identidad Supabase Auth preparada
- Añadida columna nullable `usuario.supabase_auth_user_id` (UUID).
- Añadido índice único parcial para evitar vínculos duplicados.
- Añadida búsqueda de usuario interno por UUID de Supabase Auth, solo si está activo.
- Añadida prueba unitaria del mapeo de identidad.
- Añadida migración TypeORM reversible con protección ante vínculos existentes.
- Añadida guía de activación gradual y advertencia sobre RLS con conexión backend privilegiada.

## Compatibilidad y límites
- El login legado sigue activo y sin cambios.
- No se ejecutaron migraciones ni se modificó Supabase remoto.
- No se activó Supabase Auth, RLS ni SUNAT real.
- No se certifica build completo en ausencia de dependencias instaladas.
