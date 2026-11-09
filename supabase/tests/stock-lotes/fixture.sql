-- Esquema mínimo aislado para probar el diagnóstico de conciliación.
-- No representa el esquema completo de producción.
CREATE TABLE producto_stock (
  empresa_id integer NOT NULL, sucursal_id integer NOT NULL,
  producto_id integer NOT NULL, stock numeric(12,3) NOT NULL
);
CREATE TABLE producto_variante_stock (
  empresa_id integer NOT NULL, sucursal_id integer NOT NULL,
  producto_id integer NOT NULL, variante_id integer NOT NULL,
  stock numeric(12,3) NOT NULL
);
CREATE TABLE inventario_lote (
  id bigserial PRIMARY KEY, empresa_id integer NOT NULL,
  sucursal_id integer NOT NULL, producto_id integer NOT NULL,
  variante_id integer, cantidad_disponible numeric(12,3) NOT NULL,
  fecha_vencimiento date
);

-- Producto 101: 10 unidades registradas; 6 vigentes y 4 vencidas.
INSERT INTO producto_stock VALUES (1, 1, 101, 10);
INSERT INTO inventario_lote(empresa_id,sucursal_id,producto_id,cantidad_disponible,fecha_vencimiento)
VALUES (1,1,101,6,CURRENT_DATE+30),(1,1,101,4,CURRENT_DATE-1);

-- Producto 102: lotes (5) superiores al stock registrado (3).
INSERT INTO producto_stock VALUES (1, 1, 102, 3);
INSERT INTO inventario_lote(empresa_id,sucursal_id,producto_id,cantidad_disponible,fecha_vencimiento)
VALUES (1,1,102,5,CURRENT_DATE+30);

-- Variante 201/variante 7: 5 registradas y solo 2 en lotes vigentes.
INSERT INTO producto_variante_stock VALUES (1, 1, 201, 7, 5);
INSERT INTO inventario_lote(empresa_id,sucursal_id,producto_id,variante_id,cantidad_disponible,fecha_vencimiento)
VALUES (1,1,201,7,2,CURRENT_DATE+15);

-- Producto 103: saldo conciliado; no debe aparecer en el reporte de diferencias.
INSERT INTO producto_stock VALUES (1, 1, 103, 7);
INSERT INTO inventario_lote(empresa_id,sucursal_id,producto_id,cantidad_disponible,fecha_vencimiento)
VALUES (1,1,103,7,CURRENT_DATE+60);
