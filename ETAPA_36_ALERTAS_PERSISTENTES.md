# Etapa 36 — Historial persistente de alertas operativas

## Entregado
- Tabla `alerta_operativa`, con migración TypeORM nueva `1710000000022-alertas-operativas-persistentes.ts` (pendiente de ejecutar).
- Alertas persistentes individuales por administrador, empresa y clave estable.
- Clasificación por nivel, categoría, detalle, destino, sucursal opcional y fechas de detección.
- Endpoints:
  - `GET /api/notificaciones/operativas`
  - `POST /api/notificaciones/operativas/sincronizar`
  - `PATCH /api/notificaciones/operativas/:id/leida`
  - `PATCH /api/notificaciones/operativas/leidas`
- Sincronización transaccional: las alertas que dejan de detectarse se desactivan; si reaparecen, vuelven a estado no leído. Las alertas que siguen activas conservan su estado leído.
- Aislamiento por empresa y usuario; validación de sucursales permitidas; operaciones reservadas a ADMIN.
- La pantalla `/alertas` sincroniza el resultado del dashboard y permite marcar una o todas como leídas. El estado se conserva entre sesiones y dispositivos del mismo administrador.

## Límites
- La sincronización ocurre cuando el administrador abre o actualiza el centro de alertas. No se ejecuta todavía como tarea programada en segundo plano.
- No incluye push, SMS, WhatsApp ni correo para estas alertas.
- No se modifican ni se ejecutan migraciones automáticamente.

## Pendiente de validación
Build integral, pruebas de integración PostgreSQL (incluyendo concurrencia y permisos), y pruebas de navegador/Android requieren entorno con dependencias y base de datos configuradas.
