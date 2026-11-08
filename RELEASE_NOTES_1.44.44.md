# Mi Carrito POS v1.44.44

- Integra en una sola prevalidación autenticada contexto, idempotencia, catálogo/stock, cálculo de IGV y pagos.
- Los precios y tipos IGV usados para calcular proceden del catálogo validado en servidor.
- Los pagos se validan contra el total calculado en servidor y perfil crediticio obtenido internamente.
- La prevalidación no registra ventas, pagos, caja, inventario ni correlativos.
- Incluye pruebas estáticas Node.js y documentación del contrato.
- Migración en `supabase/migrations-preview/`; no ejecutar aún.
