# Mi Carrito POS 1.44.70

## Auditoría de compatibilidad del esquema de devoluciones

- Añade `pos_devolucion_esquema_verificar_auth()` para revisar las tablas y columnas necesarias para la futura devolución transaccional.
- La función deriva la identidad desde `auth.uid()` y exige usuario POS activo.
- Devuelve una lista de tablas/columnas faltantes sin exponer registros comerciales.
- Añade `verifySupabaseReturnsSchema()` al cliente frontend.
- La respuesta siempre declara `puedeHabilitarRegistro: false`: la auditoría no sustituye pruebas de restricciones, claves foráneas, tipos ni pruebas de integración.

Migración de vista previa: `supabase/migrations-preview/202611070048_returns_schema_audit_auth.sql`.
No aplicar en producción sin contrastar con el esquema de staging.
