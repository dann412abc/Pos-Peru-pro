-- PREVIEW ONLY — Compatibilidad de inventario FEFO con ventas y devoluciones Supabase.
-- No aplicar en producción. Revisar/ejecutar primero en una copia de staging.
-- Amplía el esquema singular existente; no mezcla el modelo UUID antiguo.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.producto_stock') IS NULL
     OR to_regclass('public.producto_variante_stock') IS NULL
     OR to_regclass('public.producto_variante') IS NULL
     OR to_regclass('public.comprobante_linea') IS NULL
     OR to_regclass('public.devolucion_venta_linea') IS NULL
     OR to_regclass('public.movimiento_inventario') IS NULL
     OR to_regclass('public.compra_linea') IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_LOTS_PREREQUISITES_MISSING: faltan tablas base del modelo singular';
  END IF;
END
$guard$;

-- La recepción de compras y la devolución necesitan identificar variante y datos del lote.
ALTER TABLE public.compra_linea
  ADD COLUMN IF NOT EXISTS variante_id bigint,
  ADD COLUMN IF NOT EXISTS variante_nombre varchar(160),
  ADD COLUMN IF NOT EXISTS variante_codigo varchar(80),
  ADD COLUMN IF NOT EXISTS unidad_compra varchar(30) NOT NULL DEFAULT 'UNIDAD',
  ADD COLUMN IF NOT EXISTS cantidad_empaques numeric(12,3),
  ADD COLUMN IF NOT EXISTS unidades_por_empaque numeric(12,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS costo_empaque numeric(12,4),
  ADD COLUMN IF NOT EXISTS codigo_lote varchar(80),
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date;

-- Permitir varias variantes del mismo producto en una compra, sin duplicar la misma
-- combinación producto/variante. NULL representa el producto sin variante.
-- En el catálogo real de producción, uq_compra_linea_producto es una
-- constraint UNIQUE cuyo índice subyacente se elimina al quitar la constraint.
-- Primero se elimina la constraint; DROP INDEX queda como limpieza compatible
-- con instalaciones donde el objeto antiguo exista como índice independiente.
ALTER TABLE public.compra_linea
  DROP CONSTRAINT IF EXISTS uq_compra_linea_producto;
DROP INDEX IF EXISTS public.uq_compra_linea_producto;
CREATE UNIQUE INDEX IF NOT EXISTS uq_compra_linea_producto_variante
  ON public.compra_linea(compra_id,producto_id,COALESCE(variante_id,0));

ALTER TABLE public.producto_variante_stock
  ADD COLUMN IF NOT EXISTS producto_id integer,
  ADD COLUMN IF NOT EXISTS costo_promedio numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Campos usados por el motor de devoluciones para sincronizar inventario y crédito.
ALTER TABLE public.producto_stock
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.cuenta_cobrar
  ADD COLUMN IF NOT EXISTS monto_revertido numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- El contrato actual de compras/ventas consulta producto_id directamente en el saldo de variante.
UPDATE public.producto_variante_stock vs
SET producto_id=pv.producto_id
FROM public.producto_variante pv
WHERE pv.id=vs.variante_id AND pv.empresa_id=vs.empresa_id
  AND vs.producto_id IS DISTINCT FROM pv.producto_id;

DO $variant_stock$
BEGIN
  IF EXISTS (SELECT 1 FROM public.producto_variante_stock WHERE producto_id IS NULL) THEN
    RAISE EXCEPTION 'INVENTORY_VARIANT_STOCK_PRODUCT_LINK_MISSING: hay saldos de variante sin producto asociado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_variante_stock_producto' AND conrelid='public.producto_variante_stock'::regclass) THEN
    ALTER TABLE public.producto_variante_stock ADD CONSTRAINT fk_variante_stock_producto
      FOREIGN KEY (producto_id) REFERENCES public.producto(id) ON DELETE RESTRICT;
  END IF;
END
$variant_stock$;

-- Mantener el tipo de variante compatible con producto_variante.id (bigint).
ALTER TABLE public.devolucion_venta_linea
  ADD COLUMN IF NOT EXISTS variante_id bigint;
ALTER TABLE public.movimiento_inventario
  ADD COLUMN IF NOT EXISTS variante_id bigint;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_compra_linea_variante_lote' AND conrelid='public.compra_linea'::regclass) THEN
    ALTER TABLE public.compra_linea ADD CONSTRAINT fk_compra_linea_variante_lote
      FOREIGN KEY (variante_id) REFERENCES public.producto_variante(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_devolucion_linea_variante_lote' AND conrelid='public.devolucion_venta_linea'::regclass) THEN
    ALTER TABLE public.devolucion_venta_linea ADD CONSTRAINT fk_devolucion_linea_variante_lote
      FOREIGN KEY (variante_id) REFERENCES public.producto_variante(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_movimiento_variante_lote' AND conrelid='public.movimiento_inventario'::regclass) THEN
    ALTER TABLE public.movimiento_inventario ADD CONSTRAINT fk_movimiento_variante_lote
      FOREIGN KEY (variante_id) REFERENCES public.producto_variante(id) ON DELETE RESTRICT;
  END IF;
END
$constraints$;

CREATE TABLE IF NOT EXISTS public.inventario_lote (
  id bigserial PRIMARY KEY,
  empresa_id integer NOT NULL,
  sucursal_id integer NOT NULL,
  producto_id integer NOT NULL,
  variante_id bigint,
  compra_id bigint,
  compra_linea_id bigint,
  codigo_lote varchar(80) NOT NULL,
  fecha_vencimiento date,
  cantidad_inicial numeric(12,3) NOT NULL CHECK (cantidad_inicial >= 0),
  cantidad_disponible numeric(12,3) NOT NULL CHECK (cantidad_disponible >= 0),
  costo_unitario numeric(12,4) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_lote_sucursal FOREIGN KEY (sucursal_id) REFERENCES public.sucursal(id) ON DELETE RESTRICT,
  CONSTRAINT fk_lote_producto FOREIGN KEY (producto_id) REFERENCES public.producto(id) ON DELETE RESTRICT,
  CONSTRAINT fk_lote_variante FOREIGN KEY (variante_id) REFERENCES public.producto_variante(id) ON DELETE RESTRICT,
  CONSTRAINT fk_lote_compra FOREIGN KEY (compra_id) REFERENCES public.compra(id) ON DELETE RESTRICT,
  CONSTRAINT fk_lote_compra_linea FOREIGN KEY (compra_linea_id) REFERENCES public.compra_linea(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.comprobante_lote_salida (
  id bigserial PRIMARY KEY,
  empresa_id integer NOT NULL,
  comprobante_id integer NOT NULL,
  comprobante_linea_id integer,
  lote_id bigint NOT NULL REFERENCES public.inventario_lote(id) ON DELETE RESTRICT,
  producto_id integer NOT NULL REFERENCES public.producto(id) ON DELETE RESTRICT,
  variante_id bigint REFERENCES public.producto_variante(id) ON DELETE RESTRICT,
  cantidad numeric(12,3) NOT NULL CHECK (cantidad > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_lote_salida_comprobante FOREIGN KEY (comprobante_id) REFERENCES public.comprobante(id) ON DELETE RESTRICT
);

-- Each lot consumption is tied to one exact sale line; repeated product/variant
-- lines in the same receipt are therefore unambiguous for partial returns.
ALTER TABLE public.comprobante_lote_salida
  ADD COLUMN IF NOT EXISTS comprobante_linea_id integer;

DO $sale_line_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='fk_lote_salida_comprobante_linea'
      AND conrelid='public.comprobante_lote_salida'::regclass
  ) THEN
    ALTER TABLE public.comprobante_lote_salida
      ADD CONSTRAINT fk_lote_salida_comprobante_linea
      FOREIGN KEY (comprobante_linea_id)
      REFERENCES public.comprobante_linea(id) ON DELETE RESTRICT;
  END IF;
END
$sale_line_fk$;

CREATE TABLE IF NOT EXISTS public.devolucion_venta_lote (
  id bigserial PRIMARY KEY,
  devolucion_linea_id bigint NOT NULL REFERENCES public.devolucion_venta_linea(id) ON DELETE RESTRICT,
  lote_id bigint NOT NULL REFERENCES public.inventario_lote(id) ON DELETE RESTRICT,
  cantidad numeric(12,3) NOT NULL CHECK (cantidad > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_devolucion_linea_lote UNIQUE (devolucion_linea_id,lote_id)
);

CREATE INDEX IF NOT EXISTS idx_lote_fefo
  ON public.inventario_lote(empresa_id,sucursal_id,producto_id,variante_id,fecha_vencimiento,id)
  WHERE cantidad_disponible > 0;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lote_compra_linea
  ON public.inventario_lote(compra_linea_id) WHERE compra_linea_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comprobante_lote_salida
  ON public.comprobante_lote_salida(empresa_id,comprobante_id,producto_id,variante_id);
CREATE INDEX IF NOT EXISTS idx_lote_salida_comprobante_linea
  ON public.comprobante_lote_salida(empresa_id,comprobante_linea_id);
CREATE INDEX IF NOT EXISTS idx_devolucion_venta_lote_lote
  ON public.devolucion_venta_lote(lote_id);

-- Inicializa trazabilidad para el stock que ya existe, sin duplicar lotes previos.
-- El lote APERTURA no inventa fecha de vencimiento ni procedencia histórica.
INSERT INTO public.inventario_lote
  (empresa_id,sucursal_id,producto_id,variante_id,codigo_lote,fecha_vencimiento,
   cantidad_inicial,cantidad_disponible,costo_unitario)
SELECT ps.empresa_id,ps.sucursal_id,ps.producto_id,NULL,
       'APERTURA-'||ps.producto_id||'-'||ps.sucursal_id,NULL,
       ps.stock,ps.stock,ps.costo_promedio
FROM public.producto_stock ps
WHERE ps.stock > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.inventario_lote l
    WHERE l.empresa_id=ps.empresa_id AND l.sucursal_id=ps.sucursal_id
      AND l.producto_id=ps.producto_id AND l.variante_id IS NULL
  );

INSERT INTO public.inventario_lote
  (empresa_id,sucursal_id,producto_id,variante_id,codigo_lote,fecha_vencimiento,
   cantidad_inicial,cantidad_disponible,costo_unitario)
SELECT vs.empresa_id,vs.sucursal_id,pv.producto_id,vs.variante_id,
       'APERTURA-VAR-'||vs.variante_id||'-'||vs.sucursal_id,NULL,
       vs.stock,vs.stock,pv.costo_compra
FROM public.producto_variante_stock vs
JOIN public.producto_variante pv ON pv.id=vs.variante_id AND pv.empresa_id=vs.empresa_id
WHERE vs.stock > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.inventario_lote l
    WHERE l.empresa_id=vs.empresa_id AND l.sucursal_id=vs.sucursal_id
      AND l.producto_id=pv.producto_id AND l.variante_id=vs.variante_id
  );

-- Los saldos de variantes deben disponer de costo promedio para la recepción.
UPDATE public.producto_variante_stock vs
SET costo_promedio=pv.costo_compra
FROM public.producto_variante pv
WHERE pv.id=vs.variante_id AND pv.empresa_id=vs.empresa_id
  AND vs.costo_promedio=0 AND pv.costo_compra>0;

-- El acceso operativo será exclusivamente mediante RPC SECURITY DEFINER.
ALTER TABLE public.inventario_lote ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprobante_lote_salida ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devolucion_venta_lote ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventario_lote,public.comprobante_lote_salida,public.devolucion_venta_lote FROM PUBLIC,anon,authenticated;

COMMIT;
