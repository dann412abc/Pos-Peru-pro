-- PREVIEW ONLY — Bloqueo transaccional de movimientos durante inventario físico.
-- Requiere 202611090010_inventory_count_auth.sql y las RPC de ajustes/lotes.
-- No ejecutar en producción; validar primero en staging.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.inventario_conteo') IS NULL
     OR to_regclass('public.inventario_conteo_linea') IS NULL
     OR to_regclass('public.producto_stock') IS NULL
     OR to_regclass('public.producto_variante_stock') IS NULL
     OR to_regprocedure('public.pos_inventario_conteo_cerrar_auth(bigint)') IS NULL
     OR to_regprocedure('public.pos_inventario_ajustar_lote_auth(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_LOCK_PREREQUISITES_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='producto_stock'
      AND column_name IN ('empresa_id','sucursal_id','stock')
    GROUP BY table_schema,table_name HAVING count(*)=3
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='producto_variante_stock'
      AND column_name IN ('empresa_id','sucursal_id','stock')
    GROUP BY table_schema,table_name HAVING count(*)=3
  ) THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_LOCK_SCHEMA_INCOMPATIBLE';
  END IF;
END
$guard$;

-- One lock namespace per company/branch is shared by the count lifecycle and
-- every stock-row write, including legacy RPCs that do not know about counts.
CREATE OR REPLACE FUNCTION public.pos_inventario_conteo_bloquear_stock_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $trigger$
DECLARE
  v_empresa integer;
  v_sucursal integer;
  v_count_id text;
  v_close_id text;
BEGIN
  IF TG_OP='DELETE' THEN
    v_empresa:=OLD.empresa_id;
    v_sucursal:=OLD.sucursal_id;
  ELSE
    v_empresa:=NEW.empresa_id;
    v_sucursal:=NEW.sucursal_id;
  END IF;

  IF TG_OP='UPDATE' AND NEW.stock IS NOT DISTINCT FROM OLD.stock THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos:inventory-count:'||v_empresa||':'||v_sucursal,0)
  );

  v_close_id:=NULLIF(pg_catalog.current_setting('pos.inventory_count_close_id',true),'');
  IF v_close_id IS NOT NULL THEN
    SELECT c.id::text INTO v_count_id
    FROM public.inventario_conteo c
    WHERE c.id::text=v_close_id
      AND c.empresa_id=v_empresa
      AND c.sucursal_id=v_sucursal
      AND c.estado='ABIERTO';
    IF v_count_id IS NOT NULL THEN
      IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventario_conteo c
    WHERE c.empresa_id=v_empresa AND c.sucursal_id=v_sucursal AND c.estado='ABIERTO'
  ) THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_OPEN: stock movements are blocked until the physical count is closed'
      USING ERRCODE='55000';
  END IF;

  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$trigger$;

REVOKE ALL ON FUNCTION public.pos_inventario_conteo_bloquear_stock_trigger() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS trg_inventario_conteo_bloquear_producto_stock ON public.producto_stock;
CREATE TRIGGER trg_inventario_conteo_bloquear_producto_stock
BEFORE INSERT OR UPDATE OF stock OR DELETE ON public.producto_stock
FOR EACH ROW EXECUTE FUNCTION public.pos_inventario_conteo_bloquear_stock_trigger();

DROP TRIGGER IF EXISTS trg_inventario_conteo_bloquear_variante_stock ON public.producto_variante_stock;
CREATE TRIGGER trg_inventario_conteo_bloquear_variante_stock
BEFORE INSERT OR UPDATE OF stock OR DELETE ON public.producto_variante_stock
FOR EACH ROW EXECUTE FUNCTION public.pos_inventario_conteo_bloquear_stock_trigger();

-- Opening a count takes the same branch lock before its row is inserted.
-- The lock is held until the snapshot transaction commits, so stock writes
-- either finish before the snapshot or observe the newly-open count afterward.
CREATE OR REPLACE FUNCTION public.pos_inventario_conteo_bloquear_apertura_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $trigger$
BEGIN
  IF NEW.estado='ABIERTO' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('pos:inventory-count:'||NEW.empresa_id||':'||NEW.sucursal_id,0)
    );
  END IF;
  RETURN NEW;
END;
$trigger$;

REVOKE ALL ON FUNCTION public.pos_inventario_conteo_bloquear_apertura_trigger() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_inventario_conteo_serializar_apertura ON public.inventario_conteo;
CREATE TRIGGER trg_inventario_conteo_serializar_apertura
BEFORE INSERT ON public.inventario_conteo
FOR EACH ROW EXECUTE FUNCTION public.pos_inventario_conteo_bloquear_apertura_trigger();

-- Closing holds the branch lock for the entire adjustment transaction and
-- sets a transaction-local, count-specific capability consumed by the stock
-- trigger only while this exact open count is being finalized.
CREATE OR REPLACE FUNCTION public.pos_inventario_conteo_cerrar_auth(p_conteo_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_usuario integer:=public.mi_usuario_id();
        v_empresa integer:=public.mi_empresa_id(); v_cab record; v_line record;
        v_actual numeric(12,3); v_delta numeric(12,3); v_key text; v_adjust jsonb;
        v_total numeric(14,3):=0; v_costo numeric(14,2):=0;
BEGIN
  IF v_uid IS NULL OR v_usuario IS NULL OR v_empresa IS NULL THEN RAISE EXCEPTION 'INVENTORY_AUTH_REQUIRED'; END IF;
  IF public.mi_rol() IS DISTINCT FROM 'ADMIN' THEN RAISE EXCEPTION 'INVENTORY_ADMIN_REQUIRED'; END IF;

  SELECT * INTO v_cab FROM public.inventario_conteo
  WHERE id=p_conteo_id AND empresa_id=v_empresa AND public.mi_puede_ver_sucursal(sucursal_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_COUNT_NOT_FOUND'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pos:inventory-count:'||v_cab.empresa_id||':'||v_cab.sucursal_id,0)
  );

  SELECT * INTO v_cab FROM public.inventario_conteo
  WHERE id=p_conteo_id AND empresa_id=v_empresa AND public.mi_puede_ver_sucursal(sucursal_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVENTORY_COUNT_NOT_FOUND'; END IF;
  IF v_cab.estado<>'ABIERTO' THEN RAISE EXCEPTION 'INVENTORY_COUNT_NOT_OPEN'; END IF;
  IF EXISTS(SELECT 1 FROM public.inventario_conteo_linea WHERE conteo_id=p_conteo_id AND cantidad_contada IS NULL) THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_LINES_PENDING';
  END IF;

  PERFORM pg_catalog.set_config('pos.inventory_count_close_id',p_conteo_id::text,true);

  FOR v_line IN SELECT * FROM public.inventario_conteo_linea
    WHERE conteo_id=p_conteo_id ORDER BY producto_id,variante_id NULLS FIRST,id FOR UPDATE
  LOOP
    IF v_line.variante_id IS NULL THEN
      SELECT stock INTO v_actual FROM public.producto_stock
      WHERE empresa_id=v_empresa AND sucursal_id=v_cab.sucursal_id AND producto_id=v_line.producto_id FOR UPDATE;
    ELSE
      SELECT stock INTO v_actual FROM public.producto_variante_stock
      WHERE empresa_id=v_empresa AND sucursal_id=v_cab.sucursal_id AND producto_id=v_line.producto_id
        AND variante_id=v_line.variante_id FOR UPDATE;
    END IF;
    IF v_actual IS NULL THEN RAISE EXCEPTION 'INVENTORY_COUNT_STOCK_MISSING'; END IF;
    v_delta:=round(v_line.cantidad_contada-v_actual,3);
    IF v_delta<>0 THEN
      v_key:='COUNT-INV-'||p_conteo_id||'-'||v_line.id;
      v_adjust:=public.pos_inventario_ajustar_lote_auth(jsonb_build_object(
        'sucursalId',v_cab.sucursal_id,'productoId',v_line.producto_id,'varianteId',v_line.variante_id,
        'tipo',CASE WHEN v_delta>0 THEN 'ENTRADA' ELSE 'SALIDA' END,
        'cantidad',abs(v_delta),'motivo','INVENTARIO FISICO #'||p_conteo_id,
        'idempotencyKey',v_key));
      UPDATE public.inventario_conteo_linea SET movimiento_id=(v_adjust->>'movimientoId')::integer,
        diferencia=v_delta,costo_diferencia=round(v_delta*coalesce(v_line.costo_unitario,0),2)
      WHERE id=v_line.id;
    ELSE
      UPDATE public.inventario_conteo_linea SET diferencia=0,costo_diferencia=0 WHERE id=v_line.id;
    END IF;
    v_total:=v_total+v_delta;
    v_costo:=v_costo+round(v_delta*coalesce(v_line.costo_unitario,0),2);
  END LOOP;

  UPDATE public.inventario_conteo SET estado='CERRADO',usuario_cierre_id=v_usuario,closed_at=now(),
    diferencia_unidades=v_total,costo_diferencia=v_costo
  WHERE id=p_conteo_id;
  PERFORM pg_catalog.set_config('pos.inventory_count_close_id','',true);
  RETURN public.pos_inventario_conteo_detalle_auth(p_conteo_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_inventario_conteo_cerrar_auth(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_inventario_conteo_cerrar_auth(bigint) TO authenticated;

COMMIT;
