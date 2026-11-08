# Motor de cálculo de ventas en servidor — v1.44.42

## Qué incorpora
Se añade `public.pos_venta_calcular_importes_interno(jsonb,numeric)`, función SQL pura e inmutable para cálculo PEN/Perú. No lee ni escribe tablas, no registra ventas, no toca inventario ni caja.

## Contrato de entrada
Recibe líneas ya normalizadas y verificadas por el servidor. Cada objeto debe contener:
- `cantidad`: mayor que cero.
- `precioUnitario`: precio vigente obtenido del catálogo de Supabase; incluye IGV.
- `descuento`: descuento monetario de línea, opcional, no negativo y no mayor al importe bruto.
- `tipoIgv`: `10` gravado, `20` exonerado o `30` inafecto.

El precio del navegador no debe alimentar directamente esta función. La futura RPC debe construir el arreglo usando el resultado de la validación de catálogo.

## Reglas de cálculo
- IGV incluido: base gravada = neto / 1.18; IGV = base × 0.18.
- Exonerado e inafecto no generan IGV.
- Redondeo monetario a dos decimales por línea.
- Descuento global distribuido proporcionalmente entre las líneas después del descuento individual; el último renglón absorbe el residuo de centavos.
- Devuelve importes por línea, descuento global asignado, operaciones gravadas/exoneradas/inafectas, IGV y total.

## Importante
Esta función no está conectada todavía al botón Cobrar ni a una RPC de creación. La futura RPC debe invocarla dentro de la misma transacción que valida pagos, crea comprobante, consume stock/lotes, actualiza caja y registra crédito.

## Validación pendiente
Se agregaron pruebas estáticas de contrato. Aún se requiere ejecutar el SQL en una base PostgreSQL de staging con las migraciones completas y comparar casos de borde contra `backend/src/common/utils/igv.engine.ts`. **No ejecutar todavía en Supabase de producción ni desplegar.**
