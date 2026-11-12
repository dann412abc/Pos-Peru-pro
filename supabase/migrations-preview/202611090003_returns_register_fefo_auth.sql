-- PREVIEW ONLY — Registro de devolución autenticado con restitución FEFO atómica.
-- Requiere 202611090002_inventory_lots_returns_compat.sql y la RPC legacy transaccional.
-- Reutiliza el cálculo probado de importes, caja, crédito e inventario; añade trazabilidad de lotes
-- dentro de la misma transacción PostgREST. Aplicar después de 090002 y antes de 090012,
-- de modo que la anulación NV ya use este wrapper cuando el escritor base quede interno.
-- No aplicar en producción sin staging.
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_devolucion_registrar_auth(
  p_comprobante_id integer,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_usuario integer := public.mi_usuario_id();
  v_empresa integer := public.mi_empresa_id();
  v_motivo text;
  v_key text;
  v_line jsonb;
  v_linea_id integer;
  v_reingresar boolean;
  v_devolucion_id bigint;
  v_linea_devolucion_id bigint;
  v_producto_id integer;
  v_variante_id bigint;
  v_cantidad numeric(12,3);
  v_pendiente numeric(12,3);
  v_tomar numeric(12,3);
  v_origen_count integer;
  v_lote record;
  v_result jsonb;
  v_asignaciones integer := 0;
  v_costo_unitario numeric(12,4);
  v_nuevo_lote_id bigint;
BEGIN
  IF auth.uid() IS NULL OR v_usuario IS NULL OR v_empresa IS NULL
     OR public.mi_rol() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo un administrador vinculado puede registrar devoluciones'
      USING ERRCODE='42501';
  END IF;

  IF p_comprobante_id IS NULL OR jsonb_typeof(p_payload)<>'object'
     OR jsonb_typeof(p_payload->'lineas')<>'array'
     OR jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 100
     OR jsonb_typeof(COALESCE(p_payload->'pagos','[]'::jsonb))<>'array' THEN
    RAISE EXCEPTION 'Datos de devolución inválidos' USING ERRCODE='22023';
  END IF;

  -- Una línea original solo puede aparecer una vez por devolución.
  -- Evita que dos entradas compartan el mismo registro devolucion_venta_linea
  -- y que la reposición FEFO quede asociada de forma ambigua.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload->'lineas') AS entrada(value)
    GROUP BY NULLIF(entrada.value->>'comprobanteLineaId','')
    HAVING COUNT(*)>1
  ) THEN
    RAISE EXCEPTION 'Una línea de venta no puede repetirse en la misma devolución'
      USING ERRCODE='22023';
  END IF;

  v_motivo:=left(btrim(COALESCE(p_payload->>'motivo','')),500);
  v_key:=btrim(COALESCE(p_payload->>'idempotencyKey',''));
  IF length(v_motivo)<5 OR v_key !~ '^[A-Za-z0-9._:-]{8,100}$' THEN
    RAISE EXCEPTION 'Motivo o clave de operación inválidos' USING ERRCODE='22023';
  END IF;

  -- La RPC histórica controla idempotencia, permisos, caja, crédito, pagos y stock.
  -- Cualquier error posterior de FEFO revierte también esta llamada y todos sus efectos.
  v_result:=public.pos_registrar_devolucion(
    p_comprobante_id,
    v_motivo,
    p_payload->'lineas',
    COALESCE(p_payload->'pagos','[]'::jsonb),
    v_key
  );

  v_devolucion_id:=NULLIF(v_result->>'id','')::bigint;
  IF v_devolucion_id IS NULL THEN
    RAISE EXCEPTION 'La RPC de devolución no devolvió un identificador válido'
      USING ERRCODE='P0001';
  END IF;

  -- Reintento exacto: la primera llamada ya completó stock y lotes.
  IF COALESCE((v_result->>'reintento')::boolean,false) THEN
    RETURN v_result || jsonb_build_object('lotesRestituidos',0,'trazabilidadRepetida',true);
  END IF;

  FOR v_line IN
    SELECT value FROM jsonb_array_elements(p_payload->'lineas')
    ORDER BY (value->>'comprobanteLineaId')::integer
  LOOP
    v_linea_id:=NULLIF(v_line->>'comprobanteLineaId','')::integer;
    v_cantidad:=NULLIF(v_line->>'cantidad','')::numeric;
    v_reingresar:=COALESCE((v_line->>'reingresarStock')::boolean,true);

    IF v_linea_id IS NULL OR v_cantidad IS NULL OR v_cantidad<=0
       OR round(v_cantidad,3)<>v_cantidad THEN
      RAISE EXCEPTION 'Línea o cantidad inválida al restaurar lotes' USING ERRCODE='22023';
    END IF;

    SELECT cl.producto_id,cl.variante_id
      INTO v_producto_id,v_variante_id
    FROM public.comprobante_linea cl
    WHERE cl.id=v_linea_id AND cl.comprobante_id=p_comprobante_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se encontró la línea original para trazar sus lotes' USING ERRCODE='P0002';
    END IF;

    SELECT dvl.id INTO v_linea_devolucion_id
    FROM public.devolucion_venta_linea dvl
    WHERE dvl.devolucion_id=v_devolucion_id
      AND dvl.comprobante_linea_id=v_linea_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se encontró la línea de devolución recién registrada' USING ERRCODE='P0002';
    END IF;

    UPDATE public.devolucion_venta_linea
       SET variante_id=v_variante_id
     WHERE id=v_linea_devolucion_id;

    IF NOT v_reingresar THEN
      CONTINUE;
    END IF;

    -- Cada salida FEFO pertenece a la línea exacta; se admiten líneas repetidas
    -- del mismo producto/variante sin mezclar cantidades entre ellas.

    v_pendiente:=v_cantidad;
    SELECT COUNT(*) INTO v_origen_count
    FROM public.comprobante_lote_salida cls
    WHERE cls.empresa_id=v_empresa
      AND cls.comprobante_id=p_comprobante_id
      AND cls.producto_id=v_producto_id
      AND cls.variante_id IS NOT DISTINCT FROM v_variante_id
      AND cls.comprobante_linea_id=v_linea_id;

    -- Devuelve solo a lotes consumidos por esta línea. Los registros de otras
    -- líneas nunca reducen el saldo restituible de la línea actual.
    FOR v_lote IN
      -- Agrupar salidas repetidas del mismo lote antes de calcular lo pendiente.
      -- Evita contar dos veces la capacidad restituible si una venta generó
      -- más de un registro de salida para la misma línea y lote.
      SELECT asign.lote_id,
             GREATEST(0,asign.cantidad-COALESCE(previo.cantidad,0))::numeric(12,3) AS disponible_devolver
      FROM (
        SELECT cls.lote_id,SUM(cls.cantidad)::numeric(12,3) AS cantidad
        FROM public.comprobante_lote_salida cls
        WHERE cls.empresa_id=v_empresa
          AND cls.comprobante_id=p_comprobante_id
          AND cls.producto_id=v_producto_id
          AND cls.variante_id IS NOT DISTINCT FROM v_variante_id
          AND cls.comprobante_linea_id=v_linea_id
        GROUP BY cls.lote_id
      ) asign
      JOIN public.inventario_lote il
        ON il.id=asign.lote_id AND il.empresa_id=v_empresa
        AND il.sucursal_id=(SELECT c.sucursal_id FROM public.comprobante c WHERE c.id=p_comprobante_id AND c.empresa_id=v_empresa)
      LEFT JOIN LATERAL (
        SELECT SUM(dvl.cantidad)::numeric(12,3) AS cantidad
        FROM public.devolucion_venta_lote dvl
        JOIN public.devolucion_venta_linea dline ON dline.id=dvl.devolucion_linea_id
        JOIN public.devolucion_venta dv ON dv.id=dline.devolucion_id
        WHERE dvl.lote_id=asign.lote_id
          AND dline.comprobante_linea_id=v_linea_id
          AND dv.comprobante_id=p_comprobante_id
          AND dv.empresa_id=v_empresa
          AND dv.estado='REGISTRADA'
          AND dv.id<>v_devolucion_id
      ) previo ON true
      WHERE asign.cantidad-COALESCE(previo.cantidad,0)>0
      ORDER BY asign.lote_id
      FOR UPDATE OF il
    LOOP
      EXIT WHEN v_pendiente<=0.0005;
      v_tomar:=LEAST(v_pendiente,v_lote.disponible_devolver);
      IF v_tomar<=0 THEN CONTINUE; END IF;

      UPDATE public.inventario_lote
         SET cantidad_disponible=cantidad_disponible+v_tomar
       WHERE id=v_lote.lote_id AND empresa_id=v_empresa
         AND cantidad_disponible>=0;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'No se pudo reponer el lote original %',v_lote.lote_id
          USING ERRCODE='40001';
      END IF;

      INSERT INTO public.devolucion_venta_lote(devolucion_linea_id,lote_id,cantidad)
      VALUES(v_linea_devolucion_id,v_lote.lote_id,v_tomar);

      v_pendiente:=round(v_pendiente-v_tomar,3);
      v_asignaciones:=v_asignaciones+1;
    END LOOP;

    IF v_pendiente>0.0005 THEN
      IF v_origen_count>0 THEN
        RAISE EXCEPTION 'La trazabilidad original no cubre la cantidad a devolver para la línea %',v_linea_id
          USING ERRCODE='23514';
      END IF;

      -- Venta histórica sin asignaciones FEFO: lote de devolución identificado,
      -- sin atribuirle vencimiento ni procedencia que no constan en el comprobante.
      SELECT cl.costo_unitario INTO v_costo_unitario
      FROM public.comprobante_linea cl
      WHERE cl.id=v_linea_id AND cl.comprobante_id=p_comprobante_id;

      INSERT INTO public.inventario_lote(
        empresa_id,sucursal_id,producto_id,variante_id,codigo_lote,fecha_vencimiento,
        cantidad_inicial,cantidad_disponible,costo_unitario
      )
      SELECT v_empresa,c.sucursal_id,v_producto_id,v_variante_id,
        'DEVCLIENTE-'||v_devolucion_id||'-'||v_linea_id,NULL,
        v_pendiente,v_pendiente,COALESCE(v_costo_unitario,0)
      FROM public.comprobante c
      WHERE c.id=p_comprobante_id AND c.empresa_id=v_empresa
      RETURNING id INTO v_nuevo_lote_id;

      IF v_nuevo_lote_id IS NULL THEN
        RAISE EXCEPTION 'No se pudo crear el lote de devolución histórica'
          USING ERRCODE='P0001';
      END IF;

      INSERT INTO public.devolucion_venta_lote(devolucion_linea_id,lote_id,cantidad)
      VALUES(v_linea_devolucion_id,v_nuevo_lote_id,v_pendiente);

      v_asignaciones:=v_asignaciones+1;
    END IF;
  END LOOP;

  RETURN v_result || jsonb_build_object(
    'lotesRestituidos',v_asignaciones,
    'trazabilidadRepetida',false,
    'inventarioLotesActualizado',true
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.pos_devolucion_registrar_auth(integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_devolucion_registrar_auth(integer,jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_devolucion_registrar_auth(integer,jsonb) IS
'Registra devolución con la RPC transaccional existente y repone trazabilidad FEFO en la misma transacción. Requiere migración preview de compatibilidad de lotes y staging validado.';


-- Mantiene la anulación de notas de venta conectada al mismo motor FEFO.
-- La función interna de devolución admite NV únicamente para este flujo autorizado.
CREATE OR REPLACE FUNCTION public.pos_anular_nota_venta(
  p_comprobante_id integer,
  p_motivo text,
  p_pagos jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $cancel$
DECLARE
  v_usuario integer := public.mi_usuario_id();
  v_empresa integer := public.mi_empresa_id();
  v_comprobante public.comprobante%ROWTYPE;
  v_lineas jsonb;
  v_clave text := 'ANULNV:' || trim(coalesce(p_idempotency_key,''));
  v_prefijo text := 'ANULACION NOTA DE VENTA:';
  v_motivo text := trim(coalesce(p_motivo,''));
  v_motivo_devolucion text;
  v_hash text;
  v_hash_legacy text;
  v_resultado jsonb;
  v_existente public.devolucion_venta%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_usuario IS NULL OR v_empresa IS NULL
     OR public.mi_rol() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo un administrador autenticado puede anular notas de venta'
      USING ERRCODE='42501';
  END IF;

  IF p_comprobante_id IS NULL OR length(v_motivo)<5 OR length(v_motivo)>450
     OR length(trim(coalesce(p_idempotency_key,'')))<8
     OR length(trim(coalesce(p_idempotency_key,'')))>80 THEN
    RAISE EXCEPTION 'Comprobante, motivo o clave de anulación inválidos'
      USING ERRCODE='22023';
  END IF;
  IF p_pagos IS NULL OR jsonb_typeof(p_pagos)<>'array' THEN
    RAISE EXCEPTION 'Los reembolsos deben enviarse como una lista'
      USING ERRCODE='22023';
  END IF;

  SELECT c.* INTO v_comprobante
  FROM public.comprobante c
  WHERE c.id=p_comprobante_id AND c.empresa_id=v_empresa
    AND c.tipo='NV' AND public.mi_puede_ver_sucursal(c.sucursal_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota de venta no encontrada o fuera de su empresa/sucursal'
      USING ERRCODE='P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('pos:anular_nv:'||v_empresa||':'||p_comprobante_id,0)
  );

  IF v_comprobante.estado NOT IN ('PAGADA','PENDIENTE','ANULADA') THEN
    RAISE EXCEPTION 'La nota de venta no está en un estado anulable'
      USING ERRCODE='22023';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'comprobanteLineaId',cl.id,
    'cantidad',cl.cantidad,
    'reingresarStock',true
  ) ORDER BY cl.id)
  INTO v_lineas
  FROM public.comprobante_linea cl
  WHERE cl.comprobante_id=p_comprobante_id;
  IF v_lineas IS NULL OR jsonb_array_length(v_lineas)=0 THEN
    RAISE EXCEPTION 'La nota de venta no tiene líneas para revertir'
      USING ERRCODE='22023';
  END IF;

  v_motivo_devolucion:=v_prefijo||' '||v_motivo;

  -- La huella usa exactamente la misma canonicalización que el escritor interno.
  -- Así, un reintento después de migrar no se confunde con una operación distinta.
  SELECT md5(jsonb_build_object(
    'comprobanteId',p_comprobante_id,
    'motivo',v_motivo_devolucion,
    'lineas',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'comprobanteLineaId',(x->>'comprobanteLineaId')::integer,
      'cantidad',round((x->>'cantidad')::numeric,3),
      'reingresarStock',coalesce((x->>'reingresarStock')::boolean,true)
    ) ORDER BY (x->>'comprobanteLineaId')::integer),'[]'::jsonb)
      FROM jsonb_array_elements(v_lineas) x),
    'pagos',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'metodoPago',x->>'metodoPago',
      'monto',round((x->>'monto')::numeric,2),
      'referencia',nullif(btrim(coalesce(x->>'referencia','')),'')
    ) ORDER BY x->>'metodoPago'),'[]'::jsonb)
      FROM jsonb_array_elements(p_pagos) x)
  )::text) INTO v_hash;
  -- Compatibilidad con anulaciones y reintentos guardados por la versión anterior.
  v_hash_legacy:=md5(jsonb_build_object(
    'motivo',v_motivo_devolucion,'lineas',v_lineas,'pagos',p_pagos
  )::text);

  SELECT d.* INTO v_existente
  FROM public.devolucion_venta d
  WHERE d.empresa_id=v_empresa AND d.usuario_id=v_usuario
    AND d.idempotency_key=v_clave;

  IF FOUND THEN
    IF v_existente.comprobante_id<>p_comprobante_id
       OR left(v_existente.motivo,length(v_prefijo))<>v_prefijo
       OR (v_existente.request_hash IS DISTINCT FROM v_hash
           AND v_existente.request_hash IS DISTINCT FROM v_hash_legacy) THEN
      RAISE EXCEPTION 'La clave de anulación ya fue utilizada con otros datos';
    END IF;
    IF v_comprobante.estado<>'ANULADA' THEN
      UPDATE public.comprobante
      SET estado='ANULADA',motivo_anulacion=v_motivo
      WHERE id=p_comprobante_id AND empresa_id=v_empresa
        AND tipo='NV' AND estado IN ('PAGADA','PENDIENTE');
      IF NOT FOUND THEN
        RAISE EXCEPTION 'No se pudo reconciliar el estado de la nota de venta';
      END IF;
    END IF;
    RETURN jsonb_build_object(
      'comprobanteId',p_comprobante_id,'estado','ANULADA',
      'devolucionId',v_existente.id,'totalRevertido',v_existente.total_devolucion,
      'creditoRevertido',v_existente.credito_revertido,
      'montoReembolsado',v_existente.monto_reembolsado,'reintento',true
    );
  END IF;

  IF v_comprobante.estado='ANULADA' THEN
    RAISE EXCEPTION 'La nota ya está anulada y no existe una operación idempotente asociada';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.devolucion_venta d
    WHERE d.comprobante_id=p_comprobante_id AND d.empresa_id=v_empresa
      AND d.estado='REGISTRADA'
  ) THEN
    RAISE EXCEPTION 'No se puede anular: la nota de venta ya tiene devoluciones registradas';
  END IF;

  -- No llamar directamente al escritor interno: el wrapper también repone
  -- los lotes originales FEFO en la misma transacción de anulación.
  v_resultado:=public.pos_devolucion_registrar_auth(
    p_comprobante_id,
    jsonb_build_object(
      'motivo',v_motivo_devolucion,
      'idempotencyKey',v_clave,
      'lineas',v_lineas,
      'pagos',p_pagos
    )
  );

  UPDATE public.comprobante
  SET estado='ANULADA',motivo_anulacion=v_motivo
  WHERE id=p_comprobante_id AND empresa_id=v_empresa
    AND tipo='NV' AND estado IN ('PAGADA','PENDIENTE');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo actualizar el estado de la nota de venta';
  END IF;

  RETURN jsonb_build_object(
    'comprobanteId',p_comprobante_id,'estado','ANULADA',
    'devolucionId',(v_resultado->>'id')::bigint,
    'totalRevertido',(v_resultado->>'totalDevolucion')::numeric,
    'creditoRevertido',(v_resultado->>'creditoRevertido')::numeric,
    'montoReembolsado',(v_resultado->>'montoReembolsado')::numeric,
    'reintento',coalesce((v_resultado->>'reintento')::boolean,false)
  );
END;
$cancel$;

COMMIT;
