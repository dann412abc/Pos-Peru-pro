import { createHash } from 'crypto';
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { FeService } from '../fe/fe.service';
import { Comprobante } from '../ventas/entities/comprobante.entity';
import { SERIE_POR_DEFECTO } from '../common/enums';
import { CrearDevolucionVentaDto } from './dto/crear-devolucion.dto';
import { calcularImporteDevolucion, distribuirDevolucion, redondearCantidad, redondearMonto, validarTotalReembolsos } from './devolucion-calculations';

const money = redondearMonto;
const quantity = redondearCantidad;

@Injectable()
export class DevolucionesService {
  constructor(private readonly dataSource: DataSource, private readonly feService: FeService) {}

  private validarSucursales(sucursalIds: number[], sucursalId?: number): number[] {
    const permitidas = [...new Set((sucursalIds || []).map(Number).filter((v) => Number.isInteger(v) && v > 0))];
    if (sucursalId !== undefined && !permitidas.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    return sucursalId ? [sucursalId] : permitidas;
  }

  private hashSolicitud(comprobanteId: number, dto: CrearDevolucionVentaDto): string {
    const contenido = {
      comprobanteId: Number(comprobanteId),
      motivo: dto.motivo.trim(),
      lineas: [...(dto.lineas || [])].map((l) => ({
        comprobanteLineaId: Number(l.comprobanteLineaId), cantidad: quantity(Number(l.cantidad)), reingresarStock: Boolean(l.reingresarStock),
      })).sort((a, b) => a.comprobanteLineaId - b.comprobanteLineaId),
      pagos: [...(dto.pagos || [])].map((p) => ({
        metodoPago: p.metodoPago, monto: money(Number(p.monto)), referencia: (p.referencia || '').trim(),
      })).sort((a, b) => `${a.metodoPago}:${a.monto}:${a.referencia}`.localeCompare(`${b.metodoPago}:${b.monto}:${b.referencia}`)),
    };
    return createHash('sha256').update(JSON.stringify(contenido)).digest('hex');
  }

  async listar(empresaId: number, sucursalIds: number[], sucursalId?: number): Promise<any[]> {
    const ids = this.validarSucursales(sucursalIds, sucursalId);
    if (!ids.length) return [];
    return this.dataSource.query(
      `SELECT d.id, d.comprobante_id AS "comprobanteId", d.sucursal_id AS "sucursalId",
              d.motivo, d.total_devolucion AS "totalDevolucion",
              d.credito_revertido AS "creditoRevertido", d.monto_reembolsado AS "montoReembolsado",
              d.created_at AS "createdAt", c.tipo, c.serie, c.correlativo,
              cl.nombre AS "clienteNombre", u.nombre AS "responsable",
              (SELECT COUNT(*)::int FROM devolucion_venta_linea dl WHERE dl.devolucion_id=d.id) AS "lineas",
              nc.id AS "notaCreditoId", nc.serie AS "notaCreditoSerie", nc.correlativo AS "notaCreditoCorrelativo"
       FROM devolucion_venta d
       INNER JOIN comprobante c ON c.id=d.comprobante_id AND c.empresa_id=d.empresa_id
       LEFT JOIN cliente cl ON cl.id=d.cliente_id AND cl.empresa_id=d.empresa_id
       INNER JOIN usuario u ON u.id=d.usuario_id AND u.empresa_id=d.empresa_id
       LEFT JOIN comprobante nc ON nc.devolucion_venta_id=d.id AND nc.empresa_id=d.empresa_id AND nc.tipo='07'
       WHERE d.empresa_id=$1 AND d.sucursal_id=ANY($2::int[])
       ORDER BY d.created_at DESC,d.id DESC LIMIT 300`, [empresaId, ids],
    );
  }

  async buscarComprobantes(termino: string, empresaId: number, sucursalIds: number[], sucursalId?: number): Promise<any[]> {
    const ids = this.validarSucursales(sucursalIds, sucursalId);
    const q = String(termino || '').trim();
    if (q.length < 2 || q.length > 80) throw new BadRequestException('Escriba al menos 2 caracteres y no más de 80 para buscar');
    if (!ids.length) return [];
    return this.dataSource.query(
      `SELECT c.id,c.tipo,c.serie,c.correlativo,c.total,c.estado,
              c.fecha_emision AS "fechaEmision",
              jsonb_build_object('nombre',cl.nombre) AS cliente
       FROM comprobante c
       LEFT JOIN cliente cl ON cl.id=c.cliente_id AND cl.empresa_id=c.empresa_id
       WHERE c.empresa_id=$1 AND c.sucursal_id=ANY($2::int[])
         AND c.tipo IN ('01','03') AND c.estado <> 'ANULADA'
         AND (
           c.serie ILIKE '%' || $3 || '%'
           OR c.correlativo::text ILIKE '%' || $3 || '%'
           OR (c.serie || '-' || LPAD(c.correlativo::text,8,'0')) ILIKE '%' || $3 || '%'
           OR cl.nombre ILIKE '%' || $3 || '%'
           OR COALESCE(cl.numero,'') ILIKE '%' || $3 || '%'
         )
       ORDER BY c.fecha_emision DESC,c.id DESC LIMIT 100`, [empresaId, ids, q],
    );
  }

  async disponibilidad(comprobanteId: number, empresaId: number, sucursalIds: number[]): Promise<any> {
    const ids = this.validarSucursales(sucursalIds);
    if (!ids.length) throw new NotFoundException('Comprobante no encontrado');
    const comprobantes = await this.dataSource.query(
      `SELECT c.id,c.sucursal_id AS "sucursalId",c.cliente_id AS "clienteId",c.tipo,c.serie,
              c.correlativo,c.total,c.estado,c.fecha_emision AS "fechaEmision",cl.nombre AS "clienteNombre"
       FROM comprobante c LEFT JOIN cliente cl ON cl.id=c.cliente_id AND cl.empresa_id=c.empresa_id
       WHERE c.id=$1 AND c.empresa_id=$2 AND c.sucursal_id=ANY($3::int[])`, [comprobanteId, empresaId, ids],
    );
    if (!comprobantes.length) throw new NotFoundException('Comprobante no encontrado');
    const comprobante = comprobantes[0];
    if (!['01', '03'].includes(comprobante.tipo)) throw new BadRequestException('Solo se permiten devoluciones de facturas y boletas de venta');
    if (comprobante.estado === 'ANULADA') throw new BadRequestException('No se puede devolver un comprobante anulado');

    const lineas = await this.dataSource.query(
      `SELECT cl.id AS "comprobanteLineaId",cl.producto_id AS "productoId",cl.variante_id AS "varianteId",
              p.codigo,p.nombre AS "productoNombre",pv.nombre AS "varianteNombre",
              cl.cantidad AS "cantidadOriginal",cl.precio_unitario AS "precioUnitario",cl.subtotal AS "importeOriginal",
              COALESCE(dev.cantidad_devuelta,0)::numeric AS "cantidadDevuelta",
              GREATEST(0,cl.cantidad-COALESCE(dev.cantidad_devuelta,0))::numeric AS "cantidadDisponible",
              GREATEST(0,cl.subtotal-COALESCE(dev.importe_devuelto,0))::numeric AS "importeDisponible"
       FROM comprobante_linea cl
       INNER JOIN producto p ON p.id=cl.producto_id AND p.empresa_id=$2
       LEFT JOIN LATERAL (
         SELECT SUM(dl.cantidad)::numeric AS cantidad_devuelta,SUM(dl.monto)::numeric AS importe_devuelto
         FROM devolucion_venta_linea dl INNER JOIN devolucion_venta d ON d.id=dl.devolucion_id
         WHERE dl.comprobante_linea_id=cl.id AND d.empresa_id=$2 AND d.estado='REGISTRADA'
       ) dev ON TRUE
       WHERE cl.comprobante_id=$1 ORDER BY cl.numero_linea`, [comprobanteId, empresaId],
    );
    const cuentas = await this.dataSource.query(
      `SELECT id,saldo_pendiente AS "saldoPendiente",total_credito AS "totalCredito"
       FROM cuenta_cobrar WHERE comprobante_id=$1 AND empresa_id=$2 AND sucursal_id=$3`,
      [comprobanteId, empresaId, comprobante.sucursalId],
    );
    return { comprobante, lineas, cuentaCredito: cuentas[0] || null };
  }

  async detalle(id: number, empresaId: number, sucursalIds: number[]): Promise<any> {
    const ids = this.validarSucursales(sucursalIds);
    const headers = await this.dataSource.query(
      `SELECT d.id,d.empresa_id AS "empresaId",d.sucursal_id AS "sucursalId",d.comprobante_id AS "comprobanteId",
              d.cliente_id AS "clienteId",d.usuario_id AS "usuarioId",d.caja_id AS "cajaId",d.motivo,
              d.total_devolucion AS "totalDevolucion",d.credito_revertido AS "creditoRevertido",
              d.monto_reembolsado AS "montoReembolsado",d.created_at AS "createdAt",
              c.tipo,c.serie,c.correlativo,cl.nombre AS "clienteNombre",u.nombre AS responsable
       FROM devolucion_venta d
       INNER JOIN comprobante c ON c.id=d.comprobante_id AND c.empresa_id=d.empresa_id
       INNER JOIN cliente cl ON cl.id=d.cliente_id AND cl.empresa_id=d.empresa_id
       INNER JOIN usuario u ON u.id=d.usuario_id AND u.empresa_id=d.empresa_id
       WHERE d.id=$1 AND d.empresa_id=$2 AND d.sucursal_id=ANY($3::int[])`, [id, empresaId, ids],
    );
    if (!headers.length) throw new NotFoundException('Devolución no encontrada');
    const [lineas, pagos] = await Promise.all([
      this.dataSource.query(
        `SELECT dl.id,dl.comprobante_linea_id AS "comprobanteLineaId",dl.producto_id AS "productoId",
                dl.variante_id AS "varianteId",p.codigo,p.nombre AS "productoNombre",
                pv.nombre AS "varianteNombre",dl.cantidad,dl.monto,dl.reingresar_stock AS "reingresarStock"
         FROM devolucion_venta_linea dl
         INNER JOIN producto p ON p.id=dl.producto_id AND p.empresa_id=$2
         LEFT JOIN producto_variante pv ON pv.id=dl.variante_id AND pv.producto_id=dl.producto_id AND pv.empresa_id=p.empresa_id
         WHERE dl.devolucion_id=$1 ORDER BY dl.id`, [id, empresaId],
      ),
      this.dataSource.query(
        `SELECT id,metodo_pago AS "metodoPago",monto,referencia,created_at AS "createdAt"
         FROM devolucion_venta_pago WHERE devolucion_id=$1 AND empresa_id=$2 ORDER BY id`, [id, empresaId],
      ),
    ]);
    return { ...headers[0], lineas, pagos };
  }

  /** Emite una nota de crédito documental por una devolución ya contabilizada.
   * El saldo y el reembolso se ajustaron al registrar la devolución; aquí no se vuelven a tocar.
   */
  async emitirNotaCredito(id: number, usuarioId: number, empresaId: number, sucursalIds: number[]): Promise<Comprobante> {
    const sucursales = this.validarSucursales(sucursalIds);
    if (!sucursales.length) throw new ForbiddenException('No tiene sucursales asignadas');
    const notaId = await this.dataSource.transaction(async (manager) => {
      const filas = await manager.query(
        `SELECT d.id,d.sucursal_id,d.comprobante_id,d.cliente_id,d.total_devolucion,d.motivo,d.estado,
                c.tipo,c.serie,c.correlativo,c.total AS total_original
         FROM devolucion_venta d
         INNER JOIN comprobante c ON c.id=d.comprobante_id AND c.empresa_id=d.empresa_id
         WHERE d.id=$1 AND d.empresa_id=$2 AND d.sucursal_id=ANY($3::int[])
         FOR UPDATE OF d,c`, [id, empresaId, sucursales],
      );
      if (!filas.length) throw new NotFoundException('Devolución no encontrada');
      const devolucion = filas[0];
      if (devolucion.estado !== 'REGISTRADA' || !['01','03'].includes(devolucion.tipo)) {
        throw new BadRequestException('La nota de crédito requiere una devolución registrada de factura o boleta');
      }
      const existente = await manager.query(
        `SELECT id FROM comprobante WHERE empresa_id=$1 AND devolucion_venta_id=$2 AND tipo='07'`, [empresaId,id],
      );
      if (existente.length) return Number(existente[0].id);
      const lineas = await manager.query(
        `SELECT dl.cantidad,dl.monto,cl.producto_id,cl.variante_id,cl.variante_nombre,cl.variante_codigo,
                cl.precio_unitario,cl.descuento,cl.tipo_igv,cl.base_imponible,cl.igv,cl.subtotal
         FROM devolucion_venta_linea dl
         INNER JOIN comprobante_linea cl ON cl.id=dl.comprobante_linea_id AND cl.comprobante_id=$2
         WHERE dl.devolucion_id=$1 AND dl.empresa_id=$3 ORDER BY cl.numero_linea FOR UPDATE OF cl`, [id,devolucion.comprobante_id,empresaId],
      );
      if (!lineas.length) throw new BadRequestException('La devolución no tiene líneas que se puedan documentar');
      const total = money(Number(devolucion.total_devolucion));
      const lineasCalculadas = lineas.map((linea: any) => {
        const subtotalOriginal = Number(linea.subtotal);
        const importe = money(Number(linea.monto));
        const fraccion = subtotalOriginal > 0 ? importe / subtotalOriginal : 0;
        const base = money(Number(linea.base_imponible) * fraccion);
        const igv = Number(linea.tipo_igv) === 10 ? money(importe - base) : 0;
        return { ...linea, subtotalOriginal, base, igv, descuentoNota: money(Number(linea.descuento) * fraccion), subtotal: importe };
      });
      const lineasOriginales = await manager.query(
        `SELECT COALESCE(SUM(cl.subtotal),0)::numeric AS total
         FROM comprobante_linea cl WHERE cl.comprobante_id=$1`, [devolucion.comprobante_id],
      );
      const sumaDevoluciones = await manager.query(
        `SELECT COALESCE(SUM(total_devolucion),0)::numeric AS total
         FROM devolucion_venta WHERE comprobante_id=$1 AND empresa_id=$2 AND estado='REGISTRADA'`, [devolucion.comprobante_id,empresaId],
      );
      const codigo = Math.abs(Number(sumaDevoluciones[0].total) - Number(lineasOriginales[0].total)) <= 0.01 ? '06' : '07';
      const sumas = (tipo: number) => lineasCalculadas.filter((l: any) => Number(l.tipo_igv) === tipo).reduce((s: number, l: any) => s + Number(l.base), 0);
      const opGravadas = money(sumas(10)); const opExoneradas = money(sumas(20)); const opInafectas = money(sumas(30));
      const totalIgv = money(lineasCalculadas.reduce((s: number, l: any) => s + Number(l.igv), 0));
      const serie = SERIE_POR_DEFECTO['07'] || 'NC01';
      const secuencia = await manager.query(
        `UPDATE serie_correlativo SET ultimo_correlativo=ultimo_correlativo+1
         WHERE sucursal_id=$1 AND tipo_comprobante='07' AND serie=$2 RETURNING ultimo_correlativo`,
        [devolucion.sucursal_id,serie],
      );
      if (!secuencia.length) throw new BadRequestException(`No existe serie ${serie} para notas de crédito en esta sucursal`);
      const inserted = await manager.query(
        `INSERT INTO comprobante
          (empresa_id,sucursal_id,caja_id,usuario_id,cliente_id,tipo,serie,correlativo,op_gravadas,op_exoneradas,op_inafectas,
           descuento_global,total_igv,total,metodo_pago,estado,referencia_comprobante_id,devolucion_venta_id,codigo_motivo_nota,descripcion_motivo_nota)
         VALUES ($1,$2,NULL,$3,$4,'07',$5,$6,$7,$8,$9,0,$10,$11,'CREDITO','PAGADA',$12,$13,$14,$15) RETURNING id`,
        [empresaId,devolucion.sucursal_id,usuarioId,devolucion.cliente_id,serie,Number(secuencia[0].ultimo_correlativo),
          opGravadas,opExoneradas,opInafectas,totalIgv,total,devolucion.comprobante_id,id,codigo,
          `${codigo === '06' ? 'Devolución total' : 'Devolución parcial'}: ${String(devolucion.motivo).slice(0,200)}`],
      );
      const nuevoId = Number(inserted[0].id);
      for (const [index, linea] of lineasCalculadas.entries()) {
        await manager.query(
          `INSERT INTO comprobante_linea
            (comprobante_id,numero_linea,producto_id,variante_id,variante_nombre,variante_codigo,
             cantidad,precio_unitario,descuento,tipo_igv,base_imponible,igv,subtotal)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [nuevoId,index+1,linea.producto_id,linea.variante_id || null,linea.variante_nombre || null,linea.variante_codigo || null,
            linea.cantidad,linea.precio_unitario,linea.descuentoNota,linea.tipo_igv,linea.base,linea.igv,linea.subtotal],
        );
      }
      return nuevoId;
    });
    this.feService.crearDesdeComprobante(notaId, empresaId, sucursales).catch((err) => {
      console.error('No se pudo encolar la nota de crédito; queda registrada para reintento:', (err as Error).message);
    });
    return this.dataSource.getRepository(Comprobante).findOneOrFail({
      where: { id: notaId, empresaId }, relations: ['lineas','cliente','referenciaComprobante'],
    });
  }

  async crear(
    comprobanteId: number,
    dto: CrearDevolucionVentaDto,
    usuarioId: number,
    empresaId: number,
    sucursalIds: number[],
  ): Promise<any> {
    const sucursales = this.validarSucursales(sucursalIds);
    if (!sucursales.length) throw new ForbiddenException('No tiene sucursales asignadas');
    const motivo = dto.motivo?.trim();
    const clave = dto.idempotencyKey?.trim();
    if (!motivo || motivo.length < 5) throw new BadRequestException('Indique un motivo de al menos 5 caracteres');
    if (!clave || clave.length < 8 || clave.length > 100) throw new BadRequestException('La clave de operación es inválida');
    if (!Array.isArray(dto.lineas) || !dto.lineas.length || dto.lineas.length > 100) throw new BadRequestException('Seleccione al menos una línea para devolver');
    const hash = this.hashSolicitud(comprobanteId, dto);

    try {
      await this.dataSource.transaction(async (manager: EntityManager) => {
        // Serializa reintentos de una misma clave antes de consultar o descontar cantidades disponibles.
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`mi-carrito-pos:devolucion:${empresaId}:${usuarioId}:${clave}`],
        );
        const existente = await manager.query(
          `SELECT id,request_hash FROM devolucion_venta WHERE empresa_id=$1 AND usuario_id=$2 AND idempotency_key=$3`,
          [empresaId, usuarioId, clave],
        );
        if (existente.length) {
          if (existente[0].request_hash !== hash) throw new ConflictException('La clave de devolución ya se usó con otros datos. Revise el historial antes de continuar.');
          return;
        }

        const ventas = await manager.query(
          `SELECT c.id,c.empresa_id,c.sucursal_id,c.cliente_id,c.caja_id,c.tipo,c.serie,c.correlativo,c.total,c.estado
           FROM comprobante c WHERE c.id=$1 AND c.empresa_id=$2 AND c.sucursal_id=ANY($3::int[]) FOR UPDATE`,
          [comprobanteId, empresaId, sucursales],
        );
        if (!ventas.length) throw new NotFoundException('Comprobante no encontrado');
        const venta = ventas[0];
        if (!['01', '03'].includes(venta.tipo)) throw new BadRequestException('Solo se permiten devoluciones de facturas y boletas');
        if (venta.estado === 'ANULADA') throw new BadRequestException('No se puede devolver una venta anulada');

        // Orden estable: caja -> cuenta/cliente -> inventario, igual que ventas y cobranzas.
        // Toda devolución requiere un turno abierto para conservar la trazabilidad del responsable.
        const cajasAbiertas = await manager.query(
          `SELECT c.id,c.saldo_inicial FROM caja c INNER JOIN sucursal s ON s.id=c.sucursal_id
           WHERE c.sucursal_id=$1 AND c.usuario_id=$2 AND c.estado='ABIERTA' AND s.empresa_id=$3
           FOR UPDATE OF c`, [venta.sucursal_id, usuarioId, empresaId],
        );
        if (!cajasAbiertas.length) throw new BadRequestException('Abra una caja en la sucursal de la venta para registrar la devolución');
        const cajaId = Number(cajasAbiertas[0].id);
        const originales = await manager.query(
          `SELECT cl.id,cl.producto_id,cl.variante_id,cl.cantidad,cl.precio_unitario,cl.costo_unitario,cl.subtotal,
                   p.nombre,COALESCE(pv.nombre,'') AS variante_nombre
            FROM comprobante_linea cl
            INNER JOIN producto p ON p.id=cl.producto_id AND p.empresa_id=$2
            LEFT JOIN producto_variante pv
              ON pv.id=cl.variante_id AND pv.producto_id=cl.producto_id AND pv.empresa_id=p.empresa_id
            WHERE cl.comprobante_id=$1
            ORDER BY cl.producto_id,cl.variante_id NULLS FIRST,cl.id FOR UPDATE OF cl`, [comprobanteId, empresaId],
        );
        const lineasSolicitadas = new Map<number, { cantidad: number; reingresarStock: boolean }>();
        for (const item of dto.lineas) {
          const lineId = Number(item.comprobanteLineaId);
          const qty = quantity(Number(item.cantidad));
          if (!Number.isInteger(lineId) || lineId <= 0 || !Number.isFinite(qty) || qty <= 0 || Math.abs(qty - Number(item.cantidad)) > 0.000001) {
            throw new BadRequestException('Cada línea debe tener un ID y una cantidad válida de hasta 3 decimales');
          }
          if (lineasSolicitadas.has(lineId)) throw new BadRequestException('No repita líneas en la misma devolución');
          lineasSolicitadas.set(lineId, { cantidad: qty, reingresarStock: Boolean(item.reingresarStock) });
        }
        const lineIds = [...lineasSolicitadas.keys()];
        const noPertenecen = lineIds.filter((lineId) => !originales.some((row: any) => Number(row.id) === lineId));
        if (noPertenecen.length) throw new BadRequestException('Una o más líneas no pertenecen al comprobante original');

        const previas = await manager.query(
          `SELECT dl.comprobante_linea_id,SUM(dl.cantidad)::numeric AS cantidad_devuelta,
                  SUM(dl.monto)::numeric AS monto_devuelto
           FROM devolucion_venta_linea dl INNER JOIN devolucion_venta d ON d.id=dl.devolucion_id
           WHERE d.comprobante_id=$1 AND d.empresa_id=$2 AND d.estado='REGISTRADA'
           GROUP BY dl.comprobante_linea_id`, [comprobanteId, empresaId],
        );
        const previasMap = new Map<number, { cantidad: number; monto: number }>(previas.map((row: any) => [
          Number(row.comprobante_linea_id),
          { cantidad: Number(row.cantidad_devuelta), monto: Number(row.monto_devuelto) },
        ]));

        const procesadas: Array<{ original: any; cantidad: number; monto: number; reingresarStock: boolean }> = [];
        let totalDevolucion = 0;
        for (const original of originales) {
          const solicitado = lineasSolicitadas.get(Number(original.id));
          if (!solicitado) continue;
          const previa = previasMap.get(Number(original.id)) || { cantidad: 0, monto: 0 };
          const originalQty = Number(original.cantidad);
          const disponible = quantity(originalQty - previa.cantidad);
          if (solicitado.cantidad - disponible > 0.0001) {
            throw new BadRequestException(`La cantidad a devolver de ${original.nombre} supera lo disponible (${disponible})`);
          }
          const importeDisponible = money(Number(original.subtotal) - previa.monto);
          let importe: number;
          try {
            importe = calcularImporteDevolucion(Number(original.subtotal), originalQty, solicitado.cantidad, disponible, importeDisponible);
          } catch (error: any) {
            throw new BadRequestException(`${error.message} · ${original.nombre}`);
          }
          procesadas.push({
            original: { ...original, nombre: original.variante_nombre ? `${original.nombre} - ${original.variante_nombre}` : original.nombre },
            cantidad: solicitado.cantidad, monto: importe, reingresarStock: solicitado.reingresarStock,
          });
          totalDevolucion = money(totalDevolucion + importe);
        }
        if (!procesadas.length || totalDevolucion <= 0) throw new BadRequestException('No hay cantidades válidas disponibles para devolver');

        const cuentas = await manager.query(
          `SELECT id,total_credito,saldo_pendiente FROM cuenta_cobrar
           WHERE comprobante_id=$1 AND empresa_id=$2 AND sucursal_id=$3 FOR UPDATE`,
          [comprobanteId, empresaId, venta.sucursal_id],
        );
        if (venta.cliente_id !== null && venta.cliente_id !== undefined) {
          const clienteBloqueado = await manager.query(
            `SELECT id FROM cliente WHERE id=$1 AND empresa_id=$2 FOR UPDATE`, [venta.cliente_id, empresaId],
          );
          if (!clienteBloqueado.length) throw new NotFoundException('Cliente de la venta no encontrado');
        }
        const pagosOriginales = await manager.query(
          `SELECT metodo_pago AS metodo,monto FROM comprobante_pago WHERE comprobante_id=$1`, [comprobanteId],
        );
        const creditoOriginal = money(pagosOriginales.filter((p: any) => p.metodo === 'CREDITO')
          .reduce((sum: number, p: any) => sum + Number(p.monto), 0));
        if (creditoOriginal > 0 && venta.cliente_id == null) {
          throw new ConflictException('La venta tiene crédito pero no tiene cliente asociado. Corrija el comprobante antes de devolver.');
        }
        if (!cuentas.length && creditoOriginal > 0) {
          throw new ConflictException('La venta contiene crédito pero no tiene cuenta por cobrar asociada. Revise la migración antes de devolver.');
        }
        const saldoCredito = cuentas.length ? money(Number(cuentas[0].saldo_pendiente)) : 0;
        const { creditoRevertido, montoReembolsado } = distribuirDevolucion(totalDevolucion, saldoCredito);

        const pagos = (dto.pagos || []).map((p) => ({
          metodoPago: p.metodoPago,
          monto: money(Number(p.monto)),
          referencia: p.referencia?.trim() || null,
        }));
        if (pagos.some((p) => !Number.isFinite(p.monto) || p.monto <= 0)) throw new BadRequestException('Cada reembolso debe ser mayor a cero');
        if (pagos.some((p) => ['YAPE', 'PLIN'].includes(p.metodoPago) && !p.referencia)) {
          throw new BadRequestException('Yape y Plin requieren el número de operación del reembolso');
        }
        if (new Set(pagos.map((p) => p.metodoPago)).size !== pagos.length) throw new BadRequestException('Consolide los importes de un mismo medio de reembolso');
        const totalPagos = money(pagos.reduce((sum, p) => sum + p.monto, 0));
        try { validarTotalReembolsos(totalPagos, montoReembolsado); }
        catch { throw new BadRequestException(`El reembolso en medios de pago debe sumar S/ ${montoReembolsado.toFixed(2)}; el crédito pendiente se ajusta automáticamente por S/ ${money(creditoRevertido).toFixed(2)}.`); }

        if (montoReembolsado > 0) {
          const efectivoReembolsado = money(pagos.filter((p) => p.metodoPago === 'EFECTIVO').reduce((sum, p) => sum + p.monto, 0));
          if (efectivoReembolsado > 0) {
            const ventasEfectivo = await manager.query(
              `SELECT COALESCE(SUM(monto),0)::numeric AS total FROM (
                 SELECT cp.monto FROM comprobante_pago cp INNER JOIN comprobante c ON c.id=cp.comprobante_id
                 WHERE c.caja_id=$1 AND cp.metodo_pago='EFECTIVO'
                 UNION ALL SELECT c.total FROM comprobante c WHERE c.caja_id=$1 AND c.metodo_pago='EFECTIVO'
                   AND NOT EXISTS (SELECT 1 FROM comprobante_pago cp WHERE cp.comprobante_id=c.id)
               ) x`, [cajaId],
            );
            const movimientosEfectivo = await manager.query(
              `SELECT COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END),0)::numeric AS total
               FROM caja_movimiento WHERE caja_id=$1 AND metodo_pago='EFECTIVO'`, [cajaId],
            );
            const disponibleEfectivo = money(Number(cajasAbiertas[0].saldo_inicial || 0)
              + Number(ventasEfectivo[0]?.total || 0) + Number(movimientosEfectivo[0]?.total || 0));
            if (efectivoReembolsado > disponibleEfectivo) {
              throw new BadRequestException(`La caja dispone de S/ ${disponibleEfectivo.toFixed(2)} en efectivo y no puede devolver S/ ${efectivoReembolsado.toFixed(2)}`);
            }
          }
        }

        const headers = await manager.query(
          `INSERT INTO devolucion_venta
            (empresa_id,sucursal_id,comprobante_id,cliente_id,usuario_id,caja_id,motivo,total_devolucion,credito_revertido,monto_reembolsado,idempotency_key,request_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [empresaId, venta.sucursal_id, comprobanteId, venta.cliente_id, usuarioId, cajaId, motivo.slice(0, 500),
            totalDevolucion, creditoRevertido, montoReembolsado, clave, hash],
        );
        const devolucionId = Number(headers[0].id);

        for (const item of procesadas) {
          const returnLineRows = await manager.query(
            `INSERT INTO devolucion_venta_linea
              (devolucion_id,empresa_id,sucursal_id,comprobante_linea_id,producto_id,variante_id,cantidad,monto,reingresar_stock)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [devolucionId, empresaId, venta.sucursal_id, item.original.id, item.original.producto_id,
              item.original.variante_id || null, item.cantidad, item.monto, item.reingresarStock],
          );
          const devolucionLineaId = Number(returnLineRows[0].id);
          if (item.reingresarStock) {
            const varianteId = item.original.variante_id ? Number(item.original.variante_id) : null;
            const stock = varianteId
              ? await manager.query(
                  `SELECT stock FROM producto_variante_stock
                   WHERE variante_id=$1 AND producto_id=$2 AND sucursal_id=$3 AND empresa_id=$4 FOR UPDATE`,
                  [varianteId, item.original.producto_id, venta.sucursal_id, empresaId],
                )
              : await manager.query(
                  `SELECT stock FROM producto_stock WHERE producto_id=$1 AND sucursal_id=$2 AND empresa_id=$3 FOR UPDATE`,
                  [item.original.producto_id, venta.sucursal_id, empresaId],
                );
            if (!stock.length) throw new NotFoundException(`No hay saldo de inventario para ${item.original.nombre}`);
            const anterior = Number(stock[0].stock);
            const actualizado = varianteId
              ? await manager.query(
                  `UPDATE producto_variante_stock SET stock=stock+$1,updated_at=NOW()
                   WHERE variante_id=$2 AND producto_id=$3 AND sucursal_id=$4 AND empresa_id=$5 RETURNING stock`,
                  [item.cantidad, varianteId, item.original.producto_id, venta.sucursal_id, empresaId],
                )
              : await manager.query(
                  `UPDATE producto_stock SET stock=stock+$1,updated_at=NOW()
                   WHERE producto_id=$2 AND sucursal_id=$3 AND empresa_id=$4 RETURNING stock`,
                  [item.cantidad, item.original.producto_id, venta.sucursal_id, empresaId],
                );
            let pendiente = Number(item.cantidad);
            const lotesOrigen = await manager.query(
              `SELECT cls.lote_id, cls.cantidad,
                      cls.cantidad-COALESCE(retornado.cantidad,0) AS disponible_devolver
               FROM comprobante_lote_salida cls
               LEFT JOIN (
                 SELECT dvl.lote_id,SUM(dvl.cantidad)::numeric AS cantidad
                 FROM devolucion_venta_lote dvl
                 INNER JOIN devolucion_venta_linea dline ON dline.id=dvl.devolucion_linea_id
                 INNER JOIN devolucion_venta dv ON dv.id=dline.devolucion_id
                 WHERE dv.comprobante_id=$1 AND dv.empresa_id=$2 AND dv.estado='REGISTRADA'
                 GROUP BY dvl.lote_id
               ) retornado ON retornado.lote_id=cls.lote_id
               WHERE cls.empresa_id=$2 AND cls.comprobante_id=$1 AND cls.producto_id=$3
                 AND cls.variante_id IS NOT DISTINCT FROM $4::int
               ORDER BY cls.id FOR UPDATE OF cls`,
              [comprobanteId, empresaId, item.original.producto_id, varianteId],
            );
            for (const lote of lotesOrigen) {
              if (pendiente <= 0.0005) break;
              const disponibleDevolver = Math.max(0, Number(lote.disponible_devolver || 0));
              if (disponibleDevolver <= 0) continue;
              const tomar = Math.min(pendiente, disponibleDevolver);
              await manager.query(
                'UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible+$1 WHERE id=$2',
                [tomar, lote.lote_id],
              );
              await manager.query(
                `INSERT INTO devolucion_venta_lote(devolucion_linea_id,lote_id,cantidad)
                 VALUES($1,$2,$3)`,
                [devolucionLineaId, lote.lote_id, tomar],
              );
              pendiente = Number((pendiente - tomar).toFixed(3));
            }
            if (pendiente > 0.0005) {
              if (lotesOrigen.length) {
                throw new BadRequestException('No se pudo identificar el lote original completo para reingresar la devolución. Revise la trazabilidad del comprobante.');
              }
              const costoOriginal = Number(item.original.costo_unitario);
              if (!Number.isFinite(costoOriginal) || costoOriginal < 0) {
                throw new BadRequestException('No se puede reingresar el producto: el costo histórico de la venta no es válido.');
              }
              await manager.query(
                `INSERT INTO inventario_lote
                  (empresa_id,sucursal_id,producto_id,variante_id,codigo_lote,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario)
                 VALUES($1,$2,$3,$4,$5,NULL,$6,$6,$7)`,
                [empresaId, venta.sucursal_id, item.original.producto_id, varianteId,
                  `DEVCLIENTE-${devolucionId}-${item.original.id}`, pendiente, costoOriginal],
              );
            }
            await manager.query(
              `INSERT INTO movimiento_inventario
                (empresa_id,sucursal_id,producto_id,variante_id,comprobante_id,usuario_id,tipo,cantidad,stock_anterior,stock_posterior,motivo)
               VALUES ($1,$2,$3,$4,$5,$6,'ENTRADA',$7,$8,$9,$10)`,
              [empresaId, venta.sucursal_id, item.original.producto_id, varianteId, comprobanteId, usuarioId,
                item.cantidad, anterior, Number(actualizado[0].stock), `Devolución #${devolucionId}: ${motivo}`.slice(0, 200)],
            );
          }
        }

        if (creditoRevertido > 0 && cuentas.length) {
          const nuevoSaldo = money(saldoCredito - creditoRevertido);
          const nuevoEstado = nuevoSaldo <= 0 ? 'AJUSTADA' : 'PARCIAL';
          await manager.query(
            `UPDATE cuenta_cobrar SET saldo_pendiente=$1,monto_revertido=monto_revertido+$2,estado=$3,updated_at=NOW()
             WHERE id=$4 AND empresa_id=$5`, [nuevoSaldo, creditoRevertido, nuevoEstado, cuentas[0].id, empresaId],
          );
          if (venta.cliente_id != null) {
            await manager.query(
              `UPDATE cliente SET saldo_credito=GREATEST(0,saldo_credito-$1) WHERE id=$2 AND empresa_id=$3`,
              [creditoRevertido, venta.cliente_id, empresaId],
            );
          }
          if (nuevoSaldo <= 0) {
            await manager.query(`UPDATE comprobante SET estado='PAGADA' WHERE id=$1 AND empresa_id=$2 AND estado='PENDIENTE'`, [comprobanteId, empresaId]);
          }
        }

        for (const pago of pagos) {
          await manager.query(
            `INSERT INTO devolucion_venta_pago (devolucion_id,empresa_id,sucursal_id,metodo_pago,monto,referencia)
             VALUES ($1,$2,$3,$4,$5,$6)`, [devolucionId, empresaId, venta.sucursal_id, pago.metodoPago, pago.monto, pago.referencia],
          );
          await manager.query(
            `INSERT INTO caja_movimiento
              (caja_id,usuario_id,tipo,metodo_pago,monto,motivo,comprobante_id,devolucion_venta_id)
             VALUES ($1,$2,'SALIDA',$3,$4,$5,$6,$7)`,
            [cajaId, usuarioId, pago.metodoPago, pago.monto,
              `Reembolso por devolución #${devolucionId}`.slice(0, 200), comprobanteId, devolucionId],
          );
        }
      });
    } catch (error: any) {
      const code = error?.code || error?.driverError?.code;
      if (code === '23505') {
        const previa = await this.dataSource.query(
          `SELECT id,request_hash FROM devolucion_venta WHERE empresa_id=$1 AND usuario_id=$2 AND idempotency_key=$3`,
          [empresaId, usuarioId, clave],
        );
        if (previa.length) {
          if (previa[0].request_hash !== hash) throw new ConflictException('La clave de devolución ya se usó con otros datos. Revise el historial.');
          return this.detalle(Number(previa[0].id), empresaId, sucursales);
        }
      }
      throw error;
    }

    const previa = await this.dataSource.query(
      `SELECT id FROM devolucion_venta WHERE empresa_id=$1 AND usuario_id=$2 AND idempotency_key=$3`,
      [empresaId, usuarioId, clave],
    );
    if (!previa.length) throw new NotFoundException('No se pudo confirmar la devolución registrada');
    return this.detalle(Number(previa[0].id), empresaId, sucursales);
  }
}
