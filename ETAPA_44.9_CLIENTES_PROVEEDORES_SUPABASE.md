# Etapa 1.44.9 — Clientes y proveedores en Supabase + Cloudflare

## Alcance de esta entrega
- Endpoint `POST /api/edge/parties/mutate` con sesión Supabase obligatoria.
- Cliente TypeScript `mutateSupabaseParty` para operaciones de clientes/proveedores.
- Migración SQL de vista previa `202611070006_parties_write_rpc.sql`.
- Empresa derivada exclusivamente desde `auth.uid()` y `usuario.supabase_auth_user_id`.
- Clientes: alta, edición y baja lógica; preserva saldo de crédito y no permite bajar el límite por debajo del saldo.
- Proveedores: alta, edición y baja lógica; impide desactivar si existen compras recibidas con saldo pendiente.
- Consumidor Final protegido contra desactivación.

## Límites conocidos
- La tabla `cliente` del esquema original no tiene columna `email`; esta etapa no persiste email del cliente para evitar escribir en una columna inexistente.
- La pantalla Clientes aún no cambia a este cliente de API; el helper y endpoint quedan listos para la integración de UI siguiente.
- La pantalla Compras/Proveedores continúa usando NestJS. No se ha migrado el flujo de compras.
- Las validaciones de RUC en UI/backend deben complementarse con validación SUNAT; la RPC valida formato y prefijos, no consulta SUNAT.

## Instalación y pruebas
- Migración de vista previa, NO ejecutar en producción.
- Antes de aplicar en staging: confirmar que migraciones base crearon `usuario`, `cliente`, `proveedor` y `compra` con las columnas esperadas.
- Probar aislamiento entre dos empresas, unicidad documental, saldo de crédito, protección de Consumidor Final y proveedor con deuda.
- No se ha modificado ningún proyecto remoto ni desplegado Cloudflare.
