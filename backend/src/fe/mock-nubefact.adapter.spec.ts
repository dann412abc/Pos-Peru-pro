import { MockNubefactAdapter } from './mock-nubefact.adapter';

describe('Adaptador OSE MOCK (Nubefact sandbox)', () => {
  const endpoint = 'https://api.nubefact.com/api/v1/sandbox';
  const adapter = new MockNubefactAdapter(endpoint, 'token_demo', true);

  test('enviarComprobante responde ACEPTADO con CDR simulado (sin llamar APIs reales)', async () => {
    const r = await adapter.enviarComprobante({
      tipo: '03', serie: 'B001', correlativo: 1, rucEmpresa: '20601234565', xmlUbl: '<Invoice/>',
    });
    expect(r.aceptado).toBe(true);
    expect(r.simulado).toBe(true);
    expect(r.estado).toBe('ACEPTADO');
    expect(r.hashCdr).toBeDefined();
    expect(r.hashCdr?.length).toBe(64); // sha256 hex
    expect(r.nombreArchivoCdr).toContain('R-20601234565-03-B001');
    expect(r.endpointUsado).toBe(endpoint);
    expect(r.observaciones).toContain('MOCK');
  });

  test('endpoint configurable por variable (se refleja en endpointUsado)', async () => {
    const otro = new MockNubefactAdapter('https://ose.ejemplo.com/api', 't2', true);
    const r = await otro.enviarComprobante({
      tipo: '01', serie: 'F001', correlativo: 7, rucEmpresa: '20601234565', xmlUbl: '<Invoice/>',
    });
    expect(r.endpointUsado).toBe('https://ose.ejemplo.com/api');
    expect(r.aceptado).toBe(true);
  });

  test('obtenerCDR devuelve CDR simulado con hash y nombre de archivo', async () => {
    const cdr = await adapter.obtenerCDR({ tipo: '01', serie: 'F001', correlativo: 1, rucEmpresa: '20601234565' });
    expect(cdr.existe).toBe(true);
    expect(cdr.hashCdr).toBeDefined();
    expect(cdr.nombreArchivoCdr).toContain('.zip');
    expect(cdr.contenidoBase64).toBeDefined();
  });
});
