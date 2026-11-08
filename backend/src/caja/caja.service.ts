import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Caja } from './entities/caja.entity';
import { Comprobante } from '../ventas/entities/comprobante.entity';
import { ComprobantePago } from '../ventas/entities/comprobante-pago.entity';
import { CajaMovimiento } from './entities/caja-movimiento.entity';
import { AperturaCajaDto, CierreCajaDto } from './dto/apertura-caja.dto';
import { CajaMovimientoDto } from './dto/caja-movimiento.dto';
import { EstadoCajaEnum, MetodoPagoEnum } from '../common/enums';
import { redondear2 } from '../common/utils/round.util';

@Injectable()
export class CajaService {
  constructor(
    @InjectRepository(Caja) private readonly cajaRepo: Repository<Caja>,
    @InjectRepository(Comprobante) private readonly comprobanteRepo: Repository<Comprobante>,
    private readonly dataSource: DataSource,
  ) {}

  async abrir(dto: AperturaCajaDto, usuarioId: number, empresaId: number, sucursalIds: number[]): Promise<Caja> {
    if (!sucursalIds.includes(dto.sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const sucursal = await this.dataSource.query(
      'SELECT id FROM sucursal WHERE id = $1 AND empresa_id = $2', [dto.sucursalId, empresaId],
    );
    if (!sucursal.length) throw new ForbiddenException('La sucursal no pertenece a su empresa');
    const abierta = await this.cajaRepo.findOne({
      where: { sucursalId: dto.sucursalId, usuarioId, estado: EstadoCajaEnum.ABIERTA },
    });
    if (abierta) throw new BadRequestException(`Ya existe una caja abierta (#${abierta.id}) para este usuario en la sucursal`);
    try {
      return await this.cajaRepo.save(this.cajaRepo.create({
        sucursalId: dto.sucursalId, usuarioId,
        saldoInicial: dto.saldoInicial ?? 0, estado: EstadoCajaEnum.ABIERTA,
      }));
    } catch (error: any) {
      if (error?.code === '23505' || error?.driverError?.code === '23505') {
        throw new BadRequestException('Ya existe una caja abierta para este usuario y sucursal');
      }
      throw error;
    }
  }

  async cerrar(id: number, dto: CierreCajaDto, usuarioId: number, empresaId: number, sucursalIds: number[]): Promise<Caja> {
    return this.dataSource.transaction(async (manager) => {
      const access = await manager.query(
        `SELECT c.id FROM caja c INNER JOIN sucursal s ON s.id = c.sucursal_id
         WHERE c.id = $1 AND c.usuario_id = $2 AND s.empresa_id = $3 AND c.sucursal_id = ANY($4::int[])
         FOR UPDATE OF c`,
        [id, usuarioId, empresaId, sucursalIds],
      );
      if (!access.length) throw new NotFoundException('Caja no encontrada');
      const caja = await manager.getRepository(Caja).findOne({ where: { id, usuarioId } });
      if (!caja) throw new NotFoundException('Caja no encontrada');
      if (caja.estado === EstadoCajaEnum.CERRADA) throw new BadRequestException('La caja ya está cerrada');

      // Consolida los pagos desglosados; conserva compatibilidad con ventas antiguas sin detalle.
      const ventas = await manager.query(
        `SELECT medio, SUM(monto)::numeric AS total FROM (
           SELECT cp.metodo_pago AS medio, cp.monto
           FROM comprobante_pago cp INNER JOIN comprobante c ON c.id = cp.comprobante_id
           WHERE c.caja_id = $1 AND cp.metodo_pago <> 'CREDITO'
           UNION ALL
           SELECT c.metodo_pago AS medio, c.total AS monto
           FROM comprobante c
           WHERE c.caja_id = $1
             AND c.metodo_pago <> 'CREDITO'
             AND NOT EXISTS (SELECT 1 FROM comprobante_pago cp WHERE cp.comprobante_id = c.id)
         ) p GROUP BY medio`, [id],
      );
      const movimientos = await manager.getRepository(CajaMovimiento).find({ where: { cajaId: id } });
      const esperadoPorMetodo: Record<string, number> = {};
      for (const v of ventas) esperadoPorMetodo[v.medio] = Number(v.total || 0);
      for (const mov of movimientos) {
        const signo = mov.tipo === 'INGRESO' ? 1 : -1;
        esperadoPorMetodo[mov.metodoPago] = redondear2((esperadoPorMetodo[mov.metodoPago] || 0) + signo * Number(mov.monto));
      }
      const efectivoEsperado = redondear2(Number(caja.saldoInicial) + (esperadoPorMetodo[MetodoPagoEnum.EFECTIVO] || 0));
      const diferencia = redondear2(Number(dto.efectivoContado) - efectivoEsperado);
      const arqueo = Object.keys(esperadoPorMetodo).map((metodo) => ({
        metodoPago: metodo,
        montoEsperado: metodo === MetodoPagoEnum.EFECTIVO ? efectivoEsperado : redondear2(esperadoPorMetodo[metodo]),
        montoContado: dto.arqueo?.find((a) => a.metodoPago === metodo)?.montoContado
          ?? (metodo === MetodoPagoEnum.EFECTIVO ? Number(dto.efectivoContado) : redondear2(esperadoPorMetodo[metodo])),
      }));
      if (!arqueo.some((a) => a.metodoPago === MetodoPagoEnum.EFECTIVO)) {
        arqueo.push({ metodoPago: MetodoPagoEnum.EFECTIVO, montoEsperado: efectivoEsperado, montoContado: Number(dto.efectivoContado) });
      }
      caja.estado = EstadoCajaEnum.CERRADA;
      caja.fechaCierre = new Date();
      caja.efectivoContado = Number(dto.efectivoContado);
      caja.diferencia = diferencia;
      caja.arqueo = arqueo;
      return manager.getRepository(Caja).save(caja);
    });
  }


  async resumen(
    cajaId: number,
    usuarioId: number,
    empresaId: number,
    sucursalIds: number[],
  ): Promise<{ cantidadVentas: number; totalVentas: number; totalDevoluciones: number; porMetodo: Record<string, number>; efectivoEsperado: number }> {
    const accesible = await this.dataSource.query(
      `SELECT c.id, c.saldo_inicial FROM caja c INNER JOIN sucursal s ON s.id = c.sucursal_id
       WHERE c.id = $1 AND c.usuario_id = $2 AND s.empresa_id = $3 AND c.sucursal_id = ANY($4::int[])`,
      [cajaId, usuarioId, empresaId, sucursalIds],
    );
    if (!accesible.length) throw new NotFoundException('Caja no encontrada');

    const ventas = await this.dataSource.query(
      `SELECT COUNT(*)::int AS cantidad,
              COALESCE(SUM(GREATEST(0,c.total-COALESCE(d.total_devuelto,0))),0)::numeric AS total,
              COALESCE(SUM(COALESCE(d.total_devuelto,0)),0)::numeric AS devoluciones
       FROM comprobante c
       LEFT JOIN LATERAL (
         SELECT SUM(dv.total_devolucion)::numeric AS total_devuelto
         FROM devolucion_venta dv WHERE dv.comprobante_id=c.id AND dv.empresa_id=$2 AND dv.estado='REGISTRADA'
       ) d ON TRUE
       WHERE c.caja_id=$1 AND c.empresa_id=$2 AND c.estado <> 'ANULADA'`, [cajaId, empresaId],
    );
    const pagos = await this.dataSource.query(
      `SELECT medio, SUM(monto)::numeric AS total FROM (
         SELECT cp.metodo_pago AS medio,
                CASE WHEN cp.metodo_pago = 'CREDITO'
                     THEN COALESCE(cc.saldo_pendiente, cp.monto)
                     ELSE cp.monto END AS monto
         FROM comprobante_pago cp
         INNER JOIN comprobante c ON c.id = cp.comprobante_id
         LEFT JOIN cuenta_cobrar cc ON cc.comprobante_id = c.id AND cc.empresa_id = c.empresa_id
         WHERE c.caja_id = $1 AND c.estado <> 'ANULADA'
         UNION ALL
         SELECT c.metodo_pago AS medio, c.total AS monto
         FROM comprobante c
         WHERE c.caja_id = $1 AND c.estado <> 'ANULADA'
           AND NOT EXISTS (SELECT 1 FROM comprobante_pago cp WHERE cp.comprobante_id = c.id)
       ) p GROUP BY medio`, [cajaId],
    );
    // Para el efectivo físico se conserva el cobro original de ventas anuladas y se resta
    // el reembolso registrado como salida, incluso cuando se devuelve en otro turno.
    const efectivoCobrado = await this.dataSource.query(
      `SELECT COALESCE(SUM(monto), 0)::numeric AS total FROM (
         SELECT cp.monto FROM comprobante_pago cp INNER JOIN comprobante c ON c.id = cp.comprobante_id
         WHERE c.caja_id = $1 AND cp.metodo_pago = 'EFECTIVO'
         UNION ALL
         SELECT c.total AS monto FROM comprobante c
         WHERE c.caja_id = $1 AND c.metodo_pago = 'EFECTIVO'
           AND NOT EXISTS (SELECT 1 FROM comprobante_pago cp WHERE cp.comprobante_id = c.id)
       ) efectivo`, [cajaId],
    );
    const porMetodo: Record<string, number> = {
      EFECTIVO: 0, TARJETA: 0, YAPE: 0, PLIN: 0, CREDITO: 0,
    };
    for (const pago of pagos) porMetodo[pago.medio] = Number(pago.total || 0);
    const movimientos = await this.dataSource.getRepository(CajaMovimiento).find({ where: { cajaId } });
    for (const mov of movimientos) {
      const signo = mov.tipo === 'INGRESO' ? 1 : -1;
      porMetodo[mov.metodoPago] = redondear2((porMetodo[mov.metodoPago] || 0) + signo * Number(mov.monto));
    }
    const variacionEfectivo = movimientos
      .filter((m) => m.metodoPago === MetodoPagoEnum.EFECTIVO)
      .reduce((sum, m) => sum + (m.tipo === 'INGRESO' ? 1 : -1) * Number(m.monto), 0);
    const efectivoEsperado = redondear2(
      Number(accesible[0].saldo_inicial || 0) + Number(efectivoCobrado[0]?.total || 0) + variacionEfectivo,
    );
    return {
      cantidadVentas: Number(ventas[0]?.cantidad || 0),
      totalVentas: Number(ventas[0]?.total || 0),
      totalDevoluciones: Number(ventas[0]?.devoluciones || 0),
      porMetodo,
      efectivoEsperado,
    };
  }

  async registrarMovimiento(
    cajaId: number,
    dto: CajaMovimientoDto,
    usuarioId: number,
    empresaId: number,
    sucursalIds: number[],
  ): Promise<CajaMovimiento> {
    return this.dataSource.transaction(async (manager) => {
      const accesible = await manager.query(
        `SELECT c.id FROM caja c INNER JOIN sucursal s ON s.id = c.sucursal_id
         WHERE c.id = $1 AND c.usuario_id = $2 AND c.estado = 'ABIERTA'
           AND s.empresa_id = $3 AND c.sucursal_id = ANY($4::int[])
         FOR UPDATE OF c`,
        [cajaId, usuarioId, empresaId, sucursalIds],
      );
      if (!accesible.length) throw new NotFoundException('No existe una caja abierta accesible para registrar el movimiento');

      if (dto.tipo === 'SALIDA' && dto.metodoPago === MetodoPagoEnum.EFECTIVO) {
        const caja = await manager.getRepository(Caja).findOne({ where: { id: cajaId, usuarioId } });
        const ventas = await manager.query(
          `SELECT COALESCE(SUM(cp.monto), 0)::numeric AS total
           FROM comprobante_pago cp
           INNER JOIN comprobante c ON c.id = cp.comprobante_id
           WHERE c.caja_id = $1 AND cp.metodo_pago = 'EFECTIVO'`,
          [cajaId],
        );
        const movimientos = await manager.query(
          `SELECT COALESCE(SUM(CASE WHEN tipo = 'INGRESO' THEN monto ELSE -monto END), 0)::numeric AS total
           FROM caja_movimiento WHERE caja_id = $1 AND metodo_pago = 'EFECTIVO'`,
          [cajaId],
        );
        const disponible = redondear2(
          Number(caja?.saldoInicial || 0) + Number(ventas[0]?.total || 0) + Number(movimientos[0]?.total || 0),
        );
        if (Number(dto.monto) > disponible) {
          throw new BadRequestException(`Fondos insuficientes en efectivo. Disponible: S/ ${disponible.toFixed(2)}`);
        }
      }

      return manager.getRepository(CajaMovimiento).save(manager.getRepository(CajaMovimiento).create({
        cajaId, usuarioId, tipo: dto.tipo, metodoPago: dto.metodoPago,
        monto: redondear2(Number(dto.monto)), motivo: dto.motivo.trim(),
      }));
    });
  }

  async listarMovimientos(
    cajaId: number,
    usuarioId: number,
    empresaId: number,
    sucursalIds: number[],
  ): Promise<CajaMovimiento[]> {
    const accesible = await this.dataSource.query(
      `SELECT c.id FROM caja c INNER JOIN sucursal s ON s.id = c.sucursal_id
       WHERE c.id = $1 AND c.usuario_id = $2 AND s.empresa_id = $3 AND c.sucursal_id = ANY($4::int[])`,
      [cajaId, usuarioId, empresaId, sucursalIds],
    );
    if (!accesible.length) throw new NotFoundException('Caja no encontrada');
    return this.dataSource.getRepository(CajaMovimiento).find({
      where: { cajaId }, order: { createdAt: 'DESC' },
    });
  }


  async reporteFlujoCaja(
    sucursalId: number, desde: string | undefined, hasta: string | undefined,
    empresaId: number, sucursalIds: number[],
  ) {
    if (!Number.isInteger(sucursalId) || sucursalId <= 0) throw new BadRequestException('Sucursal inválida');
    if (!sucursalIds.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const sucursal = await this.dataSource.query(
      'SELECT id FROM sucursal WHERE id = $1 AND empresa_id = $2', [sucursalId, empresaId],
    );
    if (!sucursal.length) throw new ForbiddenException('La sucursal no pertenece a su empresa');
    const fechaDesde = desde || '1900-01-01';
    const fechaHasta = hasta || '2999-12-31';
    if (fechaDesde > fechaHasta) throw new BadRequestException('El rango de fechas es inválido');
    return this.dataSource.query(
      `WITH movimientos AS (
         SELECT cm.created_at::date AS fecha,
                CASE WHEN cm.tipo = 'INGRESO' THEN cm.monto ELSE 0 END AS ingreso_extra,
                CASE WHEN cm.tipo = 'SALIDA' THEN cm.monto ELSE 0 END AS egreso
           FROM caja_movimiento cm
           INNER JOIN caja ca ON ca.id = cm.caja_id
          WHERE ca.sucursal_id = $1
            AND cm.created_at::date BETWEEN $2::date AND $3::date
       ), pagos_venta AS (
         SELECT c.fecha_emision::date AS fecha, SUM(cp.monto)::numeric AS ingreso_ventas
           FROM comprobante_pago cp
           INNER JOIN comprobante c ON c.id = cp.comprobante_id
          WHERE c.sucursal_id = $1 AND c.estado <> 'ANULADA'
            AND c.fecha_emision::date BETWEEN $2::date AND $3::date
          GROUP BY c.fecha_emision::date
       ), gastos_pagados AS (
         SELECT fecha_pago AS fecha, SUM(monto)::numeric AS gastos_pagados
           FROM gasto_operativo
          WHERE empresa_id = $4 AND sucursal_id = $1 AND estado = 'PAGADO'
            AND fecha_pago BETWEEN $2::date AND $3::date
          GROUP BY fecha_pago
       ), dias AS (
         SELECT fecha FROM movimientos UNION SELECT fecha FROM pagos_venta
         UNION SELECT fecha FROM gastos_pagados
       )
       SELECT d.fecha,
              COALESCE(pv.ingreso_ventas,0)::numeric AS "ingresosVentas",
              COALESCE(SUM(m.ingreso_extra),0)::numeric AS "otrosIngresos",
              COALESCE(SUM(m.egreso),0)::numeric AS "egresosCaja",
              COALESCE(gp.gastos_pagados,0)::numeric AS "gastosPagados",
              (COALESCE(pv.ingreso_ventas,0)+COALESCE(SUM(m.ingreso_extra),0)
                -COALESCE(SUM(m.egreso),0)-COALESCE(gp.gastos_pagados,0))::numeric AS "flujoNeto"
         FROM dias d
         LEFT JOIN movimientos m ON m.fecha = d.fecha
         LEFT JOIN pagos_venta pv ON pv.fecha = d.fecha
         LEFT JOIN gastos_pagados gp ON gp.fecha = d.fecha
        GROUP BY d.fecha,pv.ingreso_ventas,gp.gastos_pagados
        ORDER BY d.fecha`,
      [sucursalId, fechaDesde, fechaHasta, empresaId],
    );
  }

  async estadoActual(sucursalId: number, usuarioId: number, empresaId: number, sucursalIds: number[]): Promise<Caja | null> {
    if (!Number.isInteger(sucursalId) || sucursalId <= 0) throw new BadRequestException('Debe indicar sucursalId válido');
    if (!sucursalIds.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const sucursal = await this.dataSource.query(
      'SELECT id FROM sucursal WHERE id = $1 AND empresa_id = $2', [sucursalId, empresaId],
    );
    if (!sucursal.length) throw new ForbiddenException('La sucursal no pertenece a su empresa');
    return this.cajaRepo.findOne({ where: { sucursalId, usuarioId, estado: EstadoCajaEnum.ABIERTA } });
  }
}
