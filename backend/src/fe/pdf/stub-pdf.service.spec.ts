import { StubPdfService } from './stub-pdf.service';
import { ComprobanteElectronico } from '../entities/comprobante-electronico.entity';
import { EstadoFeEnum } from '../../common/enums';

describe('Stub PDF representante (58mm/80mm/A5)', () => {
  const service = new StubPdfService();

  const ce = (): ComprobanteElectronico => ({
    id: 1, comprobanteId: 10, estadoActual: EstadoFeEnum.ACEPTADO,
    xmlUblPath: null, hashCdr: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc123',
    nombreArchivoCdr: 'R-20601234565-03-B001-00000001.zip', intentosEnvio: 0,
    createdAt: new Date(), eventos: [],
  } as any);

  test('genera un Buffer que empieza con la cabecera %PDF (PDF 1.4 valido)', async () => {
    const pdf = await service.generarPdf(ce(), '80mm');
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.toString('binary').startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.toString('binary')).toContain('%%EOF');
  });

  test('incluye marca Mi Carrito POS y el numero de comprobante en el contenido', async () => {
    const pdf = await service.generarPdf(ce(), '58mm');
    const texto = pdf.toString('binary');
    expect(texto).toContain('Mi Carrito POS');
    expect(texto).toContain('comprobante #10');
  });

  test('los 3 formatos producen PDFs distintos (con el formato en el texto)', async () => {
    const p58 = (await service.generarPdf(ce(), '58mm')).toString('binary');
    const p80 = (await service.generarPdf(ce(), '80mm')).toString('binary');
    const pA5 = (await service.generarPdf(ce(), 'A5')).toString('binary');
    expect(p58).toContain('Formato: 58mm');
    expect(p80).toContain('Formato: 80mm');
    expect(pA5).toContain('Formato: A5');
  });
});
