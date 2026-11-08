# Mi Carrito POS v1.44.50

- Integra bloqueo y validación de caja abierta, usuario y sucursal en el escritor interno.
- Separa importe pagado al contado y componente de crédito.
- Evita duplicar ingresos: ventas alimentan el reporte de caja desde comprobante_pago; no crea caja_movimiento adicional.
- Revalida límite/saldo de crédito bloqueando el registro del cliente.
- Crea cuenta_cobrar por el importe financiado y actualiza cliente.saldo_credito.
- Mantiene todo dentro de la transacción PostgreSQL llamadora.
- 91 pruebas estáticas aprobadas.
- Preview-only: no ejecutar migraciones ni habilitar Cobrar hasta pruebas runtime en staging.
