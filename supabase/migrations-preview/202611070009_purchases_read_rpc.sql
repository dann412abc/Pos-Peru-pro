-- PREVIEW SOLAMENTE. Instalar primero en staging después de revisar el esquema real.
-- Lectura de historial y detalle de compras. La empresa/usuario derivan de auth.uid().
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_compras_consultar_auth(p_sucursal_id integer, p_compra_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_auth uuid := auth.uid();
  v_empresa integer;
  v_usuario integer;
  v_result jsonb;
  v_detalle jsonb;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
  SELECT u.id,u.empresa_id INTO v_usuario,v_empresa
  FROM public.usuario u WHERE u.supabase_auth_user_id=v_auth AND u.activo=true;
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
  IF p_sucursal_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuario_sucursal us JOIN public.sucursal s ON s.id=us.sucursal_id
    WHERE us.usuario_id=v_usuario AND us.sucursal_id=p_sucursal_id AND s.empresa_id=v_empresa
  ) THEN RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501'; END IF;

  IF p_compra_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id',c.id,'tipoDocumento',c.tipo_documento,'serie',c.serie,'numero',c.numero,
      'fechaDocumento',c.fecha_documento,'condicionPago',c.condicion_pago,'estado',c.estado,
      'total',c.total,'pagado',c.pagado,'saldoPendiente',c.saldo_pendiente,
      'fechaVencimiento',c.fecha_vencimiento,'proveedorNombre',p.nombre,'proveedorNumero',p.numero,
      'sucursalId',c.sucursal_id,'responsable',u.username,
      'lineas',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',cl.id,'codigo',pr.codigo,'productoNombre',pr.nombre,'varianteNombre',cl.variante_nombre,
        'cantidad',cl.cantidad,'costoUnitario',cl.costo_unitario,'subtotal',cl.subtotal,
        'cantidadEmpaques',cl.cantidad_empaques,'unidadCompra',cl.unidad_compra,
        'unidadesPorEmpaque',cl.unidades_por_empaque,'costoEmpaque',cl.costo_empaque,
        'codigoLote',cl.codigo_lote,'fechaVencimiento',cl.fecha_vencimiento
      ) ORDER BY cl.numero_linea) FROM public.compra_linea cl JOIN public.producto pr ON pr.id=cl.producto_id AND pr.empresa_id=cl.empresa_id
        WHERE cl.compra_id=c.id AND cl.empresa_id=v_empresa),'[]'::jsonb),
      'pagos',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',cp.id,'metodoPago',cp.metodo_pago,'monto',cp.monto,'referencia',cp.referencia,'createdAt',cp.created_at
      ) ORDER BY cp.created_at) FROM public.compra_pago cp WHERE cp.compra_id=c.id AND cp.empresa_id=v_empresa),'[]'::jsonb),
      'devoluciones',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',d.id,'motivo',d.motivo,'total',d.total,
        'aplicadoCuenta',d.aplicado_cuenta,'saldoAFavor',d.saldo_a_favor
      ) ORDER BY d.id DESC) FROM public.devolucion_proveedor d
        WHERE d.compra_id=c.id AND d.empresa_id=v_empresa),'[]'::jsonb)
    ) INTO v_detalle
    FROM public.compra c
    JOIN public.proveedor p ON p.id=c.proveedor_id AND p.empresa_id=c.empresa_id
    JOIN public.usuario u ON u.id=c.usuario_id
    WHERE c.id=p_compra_id AND c.empresa_id=v_empresa AND c.sucursal_id=p_sucursal_id;
    IF v_detalle IS NULL THEN RAISE EXCEPTION 'Compra no encontrada en la sucursal autorizada' USING ERRCODE='P0002'; END IF;
    RETURN jsonb_build_object('detalle',v_detalle);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',q.id,'tipoDocumento',q.tipo_documento,'serie',q.serie,'numero',q.numero,
    'fechaDocumento',q.fecha_documento,'condicionPago',q.condicion_pago,'estado',q.estado,
    'total',q.total,'pagado',q.pagado,'saldoPendiente',q.saldo_pendiente,
    'fechaVencimiento',q.fecha_vencimiento,'proveedorNombre',q.proveedor_nombre,
    'proveedorNumero',q.proveedor_numero,'responsable',q.responsable,'sucursalId',q.sucursal_id
  ) ORDER BY q.fecha_registro DESC),'[]'::jsonb) INTO v_result
  FROM (
    SELECT c.id,c.tipo_documento,c.serie,c.numero,c.fecha_documento,c.condicion_pago,c.estado,
      c.total,c.pagado,c.saldo_pendiente,c.fecha_vencimiento,p.nombre AS proveedor_nombre,
      p.numero AS proveedor_numero,u.username AS responsable,c.sucursal_id,c.fecha_registro
    FROM public.compra c
    JOIN public.proveedor p ON p.id=c.proveedor_id AND p.empresa_id=c.empresa_id
    JOIN public.usuario u ON u.id=c.usuario_id
    WHERE c.empresa_id=v_empresa AND c.sucursal_id=p_sucursal_id
    ORDER BY c.fecha_registro DESC LIMIT 250
  ) q;
  RETURN jsonb_build_object('compras',v_result);
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_compras_consultar_auth(integer,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_compras_consultar_auth(integer,bigint) TO authenticated;
COMMIT;
