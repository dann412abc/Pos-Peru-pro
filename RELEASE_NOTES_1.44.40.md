# Mi Carrito POS v1.44.40

- Helper privado de idempotencia para integrar dentro de la RPC transaccional.
- Bloqueo advisory por empresa y clave durante la transacción.
- Reutilización segura: misma huella devuelve comprobante; huella distinta se rechaza.
- El índice UNIQUE continúa siendo la protección definitiva ante concurrencia.
- Sin escrituras operativas ni habilitación de cobro.
- No ejecutar migraciones todavía.
