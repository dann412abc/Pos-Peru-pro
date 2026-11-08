# Mi Carrito POS v1.44.57

## Detalle oficial de comprobantes desde Supabase

- Añade RPC autenticada de solo lectura `pos_comprobante_detalle_auth(p_comprobante_id)`.
- El detalle se limita por identidad `auth.uid()`, empresa y sucursales asignadas.
- Recupera cabecera, datos del cliente, líneas, variantes, precios, descuentos, IGV, pagos, estado electrónico y referencia.
- Añade ruta Cloudflare `POST /api/edge/sales/comprobante-detail` con JWT del usuario y anon key; no usa `service_role`.
- La recuperación de cobros consulta primero el estado idempotente y después obtiene el comprobante oficial de Supabase.
- Solo elimina el intento pendiente cuando el detalle completo fue guardado en IndexedDB.
- Si la consulta falla o el detalle está incompleto, conserva el intento y mantiene bloqueados nuevos cobros.

## Validaciones

- Pruebas Node/Edge ejecutadas: 174 aprobadas, 0 fallidas y 2 omitidas por requerir staging aislado.
- No se ejecutaron migraciones en Supabase, no se realizó prueba runtime remota ni despliegue Cloudflare.
- Sintaxis TypeScript/TSX de los tres archivos modificados: correcta mediante transpile. Build Vite y Vitest del frontend quedan pendientes de instalación completa de dependencias.
- `VITE_SUPABASE_SALES_ENABLED=false`; cobros no habilitados.
