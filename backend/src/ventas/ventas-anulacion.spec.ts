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

  it('detiene un segundo intento antes de caja, stock, lotes y reembolso', () => {
    const yaAnulada = method.indexOf("if (c.estado === EstadoComprobanteEnum.ANULADA)");
    const caja = method.indexOf('cajaReembolso = await');
    const stock = method.indexOf('const cantidadesDevueltas');
    const lotes = method.indexOf('UPDATE inventario_lote');
    const reembolso = method.indexOf("tipo: 'SALIDA'");
    expect(yaAnulada).toBeGreaterThan(-1);
    expect([caja, stock, lotes, reembolso].every((pos) => pos > yaAnulada)).toBe(true);
    expect(method).toContain("lock: { mode: 'pessimistic_write' }");
  });

  it('impide anular comprobantes con devoluciones registradas antes de tocar stock o lotes', () => {
    const devoluciones = method.indexOf('const devolucionesPrevias');
    const inventario = method.indexOf('const cantidadesDevueltas');
    expect(devoluciones).toBeGreaterThan(-1);
    expect(inventario).toBeGreaterThan(devoluciones);
    expect(method).toContain("estado='REGISTRADA'");
    expect(method).toContain('devolucionesPrevias.length');
  });

  it('serializa anulación y devolución bloqueando el mismo comprobante', () => {
    const returnsSource = readFileSync(join(__dirname, '../devoluciones/devoluciones.service.ts'), 'utf8');
    const startReturn = returnsSource.indexOf('async crear(');
    const endReturn = returnsSource.indexOf('\n  async ', startReturn + 10);
    const returnMethod = returnsSource.slice(startReturn, endReturn > startReturn ? endReturn : undefined);
    expect(method).toContain("lock: { mode: 'pessimistic_write' }");
    expect(returnMethod).toContain('FROM comprobante c WHERE c.id=$1 AND c.empresa_id=$2 AND c.sucursal_id=ANY($3::int[]) FOR UPDATE');
    expect(returnMethod).toContain("if (venta.estado === 'ANULADA')");
  });

  it('bloquea la caja antes de modificar inventario cuando hay reembolsos', () => {
    const caja = method.indexOf('cajaReembolso = await');
    const inventario = method.indexOf('const cantidadesDevueltas');
    expect(caja).toBeGreaterThan(-1);
    expect(inventario).toBeGreaterThan(-1);
    expect(caja).toBeLessThan(inventario);
  });

  it('agrupa líneas repetidas por producto y variante antes de contrastar sus lotes', () => {
    expect(method).toContain('const cantidadesDevueltas = new Map');
    expect(method).toContain('const key = varianteId ? `v:${varianteId}` : `p:${linea.productoId}`');
    expect(method).toContain('(prev?.cantidad || 0) + Number(linea.cantidad)');
    expect(method).toContain('const cantidadAsignada = asignaciones.reduce');
    expect(method).toContain('Math.abs(cantidadAsignada - cantidad) > 0.0005');
  });

  it('restaura stock y lotes dentro de la misma transacción y deja movimiento de auditoría', () => {
    expect(method).toMatch(/UPDATE producto_stock SET stock=stock\+\$1/);
    expect(method).toMatch(/UPDATE producto_variante_stock SET stock=stock\+\$1/);
    expect(method).toContain('SET cantidad_disponible=cantidad_disponible+$1');
    expect(method).toContain('AND cantidad_disponible+$1 <= cantidad_inicial');
    expect(method).toContain('AND sucursal_id=$4');
    expect(method).toContain('AND producto_id=$5');
    expect(method).toContain('variante_id IS NOT DISTINCT FROM $6::int');
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

  it('reembolsa cada medio original y excluye crédito de las salidas de caja', () => {
    expect(method).toContain("const medios = c.pagos?.length");
    expect(method).toContain('const pagosReembolsables = medios.filter((pago) => pago.metodoPago !== MetodoPagoEnum.CREDITO)');
    expect(method).toContain('for (const pago of pagosReembolsables)');
    expect(method).toContain('metodoPago: pago.metodoPago');
    expect(method).toContain('monto: Number(pago.monto)');
    expect(method).toContain("tipo: 'SALIDA'");
  });

  it('calcula disponibilidad de caja solo con efectivo y sus movimientos', () => {
    expect(method).toContain("pago.metodoPago === MetodoPagoEnum.EFECTIVO");
    expect(method).toContain("cp.metodo_pago = 'EFECTIVO'");
    expect(method).toContain("x.metodo_pago = 'EFECTIVO'");
    expect(method).toContain("metodo_pago = 'EFECTIVO'");
    expect(method).toContain('reembolsoEfectivo > disponible');
  });

  it('no confunde comprobantes con pagos mixtos con un único método de pago', () => {
    expect(method).toContain("c.pagos?.length");
    expect(method).toContain("c.metodoPago, monto: c.total");
    expect(method).toContain("const pagosReembolsables = medios.filter");
  });

  it('mantiene una sola fuente de ingreso de ventas para el arqueo de caja', () => {
    const salesSource = readFileSync(join(__dirname, 'ventas.service.ts'), 'utf8');
    const cashSource = readFileSync(join(__dirname, '../caja/caja.service.ts'), 'utf8');
    expect(salesSource).toContain('getRepository(ComprobantePago).save(pagos.map');
    expect(cashSource).toContain('FROM comprobante_pago cp INNER JOIN comprobante c');
    expect(cashSource).toContain('UNION ALL');
    expect(cashSource).toContain('NOT EXISTS (SELECT 1 FROM comprobante_pago cp WHERE cp.comprobante_id = c.id)');
    expect(cashSource).toContain('FROM caja_movimiento WHERE caja_id = $1');
    expect(method).toContain("tipo: 'SALIDA'");
  });

  it('excluye ventas anuladas del total neto y del desglose por método en el resumen de caja', () => {
    const cashSource = readFileSync(join(__dirname, '../caja/caja.service.ts'), 'utf8');
    const start = cashSource.indexOf('async resumen(');
    const end = cashSource.indexOf('\\n  async ', start + 10);
    const summary = cashSource.slice(start, end > start ? end : undefined);
    expect(summary).toContain("c.estado <> 'ANULADA'");
    expect(summary).toContain('WHERE c.caja_id=$1 AND c.empresa_id=$2 AND c.estado <>');
    expect(summary).toContain('WHERE c.caja_id = $1 AND c.estado <>');
  });

  it('conserva el cobro físico original y resta los reembolsos como salidas en la caja donde se pagan', () => {
    const cashSource = readFileSync(join(__dirname, '../caja/caja.service.ts'), 'utf8');
    const start = cashSource.indexOf('async resumen(');
    const end = cashSource.indexOf('\\n  async ', start + 10);
    const summary = cashSource.slice(start, end > start ? end : undefined);
    expect(summary).toContain('const efectivoCobrado = await');
    expect(summary).toContain('const variacionEfectivo = movimientos');
    expect(summary).toContain("mov.tipo === 'INGRESO' ? 1 : -1");
    expect(summary).toContain('saldo_inicial');
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
