# Mi Carrito POS v1.44.47

- Añadido harness psql de integración para probar la barrera fail-closed de ventas en PostgreSQL staging.
- Comprueba la respuesta `WRITER_DISABLED` y compara contenido/cantidad de diez tablas operativas.
- La prueba termina con `ROLLBACK` y requiere un staging aislado, datos reales de prueba y ausencia de escrituras concurrentes.
- Añadidas cinco pruebas estáticas del contrato del harness.
- No se implementa aún la escritura de ventas, no se ejecutan migraciones y no se habilita el botón Cobrar.
