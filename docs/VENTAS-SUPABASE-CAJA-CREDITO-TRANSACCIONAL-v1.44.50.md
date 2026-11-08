# v1.44.50 — Caja y cuentas por cobrar en el escritor transaccional

## Alcance incorporado

Se amplía el helper interno `pos_venta_insertar_documento_pagos_interno` para completar el bloque de caja y crédito, dentro de la misma transacción que ya inserta comprobante, líneas, pagos, inventario, lotes FEFO y movimientos de inventario.

### Caja

- Bloquea la fila de `caja` con `FOR UPDATE`.
- Comprueba que esté `ABIERTA`, pertenezca al usuario y corresponda a la sucursal y empresa autenticadas.
- Calcula el importe pagado al contado frente al componente financiado.
- No inserta `caja_movimiento` por cada pago de venta: los reportes actuales de caja ya suman los ingresos de ventas desde `comprobante_pago`. Crear otro movimiento duplicaría ingresos.
- El vuelto no se contabiliza como ingreso adicional.

### Crédito

- Recalcula el importe de crédito desde el desglose validado de `comprobante_pago`.
- Bloquea el cliente y vuelve a comprobar límite y saldo disponible.
- Rechaza el cliente genérico `00000000`, límites no autorizados y fechas de vencimiento pasadas.
- Crea `cuenta_cobrar` solo por la parte financiada.
- Actualiza `cliente.saldo_credito` en la misma transacción.

## Atomicidad y límites

Cualquier error debe propagarse como excepción; PostgreSQL revierte comprobante, líneas, pagos, correlativo, inventario, asignaciones FEFO, movimientos y saldo/cuenta de crédito.

El helper sigue sin permisos `PUBLIC`, `anon` ni `authenticated`. No es una RPC pública ni puede invocarse desde el navegador. La futura RPC pública autenticada debe derivar la identidad y alcance desde `auth.uid()`, construir el contexto confiable, llamar el helper y dejar que la transacción confirme únicamente al terminar todos los bloques.

## Validación realizada

- 91 pruebas estáticas Node.js aprobadas.
- No se ejecutó SQL contra PostgreSQL/Supabase.
- No se probó concurrencia real, rollback real ni restricciones reales en staging.
- No se habilita el botón Cobrar ni se despliega a Cloudflare.
