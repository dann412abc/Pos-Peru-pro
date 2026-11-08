# Prevalidación integral de ventas — v1.44.44

## Objetivo
Unificar la prevalidación previa a una venta en `public.pos_venta_preparar_auth(jsonb)`: identidad y alcance autenticados, idempotencia, cliente/catálogo/stock, cálculo tributario peruano y validación de pagos.

## Flujo implementado
1. Resuelve usuario, empresa, sucursal y caja mediante `auth.uid()` usando `pos_venta_contexto_auth`.
2. Calcula SHA-256 del payload sin `idempotencyKey` y consulta la idempotencia dentro del alcance de empresa.
3. Valida cliente, productos, variantes y disponibilidad de stock mediante `pos_venta_validar_cliente_catalogo_interno`.
4. Reconstruye las líneas de cálculo usando precio y tipo IGV del catálogo. Del navegador solo conserva IDs, cantidad y descuento solicitado.
5. Ejecuta `pos_venta_calcular_importes_interno` para obtener el total de servidor.
6. Ejecuta `pos_venta_validar_pagos_interno` contra ese total y usa el perfil crediticio devuelto por el catálogo; no acepta límite/saldo enviados por el navegador.
7. Devuelve el resultado completo con decisión `READY_FOR_TRANSACTIONAL_SALE`.

## Alcance y garantías
- No inserta ni actualiza comprobantes, pagos, cuentas por cobrar, movimientos de caja o inventario.
- No consume correlativos ni reserva stock/caja al terminar la llamada.
- No habilita el botón Cobrar ni reemplaza la futura RPC transaccional.
- La función mantiene `SECURITY DEFINER`, `search_path` fijo, revoca `PUBLIC` y `anon`, y concede ejecución solo a `authenticated`.
- La validación de pagos requiere perfil de cliente generado en servidor; el importe de pago se compara con el total calculado en servidor.

## Pendientes antes de producción
Las pruebas añadidas son estáticas Node.js, no ejecución SQL real. Falta revisar el SQL en PostgreSQL staging contra el esquema y propietario/privilegios reales, verificar la forma exacta de descuentos y líneas del payload frontend, y luego implementar la RPC transaccional que repita todas las validaciones junto con las escrituras y rollback integral. No ejecutar esta migración todavía.
