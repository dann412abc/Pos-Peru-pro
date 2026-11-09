import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'caja.service.ts'), 'utf8');

describe('CajaService.registrarMovimiento - efectivo disponible', () => {
  it('incluye pagos detallados y comprobantes antiguos sin desglose', () => {
    expect(source).toContain("if (dto.tipo === 'SALIDA' && dto.metodoPago === MetodoPagoEnum.EFECTIVO)");
    expect(source).toContain("cp.metodo_pago = 'EFECTIVO'");
    expect(source).toContain("c.metodo_pago = 'EFECTIVO'");
    expect(source).toContain('UNION ALL');
    expect(source).toContain('NOT EXISTS (');
    expect(source).toContain('SELECT 1 FROM comprobante_pago cp WHERE cp.comprobante_id = c.id');
  });

  it('conserva el efectivo físico de ventas anuladas y descuenta salidas de caja', () => {
    const start = source.indexOf('async registrarMovimiento(');
    const end = source.indexOf('\n  async listarMovimientos(', start);
    const method = source.slice(start, end > start ? end : undefined);
    expect(start).toBeGreaterThan(-1);
    expect(method).toContain('FROM comprobante c');
    expect(method).not.toContain("c.estado <> 'ANULADA'");
    expect(method).toContain("CASE WHEN tipo = 'INGRESO' THEN monto ELSE -monto END");
    expect(method).toContain('caja_movimiento WHERE caja_id = $1 AND metodo_pago = \'EFECTIVO\'');
    expect(method).toContain('Number(ventas[0]?.total || 0)');
    expect(method).toContain('Number(movimientos[0]?.total || 0)');
  });
});
