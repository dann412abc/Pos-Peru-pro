import { construirAlertasOperativas } from './alertas-operativas.builder';

describe('construirAlertasOperativas', () => {
  it('clasifica stock agotado como crítico y stock bajo como advertencia', () => {
    const items = construirAlertasOperativas({ stockBajo: [
      { id: 1, codigo: 'A', nombre: 'Arroz', stock: 0, stockMinimo: 5, sucursalNombre: 'Centro', sucursalId: 10 },
      { id: 2, codigo: 'B', nombre: 'Azúcar', stock: 2, stockMinimo: 5, sucursalNombre: 'Centro', sucursalId: 11 },
    ] });
    expect(items.map(x => x.nivel)).toEqual(['critica', 'advertencia']);
    expect(items.every(x => x.destino === '/productos')).toBe(true);
    expect(items.map(x => x.sucursalId)).toEqual([10, 11]);
    expect(items[0].clave).not.toBe(items[1].clave);
  });

  it('crea alertas financieras y no crea alertas para indicadores sin incidencias', () => {
    const items = construirAlertasOperativas({
      finanzas: { cuentasPorCobrar: { vencidas: 2, vencido: 120 }, gastosPendientes: { cantidad: 0, total: 0, vencido: 0 } },
      cajas: { abiertas: 0, saldoInicial: 0 }, rentabilidad: { lineasSinCosto: 0 },
    });
    expect(items).toHaveLength(1);
    expect(items[0].clave).toBe('cxc-vencidas');
  });

  it('genera claves válidas para persistencia', () => {
    const items = construirAlertasOperativas({ stockBajo: [
      { id: 8, codigo: 'X', nombre: 'Leche', stock: -1, stockMinimo: 2, sucursalNombre: 'A/B #1', sucursalId: 4 },
    ] });
    expect(items[0].clave).toMatch(/^[a-zA-Z0-9:_-]+$/);
    expect(items[0].clave.length).toBeLessThanOrEqual(160);
  });
});
