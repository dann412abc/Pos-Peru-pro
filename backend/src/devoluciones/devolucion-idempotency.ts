import { createHash } from 'crypto';
import { CrearDevolucionVentaDto } from './dto/crear-devolucion.dto';
import { redondearCantidad, redondearMonto } from './devolucion-calculations';

/** Hash estable para impedir que una clave idempotente se reutilice con otra operación. */
export function hashSolicitudDevolucion(comprobanteId: number, dto: CrearDevolucionVentaDto): string {
  const contenido = {
    comprobanteId: Number(comprobanteId),
    motivo: String(dto.motivo || '').trim(),
    lineas: [...(dto.lineas || [])].map((l) => ({
      comprobanteLineaId: Number(l.comprobanteLineaId),
      cantidad: redondearCantidad(Number(l.cantidad)),
      reingresarStock: Boolean(l.reingresarStock),
    })).sort((a, b) => a.comprobanteLineaId - b.comprobanteLineaId),
    pagos: [...(dto.pagos || [])].map((p) => ({
      metodoPago: p.metodoPago,
      monto: redondearMonto(Number(p.monto)),
      referencia: (p.referencia || '').trim(),
    })).sort((a, b) => `${a.metodoPago}:${a.monto}:${a.referencia}`.localeCompare(`${b.metodoPago}:${b.monto}:${b.referencia}`)),
  };
  return createHash('sha256').update(JSON.stringify(contenido)).digest('hex');
}
