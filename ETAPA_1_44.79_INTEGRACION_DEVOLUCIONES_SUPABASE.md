# Etapa 1.44.79 — Integración de registro de devoluciones en Supabase

## Base de trabajo
- Rama: `work/returns-register-1.44.79`
- Base: `1.44.78`
- Commit de referencia: `6a4461c816e4f02c1d5057640bfdf544bbad3dfc`

## Cambios preparados
- Cloudflare `POST /api/edge/returns/register` valida el cuerpo y llama a la RPC existente `public.pos_registrar_devolucion` usando el JWT del usuario.
- Cliente `registerSupabaseReturn` valida la respuesta confirmada y mantiene la misma clave de idempotencia para reintentos.
- La pantalla Devoluciones ahora usa clientes Supabase para historial, búsqueda, disponibilidad y registro; no deriva a NestJS cuando Supabase Auth está activo.
- La ruta de disponibilidad se alineó con el nombre real desplegado `pos_disponibilidad_devolucion(integer)`.
- Se añadió la migración preview `202611090001_returns_read_auth.sql` para las RPC de historial y búsqueda que faltaban en el proyecto remoto.
- Se corrigió el historial: el esquema real no contiene `comprobante.devolucion_venta_id`, por lo que la consulta no intenta enlazar notas de crédito mediante esa columna. La nota de crédito se mantiene como pendiente.
- La búsqueda y la pantalla admiten comprobantes `01`, `03` y `NV` (boleta, factura y nota de venta).
- Se añadieron pruebas estáticas de contrato para el endpoint, cliente, pantalla y SQL preview.

## Contratos remotos comprobados en modo solo lectura
En el proyecto Supabase `POS AYNI PERÚ`:
- Existe `pos_registrar_devolucion(integer,text,jsonb,jsonb,text)`.
- Existe `pos_disponibilidad_devolucion(integer)`.
- La función de registro permite EXECUTE a `authenticated` y no a `anon`.
- La función de registro aplica rol ADMIN, autorización de sucursal, bloqueos de comprobante/línea/caja, idempotencia, devolución parcial, reversión de crédito, reembolso y movimiento de caja.
- La reposición de stock distingue producto base y variante a partir de `comprobante_linea.variante_id`.

## Verificación disponible
- Se inspeccionó en solo lectura la definición de `pos_registrar_devolucion` y sus tablas base.
- No hay workflows de GitHub Actions configurados para ejecutar automáticamente las pruebas de esta rama; las pruebas estáticas están escritas, pero aún no ejecutadas.
- El PR está abierto como borrador: https://github.com/dann412abc/Pos-Peru-pro/pull/2

## Trabajo técnico siguiente — compatibilidad FEFO preparada
- Se recuperó la migración histórica de lotes y se comparó con el writer de ventas FEFO y la lógica NestJS de devolución.
- Se añadió `202611090002_inventory_lots_returns_compat.sql` como migración preview aditiva: agrega variante/lote a las líneas y movimientos que lo necesitan, crea tablas de lote/salida/devolución por lote, completa el vínculo `producto_id` faltante en `producto_variante_stock` y prepara lotes de apertura desde los saldos actuales sin modificar esos saldos.
- Se añadió prueba estática de la migración. Aún no se ejecutó.
- El esquema remoto también carece de `producto_id` y `costo_promedio` en `producto_variante_stock`, aunque las RPC de compras/FEFO los consultan. La migración prepara esos campos y valida el backfill.
- No se crean lotes históricos con vencimiento inventado: los lotes de apertura quedan sin fecha y sin procedencia histórica.

## Integración de registro con trazabilidad FEFO preparada
- Se creó `202611090003_returns_register_fefo_auth.sql`: RPC `pos_devolucion_registrar_auth(integer,jsonb)`, autenticada y restringida a ADMIN.
- La nueva RPC reutiliza `pos_registrar_devolucion` para mantener la lógica existente de idempotencia, cálculo de devolución, pagos, caja, crédito y reposición del stock base/variante.
- En la misma transacción, completa `variante_id` de la línea devuelta y repone cantidades a los lotes consumidos en la venta, limitando lo ya restituido por otras devoluciones.
- Para ventas históricas sin asignaciones de lote crea un lote `DEVCLIENTE-*` sin inventar fecha ni procedencia. Si existe trazabilidad original incompleta, aborta toda la operación para no dejar stock y lotes desbalanceados.
- El endpoint Cloudflare `returns/register` ahora invoca la RPC autenticada nueva con `{p_comprobante_id,p_payload}`.
- Se actualizaron las pruebas de contrato del endpoint y del cliente; también se corrigió la búsqueda de comprobantes para incluir `NV`.
- La ejecución de estas pruebas aún está pendiente; este repositorio no tiene workflows CI configurados para esta rama.

## Pendientes que bloquean la activación final
1. Aplicar la migración de lecturas solo en un entorno de staging, después de revisar el SQL.
2. Ejecutar pruebas reales con usuario ADMIN de staging: historial, búsqueda, disponibilidad, devolución parcial y total, efectivo, Yape/Plin, crédito, reintento idempotente y dos solicitudes concurrentes.
3. La RPC remota existente no muestra manejo de lotes FEFO ni trazabilidad de lotes en la definición inspeccionada. La consulta de columnas tampoco confirmó tablas de lotes en el esquema remoto. No afirmar que se repone lote original hasta resolver esta diferencia.
4. La emisión de nota de crédito electrónica sigue sin conectarse a Supabase; la pantalla lo identifica como pendiente.
5. No habilitar producción ni activar el flujo hasta superar las pruebas anteriores y confirmar que la versión desplegada incluye la migración y las rutas.

## Seguridad y alcance
- No se aplicó SQL ni se modificó Supabase remoto.
- No se desplegó Cloudflare.
- No se modificó la rama principal ni el commit base 1.44.78.
- Esta etapa prepara la integración en una rama de trabajo; no equivale a validación end-to-end.

## Hallazgo crítico adicional — el circuito de lotes aún no está conectado a compras ni ventas

Revisión de solo lectura realizada sobre las funciones del proyecto remoto POS AYNI PERÚ:

- `public.pos_registrar_venta(jsonb)` valida y descuenta `producto_stock` o `producto_variante_stock`, inserta `comprobante_linea` y movimientos de inventario, pero su definición actual no consulta `inventario_lote` ni inserta `comprobante_lote_salida`.
- En el conjunto de funciones públicas inspeccionadas no se encontró una RPC de recepción/registro de compras que cree lotes desde `compra_linea`.
- `pos_ajustar_inventario` y `pos_transferir_inventario` tampoco integran la trazabilidad FEFO.
- Por tanto, la migración 002 únicamente prepara estructura y lotes de apertura; no integra el writer de compras ni el de ventas.
- La migración 003 no puede distinguir de forma fiable una venta histórica de una venta nueva sin lotes mientras el writer de ventas no genere `comprobante_lote_salida`. El fallback `DEVCLIENTE-*` no debe considerarse solución a esa falta de integración para ventas nuevas.

### Decisión técnica de seguridad

No activar ni aplicar las migraciones 002/003. No usar el fallback de lote histórico como sustituto de la integración FEFO en ventas nuevas.

### Orden correcto del siguiente bloque

1. Diseñar e integrar recepción de compras con creación atómica de `inventario_lote`, respetando empresa, sucursal, variante, cantidades, costo y vencimiento.
2. Integrar `pos_registrar_venta(jsonb)` para consumir lotes FEFO y registrar `comprobante_lote_salida` asociado inequívocamente a cada línea de comprobante, dentro de la misma transacción que descuenta el stock.
3. Integrar ajustes y transferencias con lotes, o bloquearlos cuando no puedan preservar trazabilidad.
4. Recién después, habilitar la restitución de lotes de la devolución y probar el circuito completo en un entorno de pruebas aislado.

La inspección fue de solo lectura. No se aplicó SQL, no se escribieron datos y producción permanece intacta.

## Siguiente bloque — recepción de compras: contrato y bloqueo remoto comprobados

Inspección adicional de solo lectura en producción:

- El frontend llama a `POST /api/edge/purchases/receive`; el Edge deriva a `public.pos_compra_recibir_auth(jsonb)`.
- La ruta Edge transmite el payload autenticado y responde con error explícito si la RPC no existe.
- La búsqueda de funciones públicas `%compra%` y `%orden%` en POS AYNI PERÚ no devolvió funciones. Por tanto, la RPC `pos_compra_recibir_auth` que espera el frontend no está instalada en producción.
- Las tablas de compras sí existen: `compra`, `compra_linea`, `compra_pago`, `proveedor`. `compra.id` y `compra_linea.id` son bigint; empresa, sucursal, proveedor y producto son integer.
- `compra_linea` actualmente registra cantidad, costo unitario, IGV, subtotales y snapshots de stock/costo promedio, pero no tiene aún `variante_id`, código de lote ni fecha de vencimiento. Esas columnas solo están preparadas por la migración preview 002.
- `producto_stock` dispone de costo promedio; `producto_variante_stock` todavía no tiene `producto_id` ni `costo_promedio` en producción. La migración preview 002 los prepara y backfillea.
- El modelo de caja permite asociar movimientos con `compra_id bigint`; `compra_pago` también tiene clave de idempotencia.

### Contrato que debe cumplir la futura RPC de recepción

La RPC nueva debe ejecutar en una sola transacción:

1. Derivar usuario, empresa y rol desde `auth.uid()`; verificar sucursal, proveedor y permisos.
2. Validar clave idempotente y hash completo del payload. Reintentos idénticos devuelven la compra ya creada; reutilizar clave con datos distintos falla.
3. Validar cada línea: producto o variante perteneciente a empresa, cantidad/unidades por empaque, costo, tipo IGV, lote y vencimiento opcional.
4. Convertir empaques a unidades base de forma determinista; almacenar en `compra_linea` tanto la unidad de compra como el factor y la cantidad equivalente.
5. Crear una fila de `inventario_lote` por línea recibida, vinculada a `compra_id` y `compra_linea_id`, con código de lote, vencimiento, cantidad y costo unitario por unidad base.
6. Incrementar stock base o stock de variante exactamente una vez y registrar movimiento de inventario; actualizar costo promedio ponderado sin confundir costo por empaque con costo por unidad.
7. Registrar compra, pagos, cuenta por pagar y movimiento de caja de forma atómica; no duplicar salidas/entradas en los resúmenes de caja.
8. En recepción parcial de orden, crear lotes por cada recepción/línea recibida, no un lote ficticio por el total pedido; conservar saldo pendiente de orden.
9. Rechazar cantidades/costos inválidos, lotes vencidos si la política lo prohíbe, mezcla de empresa/sucursal y pagos que no cuadren con el total.
10. Restringir EXECUTE a `authenticated`; revocar PUBLIC/anon y usar `SECURITY DEFINER` con `search_path` fijo.

### Estado de implementación

Este bloque queda en **diseño técnico respaldado por esquema real**, no implementado ni probado. No se debe habilitar el formulario Supabase de recepción hasta que la RPC exista en el entorno de pruebas y se prueben compra contado/crédito, variante, empaque, lote, vencimiento, reintento y recepción parcial.

La inspección no ejecutó escrituras ni cambios de esquema en POS AYNI PERÚ.

## Avance — validación de entrada de recepción en Cloudflare Edge

Se reforzó la ruta `POST /api/edge/purchases/receive` antes de invocar la RPC:

- Exige IDs enteros positivos de sucursal y proveedor, documento/serie/número/fecha y condición CONTADO o CREDITO.
- Valida cada línea: producto, variante opcional, cantidad, unidad de compra, unidades por empaque, costo por empaque, costo unitario, tipo IGV, código de lote y formato de vencimiento.
- Valida métodos de pago permitidos, montos positivos, caja y referencia.
- Impide pagos iniciales en compras a crédito.
- Conserva el límite de tamaño del payload y la respuesta explícita cuando falta la RPC.

Se amplió `purchases-receive.test.js` para cubrir líneas incompletas, medios de pago no permitidos y crédito con pagos iniciales. Los tests están escritos, pero **no se han ejecutado** en esta sesión.

Importante: esta validación protege la frontera HTTP; no sustituye las validaciones SQL ni hace funcionar la recepción. La RPC `pos_compra_recibir_auth(jsonb)` sigue ausente en producción y no se creó ni aplicó migración SQL.

## Avance — contrato de líneas de compra alineado con el esquema real

La inspección de solo lectura de producción reveló que `compra_linea` tenía una restricción única antigua `UNIQUE(compra_id,producto_id)`. Esa regla impedía comprar dos variantes distintas del mismo producto en una sola compra, aunque el formulario permite seleccionar variantes.

Cambios preparados únicamente en la rama preview:

- La migración 002 elimina esa restricción y la reemplaza por unicidad de `(compra_id, producto_id, COALESCE(variante_id,0))`: permite variantes distintas, pero impide repetir la misma variante/producto en dos líneas.
- La ruta Edge ahora acepta únicamente tipos IGV que la tabla real admite: 10, 20 o 30.
- La ruta Edge rechaza líneas duplicadas de la misma combinación producto/variante antes de llamar a Supabase.
- Se añadieron pruebas estáticas para esta regla y para los tipos IGV.

### Implicación para la futura RPC

La recepción debe escribir `compra_linea.cantidad` en unidades base, `costo_unitario` en costo por unidad base y, con la migración 002, conservar `cantidad_empaques`, `unidades_por_empaque`, `costo_empaque`, `unidad_compra`, `variante_id`, lote y vencimiento. El incremento de stock debe usar la misma cantidad base que el lote y el movimiento de inventario.

El esquema actual de compras no contiene una tabla `cuenta_pagar`; el saldo de crédito se representa directamente en `compra.pagado` y `compra.saldo_pendiente`. La RPC no debe insertar en una tabla de cuentas por pagar inexistente.

La caja no admite `TRANSFERENCIA` en `caja_movimiento`; las transferencias se guardan como `compra_pago` sin movimiento de caja física. Para EFECTIVO, YAPE, PLIN y TARJETA se requiere caja abierta válida y movimiento de tipo SALIDA.

Estos cambios son preparación de contrato y esquema, no implementación de recepción. No se creó todavía `pos_compra_recibir_auth(jsonb)`; tampoco se ejecutaron tests ni migraciones en producción.
