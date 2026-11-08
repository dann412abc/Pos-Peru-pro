import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { FeService } from './fe.service';
import { FE_QUEUE_NAME } from './queue.port';
import { feCircuitBreaker } from './circuit-breaker';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

/**
 * Procesador de la cola Bull de envios de FE.
 *  - Backoff exponencial, max 5 intentos (configurado al encolar).
 *  - Circuit breaker: si esta OPEN, se rechaza el trabajo (reintenta despues).
 */
@Processor(FE_QUEUE_NAME)
export class FeProcessor {
  private readonly logger = new Logger(FeProcessor.name);

  constructor(
    private readonly feService: FeService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  @Process('enviar-comprobante')
  async enviarComprobante(job: Job<{ ceId: number }>): Promise<void> {
    const { ceId } = job.data;

    if (!feCircuitBreaker.permitirIntento()) {
      this.logger.warn(`Circuit breaker OPEN - se posterga envio CE #${ceId}`);
      throw new Error('Circuit breaker abierto: envios de FE temporalmente suspendidos');
    }

    try {
      await this.feService.procesarEnvio(ceId);
      feCircuitBreaker.registrarExito();
      this.logger.log(`CE #${ceId} procesado OK (intento ${job.attemptsMade + 1})`);
    } catch (err) {
      feCircuitBreaker.registrarFallo();
      const fallos = feCircuitBreaker.getFallosConsecutivos();
      this.logger.error(`Fallo envio CE #${ceId} (fallos consecutivos=${fallos}): ${(err as Error).message}`);
      // Si ya agoto los 5 intentos, marcar RECHAZADO.
      if (job.attemptsMade + 1 >= job.opts.attempts!) {
        await this.feService.marcarRechazado(ceId, `Agotados los 5 intentos de envio. Ultimo error: ${(err as Error).message}`);
      }
      throw err; // Bull aplica backoff y reintenta.
    }
  }

  /** Envio automatico de notificaciones (email) al aceptarse el comprobante (toggle por .env). */
  @Process('enviar-notificacion')
  async enviarNotificacion(job: Job<{ comprobanteId: number }>): Promise<void> {
    await this.notificaciones.enviarAutomaticoAceptado(job.data.comprobanteId);
  }
}
