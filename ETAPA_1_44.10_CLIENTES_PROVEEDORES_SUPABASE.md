# Etapa 1.44.10 — Integración de clientes y proveedores

Esta etapa conecta el CRUD visual de clientes y proveedores con la API Edge de Cloudflare y la RPC `pos_terceros_mutar_auth` de Supabase.

- El navegador envía únicamente la acción, los datos del registro y, para edición/baja, el ID.
- La empresa y el usuario se derivan en PostgreSQL desde `auth.uid()`.
- Los clientes desactivados se excluyen del catálogo; Consumidor Final no se puede desactivar y los clientes con saldo no pueden darse de baja.
- Los proveedores desactivados se excluyen del catálogo; la RPC impide desactivar proveedores con compras recibidas y saldo pendiente.
- Las compras, órdenes, cuentas por pagar, pagos y análisis continúan en NestJS. No se considera migrado el módulo Compras completo.

## Configuración

Activar `VITE_AUTH_PROVIDER=supabase` solo después de configurar Supabase Auth, el vínculo de identidad y las funciones SQL de los previews correspondientes en staging. No habilitarlo en producción hasta probar altas, ediciones, bajas, aislamiento entre empresas y saldos.

## Pendiente

1. Ejecutar migraciones en staging con autorización del responsable.
2. Probar con dos empresas y usuarios distintos que no exista acceso cruzado.
3. Probar cliente con deuda, Consumidor Final y proveedor con cuenta por pagar.
4. Migrar las operaciones de compras antes de retirar NestJS.
