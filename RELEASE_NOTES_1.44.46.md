# Mi Carrito POS v1.44.46

- Añadida barrera autenticada fail-closed para la futura RPC transaccional de ventas.
- La barrera encadena la prevalidación integral y declara explícitamente que no crea ventas ni modifica caja, stock, pagos, crédito o correlativos.
- Permisos limitados a `authenticated` y `search_path` fijo.
- Añadidas pruebas estáticas de seguridad y ausencia de escrituras.
- No ejecutar migraciones ni habilitar Cobrar: el escritor transaccional integral sigue pendiente.
