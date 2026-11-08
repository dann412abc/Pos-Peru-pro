import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { RegistrarCobroClienteDto } from './dto/registrar-cobro-cliente.dto';
import { validarDocumento } from '../common/utils/documento.validator';
import { TipoDocClienteEnum } from '../common/enums';
import { redondear2 } from '../common/utils/round.util';
import { calcularSaldoLuegoDeCobro, estadoCuentaPorSaldo } from './credit-calculations';
import { esMismoCobroRegistrado } from './credit-idempotency';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente) private readonly repo: Repository<Cliente>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(empresaId: number): Promise<Cliente[]> {
    return this.repo.find({ where: { empresaId }, order: { id: 'ASC' } });
  }

  async findOne(id: number, empresaId: number): Promise<Cliente> {
    const c = await this.repo.findOne({ where: { id, empresaId } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    return c;
  }

  async update(id: number, empresaId: number, dto: CreateClienteDto): Promise<Cliente> {
    await this.findOne(id, empresaId);
    if (dto.numero !== '00000000' && !validarDocumento(dto.tipoDoc as TipoDocClienteEnum, dto.numero)) {
      throw new BadRequestException('Documento de cliente inválido');
    }
    // UPDATE parcial: nunca reescribir saldo_credito leído antes, porque una venta/cobranza
    // concurrente podría haberlo incrementado o reducido después de la lectura.
    await this.repo.update({ id, empresaId }, {
      tipoDoc: dto.tipoDoc as TipoDocClienteEnum,
      numero: dto.numero,
      nombre: dto.nombre,
      direccion: dto.direccion ?? null as any,
      telefono: dto.telefono ?? null as any,
      email: dto.email ?? null as any,
      limiteCredito: dto.limiteCredito ?? 0,
    });
    return this.findOne(id, empresaId);
  }

  async create(empresaId: number, dto: CreateClienteDto): Promise<Cliente> {
    if (dto.numero !== '00000000' && !validarDocumento(dto.tipoDoc as TipoDocClienteEnum, dto.numero)) {
      throw new BadRequestException(
        dto.tipoDoc === 'DNI'
          ? 'DNI invalido: debe tener exactamente 8 digitos'
          : 'RUC inválido: verifica los 11 dígitos, prefijo y dígito verificador',
      );
    }
    const cliente = new Cliente();
    cliente.tipoDoc = dto.tipoDoc as any;
    cliente.numero = dto.numero;
    cliente.nombre = dto.nombre;
    cliente.direccion = dto.direccion ?? null as any;
    cliente.telefono = dto.telefono ?? null as any;
    cliente.email = dto.email ?? null as any;
    cliente.limiteCredito = dto.limiteCredito ?? 0;
    cliente.saldoCredito = 0;
    cliente.empresaId = empresaId;
    return this.repo.save(cliente);
  }

  private validarSucursal(sucursalId: number | undefined, sucursalIds: number[]): number[] {
    if (sucursalId !== undefined && (!Number.isInteger(sucursalId) || sucursalId <= 0 || !sucursalIds.includes(sucursalId))) {
      throw new ForbiddenException('No tiene acceso a la sucursal solicitada');
    }
    return sucursalId ? [sucursalId] : sucursalIds;
  }

  async listarCuentasPorCobrar(
    empresaId: number,
    sucursalIds: number[],
    sucursalId?: number,
    estado?: string,
  ): Promise<any[]> {
    const ids = this.validarSucursal(sucursalId, sucursalIds);
    if (!ids.length) return [];
    if (estado && !['PENDIENTE', 'PARCIAL', 'PAGADA', 'AJUSTADA', 'ANULADA', 'CERRADAS'].includes(estado)) {
      throw new BadRequestException('Estado de cuenta por cobrar inválido');
    }
    return this.dataSource.query(
      `SELECT cc.id, cc.empresa_id AS "empresaId", cc.sucursal_id AS "sucursalId",
              cc.comprobante_id AS "comprobanteId", cc.cliente_id AS "clienteId",
              cc.total_credito AS "totalCredito", cc.saldo_pendiente AS "saldoPendiente",
              cc.monto_revertido AS "montoRevertido", cc.fecha_vencimiento AS "fechaVencimiento", cc.estado,
              cc.created_at AS "createdAt", c.tipo, c.serie, c.correlativo,
              c.fecha_emision AS "fechaEmision", c.total AS "totalComprobante",
              cl.tipo_doc AS "tipoDoc", cl.numero AS "numeroCliente", cl.nombre AS "clienteNombre",
              cl.telefono AS "clienteTelefono", cl.email AS "clienteEmail",
              GREATEST(0, (((NOW() AT TIME ZONE 'America/Lima')::date) - cc.fecha_vencimiento))::int AS "diasVencida",
              (cc.fecha_vencimiento < (NOW() AT TIME ZONE 'America/Lima')::date AND cc.saldo_pendiente > 0) AS vencida,
              COALESCE((SELECT SUM(cb.monto) FROM cobro_cliente cb WHERE cb.cuenta_cobrar_id=cc.id),0)::numeric AS cobrado
       FROM cuenta_cobrar cc
       INNER JOIN comprobante c ON c.id=cc.comprobante_id AND c.empresa_id=cc.empresa_id
       INNER JOIN cliente cl ON cl.id=cc.cliente_id AND cl.empresa_id=cc.empresa_id
       WHERE cc.empresa_id=$1 AND cc.sucursal_id=ANY($2::int[])
         AND (
           ($3::varchar IS NULL AND cc.estado IN ('PENDIENTE','PARCIAL'))
           OR ($3::varchar = 'CERRADAS' AND cc.estado IN ('PAGADA','AJUSTADA','ANULADA'))
           OR ($3::varchar IS NOT NULL AND $3::varchar <> 'CERRADAS' AND cc.estado=$3)
         )
       ORDER BY (cc.fecha_vencimiento < (NOW() AT TIME ZONE 'America/Lima')::date) DESC, cc.fecha_vencimiento ASC, cc.created_at DESC
       LIMIT 1000`,
      [empresaId, ids, estado || null],
    );
  }

  async resumenCuentasPorCobrar(empresaId: number, sucursalIds: number[], sucursalId?: number): Promise<any> {
    const ids = this.validarSucursal(sucursalId, sucursalIds);
    if (!ids.length) return { cuentasAbiertas: 0, saldoTotal: 0, porVencer: 0, vencido1a7: 0, vencido8a30: 0, vencido31a60: 0, vencidoMas60: 0 };
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS "cuentasAbiertas",
              COALESCE(SUM(saldo_pendiente),0)::numeric AS "saldoTotal",
              COALESCE(SUM(saldo_pendiente) FILTER (WHERE fecha_vencimiento >= (NOW() AT TIME ZONE 'America/Lima')::date),0)::numeric AS "porVencer",
              COALESCE(SUM(saldo_pendiente) FILTER (WHERE (NOW() AT TIME ZONE 'America/Lima')::date-fecha_vencimiento BETWEEN 1 AND 7),0)::numeric AS "vencido1a7",
              COALESCE(SUM(saldo_pendiente) FILTER (WHERE (NOW() AT TIME ZONE 'America/Lima')::date-fecha_vencimiento BETWEEN 8 AND 30),0)::numeric AS "vencido8a30",
              COALESCE(SUM(saldo_pendiente) FILTER (WHERE (NOW() AT TIME ZONE 'America/Lima')::date-fecha_vencimiento BETWEEN 31 AND 60),0)::numeric AS "vencido31a60",
              COALESCE(SUM(saldo_pendiente) FILTER (WHERE (NOW() AT TIME ZONE 'America/Lima')::date-fecha_vencimiento > 60),0)::numeric AS "vencidoMas60"
       FROM cuenta_cobrar WHERE empresa_id=$1 AND sucursal_id=ANY($2::int[])
         AND estado IN ('PENDIENTE','PARCIAL') AND saldo_pendiente>0`,
      [empresaId, ids],
    );
    return rows[0] || {};
  }

  async detalleCuentaPorCobrar(id: number, empresaId: number, sucursalIds: number[]): Promise<any> {
    const cuenta = await this.dataSource.query(
      `SELECT cc.id, cc.empresa_id AS "empresaId", cc.sucursal_id AS "sucursalId",
              cc.comprobante_id AS "comprobanteId", cc.cliente_id AS "clienteId",
              cc.total_credito AS "totalCredito", cc.saldo_pendiente AS "saldoPendiente",
              cc.monto_revertido AS "montoRevertido", cc.fecha_vencimiento AS "fechaVencimiento", cc.estado, cc.created_at AS "createdAt",
              c.tipo, c.serie, c.correlativo, c.fecha_emision AS "fechaEmision",
              cl.tipo_doc AS "tipoDoc", cl.numero, cl.nombre AS "clienteNombre",
              cl.telefono, cl.email, cl.direccion
       FROM cuenta_cobrar cc
       INNER JOIN comprobante c ON c.id=cc.comprobante_id AND c.empresa_id=cc.empresa_id
       INNER JOIN cliente cl ON cl.id=cc.cliente_id AND cl.empresa_id=cc.empresa_id
       WHERE cc.id=$1 AND cc.empresa_id=$2 AND cc.sucursal_id=ANY($3::int[])`,
      [id, empresaId, sucursalIds],
    );
    if (!cuenta.length) throw new NotFoundException('Cuenta por cobrar no encontrada');
    const cobros = await this.dataSource.query(
      `SELECT cb.id, cb.metodo_pago AS "metodoPago", cb.monto, cb.referencia,
              cb.created_at AS "createdAt", cb.usuario_id AS "usuarioId"
       FROM cobro_cliente cb WHERE cb.cuenta_cobrar_id=$1 AND cb.empresa_id=$2
       ORDER BY cb.created_at DESC, cb.id DESC`,
      [id, empresaId],
    );
    return { ...cuenta[0], cobros };
  }

  async registrarCobro(
    id: number,
    dto: RegistrarCobroClienteDto,
    usuarioId: number,
    empresaId: number,
    sucursalIds: number[],
  ): Promise<any> {
    const monto = redondear2(Number(dto.monto));
    if (!Number.isFinite(monto) || monto <= 0) throw new BadRequestException('El monto debe ser mayor a cero');
    const idempotencyKey = String(dto.idempotencyKey || '').trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 100) throw new BadRequestException('La clave de operación debe tener entre 8 y 100 caracteres');
    const referenciaNormalizada = dto.referencia?.trim() || null;
    if (dto.metodoPago === 'TRANSFERENCIA' && !referenciaNormalizada) {
      throw new BadRequestException('La transferencia requiere número de operación o referencia bancaria');
    }

    const previa = await this.dataSource.query(
      `SELECT id,cuenta_cobrar_id AS "cuentaId",monto,metodo_pago AS "metodoPago",referencia
       FROM cobro_cliente WHERE empresa_id=$1 AND idempotency_key=$2 LIMIT 1`,
      [empresaId, idempotencyKey],
    );
    if (previa.length) {
      if (!esMismoCobroRegistrado(previa[0], { cuentaId: id, monto, metodoPago: dto.metodoPago, referencia: referenciaNormalizada })) {
        throw new ConflictException('La clave de operación ya fue utilizada con otros datos. Actualice la cuenta antes de registrar un nuevo cobro.');
      }
      return this.detalleCuentaPorCobrar(id, empresaId, sucursalIds);
    }

    try {
      const fueReintento = await this.dataSource.transaction(async (manager) => {
        // Serializa el mismo identificador incluso cuando dos solicitudes llegan simultáneamente.
        // La clave única sigue siendo la última defensa ante cualquier carrera.
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`mi-carrito-pos:cobro:${empresaId}:${idempotencyKey}`],
        );
        const existenteTx = await manager.query(
          `SELECT id,cuenta_cobrar_id AS "cuentaId",monto,metodo_pago AS "metodoPago",referencia
           FROM cobro_cliente WHERE empresa_id=$1 AND idempotency_key=$2 LIMIT 1`,
          [empresaId, idempotencyKey],
        );
        if (existenteTx.length) {
          if (!esMismoCobroRegistrado(existenteTx[0], { cuentaId: id, monto, metodoPago: dto.metodoPago, referencia: referenciaNormalizada })) {
            throw new ConflictException('La clave de operación ya fue utilizada con otros datos. Actualice la cuenta antes de registrar un nuevo cobro.');
          }
          return true;
        }

        // Lectura inicial para conocer sucursal y comprobar alcance antes de bloquear recursos.
        const acceso = await manager.query(
          `SELECT sucursal_id AS "sucursalId", comprobante_id AS "comprobanteId"
           FROM cuenta_cobrar WHERE id=$1 AND empresa_id=$2 AND sucursal_id=ANY($3::int[])`,
          [id, empresaId, sucursalIds],
        );
        if (!acceso.length) throw new NotFoundException('Cuenta por cobrar no encontrada');
        const sucursalCuenta = Number(acceso[0].sucursalId);

        let cajaId: number | null = null;
        if (dto.metodoPago !== 'TRANSFERENCIA') {
          const cajas = await manager.query(
            `SELECT id FROM caja WHERE sucursal_id=$1 AND usuario_id=$2 AND estado='ABIERTA' FOR UPDATE`,
            [sucursalCuenta, usuarioId],
          );
          if (!cajas.length) throw new BadRequestException('Abra una caja en la misma sucursal para registrar esta cobranza');
          cajaId = Number(cajas[0].id);
        }

        const filas = await manager.query(
          `SELECT id, empresa_id AS "empresaId", sucursal_id AS "sucursalId",
                  comprobante_id AS "comprobanteId", cliente_id AS "clienteId",
                  total_credito AS "totalCredito", saldo_pendiente AS "saldoPendiente", estado
           FROM cuenta_cobrar WHERE id=$1 AND empresa_id=$2 AND sucursal_id=ANY($3::int[]) FOR UPDATE`,
          [id, empresaId, sucursalIds],
        );
        if (!filas.length) throw new NotFoundException('Cuenta por cobrar no encontrada');
        const cuenta = filas[0];
        const saldoActual = redondear2(Number(cuenta.saldoPendiente));
        if (cuenta.estado === 'ANULADA' || cuenta.estado === 'PAGADA' || saldoActual <= 0) {
          throw new BadRequestException('La cuenta ya no tiene saldo pendiente');
        }
        let saldoNuevo: number;
        try { saldoNuevo = calcularSaldoLuegoDeCobro(saldoActual, monto); }
        catch (error: any) {
          throw new BadRequestException(`${error.message}. Saldo pendiente: S/ ${saldoActual.toFixed(2)}`);
        }

        const clienteRows = await manager.query(
          `SELECT saldo_credito FROM cliente WHERE id=$1 AND empresa_id=$2 FOR UPDATE`,
          [cuenta.clienteId, empresaId],
        );
        if (!clienteRows.length) throw new NotFoundException('Cliente asociado a la cuenta no encontrado');
        if (Number(clienteRows[0].saldo_credito) + 0.001 < monto) {
          throw new ConflictException('El saldo global del cliente no coincide con sus cuentas. Revise la conciliación antes de aplicar el cobro.');
        }

        const inserted = await manager.query(
          `INSERT INTO cobro_cliente
            (empresa_id,sucursal_id,cuenta_cobrar_id,usuario_id,caja_id,metodo_pago,monto,referencia,idempotency_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [empresaId, sucursalCuenta, id, usuarioId, cajaId, dto.metodoPago, monto,
            referenciaNormalizada, idempotencyKey],
        );
        const cobroId = Number(inserted[0].id);
        const estadoNuevo = estadoCuentaPorSaldo(saldoNuevo);
        await manager.query(
          `UPDATE cuenta_cobrar SET saldo_pendiente=$1,estado=$2,updated_at=NOW() WHERE id=$3 AND empresa_id=$4`,
          [saldoNuevo, estadoNuevo, id, empresaId],
        );
        await manager.query(
          `UPDATE cliente SET saldo_credito=GREATEST(0,saldo_credito-$1) WHERE id=$2 AND empresa_id=$3`,
          [monto, cuenta.clienteId, empresaId],
        );
        if (estadoNuevo === 'PAGADA') {
          await manager.query(`UPDATE comprobante SET estado='PAGADA' WHERE id=$1 AND empresa_id=$2 AND estado <> 'ANULADA'`,
            [cuenta.comprobanteId, empresaId]);
        }

        // Transferencias bancarias quedan en el historial de cobros, pero no representan efectivo en caja.
        if (cajaId !== null) {
          await manager.query(
            `INSERT INTO caja_movimiento
              (caja_id,usuario_id,tipo,metodo_pago,monto,motivo,comprobante_id,cobro_cliente_id)
             VALUES ($1,$2,'INGRESO',$3,$4,$5,$6,$7)`,
            [cajaId, usuarioId, dto.metodoPago, monto,
              `Cobranza comprobante ${cuenta.comprobanteId} · cuenta #${id}`.slice(0, 200),
              cuenta.comprobanteId, cobroId],
          );
        }
        return false;
      });
      if (fueReintento) return this.detalleCuentaPorCobrar(id, empresaId, sucursalIds);
    } catch (error: any) {
      const code = error?.code || error?.driverError?.code;
      if (code === '23505') {
        const repetido = await this.dataSource.query(
          `SELECT id,cuenta_cobrar_id AS "cuentaId",monto,metodo_pago AS "metodoPago",referencia
           FROM cobro_cliente WHERE empresa_id=$1 AND idempotency_key=$2 LIMIT 1`,
          [empresaId, idempotencyKey],
        );
        if (repetido.length) {
          if (!esMismoCobroRegistrado(repetido[0], { cuentaId: id, monto, metodoPago: dto.metodoPago, referencia: referenciaNormalizada })) {
            throw new ConflictException('La clave de operación ya fue utilizada con otros datos. Actualice la cuenta antes de registrar un nuevo cobro.');
          }
          return this.detalleCuentaPorCobrar(id, empresaId, sucursalIds);
        }
      }
      throw error;
    }
    return this.detalleCuentaPorCobrar(id, empresaId, sucursalIds);
  }
}
