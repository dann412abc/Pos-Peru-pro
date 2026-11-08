# Etapa 1.44.70 — Auditoría del esquema

RPC autenticado de solo lectura: `pos_devolucion_esquema_verificar_auth()`.

Comprueba la presencia de tablas y columnas usadas por el servicio de devoluciones actual: comprobantes, líneas, pagos, devoluciones, caja, stock, lotes, movimientos de inventario, cuentas por cobrar y usuarios/sucursales.

No inspecciona filas de negocio, no realiza escrituras y nunca devuelve permiso para activar el registro. La siguiente etapa debe comparar los resultados reales de staging y validar constraints, FK, tipos numéricos y políticas antes de construir/habilitar el RPC de commit.
