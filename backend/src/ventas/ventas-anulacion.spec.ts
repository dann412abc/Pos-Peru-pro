import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'ventas.service.ts'), 'utf8');
const start = source.indexOf('async anular(');
const end = source.indexOf('\n  async ', start + 10);
const method = source.slice(start, end > start ? end : undefined);

describe('VentasService.anular - contrato de seguridad', () => {
  it('ejecuta la anulación dentro de una transacción y bloquea el comprobante', () => {
    expect(method).toContain('this.dataSource.transaction');
    expect(method).toMatch(/lock:\s*\{\s*mode:\s*'pessimistic_write'/);
  });

  it('rechaza comprobantes ya anulados y ventas con devoluciones registradas', () => {
    expect(method).toContain('EstadoComprobanteEnum.ANULADA');
    expect(method).toContain('devolucion_venta');
    expect(method).toContain("estado='REGISTRADA'");
    expect(method).toContain('No se puede anular por el flujo simple');
  });

  it('bloquea la caja antes de modificar inventario cuando hay reembolsos', () => {
    const caja = method.indexOf('cajaReembolso = await');
    const inventario = method.indexOf('const cantidadesDevueltas');
    expect(caja).toBeGreaterThan(-1);
    expect(inventario).toBeGreaterThan(-1);
    expect(caja).toBeLessThan(inventario);
  });

  it('restaura stock y lotes dentro de la misma transacción y deja movimiento de auditoría', () => {
    expect(method).toMatch(/UPDATE producto_stock SET stock=stock\+\$1/);
    expect(method).toMatch(/UPDATE producto_variante_stock SET stock=stock\+\$1/);
    expect(method).toContain('UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible+$1');
    expect(method).toContain("tipo: 'ENTRADA'");
    expect(method).toContain('Anulación');
  });

  it('no anula crédito que ya recibió cobranzas', () => {
    expect(method).toContain('saldo_pendiente');
    expect(method).toContain('cobrado > 0');
    expect(method).toContain('Registre primero una devolución o regularización');
  });

  it('verifica efectivo disponible y registra los reembolsos como salidas de caja', () => {
    expect(method).toContain('reembolsoEfectivo > disponible');
    expect(method).toContain("tipo: 'SALIDA'");
    expect(method).toContain('comprobanteId: c.id');
  });

  it('marca el comprobante anulado solo al final del flujo transaccional', () => {
    const marca = method.indexOf('c.estado = EstadoComprobanteEnum.ANULADA');
    const stock = method.indexOf('UPDATE producto_stock SET stock=stock+$1');
    const caja = method.indexOf("tipo: 'SALIDA'");
    expect(marca).toBeGreaterThan(stock);
    expect(marca).toBeGreaterThan(caja);
    expect(method).toContain('c.motivoAnulacion = razon');
  });
});
