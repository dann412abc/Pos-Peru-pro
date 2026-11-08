# Etapa 10 — Desacoplamiento de colas para arquitectura Cloud (v1.10.0)

## Objetivo
Preparar el dominio para sustituir Bull/Redis por un proveedor de trabajos compatible con Cloudflare Queues u otro servicio administrado, sin reescribir la lógica de facturación ni cambiar la API de negocio en una sola entrega.

## Implementado
- Se definió el contrato `FeQueuePort` (`backend/src/fe/queue.port.ts`) con operaciones mínimas de encolado y opciones de reintento.
- Se creó `BullFeQueueAdapter`, adaptador transitorio que conserva el comportamiento actual de Bull.
- `FeService`, `ResumenDiarioService` y `ComunicacionBajaService` dependen ahora del contrato, no de `@InjectQueue` ni del tipo `Queue`.
- El módulo FE registra el puerto mediante inyección de dependencias.
- Se agregó prueba unitaria del adaptador para asegurar que nombre, payload y política de reintentos se transmiten sin alteración.

## Estado real después de esta etapa
- Bull/Redis sigue activo como proveedor de ejecución y `FeProcessor` sigue usando el consumidor Bull.
- No se desplegó una cola Cloudflare ni se cambió la infraestructura remota.
- No se migraron todavía transacciones TypeORM/PostgreSQL a Supabase RPC.
- No se ejecutaron migraciones SQL ni se modificó Supabase.
- No se afirma que la aplicación ya funcione sin servidor Node.

## Próximos pasos obligatorios
1. Definir el contrato de persistencia transaccional para ventas, caja, stock, devoluciones y compras.
2. Convertir operaciones críticas a funciones SQL idempotentes con transacciones en Supabase; generar migraciones versionadas y auditables, pero no aplicarlas sin autorización.
3. Implementar un consumidor de cola administrada y patrón outbox transaccional para no perder comprobantes cuando se confirme una venta.
4. Migrar módulos por prioridad, con pruebas de concurrencia y regresión.
5. Reemplazar autenticación JWT propia por una integración validada con Supabase Auth, manteniendo roles y sucursales.
6. Retirar Bull/Redis solo cuando no queden consumidores ni productores dependientes.

## Criterio de aceptación
No retirar el runtime Node/Redis hasta demostrar que cada endpoint y proceso tiene un reemplazo desplegable, con permisos equivalentes, idempotencia, transacciones, observabilidad y pruebas de fallo.
