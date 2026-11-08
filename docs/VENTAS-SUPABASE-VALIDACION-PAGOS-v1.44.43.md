# Validación de pagos en servidor — v1.44.43

## Qué incorpora
Se añade `public.pos_venta_validar_pagos_interno(jsonb,numeric,jsonb)`, un helper SQL puro e inmutable para validar pagos de una venta. No crea comprobantes, pagos, cuentas por cobrar ni movimientos de caja; tampoco modifica saldos.

## Contrato de entrada
- `p_pagos`: arreglo de 1 a 5 objetos `{ "metodo": "EFECTIVO|TARJETA|YAPE|PLIN|CREDITO", "monto": 10.00, "montoRecibido": 20.00 }`.
- `p_total`: total calculado por el motor de importes del servidor, no el total declarado por el navegador.
- `p_cliente`: objeto interno opcional con `numero`, `limite_credito` y `saldo_credito`. Solo debe construirse dentro de la futura RPC a partir del registro de cliente de la empresa autenticada, tras validar y bloquear esa fila. Nunca se debe reenviar aquí el objeto de cliente suministrado por el navegador.

## Reglas aplicadas
- Medios permitidos: efectivo, tarjeta, Yape, Plin y crédito.
- Entre 1 y 5 pagos; no se repite un medio, siguiendo el comportamiento del servicio POS actual.
- Cada importe debe ser positivo y se redondea a dos decimales. La suma debe coincidir con el total con la tolerancia de S/ 0.01 que utiliza actualmente `ventas.service.ts`.
- Solo efectivo admite `montoRecibido`. Si se omite, se considera igual al importe aplicado. Si se informa, no puede ser menor; el vuelto se calcula como recibido menos aplicado.
- Tarjeta, Yape y Plin no admiten vuelto ni monto recibido.
- El importe aplicado en efectivo, tarjeta, Yape y Plin se informa como ingreso de caja. El crédito no se suma a caja.
- Crédito requiere un cliente distinto del cliente genérico `00000000`, límite positivo y disponible suficiente (`limite_credito - saldo_credito`).
- Devuelve pagos normalizados, importe de crédito, ingreso de caja, efectivo recibido, vuelto, saldo por cobrar, método principal y estado sugerido del comprobante.

## Integración futura obligatoria
La RPC autenticada debe:
1. Resolver usuario, empresa, sucursal y caja abierta desde `auth.uid()` y bloquear la caja.
2. Resolver y bloquear el cliente dentro de la empresa; formar el objeto crediticio interno.
3. Validar catálogo y calcular el total con `pos_venta_calcular_importes_interno`.
4. Invocar este helper con el total calculado y el perfil crediticio obtenido en servidor.
5. Solo después de todas las validaciones, insertar comprobante y pagos, crear cuenta por cobrar si corresponde y registrar movimientos de caja únicamente por los importes no financiados.
6. Mantener todo en una sola transacción, con idempotencia y rollback integral.

## Seguridad y alcance
El helper revoca ejecución directa a `PUBLIC`, `anon` y `authenticated`; queda reservado para invocación interna desde la futura RPC `SECURITY DEFINER` con `search_path` fijo. No confiar en campos de empresa, usuario, caja, límite o saldo enviados por el frontend.

## Pruebas y pendientes
Se añadieron pruebas estáticas Node.js para contrato, medios, vuelto, crédito, separación de caja y permisos. Estas pruebas no ejecutan PostgreSQL. Antes de habilitar Cobrar se requiere prueba real en staging contra el esquema completo, revisión de privilegios/propietario de funciones y pruebas transaccionales/concurrentes. **No ejecutar esta migración todavía ni desplegar.**
