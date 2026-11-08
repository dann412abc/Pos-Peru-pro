import { FE_QUEUE_NAME, FE_QUEUE_PORT, FeQueuePort } from './queue.port';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { ComprobanteElectronico } from './entities/comprobante-electronico.entity';
import { FeEvento } from './entities/fe-evento.entity';
import { Comprobante } from '../ventas/entities/comprobante.entity';
import { Empresa } from '../empresas/entities/empresa.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { EstadoFeEnum } from '../common/enums';
import { generarXmlUbl, DatosComprobanteFe } from './xml-ubl.generator';
import { OSE_ADAPTER_TOKEN, OseAdapter } from './ose-adapter.interface';

/**
 * Servicio de facturacion electronica.
 * Gestiona el agregado ComprobanteElectronico con event-sourcing de estados:
 *   CREADO -> FIRMADO -> ENVIADO -> ACEPTADO / RECHAZADO
 */
@Injectable()
export class FeService {
  private readonly logger = new Logger(FeService.name);

  constructor(
    @InjectRepository(ComprobanteElectronico)
    private readonly ceRepo: Repository<ComprobanteElectronico>,
    @InjectRepository(FeEvento)
    private readonly eventoRepo: Repository<FeEvento>,
    private readonly dataSource: DataSource,
    @Inject(OSE_ADAPTER_TOKEN) private readonly ose: OseAdapter,
    @Inject(FE_QUEUE_PORT) private readonly feQueue: FeQueuePort,
    @Inject('FE_XML_DIR') private readonly xmlDir: string,
  ) {}

  private async registrarEvento(
    ceId: number,
    estado: EstadoFeEnum,
    observaciones?: string,
    hashCdr?: string,
    nombreArchivoCdr?: string,
  ): Promise<FeEvento> {
    const evento = this.eventoRepo.create({ comprobanteElectronicoId: ceId, estado, observaciones, hashCdr, nombreArchivoCdr });
    return this.eventoRepo.save(evento);
  }

  /** Crea el agregado FE (estado CREADO), genera XML UBL y encola el envio. */
  async crearDesdeComprobante(comprobanteId: number, empresaId: number, sucursalIds: number[]): Promise<ComprobanteElectronico> {
    const comprobante = await this.obtenerComprobanteAutorizado(comprobanteId, empresaId, sucursalIds, ['lineas','referenciaComprobante']);
    if (!comprobante) throw new NotFoundException(`Comprobante ${comprobanteId} no encontrado`);

    const existe = await this.ceRepo.findOne({ where: { comprobanteId } });
    if (existe) return existe;

    const datosFe = await this.construirDatosFe(comprobante);
    const xml = generarXmlUbl(datosFe);

    fs.mkdirSync(this.xmlDir, { recursive: true });
    const nombreXml = `${datosFe.empresa.ruc}-${datosFe.tipo}-${datosFe.serie}-${String(datosFe.correlativo).padStart(8, '0')}.xml`;
    const xmlPath = path.join(this.xmlDir, nombreXml);
    fs.writeFileSync(xmlPath, xml, 'utf-8');

    const ce = await this.ceRepo.save(this.ceRepo.create({
      comprobanteId,
      estadoActual: EstadoFeEnum.CREADO,
      xmlUblPath: xmlPath,
    }));
    await this.registrarEvento(ce.id, EstadoFeEnum.CREADO, `XML UBL 2.1 generado: ${nombreXml}`);

    // Encolar envio (Bull, backoff exponencial, max 5 intentos).
    await this.feQueue.add('enviar-comprobante', { ceId: ce.id }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    this.logger.log(`Comprobante FE #${ce.id} encolado para envio (comprobante ${comprobanteId})`);
    return ce;
  }

  async reenviarComprobante(comprobanteId: number, empresaId: number, sucursalIds: number[]): Promise<ComprobanteElectronico> {
    await this.obtenerComprobanteAutorizado(comprobanteId, empresaId, sucursalIds);
    const existente = await this.ceRepo.findOne({ where: { comprobanteId } });
    if (!existente) return this.crearDesdeComprobante(comprobanteId, empresaId, sucursalIds);
    if (existente.estadoActual !== EstadoFeEnum.RECHAZADO) {
      throw new BadRequestException(`El comprobante electrónico está en estado ${existente.estadoActual}; solo se permite reintentar uno RECHAZADO`);
    }
    if (!existente.xmlUblPath || !fs.existsSync(existente.xmlUblPath)) {
      throw new BadRequestException('No existe el XML UBL original; regenere el comprobante electrónico desde un proceso administrativo');
    }
    existente.estadoActual = EstadoFeEnum.CREADO;
    existente.intentosEnvio = 0;
    const guardado = await this.ceRepo.save(existente);
    await this.registrarEvento(guardado.id, EstadoFeEnum.CREADO, 'Reintento manual solicitado por un administrador');
    await this.feQueue.add('enviar-comprobante', { ceId: guardado.id }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
      jobId: `reintento-fe-${guardado.id}-${Date.now()}`,
    });
    return guardado;
  }

  private async construirDatosFe(comprobante: Comprobante): Promise<DatosComprobanteFe> {
    const empresa = await this.dataSource.getRepository(Empresa).findOneOrFail({ where: { id: comprobante.empresaId } });
    const cliente = await this.dataSource.getRepository(Cliente).findOneOrFail({ where: { id: comprobante.clienteId } });
    const lineas = comprobante.lineas.map((l) => ({
      numeroLinea: l.numeroLinea,
      cantidad: Number(l.cantidad),
      unidad: 'NIU',
      descripcion: `Producto #${l.productoId}`,
      precioUnitario: Number(l.precioUnitario),
      descuento: Number(l.descuento),
      tipoIgv: l.tipoIgv as any,
      baseImponible: Number(l.baseImponible),
      igv: Number(l.igv),
      subtotal: Number(l.subtotal),
    }));
    return {
      tipo: comprobante.tipo,
      serie: comprobante.serie,
      correlativo: comprobante.correlativo,
      fechaEmision: comprobante.fechaEmision,
      empresa: {
        ruc: empresa.ruc, razonSocial: empresa.razonSocial, nombreComercial: empresa.nombreComercial,
        direccion: empresa.direccion, ubigeo: empresa.ubigeo, departamento: empresa.departamento,
        provincia: empresa.provincia, distrito: empresa.distrito,
      },
      cliente: { tipoDoc: cliente.tipoDoc, numero: cliente.numero, nombre: cliente.nombre, direccion: cliente.direccion },
      lineas,
      opGravadas: Number(comprobante.opGravadas),
      opExoneradas: Number(comprobante.opExoneradas),
      opInafectas: Number(comprobante.opInafectas),
      descuentoGlobal: Number(comprobante.descuentoGlobal),
      totalIgv: Number(comprobante.totalIgv),
      total: Number(comprobante.total),
      referencia: comprobante.referenciaComprobante ? {
        tipo: comprobante.referenciaComprobante.tipo,
        serie: comprobante.referenciaComprobante.serie,
        correlativo: comprobante.referenciaComprobante.correlativo,
      } : undefined,
      codigoMotivoNota: comprobante.codigoMotivoNota || undefined,
      descripcionMotivoNota: comprobante.descripcionMotivoNota || undefined,
    };
  }

  /** Llamado por el procesador Bull: firma (simulada), envia via OSE, actualiza estados. */
  async procesarEnvio(ceId: number): Promise<void> {
    const ce = await this.ceRepo.findOne({ where: { id: ceId } });
    if (!ce) throw new NotFoundException(`Comprobante electronico ${ceId} no encontrado`);
    ce.intentosEnvio += 1;

    // Estado FIRMADO (firma digital simulada; el OSE la aplica en la realidad).
    if (ce.estadoActual === EstadoFeEnum.CREADO) {
      ce.estadoActual = EstadoFeEnum.FIRMADO;
      await this.registrarEvento(ce.id, EstadoFeEnum.FIRMADO, 'Firma digital aplicada (simulada)');
    }

    const comprobante = await this.dataSource.getRepository(Comprobante).findOneOrFail({ where: { id: ce.comprobanteId } });
    const empresa = await this.dataSource.getRepository(Empresa).findOneOrFail({ where: { id: comprobante.empresaId } });
    if (!ce.xmlUblPath) throw new Error(`XML UBL no generado para el comprobante electronico ${ceId}`);
    const xml = fs.readFileSync(ce.xmlUblPath, 'utf-8');

    ce.estadoActual = EstadoFeEnum.ENVIADO;
    // Persistir el intento antes de llamar al proveedor: los timeouts también deben quedar auditados.
    await this.ceRepo.save(ce);
    await this.registrarEvento(ce.id, EstadoFeEnum.ENVIADO, `Envio a OSE (intento ${ce.intentosEnvio})`);

    const resultado = await this.ose.enviarComprobante({
      tipo: comprobante.tipo, serie: comprobante.serie, correlativo: comprobante.correlativo,
      rucEmpresa: empresa.ruc, xmlUbl: xml,
    });

    ce.esSimulacion = resultado.simulado === true;
    if (resultado.aceptado) {
      ce.estadoActual = EstadoFeEnum.ACEPTADO;
      ce.hashCdr = resultado.hashCdr ?? null;
      ce.nombreArchivoCdr = resultado.nombreArchivoCdr ?? null;
      await this.registrarEvento(ce.id, EstadoFeEnum.ACEPTADO, ce.esSimulacion ? `PRUEBA SIMULADA: ${resultado.observaciones || 'sin respuesta de SUNAT'}` : resultado.observaciones, resultado.hashCdr, resultado.nombreArchivoCdr);
      // Nunca enviar al cliente un comprobante que solo fue aceptado por el adaptador de pruebas.
      if (!ce.esSimulacion) {
        await this.feQueue.add('enviar-notificacion', { comprobanteId: ce.comprobanteId }, {
          attempts: 3, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: true,
        });
      } else {
        this.logger.warn(`CE #${ce.id}: aceptación simulada; se omiten las notificaciones automáticas al cliente.`);
      }
    } else {
      ce.estadoActual = EstadoFeEnum.RECHAZADO;
      await this.registrarEvento(ce.id, EstadoFeEnum.RECHAZADO, resultado.observaciones);
    }
    await this.ceRepo.save(ce);
  }

  async marcarRechazado(ceId: number, observaciones: string): Promise<void> {
    const ce = await this.ceRepo.findOne({ where: { id: ceId } });
    if (!ce) return;
    ce.estadoActual = EstadoFeEnum.RECHAZADO;
    await this.ceRepo.save(ce);
    await this.registrarEvento(ce.id, EstadoFeEnum.RECHAZADO, observaciones);
  }

  private async obtenerComprobanteAutorizado(
    comprobanteId: number, empresaId: number, sucursalIds: number[], relations: string[] = [],
  ): Promise<Comprobante> {
    if (!Number.isInteger(empresaId) || empresaId <= 0 || !sucursalIds?.length) {
      throw new NotFoundException('Comprobante no encontrado');
    }
    const comprobante = await this.dataSource.getRepository(Comprobante).findOne({
      where: { id: comprobanteId, empresaId, sucursalId: In(sucursalIds) },
      relations,
    });
    if (!comprobante) throw new NotFoundException('Comprobante no encontrado');
    return comprobante;
  }

  async validarAccesoComprobante(comprobanteId: number, empresaId: number, sucursalIds: number[]): Promise<void> {
    await this.obtenerComprobanteAutorizado(comprobanteId, empresaId, sucursalIds);
  }

  async findAll(empresaId: number, sucursalIds: number[]): Promise<ComprobanteElectronico[]> {
    if (!sucursalIds?.length) return [];
    return this.ceRepo.createQueryBuilder('ce')
      .innerJoin('ce.comprobante', 'c')
      .leftJoinAndSelect('ce.eventos', 'evento')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('c.sucursalId IN (:...sucursalIds)', { sucursalIds })
      .orderBy('ce.id', 'DESC').take(100).getMany();
  }

  async findOne(id: number, empresaId: number, sucursalIds: number[]): Promise<ComprobanteElectronico> {
    if (!sucursalIds?.length) throw new NotFoundException('Comprobante electronico no encontrado');
    const ce = await this.ceRepo.createQueryBuilder('ce')
      .innerJoin('ce.comprobante', 'c')
      .leftJoinAndSelect('ce.eventos', 'evento')
      .where('ce.id = :id', { id })
      .andWhere('c.empresaId = :empresaId', { empresaId })
      .andWhere('c.sucursalId IN (:...sucursalIds)', { sucursalIds })
      .getOne();
    if (!ce) throw new NotFoundException('Comprobante electronico no encontrado');
    return ce;
  }
}
