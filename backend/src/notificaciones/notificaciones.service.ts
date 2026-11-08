import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CanalNotificacionEnum, EnvioNotificacion, EstadoEnvioNotificacionEnum,
} from './entities/envio-notificacion.entity';
import { EmailService } from './email.service';
import { WhatsappService } from './whatsapp.service';
import { Comprobante } from '../ventas/entities/comprobante.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { ComprobanteElectronico } from '../fe/entities/comprobante-electronico.entity';
import { PDF_GENERADOR_TOKEN, GeneradorPdfInterface } from '../fe/pdf/generador-pdf.interface';
import { AlertaOperativa } from './entities/alerta-operativa.entity';
import { AlertaOperativaDto } from './dto/sincronizar-alertas.dto';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { GastosService } from '../gastos/gastos.service';
import { construirAlertasOperativas } from './alertas-operativas.builder';

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    @InjectRepository(EnvioNotificacion) private readonly envioRepo: Repository<EnvioNotificacion>,
    @InjectRepository(AlertaOperativa) private readonly alertaRepo: Repository<AlertaOperativa>,
    private readonly dataSource: DataSource,
    @InjectRepository(Comprobante) private readonly comprobanteRepo: Repository<Comprobante>,
    @InjectRepository(Cliente) private readonly clienteRepo: Repository<Cliente>,
    @InjectRepository(ComprobanteElectronico) private readonly ceRepo: Repository<ComprobanteElectronico>,
    @InjectRepository(Usuario) private readonly usuarioRepo: Repository<Usuario>,
    private readonly gastosService: GastosService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsappService,
    private readonly config: ConfigService,
    @Inject(PDF_GENERADOR_TOKEN) private readonly pdfGenerator: GeneradorPdfInterface,
  ) {}

  private async cargarComprobanteYCliente(comprobanteId: number) {
    const comprobante = await this.comprobanteRepo.findOne({ where: { id: comprobanteId } });
    if (!comprobante) throw new NotFoundException(`Comprobante ${comprobanteId} no encontrado`);
    const cliente = await this.clienteRepo.findOne({ where: { id: comprobante.clienteId } });
    return { comprobante, cliente };
  }

  private async registrar(
    comprobanteId: number, canal: CanalNotificacionEnum, destino: string,
    estado: EstadoEnvioNotificacionEnum, simulado: boolean, mensajeError?: string,
  ): Promise<EnvioNotificacion> {
    return this.envioRepo.save(this.envioRepo.create({
      comprobanteId, canal, destino, estado, simulado, mensajeError: mensajeError ?? null,
    }));
  }

  private async exigirComprobanteElectronicoReal(comprobanteId: number): Promise<ComprobanteElectronico> {
    const ce = await this.ceRepo.findOne({ where: { comprobanteId } });
    if (!ce || ce.estadoActual !== 'ACEPTADO' || ce.esSimulacion) {
      throw new BadRequestException('No se puede enviar como comprobante electrónico: no existe una aceptación real de SUNAT/OSE.');
    }
    return ce;
  }

  async enviarEmail(comprobanteId: number, emailOpcional?: string): Promise<EnvioNotificacion> {
    const { comprobante, cliente } = await this.cargarComprobanteYCliente(comprobanteId);
    const ce = await this.exigirComprobanteElectronicoReal(comprobanteId);
    if (this.pdfGenerator.esStub) {
      throw new BadRequestException('El generador PDF actual es provisional. Instale una representación impresa completa antes de enviar comprobantes por correo.');
    }
    const destino = emailOpcional || cliente?.email;
    if (!destino) {
      throw new BadRequestException('El cliente no tiene email y no se indico uno en la peticion');
    }
    // Generar la representación impresa completa para adjuntar.
    let pdfBuffer: Buffer | undefined;
    const formato = (this.config.get<string>('fe.formatoTicketDefault') as any) || '80mm';
    pdfBuffer = await this.pdfGenerator.generarPdf(ce, formato);
    const resultado = await this.emailService.enviarComprobante(
      comprobante, destino, pdfBuffer, `comprobante-${comprobante.serie}-${comprobante.correlativo}.pdf`,
    );
    return this.registrar(
      comprobanteId, CanalNotificacionEnum.EMAIL, destino,
      resultado.enviado ? EstadoEnvioNotificacionEnum.ENVIADO : EstadoEnvioNotificacionEnum.FALLIDO,
      resultado.simulado, resultado.error,
    );
  }

  async enviarWhatsapp(comprobanteId: number, numeroOpcional?: string): Promise<EnvioNotificacion> {
    const { comprobante, cliente } = await this.cargarComprobanteYCliente(comprobanteId);
    await this.exigirComprobanteElectronicoReal(comprobanteId);
    const destino = numeroOpcional || cliente?.telefono;
    if (!destino) {
      throw new BadRequestException('El cliente no tiene telefono y no se indico uno en la peticion');
    }
    const resultado = await this.whatsappService.enviarComprobante(comprobante, destino);
    return this.registrar(
      comprobanteId, CanalNotificacionEnum.WHATSAPP, resultado.numeroFormateado || destino,
      resultado.enviado ? EstadoEnvioNotificacionEnum.ENVIADO : EstadoEnvioNotificacionEnum.FALLIDO,
      resultado.simulado, resultado.error,
    );
  }

  /** Envio automatico cuando el comprobante es ACEPTADO por la OSE (toggle por .env). */
  async enviarAutomaticoAceptado(comprobanteId: number): Promise<void> {
    const enviarEmail = this.config.get<boolean>('notificaciones.envioAutomaticoEmail') ?? false;
    const enviarWhatsapp = this.config.get<boolean>('notificaciones.envioAutomaticoWhatsapp') ?? false;
    if (!enviarEmail && !enviarWhatsapp) return;
    try {
      const comprobanteElectronico = await this.ceRepo.findOne({ where: { comprobanteId } });
      if (!comprobanteElectronico || comprobanteElectronico.esSimulacion) {
        this.logger.warn(`Se omiten notificaciones automáticas del comprobante ${comprobanteId}: no existe aceptación FE real.`);
        return;
      }
      const { cliente } = await this.cargarComprobanteYCliente(comprobanteId);
      if (enviarEmail && cliente?.email) {
        const resultado = await this.enviarEmail(comprobanteId);
        this.logger.log(`Email automático ${resultado.estado} para comprobante ${comprobanteId}${resultado.simulado ? ' (simulado)' : ''}`);
      }
      if (enviarWhatsapp && cliente?.telefono) {
        const resultado = await this.enviarWhatsapp(comprobanteId);
        this.logger.log(`WhatsApp automático ${resultado.estado} para comprobante ${comprobanteId}${resultado.simulado ? ' (simulado)' : ''}`);
      }
    } catch (err) {
      this.logger.error(`Envio automatico fallido comprobante ${comprobanteId}: ${(err as Error).message}`);
    }
  }


  /** Ejecuta el cálculo y la persistencia de alertas para todos los administradores activos. */
  async sincronizarAlertasAutomaticas() {
    const administradores = await this.usuarioRepo.find({
      where: { rol: 'ADMIN' as any, activo: true },
      relations: ['sucursales'],
      order: { id: 'ASC' },
    });
    const resumen = { administradores: administradores.length, procesados: 0, alertas: 0, errores: [] as Array<{ usuarioId: number; mensaje: string }> };
    for (const admin of administradores) {
      try {
        const sucursalIds = (admin.sucursales || []).map(s => s.id);
        const panel = await this.gastosService.dashboardGerencial(admin.empresaId, sucursalIds);
        const alertas = construirAlertasOperativas(panel);
        const resultado = await this.sincronizarAlertas(admin.empresaId, admin.id, sucursalIds, alertas);
        resumen.procesados += 1;
        resumen.alertas += resultado.total;
      } catch (error) {
        const mensaje = (error as Error)?.message || 'Error desconocido';
        this.logger.error(`No se pudieron sincronizar alertas para usuario ${admin.id}: ${mensaje}`);
        resumen.errores.push({ usuarioId: admin.id, mensaje });
      }
    }
    return resumen;
  }

  async probarEmail(destino: string) { return this.emailService.enviarPrueba(destino); }
  async probarWhatsapp(destino: string) { return this.whatsappService.enviarPrueba(destino); }

  obtenerEstadoConfiguracion() {
    return {
      email: {
        configurado: this.emailService.estaConfigurado(),
        envioAutomatico: this.config.get<boolean>('notificaciones.envioAutomaticoEmail') ?? false,
      },
      whatsapp: {
        configurado: this.whatsappService.estaConfigurado(),
        plantillaConfigurada: this.whatsappService.estaPlantillaConfigurada(),
        envioAutomatico: this.config.get<boolean>('notificaciones.envioAutomaticoWhatsapp') ?? false,
      },
      cronAlertas: Boolean(this.config.get<string>('cron.secret')),
      sunat: {
        modo: 'simulacion',
        conectado: false,
        detalle: 'Esta entrega solo incluye adaptador MOCK; no está conectada a SUNAT ni a un OSE real.',
      },
    };
  }


  async listarAlertas(empresaId: number, usuarioId: number, sucursalIds: number[]) {
    const query = this.alertaRepo.createQueryBuilder('alerta')
      .where('alerta.empresaId = :empresaId', { empresaId })
      .andWhere('alerta.usuarioId = :usuarioId', { usuarioId })
      .andWhere('alerta.activa = TRUE');
    if (sucursalIds?.length) {
      query.andWhere('(alerta.sucursalId IS NULL OR alerta.sucursalId IN (:...sucursalIds))', { sucursalIds });
    } else {
      query.andWhere('alerta.sucursalId IS NULL');
    }
    const items = await query.orderBy('alerta.leida','ASC')
      .addOrderBy("CASE alerta.nivel WHEN 'critica' THEN 0 WHEN 'advertencia' THEN 1 ELSE 2 END",'ASC')
      .addOrderBy('alerta.ultimaDeteccionAt','DESC').take(300).getMany();
    return { items, total: items.length, pendientes: items.filter(a=>!a.leida).length };
  }

  async sincronizarAlertas(
    empresaId: number, usuarioId: number, sucursalIds: number[], alertas: AlertaOperativaDto[],
  ) {
    const permitidas = new Set(sucursalIds || []);
    for (const alerta of alertas) {
      if (alerta.sucursalId && !permitidas.has(alerta.sucursalId)) {
        throw new BadRequestException('La alerta contiene una sucursal no autorizada');
      }
    }
    await this.dataSource.transaction(async manager => {
      const claves = [...new Set(alertas.map(a => a.clave))];
      const desactivar = manager.createQueryBuilder().update(AlertaOperativa)
        .set({ activa: false })
        .where('empresa_id = :empresaId AND usuario_id = :usuarioId', { empresaId, usuarioId });
      if (claves.length) desactivar.andWhere('clave NOT IN (:...claves)', { claves });
      await desactivar.execute();
      for (const alerta of alertas) {
        await manager.query(
          `INSERT INTO alerta_operativa
            (empresa_id,usuario_id,sucursal_id,clave,nivel,categoria,titulo,detalle,destino,activa,ultima_deteccion_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,NOW())
           ON CONFLICT (empresa_id,usuario_id,clave) DO UPDATE SET
             sucursal_id=EXCLUDED.sucursal_id,nivel=EXCLUDED.nivel,categoria=EXCLUDED.categoria,
             titulo=EXCLUDED.titulo,detalle=EXCLUDED.detalle,destino=EXCLUDED.destino,
             leida=CASE WHEN alerta_operativa.activa=FALSE THEN FALSE ELSE alerta_operativa.leida END,
             leida_at=CASE WHEN alerta_operativa.activa=FALSE THEN NULL ELSE alerta_operativa.leida_at END,
             activa=TRUE,ultima_deteccion_at=NOW(),actualizada_at=NOW()`,
          [empresaId,usuarioId,alerta.sucursalId || null,alerta.clave,alerta.nivel,alerta.categoria,alerta.titulo,alerta.detalle,alerta.destino],
        );
      }
    });
    return this.listarAlertas(empresaId, usuarioId, sucursalIds);
  }

  async marcarAlertaLeida(empresaId: number, usuarioId: number, id: number) {
    const result = await this.alertaRepo.createQueryBuilder().update(AlertaOperativa)
      .set({ leida: true, leidaAt: new Date() })
      .where('id = :id AND empresa_id = :empresaId AND usuario_id = :usuarioId AND activa = TRUE', { id, empresaId, usuarioId })
      .execute();
    if (!result.affected) throw new NotFoundException('Alerta no encontrada o ya no está activa');
    return { ok: true };
  }

  async marcarTodasLeidas(empresaId: number, usuarioId: number) {
    await this.alertaRepo.createQueryBuilder().update(AlertaOperativa)
      .set({ leida: true, leidaAt: new Date() })
      .where('empresa_id = :empresaId AND usuario_id = :usuarioId AND activa = TRUE AND leida = FALSE', { empresaId, usuarioId })
      .execute();
    return { ok: true };
  }

  async findAll(empresaId: number, sucursalIds: number[], comprobanteId?: number): Promise<EnvioNotificacion[]> {
    if (!sucursalIds?.length) return [];
    const query = this.envioRepo.createQueryBuilder('envio')
      .innerJoin(Comprobante, 'comprobante', 'comprobante.id = envio.comprobanteId')
      .where('comprobante.empresaId = :empresaId', { empresaId })
      .andWhere('comprobante.sucursalId IN (:...sucursalIds)', { sucursalIds });
    if (comprobanteId !== undefined) query.andWhere('envio.comprobanteId = :comprobanteId', { comprobanteId });
    return query.orderBy('envio.id', 'DESC').take(200).getMany();
  }
}
