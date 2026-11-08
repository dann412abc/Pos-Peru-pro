# Mi Carrito POS v1.44.28

## Bloque: historial de devoluciones a proveedores en el detalle de compra

- Se corrigió la RPC preview de lectura de compras para que el detalle devuelva las devoluciones a proveedor realmente registradas, en vez de entregar siempre una lista vacía.
- Cada devolución incluye identificador, motivo, importe total, importe aplicado a la cuenta y saldo a favor.
- La pantalla Compras ya disponía de la presentación del historial; ahora recibirá los datos desde la consulta Supabase.
- Se añadieron pruebas de contrato para evitar que el historial vuelva a quedar vacío por un valor fijo.

## Validación y límites

- Este cambio modifica únicamente el archivo SQL preview y pruebas de contrato.
- No se ejecutó la migración en Supabase ni se desplegó Cloudflare.
- Requiere revisar y aplicar la migración de lectura actualizada en un entorno staging antes de verificar datos reales.
