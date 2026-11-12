# Preparación de staging — inventario integrado v1.44.79

## Estado verificado

El proyecto Supabase de staging `wcmlpsofikffcwijnuut` respondió sin tablas en el esquema `public`. Por tanto, todavía no es una base de pruebas POS preparada. No se ejecutaron DDL, migraciones, seeds ni escrituras.

Producción `tmbhvgwopbfbfnokwfve` queda fuera de este procedimiento.

## Dependencias históricas confirmadas en el repositorio

La migración TypeORM `backend/src/database/migrations/1700000000007-lotes-devoluciones-proveedor.ts` crea las tablas `inventario_lote` y `comprobante_lote_salida`, además de tablas de devolución a proveedor. La migración de compatibilidad Supabase `202611090002_inventory_lots_returns_compat.sql` altera esas tablas antes de sus declaraciones `CREATE TABLE IF NOT EXISTS`; por ello no puede ser el bootstrap inicial en una base vacía.

La misma migración 002 altera `public.cuenta_cobrar`. Su existencia debe verificarse en el esquema base antes de ejecutar el bloque FEFO.

## Orden de preparación propuesto

1. Crear/recuperar una base staging aislada y disponer de respaldo restaurable.
2. Aplicar el esquema histórico TypeORM completo, en el orden registrado por TypeORM, sobre staging; no ejecutar solo la migración 0007 de forma aislada.
3. Confirmar tablas base, restricciones y columnas que consumen las RPC preview, incluyendo `usuario.supabase_auth_user_id`, catálogo, sucursales, compras, caja, comprobantes, saldos de stock, `cuenta_cobrar`, `inventario_lote` y `comprobante_lote_salida`.
4. Aplicar las migraciones preview en su orden de dependencia documentado: compatibilidad de lotes 002 antes de ajustes 007; transferencias 008 y mermas 009 después de 002/007; conteo 010 después de 002/007; bloqueo de stock 011 después de 010.
5. Ejecutar primero pruebas estáticas y luego pruebas transaccionales con fixtures exclusivos de staging. Las pruebas que confirman transacciones requieren autorización separada y limpieza administrativa controlada.

## Guardas añadidas

La migración `202611090002_inventory_lots_returns_compat.sql` ahora exige explícitamente `inventario_lote`, `comprobante_lote_salida` y `cuenta_cobrar` antes de ejecutar ALTERs, y devuelve un error de prerrequisitos que identifica el esquema histórico y la migración 0007.

## Límites

Este documento no autoriza aplicar migraciones. No usar datos de producción, no ejecutar seeds ni crear usuarios/cajas/productos automáticamente. Antes de cualquier escritura se requiere autorización explícita y actual, respaldo y un plan de restauración.
