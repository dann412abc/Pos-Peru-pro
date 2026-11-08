import type { Cliente, MetodoPago, TipoComprobante, Venta } from '../types';

function numero(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Adapta la entidad del backend al modelo de pantalla/caché del frontend. */
export function mapComprobante(comprobante: any): Venta {
  const clienteRaw = comprobante.cliente || {};
  const cliente: Cliente = {
    id: clienteRaw.id,
    tipoDoc: clienteRaw.tipoDoc || 'DNI',
    numero: clienteRaw.numero || '',
    nombre: clienteRaw.nombre || 'Cliente',
    direccion: clienteRaw.direccion || '',
    telefono: clienteRaw.telefono || '',
    limiteCredito: numero(clienteRaw.limiteCredito),
  };
  const pagos = Array.isArray(comprobante.pagos) && comprobante.pagos.length
    ? comprobante.pagos.map((p: any) => ({
      metodo: p.metodoPago as MetodoPago,
      monto: numero(p.monto),
      montoRecibido: p.montoRecibido == null ? undefined : numero(p.montoRecibido),
      vuelto: p.vuelto == null ? undefined : numero(p.vuelto),
    }))
    : [{ metodo: (comprobante.metodoPago || 'EFECTIVO') as MetodoPago, monto: numero(comprobante.total) }];

  const estadoFeRaw = comprobante.comprobanteElectronico?.estadoActual || comprobante.estadoFE;
  const estadoFE = estadoFeRaw === 'ACEPTADO' || estadoFeRaw === 'Aceptado'
    ? 'Aceptado'
    : estadoFeRaw === 'RECHAZADO' || estadoFeRaw === 'Rechazado'
      ? 'Rechazado'
      : 'Pendiente';

  return {
    id: -Math.abs(numero(comprobante.id)),
    serverId: numero(comprobante.id),
    serie: comprobante.serie,
    correlativo: numero(comprobante.correlativo),
    tipoComprobante: comprobante.tipo as TipoComprobante,
    cliente,
    lineas: (comprobante.lineas || []).map((linea: any) => ({
      comprobanteLineaId: linea.id == null ? undefined : numero(linea.id),
      productoId: numero(linea.productoId),
      varianteId: linea.varianteId == null ? undefined : numero(linea.varianteId),
      varianteCodigo: linea.varianteCodigo || undefined,
      varianteNombre: linea.varianteNombre || undefined,
      codigo: linea.varianteCodigo || linea.producto?.codigo || '',
      nombre: linea.varianteNombre
        ? `${linea.producto?.nombre || `Producto ${linea.productoId}`} - ${linea.varianteNombre}`
        : (linea.producto?.nombre || `Producto ${linea.productoId}`),
      cantidad: numero(linea.cantidad),
      precioUnitario: numero(linea.precioUnitario),
      tipoIgv: String(linea.tipoIgv) as '10' | '20' | '30',
      descuento: numero(linea.descuento),
    })),
    pagos,
    fecha: comprobante.fechaEmision || comprobante.fecha || new Date().toISOString(),
    usuarioId: String(comprobante.usuarioId || ''),
    cajaId: comprobante.cajaId,
    opGravadas: numero(comprobante.opGravadas),
    opExoneradas: numero(comprobante.opExoneradas),
    opInafectas: numero(comprobante.opInafectas),
    descuentoTotal: numero(comprobante.descuentoGlobal),
    motivoDescuento: comprobante.motivoDescuento || undefined,
    referenciaComprobanteId: comprobante.referenciaComprobanteId == null ? undefined : numero(comprobante.referenciaComprobanteId),
    referenciaComprobante: comprobante.referenciaComprobante ? {
      tipo: comprobante.referenciaComprobante.tipo,
      serie: comprobante.referenciaComprobante.serie,
      correlativo: numero(comprobante.referenciaComprobante.correlativo),
    } : undefined,
    codigoMotivoNota: comprobante.codigoMotivoNota || undefined,
    descripcionMotivoNota: comprobante.descripcionMotivoNota || undefined,
    igvTotal: numero(comprobante.totalIgv),
    total: numero(comprobante.total),
    estadoFE,
    estadoComprobante: comprobante.estado,
    cdrObservacion: comprobante.motivoAnulacion || undefined,
    idempotencyKey: comprobante.idempotencyKey || undefined,
  } as Venta;
}

export function mapCaja(caja: any): import('../types').Caja {
  return {
    id: numero(caja.id),
    fechaApertura: caja.fechaApertura,
    fechaCierre: caja.fechaCierre || undefined,
    saldoInicial: numero(caja.saldoInicial),
    estado: caja.estado === 'ABIERTA' || caja.estado === 'Abierta' ? 'Abierta' : 'Cerrada',
    usuarioId: String(caja.usuarioId || ''),
    sucursalId: String(caja.sucursalId || ''),
    efectivoContado: caja.efectivoContado == null ? undefined : numero(caja.efectivoContado),
    diferencia: caja.diferencia == null ? undefined : numero(caja.diferencia),
  };
}
