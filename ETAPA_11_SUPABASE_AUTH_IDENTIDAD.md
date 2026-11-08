# Etapa 11 — Preparación de identidad para Supabase Auth

## Objetivo
Preparar un vínculo seguro y gradual entre el usuario operativo del POS (`usuario.id`, entero) y la identidad de autenticación de Supabase (`auth.users.id`, UUID), sin interrumpir el inicio de sesión actual.

## Cambios incluidos en 1.11.0
- `usuario.supabase_auth_user_id`: UUID nullable para vincular identidades sin cambiar las claves internas ni las relaciones existentes.
- Índice único parcial: impide que una identidad de Supabase quede vinculada a dos usuarios POS; permite que usuarios aún no migrados mantengan el campo NULL.
- `UsuariosService.findBySupabaseAuthUserId`: resuelve únicamente usuarios internos activos y carga sus sucursales.
- Prueba unitaria para la búsqueda y el caso sin vínculo.
- Migración TypeORM `1710000000010-supabase-auth-identity.ts`, con reversión protegida si ya existen vínculos.

## Lo que NO se ha activado
- El login actual `username + password` y los JWT internos siguen siendo el único flujo activo.
- No se llama a Supabase Auth, no se crean cuentas, no se sincronizan contraseñas y no se cambia el frontend.
- No se han ejecutado migraciones, SQL ni cambios en el proyecto remoto Supabase.
- No se han creado políticas RLS ni se ha cambiado el rol de conexión PostgreSQL.

## Secuencia de activación futura (requiere aprobación)
1. Confirmar que la tabla `usuario` y su esquema coinciden con esta versión.
2. Aplicar primero la migración en un entorno de prueba y comprobar el índice único.
3. Crear/invitar identidades en Supabase Auth y vincular cada UUID a un usuario POS existente mediante un proceso administrativo auditado. Nunca vincular automáticamente solo por coincidencia de nombre de usuario.
4. Implementar intercambio de sesión validando el token de Supabase en servidor y comprobando que el usuario POS está activo, con empresa y sucursales asignadas.
5. Diseñar revocación/refresh y cierre de sesión antes de cambiar el proveedor por defecto.
6. Probar recuperación de contraseña, bloqueo/desactivación, expiración, revocación y acceso multiempresa.
7. Solo después, habilitar el proveedor Supabase Auth mediante una configuración explícita y plan de reversión.

## Advertencia importante sobre RLS
El backend actual usa TypeORM con credenciales PostgreSQL del servidor. Una conexión con privilegios elevados puede omitir RLS de Supabase. No basta con activar políticas: la siguiente etapa de seguridad debe definir cómo propagar la identidad/contexto de usuario a PostgreSQL o qué operaciones pasarán a RPC con rol `authenticated`. No exponer nunca `service_role` en el frontend.

## Verificación de esta entrega
- Revisión estática: entidad, índice y búsqueda usan el mismo nombre de columna.
- Prueba unitaria añadida; su ejecución completa requiere instalar las dependencias del backend.
- No se declara compilación integral: el entorno de trabajo anterior no tenía `node_modules` completo.

## Aprobación necesaria antes de producción
Esta entrega prepara la estructura, no autoriza a ejecutar `npm run migration:run`. Mantener el login actual hasta completar y aprobar el flujo completo de autenticación.
