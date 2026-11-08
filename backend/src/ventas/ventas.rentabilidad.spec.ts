import { VentasService } from './ventas.service';

describe('VentasService: rentabilidad por producto', () => {
  it('calcula productos desde boletas/facturas y resta devoluciones registradas', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const service = new VentasService({} as any, {} as any, dataSource as any, {} as any);
    await service.reporteRentabilidad(1, [2]);
    const consulta = dataSource.query.mock.calls[0][0] as string;
    expect(consulta).toContain("AND c.tipo IN ('01','03')");
    expect(consulta).toContain('devolucion_venta_linea');
  });
});
