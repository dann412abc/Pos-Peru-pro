# Reconstrucción de cadena TypeORM y prerrequisitos de staging — v1.44.79

Fecha de revisión: 2026-11-11
Rama: `work/returns-register-1.44.79`
Alcance: lectura estática del código. No se ejecutó SQL ni se modificó Supabase.

## 1. Configuración de ejecución

Archivo: `backend/src/database/data-source.ts`

- TypeORM carga entidades desde `__dirname + '/../**/*.entity.{ts,js}'`.
- TypeORM carga migraciones desde `__dirname + '/migrations/*.{ts,js}'`.
- `synchronize: false`: el esquema no se sincroniza automáticamente.
- `backend/src/database/run-migrations.ts` inicializa el DataSource y llama a `AppDataSource.runMigrations()`; con argumento `revert` llama a `undoLastMigration()`.
- Por tanto, el orden efectivo depende del conjunto de migraciones disponible y de sus nombres/clases/registro TypeORM. No existe una lista explícita de migraciones en `data-source.ts`.

## 2. Migraciones verificadas directamente

### `1700000000000-initial-schema.ts`

Crea, entre otras, estas tablas base:
- `empresa` (incluye `ruc VARCHAR(11) NOT NULL UNIQUE`, no `tax_id`)
- `sucursal`
- `usuario`
- `usuario_sucursal`
- `categoria`
- `producto`
- `cliente`
- `serie_correlativo`
- `caja`
- `comprobante`
- `comprobante_linea`
- `comprobante_electronico`
- `fe_evento`

Esta migración inicial NO crea en el SQL revisado:
- `proveedor`
- `compra`
- `compra_linea`
- `producto_stock`
- `cuenta_cobrar`
- `producto_variante)

No se debe interpretar esta lista como prueba de que las tablas no existan en otras migraciones posteriores; significa que no nacen en el esquema inicial inspeccionado.

### `1700000000007-lotes-devoluciones-proveedor.ts`

Crea `inventario_lote`, `comprobante_lote_salida`, `devolucion_proveedor` y `devolucion_proveedor_linea`. Antes y durante su ejecución depende de:
- `empresa`, `sucursal`, `producto`, `producto_stock`
- `compra`, `compra_linea`
- `comprobante`, `proveedor`, `usuario)

También añade columnas a `compra_linea`. En consecuencia, no puede ser la primera migración del proyecto.

### `1710000000010-supabase-auth-identity.ts`

Añade `usuario.supabase_auth_user_id UUID` y un índice único parcial. Requiere que `usuario` exista.

### `1710000000015-compras-variantes.ts`

Añade campos de empaque y `variante_id INTEGER` a `compra_linea`, añade `variante_id` a `devolucion_proveedor_linea` y declara claves foráneas a `producto_variante(id, producto_id, empresa_id)`. Requiere las tablas de compra/devolución y la tabla/clave única compuesta de variantes.

## 3. Bloqueo identificado para las migraciones preview

La migración Supabase preview `202611090002_inventory_lots_returns_compat.sql` exige que existan:
- `public.inventario_lote`
- `public.comprobante_lote_salida`
- `public.cuenta_cobrar`

La TypeORM `1700000000007` crea las dos primeras, pero no crea `cuenta_cobrar`. La migración inicial `1700000000000` tampoco crea `cuenta_cobrar`. Se necesita localizar y revisar la migración que crea esa tabla, así como su orden y sus dependencias, antes de diseñar la secuencia de staging.

## 4. Versión de backend

`backend/package.json` declara `1.44.78`, mientras la rama de trabajo se está manejando como `1.44.79`. Debe alinearse la versión antes de preparar el paquete de distribución; no se modificó en este bloque.

## 5. Estado y acciones prohibidas en este bloque

- No se ejecutó ninguna migración TypeORM.
- No se ejecutó DDL, seed ni escritura en Supabase.
- Staging sigue bloqueado hasta verificar el esquema base completo y respaldarlo.
- Producción permanece intacta.
- No se debe ejecutar `npm run migration:run` en staging hasta tener inventario completo, orden validado, respaldo y autorización expresa.

## 6. Trabajo pendiente para cerrar la cadena

1. Obtener el inventario completo de archivos bajo `backend/src/database/migrations/` en esta misma rama.
2. Leer todas las migraciones intermedias entre `1700000000000` y `1700000000007`, y las posteriores relevantes.
3. Identificar con precisión dónde se crean `proveedor`, `compra`, `compra_linea`, `producto_stock`, `producto_variante` y `cuenta_cobrar`.
4. Construir una matriz tabla → migración creadora → dependencias → migración consumidora.
5. Comparar esa cadena con las migraciones Supabase preview 002 y 007–011.
6. Solo después, preparar plan de ejecución en staging con snapshot/restauración; no aplicar nada a producción.

## 7. Límite de evidencia

El conector permitió leer los cuatro archivos citados, pero no listar el directorio completo ni recuperar todos los nombres de migración. Por eso este documento registra hallazgos confirmados y deja explícita la enumeración incompleta; no afirma que las tablas ausentes del esquema inicial estén ausentes de todo el backend.
