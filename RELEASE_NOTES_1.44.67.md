# Mi Carrito POS 1.44.67

## Consultas autenticadas de devoluciones en Supabase
- Añade RPCs de solo lectura para listar devoluciones, buscar boletas/facturas y consultar cantidades/importe disponibles.
- Las RPCs derivan usuario y empresa desde `auth.uid()`, verifican usuario POS activo y limitan resultados a sucursales asignadas.
- Añade endpoints Cloudflare `/api/edge/returns/list`, `/search` y `/availability` y un cliente frontend tipado/validado.
- Se conserva el bloqueo del registro de devoluciones en modo Supabase. Esta etapa no registra reembolsos, no devuelve stock, no altera cuentas por cobrar y no emite notas de crédito.

## Seguridad y despliegue
- Migración de vista previa: `supabase/migrations-preview/202611070046_returns_read_auth.sql`.
- No ejecutar en producción todavía: validar primero en staging la existencia/estructura de `usuario_sucursal`, `devolucion_venta*`, `producto_variante` y demás tablas referenciadas.
- No se ejecutaron migraciones ni se desplegó Cloudflare.
