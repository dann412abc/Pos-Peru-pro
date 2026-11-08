# v1.44.51 — Orquestador autenticado transaccional de ventas

## Objetivo

Se incorpora la RPC `public.pos_venta_crear_auth(p_payload jsonb)`, destinada a ser el único punto de entrada de creación de ventas desde el cliente autenticado.

## Flujo dentro de una sola transacción PostgreSQL

1. Valida la forma del payload y limita comprobantes a boleta (`03`) y factura (`01`).
2. Resuelve identidad, empresa, sucursal, rol y caja abierta usando `auth.uid()` mediante `pos_venta_contexto_auth`.
3. Calcula SHA-256 y serializa reintentos por empresa + clave idempotente. Si ya existe la venta idéntica, devuelve el comprobante sin repetir operaciones.
4. Valida cliente, productos, variantes y stock con el helper interno.
5. Reconstruye cada línea con precio e IGV obtenidos del catálogo de servidor.
6. Calcula importes e IGV en servidor.
7. Valida los medios de pago y el crédito con datos reales del cliente.
8. Construye el preflight interno y llama `pos_venta_insertar_documento_pagos_interno`.
9. Devuelve el resultado solo si todos los pasos terminan correctamente. Una excepción aborta la transacción completa.

## Seguridad

- `SECURITY DEFINER` con `search_path` fijo.
- `EXECUTE` concedido únicamente a `authenticated`; revocado a `PUBLIC` y `anon`.
- El navegador no puede elegir `empresaId`, `usuarioId`, `cajaId` ni rol.
- Los helpers internos mantienen sus permisos revocados a roles cliente.
- Los precios, tipo IGV, importes, pagos, límite y saldo de crédito se obtienen o recalculan en servidor.

## Límites conservados

- No se habilita nota de venta ni se altera el CHECK de tipos fiscales.
- Descuento global sigue rechazado hasta resolver su representación contable en cabecera/líneas.
- No se crea un segundo movimiento de caja por venta; los reportes ya suman `comprobante_pago`.
- La RPC no se debe desplegar ni invocar en producción antes de las pruebas runtime.

## Validación

- 99 pruebas estáticas Node.js aprobadas (0 fallidas).
- No se ejecutó SQL en Supabase ni PostgreSQL.
- No se probó concurrencia, rollback ni RLS en una instancia real.
- No se habilita el botón Cobrar ni se despliega Cloudflare.
