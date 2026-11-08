# v1.44.24 — Reposición sugerida en Supabase + Cloudflare

- Se añadió la RPC preview `pos_compras_sugerencias_reposicion_auth(integer)`.
- La RPC valida sesión, vínculo del usuario POS, empresa y sucursal asignada.
- Calcula demanda con salidas de inventario de los últimos 30 días, stock actual, stock mínimo, cobertura de 14 días e inversión estimada.
- Incluye productos simples y variantes y el último proveedor conocido.
- Se añadió `GET /api/edge/purchases/replenishment` y cliente `fetchSupabasePurchaseReplenishment`.
- La pestaña Reposición sugerida usa esta ruta cuando `VITE_AUTH_PROVIDER=supabase`; no crea órdenes automáticamente.

Pendiente: revisar columnas y rendimiento en staging, ejecutar pruebas PostgreSQL reales, build integral y migrar alertas de vencimiento. No ejecutar este preview en producción sin auditoría del esquema.
