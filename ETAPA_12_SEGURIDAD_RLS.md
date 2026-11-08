# Etapa 12 — aislamiento por empresa/sucursal y diagnóstico RLS

## Qué se añadió
- `canAccessTenantScope`: regla pura para verificar empresa y sucursal.
- `@TenantScope({ empresaParam, sucursalParam? })`: metadato explícito para proteger rutas.
- `TenantScopeGuard`: rechaza ámbitos ausentes, inválidos o ajenos. Sin metadatos no altera rutas existentes.
- Pruebas unitarias de la regla de ámbito.
- `SUPABASE_RLS_DIAGNOSTICO_SOLO_LECTURA.sql`: consultas SELECT para conocer el estado real de RLS, políticas y privilegios.

## Uso previsto en un endpoint
La ruta debe tener autenticación y ámbito explícitos, por ejemplo:

```ts
@UseGuards(JwtAuthGuard, TenantScopeGuard)
@TenantScope({ empresaParam: 'empresaId', sucursalParam: 'sucursalId' })
@Get()
listar(...) { ... }
```

Los nombres de parámetros deben existir en `params`, `query` o `body`. El `empresaId` recibido se compara con el del JWT validado. Los IDs de sucursal se contrastan con las sucursales asignadas al usuario.

## Limitación crítica antes de activar RLS
El backend actual usa TypeORM y una conexión PostgreSQL directa. Si esa conexión usa un rol propietario, `postgres` o `BYPASSRLS`, las políticas RLS no constituyen una barrera efectiva para las consultas del backend. Activar políticas sin cambiar y probar el modelo de conexión puede bloquear operaciones legítimas o crear una falsa sensación de seguridad.

Antes de activar RLS hay que:
1. Ejecutar el diagnóstico SELECT en un entorno controlado y revisar resultados.
2. Decidir si las consultas de usuario final usarán JWT Supabase y rol `authenticated`, o un backend de confianza con aislamiento explícito y contexto transaccional seguro.
3. Definir cómo se establecerá y limpiará el contexto de empresa/sucursal por transacción, evitando contaminación entre conexiones del pool.
4. Diseñar políticas tabla por tabla, incluyendo lectura, inserción, actualización y borrado.
5. Probar acceso cruzado entre empresas y sucursales antes de producción.

## No realizado
- No se ejecutó SQL ni migraciones.
- No se modificó Supabase.
- No se habilitó RLS.
- El guard se entrega como mecanismo opt-in; no se activa globalmente ni se aplica automáticamente a todos los controladores.
- No se cambió el inicio de sesión ni el proveedor de autenticación.
