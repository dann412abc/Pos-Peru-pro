# v1.44.37 — Corrección de huella de idempotencia

## Hallazgo corregido
La revisión del SQL previo encontró una inconsistencia: el contrato de venta exige una huella SHA-256 de 64 caracteres, pero el preflight v1.44.36 usaba MD5 de 32 caracteres. Además, la comprobación previa no reserva la clave y no sustituye la idempotencia transaccional.

## Cambio de esta etapa
- Nuevo preview `202611070021_sales_idempotency_sha256.sql`.
- `request_hash` se prepara como `varchar(64)`.
- La huella se calcula con SHA-256 sobre JSONB normalizado, excluyendo `idempotencyKey`.
- Se conserva la validación de `auth.uid()`, usuario POS activo, empresa y sucursal asignada.
- Las huellas históricas MD5 no se aceptan como verificables automáticamente: requieren revisión/migración controlada.
- Pruebas estáticas para algoritmo, alcance de autorización y ausencia de efectos secundarios.

## Límites
Este endpoint es solo una preconsulta; no reserva claves ni garantiza concurrencia. La garantía final debe estar en el INSERT de la RPC de creación, protegido por `uq_comprobante_empresa_idempotency`, con comparación de hash dentro de la transacción.

## Estado operativo
No ejecutar en producción. No conectar todavía el botón Cobrar. No se toca Supabase remoto ni Cloudflare.
