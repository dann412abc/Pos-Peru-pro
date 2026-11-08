import { VentasService } from './ventas.service';
import { BadRequestException } from '@nestjs/common';

/**
 * Tests del correlativo atomico. Se mockea DataSource.query para verificar
 * que se usa UPDATE ... RETURNING (row-lock => atomicidad) y los parametros.
 */
describe('Correlativo atomico por sucursal', () => {
  const crearServiceConMock = (queryMock: jest.Mock) => {
    return new VentasService(
      { findOne: jest.fn(), save: jest.fn(), create: jest.fn() } as any,
      {} as any,
      { query: queryMock } as any,
      { crearDesdeComprobante: jest.fn() } as any,
    );
  };

  test('obtiene el siguiente correlativo mediante UPDATE ... RETURNING (atomico)', async () => {
    const queryMock = jest.fn().mockResolvedValue([{ serie: 'F001', ultimo_correlativo: 25 }]);
    const service = crearServiceConMock(queryMock);
    const resultado = await service.obtenerSiguienteCorrelativo(1, '01', 'F001');
    expect(resultado.correlativo).toBe(25);
    expect(resultado.serie).toBe('F001');
    // Verifica que el SQL incrementa atomicamente y usa los parametros correctos.
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('UPDATE serie_correlativo');
    expect(sql).toContain('RETURNING');
    expect(params).toEqual([1, '01', 'F001']);
  });

  test('dos llamadas concurrentes devuelven correlativos distintos (simulado con mock secuencial)', async () => {
    const queryMock = jest.fn()
      .mockResolvedValueOnce([{ serie: 'B001', ultimo_correlativo: 1 }])
      .mockResolvedValueOnce([{ serie: 'B001', ultimo_correlativo: 2 }]);
    const service = crearServiceConMock(queryMock);
    const [r1, r2] = await Promise.all([
      service.obtenerSiguienteCorrelativo(1, '03', 'B001'),
      service.obtenerSiguienteCorrelativo(1, '03', 'B001'),
    ]);
    expect(r1.correlativo).not.toBe(r2.correlativo);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  test('lanza error si la serie no existe para esa sucursal/tipo', async () => {
    const queryMock = jest.fn().mockResolvedValue([]);
    const service = crearServiceConMock(queryMock);
    await expect(service.obtenerSiguienteCorrelativo(99, '01', 'F999'))
      .rejects.toThrow(BadRequestException);
  });
});
