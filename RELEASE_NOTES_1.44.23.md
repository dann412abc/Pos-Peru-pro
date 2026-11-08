# Mi Carrito POS 1.44.23

## Bloque: análisis de proveedores en Supabase + Cloudflare

- Añade la RPC preview `pos_compras_analisis_proveedores_auth(p_sucursal_id)`.
- Añade `GET /api/edge/purchases/supplier-analytics`, con sesión Supabase obligatoria y validación del identificador de sucursal.
- Agrega `fetchSupabaseSupplierAnalytics()` y conecta la pestaña Análisis de proveedores en modo Supabase.
- El informe resume compras, saldos, devoluciones y cumplimiento de órdenes; incluye historial reciente y comparación del último costo por proveedor/producto/variante.
- La función deriva empresa y usuario desde `auth.uid()` y verifica la asignación de sucursal. No acepta empresa enviada por el navegador.

## Validación de esta entrega

- Pruebas de ruta Edge: 4 casos (sin sesión, sucursal inválida, propagación del JWT/sucursal y migración ausente).
- La consulta SQL es una migración preview y no se ha ejecutado contra PostgreSQL.
- No se ha ejecutado un build integral ni se ha desplegado Cloudflare.
- La pestaña de sugerencias de reposición y las alertas de vencimiento todavía consultan el backend anterior.
