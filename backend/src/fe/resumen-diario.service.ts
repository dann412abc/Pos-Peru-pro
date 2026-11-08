import { FE_QUEUE_PORT, FeQueuePort } from './queue.port';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Comprobante } from '../ventas/entities/comprobante.entity';

/**
 * Esqueleto de Resumen Diario (RC, tipo documento RESUMEN).
 * Agrupa todos los comprobantes del dia de una sucursal y los envia
 * a SUNAT en un solo lote (requerido para boletas y facturas segun regimen).
 */
@Injectable()
export class ResumenDiarioService {
  private readonly logger = new Logger(ResumenDiarioService.name);

  constructor(
    @InjectRepository(Comprobante) private readonly comprobanteRepo: Repository<Comprobante>,
    @Inject(FE_QUEUE_PORT) private readonly feQueue: FeQueuePort,
  ) {}

  async generarResumenDiario(sucursalId: number, empresaId: number, fecha: Date): Promise<{ cantidad: number; total: number; encolado: boolean }> {
    const inicio = new Date(fecha); inicio.setHours(0, 0, 0, 0);
    const fin = new Date(fecha); fin.setHours(23, 59, 59, 999);

    const comprobantes = await this.comprobanteRepo.find({
      where: { sucursalId, empresaId, fechaEmision: Between(inicio, fin) },
    });

    const total = comprobantes.reduce((s, c) => s + Number(c.total), 0);
    this.logger.log(`Resumen diario RC generado: ${comprobantes.length} comprobantes, total S/ ${total.toFixed(2)}`);

    // En produccion se genera el XML UBL de SummaryDocuments y se envia.
    await this.feQueue.add('enviar-resumen-diario', {
      sucursalId, fecha: fecha.toISOString(), cantidad: comprobantes.length, total,
    }, { attempts: 5, backoff: { type: 'exponential', delay: 5000 } });

    return { cantidad: comprobantes.length, total: +total.toFixed(2), encolado: true };
  }
}
