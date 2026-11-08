# Etapa 33 — Inventario físico y conciliación de existencias

## Implementado
- Nueva migración `1710000000021-conteo-fisico-inventario.ts`.
- Apertura de inventario físico por sucursal, con snapshot de productos simples y variantes activas.
- Captura de cantidad física por SKU/presentación, admite cero y hasta 3 decimales.
- Búsqueda por código o código de barras (el snapshot prioriza código de barras cuando existe).
- Seguimiento de líneas contadas y pendientes.
- Cierre solo cuando todas las líneas estén contadas.
- Aplicación transaccional de diferencias contra el stock vigente al cierre.
- Movimientos de entrada/salida auditados en el kardex con stock anterior/posterior y usuario.
- Ajuste de lotes para mantener consistencia: diferencias negativas consumen lotes por FEFO; diferencias positivas crean lote de regularización sin vencimiento.
- Historial de inventarios físicos y exportación CSV.
- Acceso administrativo y aislamiento por empresa/sucursales autorizadas.

## Reglas importantes
- Se permite un solo conteo ABIERTO por sucursal.
- El cierre no compara únicamente contra el snapshot: vuelve a leer el stock vigente y calcula el ajuste contra la cantidad física capturada.
- Realizar el conteo con ventas, compras, transferencias y movimientos pausados. Si hubo movimientos durante el conteo, el stock se concilia contra el saldo vigente, pero la cantidad física capturada debe corresponder al momento de cierre.
- Si una diferencia negativa supera la cantidad disponible en los lotes asociados, el cierre se cancela íntegramente y exige regularizar lotes; no deja stock general y lotes desincronizados.
- Las diferencias se aplican en una sola transacción; si cualquier línea falla, no se cierra parcialmente.
- No hay cancelación de conteo ni edición de conteos cerrados.

## Migración pendiente
`1710000000021-conteo-fisico-inventario.ts` debe ejecutarse antes de utilizar el módulo. No fue ejecutada y no se modificó Supabase.

## Validación pendiente
- Pruebas de integración y concurrencia con PostgreSQL.
- Verificar datos reales de productos, variantes y lotes.
- Build completo frontend/backend y pruebas en navegador/móvil.
