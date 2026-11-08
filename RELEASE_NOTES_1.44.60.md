# Mi Carrito POS v1.44.60

## Conciliación exacta de pagos
- Endurece el validador puro de pagos: la suma de los medios de pago debe coincidir exactamente con el total de la venta a dos decimales.
- Elimina la tolerancia de S/ 0.01 que podía permitir una diferencia entre el comprobante y los importes registrados.
- Añade pruebas estáticas para Yape, Plin, tarjeta, efectivo/vuelto y crédito/cuenta por cobrar.
- Confirma en el contrato del escritor que el ingreso de caja se obtiene desde `comprobante_pago`, evitando duplicar ingresos con movimientos de caja paralelos.

## Seguridad y límites
- No se ejecutaron migraciones ni pruebas conectadas a Supabase.
- No se desplegó Cloudflare.
- Las pruebas de esta etapa verifican contratos de código; no certifican el comportamiento real del runtime.
- Los cobros Supabase continúan deshabilitados hasta completar staging, reconciliación real y autorización.
