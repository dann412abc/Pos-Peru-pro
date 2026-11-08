# Preparación autenticada de venta — v1.44.41

## Implementación
Se añade `public.pos_venta_preparar_auth(jsonb)` que encadena, en este orden:
1. contexto autenticado (usuario, empresa, sucursal asignada y caja abierta);
2. consulta transaccional de idempotencia con SHA-256;
3. validación del cliente dentro de la empresa;
4. validación de productos/variantes activos, pertenencia a empresa y existencia por sucursal.

El helper de catálogo consolida líneas repetidas, procesa los productos en orden determinista, bloquea filas de stock con `FOR UPDATE` y devuelve precios del catálogo. El precio enviado por el navegador no se usa como autoridad.

## Reglas de variantes e inventario
- Producto con `tiene_variantes=false`: exige `varianteId` nulo y consulta `producto_stock`.
- Producto con `tiene_variantes=true`: exige variante activa de ese producto y consulta exclusivamente `producto_variante_stock`.
- Nunca suma ni descuenta el stock del padre y de la variante a la vez.
- Stock insuficiente detiene la prevalidación.

## Límites
Esta RPC es de preparación, no de venta. No registra comprobantes, pagos ni movimientos; no descuenta existencias ni consume correlativos. Los locks de stock terminan al finalizar la llamada: no hay reserva persistente. La futura RPC de creación deberá repetir estas validaciones y efectuar cálculo/consumos en la misma transacción que inserte el comprobante.

El cliente es obligatorio porque `comprobante.cliente_id` es NOT NULL; no se inventa un cliente genérico ni se asume un ID fijo.

## Seguridad / despliegue
La función interna de catálogo no tiene permisos para `PUBLIC`, `anon` ni `authenticated`; solo se invoca desde la RPC SECURITY DEFINER. La RPC de preparación se concede a `authenticated`.

**No ejecutar todavía en Supabase ni desplegar.** Antes de producción, revisar el SQL contra una base staging que haya aplicado todas las migraciones, y completar pruebas PostgreSQL reales de locks/concurrencia, RLS, políticas y errores.
