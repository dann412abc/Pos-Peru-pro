# Etapa 16 — Gestión operativa de variantes

## Objetivo
Hacer administrable desde el módulo Productos el catálogo de presentaciones que ya soporta el backend y que se utiliza en ventas desde la etapa 15.

## Flujo
1. En **Productos**, el usuario abre el icono de capas de la fila correspondiente.
2. Se consultan las variantes de ese producto para la sucursal activa.
3. ADMIN puede crear o editar código, nombre de presentación, código de barras, precio y precio mayorista.
4. ADMIN puede activar/desactivar una variante sin borrar su historial.
5. ADMIN puede registrar entrada o salida de existencias indicando cantidad y motivo. El backend registra el movimiento y mantiene el saldo/lotes.
6. El stock se vuelve a consultar al cerrar cada movimiento.

## Endpoints utilizados
- `GET /api/productos/:productoId/variantes?sucursalId=:id`
- `POST /api/productos/:productoId/variantes`
- `PUT /api/productos/:productoId/variantes/:varianteId`
- `POST /api/inventario/variantes/ajustes`

## Reglas
- Los precios se expresan en soles e incluyen IGV, igual que el catálogo POS actual.
- Código interno y código de barras deben ser únicos dentro de la empresa según las restricciones existentes.
- La UI no permite modificar el saldo escribiendo un número: exige un movimiento de inventario.
- Las salidas no pueden superar el stock disponible.
- El ajuste incluye una clave de idempotencia para reducir el riesgo de duplicar un movimiento en reintentos.

## Alcance no incluido
Esta etapa no integra compras, recepción de mercadería, transferencias ni costo promedio por variante. Tampoco añade una migración SQL; reutiliza las tablas y endpoints creados en etapas previas.
