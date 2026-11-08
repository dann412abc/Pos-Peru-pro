# Mi Carrito POS v1.44.41

- RPC de preparación que integra contexto autenticado e idempotencia.
- Validación de cliente dentro de la empresa.
- Validación de productos base y variantes activas.
- Precios leídos desde catálogo; los valores del navegador no son autoridad.
- Comprobación de stock por sucursal con locks y orden determinista.
- Sin creación de ventas, consumo de stock ni correlativos.
- No ejecutar migraciones todavía.
