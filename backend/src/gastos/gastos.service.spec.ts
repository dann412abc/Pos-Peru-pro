import { GastosService } from './gastos.service';

describe('GastosService: estado de resultados y devoluciones', () => {
  it('no vuelve a descontar la nota de crédito vinculada a una devolución ya descontada de la venta original', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const service = new GastosService(dataSource as any);
    await service.estadoResultados(1, [2], undefined, '2026-01-01', '2026-01-31');
    const consultaVentas = dataSource.query.mock.calls[0][0] as string;
    expect(consultaVentas).toContain("AND NOT (c.tipo='07' AND c.devolucion_venta_id IS NOT NULL)");
  });
});
