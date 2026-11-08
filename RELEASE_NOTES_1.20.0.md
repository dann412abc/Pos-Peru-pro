# Mi Carrito POS 1.20.0

## Etapa 20 — Reportes avanzados de inventario

- Inventario valorizado por sucursal, producto y presentación.
- Stock actual, stock mínimo, costo promedio y valor estimado del inventario.
- Identificación visual de productos por debajo del mínimo.
- Consulta de Kardex con filtro por periodo y desglose de variante.
- Endpoints protegidos por autenticación y sucursales asignadas.

## Operación segura

No ejecutar migraciones por esta etapa. No se conectó ni modificó la base remota y no se desplegó el sitio.

## Verificación

La validación de sintaxis TypeScript/TSX se realiza sin instalar dependencias. La compilación completa y las pruebas de integración contra PostgreSQL requieren instalar dependencias y configurar un entorno de prueba.
