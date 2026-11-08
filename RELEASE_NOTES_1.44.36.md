# Mi Carrito POS v1.44.36

- Añadido diagnóstico SQL de solo lectura para verificar el esquema real requerido por la RPC transaccional de ventas.
- Documentado el estado y los bloqueos para no habilitar cobros antes de validar identidad, caja, catálogo, stock por variante, lotes, pagos y crédito.
- No se ejecutan migraciones ni se activa el cobro Supabase.
