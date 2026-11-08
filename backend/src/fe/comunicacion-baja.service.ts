import { FE_QUEUE_PORT, FeQueuePort } from './queue.port';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Comprobante } from '../ventas/entities/comprobante.entity';
import { EstadoComprobanteEnum } from '../common/enums';

/**
 * Esqueleto de Comunicacion de Baja (RA).
 * Informa a SUNAT la anulacion de comprobantes ya emitidos.
 */
@Injectable()
export class ComunicacionBajaService {
  private readonly logger = new Logger(ComunicacionBajaService.name);

  constructor(
    @InjectRepository(Comprobante) private readonly comprobanteRepo: Repository<Comprobante>,
    @Inject(FE_QUEUE_PORT) private readonly feQueue: FeQueuePort,
  ) {}

  async generarComunicacionBaja(sucursalId: number, empresaId: number, comprobanteIds: number[], motivo: string): Promise<{ cantidad: number; encolado: boolean }> {
    const solicitados = Array.isArray(comprobanteIds) ? comprobanteIds : [];
    const ids = [...new Set(solicitados.filter((id) => Number.isInteger(id) && id > 0))];
    if (!ids.length || ids.length !== solicitados.length) {
      throw new BadRequestException('Indique IDs de comprobantes válidos y sin duplicados');
    }
    if (!motivo || motivo.trim().length < 5) throw new BadRequestException('El motivo debe tener al menos 5 caracteres');
    const comprobantes = await this.comprobanteRepo.find({ where: { id: In(ids), sucursalId, empresaId } });
    if (comprobantes.length !== ids.length) throw new BadRequestException('Uno o más comprobantes no pertenecen a la empresa o sucursal autorizada');
    if (comprobantes.some((c) => c.estado !== EstadoComprobanteEnum.ANULADA)) {
      throw new BadRequestException('La comunicación de baja solo admite comprobantes anulados previamente mediante el flujo de ventas');
    }

    this.logger.log(`Comunicacion de baja RA: ${comprobantes.length} comprobantes previamente anulados. Motivo: ${motivo.trim()}`);

    await this.feQueue.add('enviar-comunicacion-baja', {
      sucursalId, comprobanteIds: comprobantes.map((c) => c.id), motivo: motivo.trim(),
    }, { attempts: 5, backoff: { type: 'exponential', delay: 5000 } });

    return { cantidad: comprobantes.length, encolado: true };
  }
}
