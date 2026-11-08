# Etapa 35 — Centro de alertas operativas

## Entregado
- Nueva pantalla `/alertas`, accesible desde el menú lateral para ADMIN.
- Resumen separado de alertas críticas, advertencias e informativas.
- Filtros por nivel y orden de prioridad.
- Alertas derivadas del endpoint gerencial existente:
  - Productos simples y variantes en stock mínimo o agotados.
  - Lotes con vencimiento dentro de los próximos 30 días (crítico si faltan 7 días o menos).
  - Cuentas por cobrar y obligaciones con proveedores vencidas.
  - Gastos pendientes.
  - Cajas abiertas.
  - Líneas vendidas sin costo registrado.
  - Mermas registradas en los últimos 30 días.
- Accesos directos a los módulos correspondientes.
- Actualización manual de datos desde el botón Actualizar.
- Sin cambios en el esquema de base de datos y sin migraciones.

## Alcance y límites
Las alertas se calculan al consultar el panel y se construyen con los datos del dashboard gerencial existente, respetando el alcance de empresa y sucursales del usuario autenticado. No se crea una bandeja persistente, no se sincroniza el estado leído entre dispositivos y no se envían notificaciones push, SMS, WhatsApp ni correo. La pantalla informa expresamente estos límites para evitar confundir alertas dentro de la aplicación con mensajería externa.

## Validación
La implementación requiere ejecutar build y pruebas del proyecto en un entorno con dependencias instaladas y conexión a una base compatible. No se ejecutaron migraciones, no se modificó Supabase remoto y no se desplegó Cloudflare.
