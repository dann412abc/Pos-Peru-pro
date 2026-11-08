# Etapa 17 — Producto único o familia con variantes

## Objetivo
Cada producto puede configurarse en uno de dos modos excluyentes:

- **Producto único:** usa su propio código interno, código de barras opcional, precio, precio mayorista y stock por sucursal.
- **Producto con variantes:** actúa como familia comercial. No tiene precio ni stock operativo propios; cada presentación administra código, código de barras, precio y existencias.

## Ejemplo Coca-Cola
Se crea el producto padre `Coca-Cola`, se activa `Este producto tiene variantes / presentaciones` y se registran:
- Coca-Cola 3 L
- Coca-Cola 2.5 L
- Coca-Cola 1 L
- Coca-Cola 600 ml

Cada presentación recibe código interno y código de barras propios, precio y stock por sucursal.

## Cambios
- Migración `1710000000014-producto-modo-variantes-codigo-barras.ts` añade `producto.tiene_variantes` (FALSE por defecto para compatibilidad) y `producto.codigo_barras`, con índice único parcial por empresa.
- El formulario Productos incorpora el selector de modalidad. En modo familia oculta precio, precio mayorista, stock y código de barras del padre.
- En modo único muestra el campo de código de barras y mantiene precios y stock del producto.
- El catálogo distingue visualmente las familias con variantes.
- El escáner de ventas busca código interno o código de barras del producto único y código de barras/código interno de variantes.
- Al agregar un producto único no consulta variantes. Para una familia con variantes, exige seleccionar una presentación.
- El backend impide vender la familia sin variante, asociar variantes a productos únicos y crear variantes si el producto padre no está habilitado.
- Cambio de modalidad protegido: no permite activar variantes con stock base existente; no permite desactivarlas mientras haya variantes activas o stock en presentaciones.

## Compatibilidad y seguridad
Los productos existentes migran lógicamente como producto único (`tiene_variantes = FALSE`). No se elimina ni transforma su historial.
La migración está incluida en el paquete, pero **no se ha ejecutado**.
