/**
 * Puerto de cola de facturación. Los servicios de dominio dependen de este
 * contrato y no del SDK Bull/Redis. Un proveedor futuro puede implementar
 * este puerto con Cloudflare Queues o Supabase sin cambiar el dominio.
 */
export const FE_QUEUE_PORT = 'FE_QUEUE_PORT';
export const FE_QUEUE_NAME = 'fe-envios';

export interface FeQueueOptions {
  attempts?: number;
  backoff?: { type: 'exponential' | 'fixed'; delay: number };
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
  jobId?: string;
}

export interface FeQueuePort {
  add<T extends Record<string, unknown>>(
    name: string,
    payload: T,
    options?: FeQueueOptions,
  ): Promise<unknown>;
}
