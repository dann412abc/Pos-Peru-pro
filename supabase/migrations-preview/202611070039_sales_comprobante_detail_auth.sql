-- v1.44.57 | Lectura autenticada del detalle oficial de un comprobante.
-- PREVIEW ONLY. Solo lectura: no modifica ventas, pagos, inventario, caja ni correlativos.
CREATE OR REPLACE FUNCTION public.pos_comprobante_detalle_auth(p_comprobante_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_usuario_id integer;
  v_empresa_id integer;
  v_result jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'SALE_DETAIL_AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  SELECT u.id, u.empresa_id
    INTO v_usuario_id, v_empresa_id
  FROM public.usuario u
  WHERE u.supabase_auth_user_id = v_auth
    AND u.activo = true;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'SALE_DETAIL_USER_NOT_LINKED' USING ERRCODE = '42501';
  END IF;

  IF p_comprobante_id IS NULL OR p_comprobante_id <= 0 THEN
    RAISE EXCEPTION 'SALE_DETAIL_ID_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'id', c.id,
    'empresaId', c.empresa_id,
    'sucursalId', c.sucursal_id,
    'cajaId', c.caja_id,
    'usuarioId', c.usuario_id,
    'clienteId', c.cliente_id,
    'tipo', c.tipo,
    'serie', c.serie,
    'correlativo', c.correlativo,
    'fechaEmision', c.fecha_emision,
    'opGravadas', c.op_gravadas,
    'opExoneradas', c.op_exoneradas,
    'opInafectas', c.op_inafectas,
    'descuentoGlobal', c.descuento_global,
    'motivoDescuento', c.motivo_descuento,
    'totalIgv', c.total_igv,
    'total', c.total,
    'metodoPago', c.metodo_pago,
    'montoRecibido', c.monto_recibido,
    'vuelto', c.vuelto,
    'estado', c.estado,
    'idempotencyKey', c.idempotency_key,
    'referenciaComprobanteId', c.referencia_comprobante_id,
    'codigoMotivoNota', c.codigo_motivo_nota,
    'descripcionMotivoNota', c.descripcion_motivo_nota,
    'motivoAnulacion', c.motivo_anulacion,
    'cliente', jsonb_build_object(
      'id', cl.id, 'tipoDoc', cl.tipo_doc, 'numero', cl.numero,
      'nombre', cl.nombre, 'direccion', cl.direccion, 'telefono', cl.telefono,
      'limiteCredito', cl.limite_credito
    ),
    'lineas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', li.id,
        'numeroLinea', li.numero_linea,
        'productoId', li.producto_id,
        'varianteId', li.variante_id,
        'varianteNombre', li.variante_nombre,
        'varianteCodigo', li.variante_codigo,
        'producto', jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre),
        'cantidad', li.cantidad,
        'precioUnitario', li.precio_unitario,
        'descuento', li.descuento,
        'tipoIgv', li.tipo_igv,
        'baseImponible', li.base_imponible,
        'igv', li.igv,
        'subtotal', li.subtotal
      ) ORDER BY li.numero_linea, li.id)
      FROM public.comprobante_linea li
      JOIN public.producto p ON p.id = li.producto_id AND p.empresa_id = c.empresa_id
      WHERE li.comprobante_id = c.id
    ), '[]'::jsonb),
    'pagos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cp.id, 'metodoPago', cp.metodo_pago, 'monto', cp.monto,
        'montoRecibido', cp.monto_recibido, 'vuelto', cp.vuelto
      ) ORDER BY cp.id)
      FROM public.comprobante_pago cp
      WHERE cp.comprobante_id = c.id
    ), '[]'::jsonb),
    'comprobanteElectronico', (
      SELECT jsonb_build_object('estadoActual', ce.estado_actual, 'hashCdr', ce.hash_cdr)
      FROM public.comprobante_electronico ce
      WHERE ce.comprobante_id = c.id
    ),
    'referenciaComprobante', (
      SELECT jsonb_build_object('id', ref.id, 'tipo', ref.tipo, 'serie', ref.serie, 'correlativo', ref.correlativo)
      FROM public.comprobante ref
      WHERE ref.id = c.referencia_comprobante_id
        AND ref.empresa_id = c.empresa_id
        AND ref.sucursal_id = c.sucursal_id
    )
  )
  INTO v_result
  FROM public.comprobante c
  JOIN public.cliente cl ON cl.id = c.cliente_id AND cl.empresa_id = c.empresa_id
  JOIN public.usuario_sucursal us ON us.usuario_id = v_usuario_id AND us.sucursal_id = c.sucursal_id
  WHERE c.id = p_comprobante_id
    AND c.empresa_id = v_empresa_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'SALE_DETAIL_NOT_FOUND_OR_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_comprobante_detalle_auth(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_comprobante_detalle_auth(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_comprobante_detalle_auth(integer) TO authenticated;

COMMENT ON FUNCTION public.pos_comprobante_detalle_auth(integer)
IS 'Detalle oficial de comprobante para usuario autenticado, restringido a su empresa y sucursales asignadas. Solo lectura. PREVIEW ONLY.';
