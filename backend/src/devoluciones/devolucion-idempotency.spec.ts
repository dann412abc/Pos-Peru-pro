import { hashSolicitudDevolucion } from './devolucion-idempotency';
import { CrearDevolucionVentaDto } from './dto/crear-devolucion.dto';

describe('Idempotencia de devoluciones', () => {
  const base: CrearDevolucionVentaDto = {
    motivo: 'Producto defectuoso', idempotencyKey: 'devolucion-123',
    lineas: [
      { comprobanteLineaId: 12, cantidad: 1.000, reingresarStock: true },
      { comprobanteLineaId: 10, cantidad: 2, reingresarStock: false },
    ],
    pagos: [
      { metodoPago: 'YAPE', monto: 10, referencia: ' OP-01 ' },
      { metodoPago: 'EFECTIVO', monto: 5 },
    ],
  };

  it('genera el mismo hash al reordenar líneas y pagos', () => {
    const reordered: CrearDevolucionVentaDto = {
      ...base, lineas: [...base.lineas].reverse(), pagos: [...base.pagos!].reverse(),
    };
    expect(hashSolicitudDevolucion(100, base)).toBe(hashSolicitudDevolucion(100, reordered));
  });

  it('incluye el comprobante original en la identidad de la operación', () => {
    expect(hashSolicitudDevolucion(100, base)).not.toBe(hashSolicitudDevolucion(101, base));
  });

  it('detecta cambios en cantidad, reposición, motivo y reembolso', () => {
    const variants: CrearDevolucionVentaDto[] = [
      { ...base, motivo: 'Otro motivo' },
      { ...base, lineas: [{ ...base.lineas[0], cantidad: 1.5 }, base.lineas[1]] },
      { ...base, lineas: [{ ...base.lineas[0], reingresarStock: false }, base.lineas[1]] },
      { ...base, pagos: [{ metodoPago: 'YAPE', monto: 11, referencia: 'OP-01' }, { metodoPago: 'EFECTIVO', monto: 4 }] },
    ];
    for (const variant of variants) {
      expect(hashSolicitudDevolucion(100, base)).not.toBe(hashSolicitudDevolucion(100, variant));
    }
  });

  it('normaliza espacios y redondeo monetario/cantidad', () => {
    const normalized: CrearDevolucionVentaDto = {
      ...base, motivo: ' Producto defectuoso ',
      lineas: [
        { comprobanteLineaId: 12, cantidad: 1, reingresarStock: true },
        { comprobanteLineaId: 10, cantidad: 2.000, reingresarStock: false },
      ],
      pagos: [
        { metodoPago: 'YAPE', monto: 10.001, referencia: 'OP-01' },
        { metodoPago: 'EFECTIVO', monto: 5, referencia: '' },
      ],
    };
    expect(hashSolicitudDevolucion(100, base)).toBe(hashSolicitudDevolucion(100, normalized));
  });
});
