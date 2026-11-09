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

## Avance — persistencia de vencimiento e idempotencia de compras

Se añadió la migración preview `202611090004_purchase_receipt_fields.sql`, posterior a la preparación de lotes:

- Agrega `compra.fecha_vencimiento`, que faltaba pese a que el formulario ya solicita esa fecha para compras a crédito.
- Agrega `compra.payload_hash` para que la futura RPC compare el contenido normalizado de un reintento con la compra original.
- Comprueba que exista el índice único remoto `uq_compra_empresa_idempotency` antes de preparar el cambio.
- Añade restricciones para que contado no guarde vencimiento y para que el vencimiento de crédito no sea anterior al documento.
- El hash queda limitado al formato hexadecimal MD5 de 32 caracteres. La futura RPC deberá calcularlo desde el JSONB normalizado y comparar antes de devolver una compra preexistente.

Se inspeccionó además que el índice único de idempotencia por empresa ya existe en el esquema remoto. No se añadió un índice redundante.

### Regla de cálculo pendiente de cerrar

El formulario actual calcula el total como cantidad de empaques × unidades por empaque × costo por unidad, redondeado a dos decimales. No aplica IGV adicional en ese cálculo, aunque `compra_linea` conserva columnas `base_imponible`, `igv` y `subtotal`. La RPC debe reproducir exactamente la semántica del backend vigente o corregirla de manera coordinada; no se debe inventar una tasa ni sumar IGV por intuición. Este punto queda como bloqueo para cerrar la función SQL.

La migración 004 y su prueba estática están en la rama de trabajo. No se han ejecutado tests, no se aplicó SQL en staging ni en producción y la RPC de recepción sigue pendiente.


## Corrección — índice único de líneas de compra

La consulta de catálogo de restricciones de PostgreSQL confirmó que `uq_compra_linea_producto` está creado en producción como **constraint UNIQUE**, respaldada por un índice interno. Intentar `DROP INDEX` primero fallaría porque PostgreSQL no permite eliminar directamente el índice que respalda una constraint.

Corrección preparada en la rama:
- Primero se ejecuta `ALTER TABLE ... DROP CONSTRAINT IF EXISTS`; PostgreSQL elimina con ella el índice interno.
- Después se ejecuta `DROP INDEX IF EXISTS` como limpieza compatible con instalaciones donde exista un índice independiente con ese nombre.
- Finalmente se crea el índice único compuesto por producto y variante.
- Se actualiza la prueba estática para exigir la eliminación del índice real.

No se ejecutó la migración ni se modificó Supabase. La corrección queda pendiente de validación automatizada y de aplicación en un entorno aislado.


## Cierre del bloqueo de cálculo IGV — fuente legacy comprobada

Se localizó el motor real de compras en `backend/src/compras/compra-calculations.ts` y su suite `compra-calculations.spec.ts`. Ya no es necesario inferir el tratamiento tributario:

- El costo unitario ingresado **incluye IGV**, igual que los precios del catálogo POS.
- Para tipo IGV `10` (gravado): `importe = cantidad × costo_unitario`; `base_imponible = redondear2(importe / 1.18)`; `igv = redondear2(importe - base_imponible)`; `subtotal = base_imponible + igv`. El total pagable no aumenta por encima del importe ingresado.
- Para tipo `20` (exonerado) y `30` (inafecto): la base de la línea es el importe, IGV es cero y subtotal es igual al importe.
- La recepción convierte primero empaques a unidades base: cantidad = empaques × unidades_por_empaque (3 decimales); costo unitario = costo_empaque / unidades_por_empaque (4 decimales).
- La compra verifica que el tipo IGV enviado coincida con el tipo IGV del producto del catálogo. La futura RPC debe repetir esta validación; no debe confiar en el valor enviado por el navegador.
- La suite existente cubre un ejemplo gravado (118 → base 100 + IGV 18), exonerado, inafecto, conversión de caja a unidades y costo promedio ponderado.

Por tanto, el bloqueo tributario queda resuelto con una regla concreta y respaldada por el backend legacy. La RPC Supabase puede implementar el mismo algoritmo y redondeos, manteniendo la cantidad/costo unitario en unidades base. Aún falta traducirlo a SQL y contrastar sus columnas con el esquema real; no se considera implementado hasta completar esa integración y probarla.


### Ajuste de orden de eliminación del índice/constraint

La consulta posterior de `pg_constraint` precisó el hallazgo: en la producción consultada, el objeto se registra como constraint UNIQUE `uq_compra_linea_producto`. La migración se corrigió para eliminar primero la constraint (y su índice respaldante) y solo después ejecutar `DROP INDEX IF EXISTS`. La prueba ahora verifica el orden de las tres instrucciones. La migración continúa siendo preview-only y no se ha ejecutado.


## Inspección adicional del contrato real para RPC de recepción

Se contrastó el flujo legacy `ComprasService.crearCompra` con las columnas y constraints de producción:

- El flujo legacy inserta cabecera, líneas, lotes, stock, movimientos y pagos dentro de una transacción. La RPC Supabase debe mantener esa misma atomicidad.
- La cabecera usa `compra.estado='RECIBIDA'`, `pagado`, `saldo_pendiente`, `op_gravadas`, `op_exoneradas`, `op_inafectas`, `total_igv` y `total`.
- La línea guarda snapshots de stock/costo anteriores y posteriores. Los IDs de compra/línea son bigint; empresa/sucursal/producto/usuario son integer; variante es bigint.
- `movimiento_inventario.tipo` solo admite `ENTRADA` o `SALIDA`; la recepción registra `ENTRADA` y enlaza `compra_id`.
- `compra_pago` admite TRANSFERENCIA; `caja_movimiento` no. Transferencia debe persistirse como pago sin egreso de caja física. EFECTIVO/TARJETA/YAPE/PLIN se vinculan a una caja abierta del usuario/sucursal y generan SALIDA.
- El legacy valida disponibilidad de efectivo antes de registrar un pago EFECTIVO. La RPC debe hacer la misma comprobación bajo bloqueo de la fila de caja.
- Los constraints productivos ya limitan tipos de documento de compra a `01`, `03`, `NV`, `OT`; condición a CONTADO/CREDITO; métodos de pago de compra a los cinco permitidos; y tipo IGV de línea a 10/20/30.
- La constraint productiva `uq_compra_linea_producto` es UNIQUE (compra_id, producto_id). La migración 002 debe quitarla antes de crear el índice por producto/variante. El orden quedó corregido y su prueba estática exige ese orden.

### Incompatibilidad detectada que debe resolverse en la RPC

El servicio legacy consulta `producto.tiene_variantes`, pero la consulta de columnas de la tabla `public.producto` en Supabase producción **no muestra esa columna**. No se debe copiar esa referencia SQL del legacy tal cual. Para esta RPC se debe determinar la presencia de variantes consultando `producto_variante` por producto/empresa (y validar la variante seleccionada), o preparar una migración coordinada si se decide introducir un indicador persistente. La alternativa por existencia evita agregar un campo redundante y es la opción de menor riesgo para la integración actual.

También se confirmó que el catálogo `producto` contiene `tipo_igv`, mientras que `producto_variante` no declara un tipo IGV propio; la validación tributaria debe comparar la línea con `producto.tipo_igv`.

No se implementó todavía la RPC: primero se está cerrando el contrato contra el esquema remoto para evitar una función que compile pero falle al ejecutarse por columnas inexistentes. Todas las consultas fueron de solo lectura.



## Bloque siguiente — reglas legacy de compras y diferencias que debe corregir la RPC

Se inspeccionaron el DTO, el controlador y el método `crearCompra` del backend vigente. La RPC Supabase debe respetar estas reglas confirmadas:

- El endpoint de creación de compras está protegido por `@Roles(ADMIN)`; la RPC debe exigir ADMIN autenticado y autorización de sucursal.
- Una compra al contado exige que la suma de pagos sea igual al total (tolerancia 0.01). Los pagos no pueden superar el total.
- Los pagos EFECTIVO, TARJETA, YAPE y PLIN requieren `cajaId`; todos los pagos asociados a caja deben usar una sola caja abierta, del usuario y sucursal actuales.
- TRANSFERENCIA no admite `cajaId` y se registra en `compra_pago` sin movimiento físico de caja.
- Solo el pago EFECTIVO se contrasta contra el efectivo disponible; el cálculo incluye saldo inicial, cobros efectivos de comprobantes y movimientos de caja.
- El backend valida máximo 200 líneas, máximo 8 pagos, métodos permitidos, montos positivos, clave de compra entre 8 y 100 caracteres y clave opcional por pago entre 8 y 100.
- El costo unitario está expresado con IGV incluido; la regla exacta de cálculo por tipo 10/20/30 ya está descrita arriba.

### Defectos e incompatibilidades del backend antiguo que no se deben replicar

1. `crearCompra` y otros métodos consultan `producto.tiene_variantes`, columna ausente en producción. La RPC debe inferir si el producto tiene variantes consultando `producto_variante` y validar que la variante seleccionada pertenezca al producto/empresa.
2. El backend legacy resuelve un conflicto de clave idempotente devolviendo la compra existente sin comparar el payload. La nueva RPC debe comparar `payload_hash`; misma clave y mismo contenido devuelve la compra previa, misma clave y contenido diferente devuelve conflicto.
3. La clave idempotente de pago se valida por duplicidad dentro del arreglo, pero el backend no hace una recuperación segura de un pago previo por hash. La RPC debe evitar duplicar pagos y movimientos en reintentos.
4. Los IDs de variantes son bigint en el esquema. La RPC debe usar bigint al consultar/validar `variante_id`, no asumir int4.
5. El controlador solo permite ADMIN para compra nueva. No se debe abrir el registro a CAJERO por comodidad del POS.

### Diferencia pendiente entre legacy y el contrato Edge actual

El servicio legacy permite pagos parciales en una compra a crédito (solo impide que los pagos superen el total); el formulario/Edge Supabase actual rechaza pagos iniciales cuando `condicionPago='CREDITO'`. Esta diferencia debe resolverse explícitamente antes de implementar la RPC. Para no cambiar silenciosamente el comportamiento del sistema, la regla de negocio elegida debe quedar coordinada entre formulario, Edge y SQL. El backend legacy también exige pago íntegro para CONTADO.

### Riesgo separado en recepción parcial de órdenes

El flujo legacy `recepcionarOrdenCompra` registra primero la compra mediante `crearCompra` y actualiza la orden en una segunda transacción. La preconsulta de idempotencia también ocurre fuera de una transacción. Por ello no es un patrón seguro para copiar en Supabase: la futura recepción de orden debe bloquear la orden/líneas, verificar la clave idempotente y crear compra, lotes, stock, pagos y avance de cantidades/estado en una sola transacción.

Este bloque es inspección de código y diseño del contrato. No se creó aún `pos_compra_recibir_auth(jsonb)`, no se ejecutaron pruebas y no se aplicó SQL en Supabase.
