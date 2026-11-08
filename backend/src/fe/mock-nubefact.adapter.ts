import * as crypto from 'crypto';
import { OseAdapter, OseCdrResultado, OseEnvioResultado } from './ose-adapter.interface';

/**
 * Implementacion MOCK sandbox de Nubefact.
 *
 * IMPORTANTE: NO llama a APIs reales de SUNAT ni de Nubefact.
 * El endpoint es configurable por variable de entorno (OSE_ENDPOINT)
 * y se registra a modo informativo; el adaptador siempre responde
 * de forma simulada: ACEPTADO con CDR generado localmente.
 */
export class MockNubefactAdapter implements OseAdapter {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly modoMock = true,
  ) {}

  private generarHashCdr(ruc: string, tipo: string, serie: string, correlativo: number): string {
    const base = `${ruc}|${tipo}|${serie}|${correlativo}|${new Date().toISOString()}`;
    return crypto.createHash('sha256').update(base).digest('hex');
  }

  async enviarComprobante(params: {
    tipo: string; serie: string; correlativo: number; rucEmpresa: string; xmlUbl: string;
  }): Promise<OseEnvioResultado> {
    // En modo real (OSE_MOCK=false) se levantaria la llamada HTTP aqui.
    // Por seguridad y por requerimiento del proyecto, siempre se simula.
    void params.xmlUbl;
    void this.token;
    const hashCdr = this.generarHashCdr(params.rucEmpresa, params.tipo, params.serie, params.correlativo);
    const nombreArchivoCdr = `R-${params.rucEmpresa}-${params.tipo}-${params.serie}-${String(params.correlativo).padStart(8, '0')}.zip`;
    return {
      aceptado: true,
      estado: 'ACEPTADO',
      simulado: true,
      ticket: `mock-ticket-${Date.now()}`,
      hashCdr,
      nombreArchivoCdr,
      observaciones: this.modoMock
        ? `Envio simulado (MOCK). Endpoint configurado: ${this.endpoint}`
        : 'Aceptado por SUNAT (simulado)',
      endpointUsado: this.endpoint,
    };
  }

  async consultarEstado(ticket: string, rucEmpresa: string): Promise<OseEnvioResultado> {
    void rucEmpresa;
    return {
      aceptado: true,
      estado: 'ACEPTADO',
      simulado: true,
      ticket,
      observaciones: `Consulta simulada para ticket ${ticket}`,
      endpointUsado: this.endpoint,
    };
  }

  async obtenerCDR(params: {
    tipo: string; serie: string; correlativo: number; rucEmpresa: string;
  }): Promise<OseCdrResultado> {
    const hashCdr = this.generarHashCdr(params.rucEmpresa, params.tipo, params.serie, params.correlativo);
    const nombreArchivoCdr = `R-${params.rucEmpresa}-${params.tipo}-${params.serie}-${String(params.correlativo).padStart(8, '0')}.zip`;
    return {
      existe: true,
      hashCdr,
      nombreArchivoCdr,
      contenidoBase64: Buffer.from(`CDR simulado ${nombreArchivoCdr}`).toString('base64'),
      observaciones: 'CDR simulado por adaptador MOCK',
    };
  }
}
