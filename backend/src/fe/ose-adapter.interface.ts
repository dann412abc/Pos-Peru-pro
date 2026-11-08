/**
 * Interfaz del adaptador OSE (Operador de Servicios Electronicos).
 * Cualquier proveedor (Nubefact, SUNAT, etc.) debe implementarla.
 * La implementacion por defecto es MOCK (no llama APIs reales).
 */

export interface OseEnvioResultado {
  aceptado: boolean;
  estado: 'ACEPTADO' | 'RECHAZADO' | 'EN_PROCESO';
  /** Ticket de consulta (para envios asincronos). */
  ticket?: string;
  hashCdr?: string;
  nombreArchivoCdr?: string;
  observaciones?: string;
  /** Endpoint configurado (solo informativo). */
  endpointUsado: string;
  /** true si el adaptador devolvió una respuesta de prueba y no una respuesta tributaria real. */
  simulado?: boolean;
}

export interface OseCdrResultado {
  existe: boolean;
  hashCdr?: string;
  nombreArchivoCdr?: string;
  contenidoBase64?: string;
  observaciones?: string;
}

export interface OseAdapter {
  /** Envia un comprobante (XML UBL) al OSE/SUNAT. */
  enviarComprobante(params: {
    tipo: string;
    serie: string;
    correlativo: number;
    rucEmpresa: string;
    xmlUbl: string;
  }): Promise<OseEnvioResultado>;

  /** Consulta el estado de un envio mediante ticket. */
  consultarEstado(ticket: string, rucEmpresa: string): Promise<OseEnvioResultado>;

  /** Obtiene el CDR (Comprobante de Recepcion) de un comprobante aceptado. */
  obtenerCDR(params: {
    tipo: string; serie: string; correlativo: number; rucEmpresa: string;
  }): Promise<OseCdrResultado>;
}

export const OSE_ADAPTER_TOKEN = 'OSE_ADAPTER';
