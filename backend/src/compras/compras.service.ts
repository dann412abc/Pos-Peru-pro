import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { redondear2 } from '../common/utils/round.util';
import { calcularCostoPromedio, calcularLineaCompra, convertirEmpaqueCompra } from './compra-calculations';
import { CrearCompraDto, PagoCompraDto, RegistrarPagoCompraDto, AnularCompraDto } from './dto/compra.dto';
import { ProveedorDto } from './dto/proveedor.dto';
import { DevolucionProveedorDto } from './dto/devolucion-proveedor.dto';
import { calcularAplicacionNotaProveedor } from './devolucion-proveedor-calculations';

type MetodoCompra = 'EFECTIVO' | 'TARJETA' | 'YAPE' | 'PLIN' | 'TRANSFERENCIA';
type PagoNormalizado = { metodoPago: MetodoCompra; monto: number; cajaId?: number; referencia?: string; idempotencyKey?: string };

@Injectable()
export class ComprasService {
  constructor(private readonly dataSource: DataSource) {}

  private validarDocumentoProveedor(dto: ProveedorDto): void {
    const numero = dto.numero.trim();
    if (dto.tipoDoc === 'RUC' && !/^(10|15|16|17|20)\d{9}$/.test(numero)) throw new BadRequestException('El RUC del proveedor debe tener 11 dígitos');
    if (dto.tipoDoc === 'DNI' && !/^\d{8}$/.test(numero)) throw new BadRequestException('El DNI del proveedor debe tener 8 dígitos');
    if (dto.tipoDoc === 'OTRO' && !/^[0-9A-Za-z-]{1,15}$/.test(numero)) throw new BadRequestException('Número de documento del proveedor inválido');
  }

  async listarProveedores(empresaId: number, incluirInactivos = false): Promise<any[]> {
    return this.dataSource.query(
      `SELECT id, tipo_doc AS "tipoDoc", numero, nombre, direccion, telefono, email,
              contacto, observaciones, activo, created_at AS "createdAt"
       FROM proveedor WHERE empresa_id = $1 AND ($2::boolean OR activo = TRUE)
       ORDER BY activo DESC, nombre ASC LIMIT 1000`,
      [empresaId, incluirInactivos],
    );
  }

  /** Indicadores de proveedores, precios históricos y cumplimiento de órdenes. */
  async analisisProveedores(empresaId: number, sucursalIds: number[], sucursalId?: number): Promise<any> {
    if (sucursalId && !sucursalIds.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const ids = sucursalId ? [sucursalId] : sucursalIds;
    if (!ids?.length) return { proveedores: [], preciosRecientes: [], comparacionCostos: [] };

    const proveedores = await this.dataSource.query(
      `WITH compras AS (
         SELECT proveedor_id, COUNT(*) FILTER (WHERE estado='RECIBIDA')::int AS cantidad_compras,
                COALESCE(SUM(total) FILTER (WHERE estado='RECIBIDA'),0)::numeric(14,2) AS total_comprado,
                COALESCE(SUM(saldo_pendiente) FILTER (WHERE estado='RECIBIDA'),0)::numeric(14,2) AS saldo_pendiente,
                MAX(fecha_documento) AS ultima_compra
         FROM compra WHERE empresa_id=$1 AND sucursal_id=ANY($2::int[]) GROUP BY proveedor_id
       ), devoluciones AS (
         SELECT proveedor_id,COUNT(*)::int AS cantidad_devoluciones,COALESCE(SUM(total),0)::numeric(14,2) AS total_devuelto
         FROM devolucion_proveedor WHERE empresa_id=$1 AND sucursal_id=ANY($2::int[]) GROUP BY proveedor_id
       ), ordenes AS (
         SELECT o.proveedor_id,
                COUNT(*) FILTER (WHERE o.estado IN ('RECIBIDA','RECIBIDA_PARCIAL'))::int AS ordenes_con_recepcion,
                COUNT(*) FILTER (WHERE o.estado='RECIBIDA' AND o.fecha_entrega_esperada IS NOT NULL AND r.ultima_recepcion::date <= o.fecha_entrega_esperada)::int AS ordenes_a_tiempo
         FROM orden_compra o LEFT JOIN LATERAL (
           SELECT MAX(rc.created_at) AS ultima_recepcion FROM orden_compra_recepcion rc
           WHERE rc.orden_compra_id=o.id AND rc.empresa_id=o.empresa_id
         ) r ON TRUE
         WHERE o.empresa_id=$1 AND o.sucursal_id=ANY($2::int[]) GROUP BY o.proveedor_id
       )
       SELECT p.id AS "proveedorId",p.nombre AS "proveedorNombre",p.tipo_doc AS "tipoDoc",p.numero,
              COALESCE(c.cantidad_compras,0) AS "cantidadCompras",COALESCE(c.total_comprado,0) AS "totalComprado",
              COALESCE(c.saldo_pendiente,0) AS "saldoPendiente",COALESCE(d.cantidad_devoluciones,0) AS "cantidadDevoluciones",
              COALESCE(d.total_devuelto,0) AS "totalDevuelto",COALESCE(o.ordenes_con_recepcion,0) AS "ordenesConRecepcion",
              COALESCE(o.ordenes_a_tiempo,0) AS "ordenesATiempo",c.ultima_compra AS "ultimaCompra"
       FROM proveedor p LEFT JOIN compras c ON c.proveedor_id=p.id
       LEFT JOIN devoluciones d ON d.proveedor_id=p.id LEFT JOIN ordenes o ON o.proveedor_id=p.id
       WHERE p.empresa_id=$1 ORDER BY "totalComprado" DESC,p.nombre`, [empresaId, ids],
    );

    const preciosRecientes = await this.dataSource.query(
      `WITH precios AS (
         SELECT cl.producto_id AS "productoId", cl.variante_id AS "varianteId",
                pr.nombre AS "productoNombre", COALESCE(cl.variante_nombre,'') AS "varianteNombre",
                cl.variante_codigo AS "varianteCodigo", p.id AS "proveedorId", p.nombre AS "proveedorNombre",
                cl.costo_unitario AS "costoUnitario", c.fecha_documento AS "fechaDocumento",
                c.id AS "compraId", ROW_NUMBER() OVER (PARTITION BY cl.producto_id,cl.variante_id,p.id ORDER BY c.fecha_documento DESC,c.id DESC,cl.id DESC) AS rn
         FROM compra_linea cl
         JOIN compra c ON c.id=cl.compra_id AND c.empresa_id=cl.empresa_id
         JOIN proveedor p ON p.id=c.proveedor_id AND p.empresa_id=c.empresa_id
         JOIN producto pr ON pr.id=cl.producto_id AND pr.empresa_id=cl.empresa_id
         WHERE c.empresa_id=$1 AND c.sucursal_id=ANY($2::int[]) AND c.estado='RECIBIDA'
       ) SELECT "productoId","varianteId","productoNombre","varianteNombre","varianteCodigo","proveedorId","proveedorNombre",
                "costoUnitario","fechaDocumento","compraId"
         FROM precios WHERE rn<=5 ORDER BY "productoNombre","varianteNombre","fechaDocumento" DESC LIMIT 500`, [empresaId, ids],
    );

    const comparacionCostos = await this.dataSource.query(
      `WITH ultimos AS (
         SELECT cl.producto_id AS "productoId",cl.variante_id AS "varianteId",pr.nombre AS "productoNombre",
                COALESCE(cl.variante_nombre,'') AS "varianteNombre",p.id AS "proveedorId",p.nombre AS "proveedorNombre",
                cl.costo_unitario AS "costoUnitario",c.fecha_documento AS "fechaDocumento",
                ROW_NUMBER() OVER(PARTITION BY cl.producto_id,cl.variante_id,p.id ORDER BY c.fecha_documento DESC,c.id DESC,cl.id DESC) rn
         FROM compra_linea cl JOIN compra c ON c.id=cl.compra_id AND c.empresa_id=cl.empresa_id
         JOIN proveedor p ON p.id=c.proveedor_id AND p.empresa_id=c.empresa_id
         JOIN producto pr ON pr.id=cl.producto_id AND pr.empresa_id=cl.empresa_id
         WHERE c.empresa_id=$1 AND c.sucursal_id=ANY($2::int[]) AND c.estado='RECIBIDA'
       ), vigentes AS (SELECT * FROM ultimos WHERE rn=1)
       SELECT v.*, MIN(v."costoUnitario") OVER(PARTITION BY v."productoId",v."varianteId") AS "mejorCosto",
              (v."costoUnitario"=MIN(v."costoUnitario") OVER(PARTITION BY v."productoId",v."varianteId")) AS "esMasEconomico"
       FROM vigentes v ORDER BY v."productoNombre",v."varianteNombre",v."costoUnitario" ASC LIMIT 500`, [empresaId, ids],
    );
    return { proveedores, preciosRecientes, comparacionCostos };
  }

  async crearProveedor(empresaId: number, dto: ProveedorDto): Promise<any> {
    this.validarDocumentoProveedor(dto);
    try {
      const rows = await this.dataSource.query(
        `INSERT INTO proveedor (empresa_id, tipo_doc, numero, nombre, direccion, telefono, email, contacto, observaciones)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, tipo_doc AS "tipoDoc", numero, nombre, direccion, telefono, email, contacto, observaciones, activo`,
        [empresaId, dto.tipoDoc, dto.numero.trim(), dto.nombre.trim(), dto.direccion?.trim() || null,
          dto.telefono?.trim() || null, dto.email?.trim().toLowerCase() || null, dto.contacto?.trim() || null,
          dto.observaciones?.trim() || null],
      );
      return rows[0];
    } catch (error: any) {
      if (error?.code === '23505' || error?.driverError?.code === '23505') throw new ConflictException('Ya existe un proveedor con ese documento');
      throw error;
    }
  }

  async actualizarProveedor(id: number, empresaId: number, dto: ProveedorDto): Promise<any> {
    this.validarDocumentoProveedor(dto);
    let rows: any[];
    try {
      rows = await this.dataSource.query(
        `UPDATE proveedor SET tipo_doc=$1, numero=$2, nombre=$3, direccion=$4, telefono=$5,
           email=$6, contacto=$7, observaciones=$8, updated_at=NOW()
         WHERE id=$9 AND empresa_id=$10
         RETURNING id, tipo_doc AS "tipoDoc", numero, nombre, direccion, telefono, email, contacto, observaciones, activo`,
        [dto.tipoDoc, dto.numero.trim(), dto.nombre.trim(), dto.direccion?.trim() || null,
          dto.telefono?.trim() || null, dto.email?.trim().toLowerCase() || null, dto.contacto?.trim() || null,
          dto.observaciones?.trim() || null, id, empresaId],
      );
    } catch (error: any) {
      if (error?.code === '23505' || error?.driverError?.code === '23505') throw new ConflictException('Ya existe otro proveedor con ese documento');
      throw error;
    }
    if (!rows.length) throw new NotFoundException('Proveedor no encontrado');
    return rows[0];
  }

  async desactivarProveedor(id: number, empresaId: number): Promise<void> {
    const rows = await this.dataSource.query(
      `UPDATE proveedor SET activo=FALSE, updated_at=NOW() WHERE id=$1 AND empresa_id=$2 RETURNING id`, [id, empresaId],
    );
    if (!rows.length) throw new NotFoundException('Proveedor no encontrado');
  }

  private normalizarPagos(pagos: PagoCompraDto[] | undefined): PagoNormalizado[] {
    const lista = (pagos || []).map((p) => ({
      metodoPago: p.metodoPago,
      monto: redondear2(Number(p.monto)),
      cajaId: p.cajaId,
      referencia: p.referencia?.trim(),
      idempotencyKey: p.idempotencyKey,
    }));
    if (lista.some((p) => !Number.isFinite(p.monto) || p.monto <= 0)) throw new BadRequestException('Cada pago debe tener un importe mayor a cero');
    if (lista.filter((p) => p.idempotencyKey).some((p, i, arr) => arr.findIndex((x) => x.idempotencyKey === p.idempotencyKey) !== i)) {
      throw new BadRequestException('Las claves de idempotencia de los pagos deben ser únicas');
    }
    if (lista.some((p) => new Set<string>(['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN']).has(p.metodoPago) && !p.cajaId)) {
      throw new BadRequestException('Los pagos en efectivo, tarjeta, Yape o Plin requieren una caja abierta para registrar la salida; use transferencia bancaria si paga fuera de caja');
    }
    if (lista.some((p) => p.metodoPago === 'TRANSFERENCIA' && p.cajaId)) {
      throw new BadRequestException('Las transferencias bancarias no se registran como movimiento de caja');
    }
    return lista;
  }

  /**
   * Mantiene el mismo orden de bloqueo que el flujo de ventas: primero caja y
   * después inventario. Esto reduce deadlocks cuando un cajero vende y recibe
   * mercadería al mismo tiempo.
   */
  private async bloquearCajaDeCompra(
    manager: EntityManager,
    pagos: PagoNormalizado[],
    sucursalId: number,
    usuarioId: number,
    empresaId: number,
  ): Promise<void> {
    const cajaIds = [...new Set(pagos.map((p) => p.cajaId).filter((id): id is number => !!id))];
    if (cajaIds.length > 1) throw new BadRequestException('Todos los pagos asociados a caja deben pertenecer a una misma caja');
    if (!cajaIds.length) return;
    const rows = await manager.query(
      `SELECT c.id FROM caja c
       INNER JOIN sucursal s ON s.id=c.sucursal_id
       WHERE c.id=$1 AND c.usuario_id=$2 AND c.sucursal_id=$3 AND c.estado='ABIERTA'
         AND s.empresa_id=$4 FOR UPDATE OF c`,
      [cajaIds[0], usuarioId, sucursalId, empresaId],
    );
    if (!rows.length) throw new BadRequestException('La caja indicada no está abierta o no pertenece al usuario y sucursal actuales');
  }

  private async validarCajaYRegistrarPagos(
    manager: EntityManager,
    pagos: PagoNormalizado[],
    compraId: number,
    sucursalId: number,
    usuarioId: number,
    empresaId: number,
  ): Promise<void> {
    const cajaIds = [...new Set(pagos.map((p) => p.cajaId).filter((id): id is number => !!id))];
    if (cajaIds.length > 1) throw new BadRequestException('Todos los pagos asociados a caja deben pertenecer a una misma caja');

    let caja: any | null = null;
    if (cajaIds.length) {
      const rows = await manager.query(
        `SELECT c.id, c.saldo_inicial FROM caja c
         INNER JOIN sucursal s ON s.id=c.sucursal_id
         WHERE c.id=$1 AND c.usuario_id=$2 AND c.sucursal_id=$3 AND c.estado='ABIERTA'
           AND s.empresa_id=$4 FOR UPDATE OF c`,
        [cajaIds[0], usuarioId, sucursalId, empresaId],
      );
      if (!rows.length) throw new BadRequestException('La caja indicada no está abierta o no pertenece al usuario y sucursal actuales');
      caja = rows[0];
    }

    const salidaEfectivo = redondear2(pagos.filter((p) => p.metodoPago === 'EFECTIVO').reduce((s, p) => s + p.monto, 0));
    if (salidaEfectivo > 0 && caja) {
      const cobros = await manager.query(
        `SELECT COALESCE(SUM(monto),0)::numeric AS total FROM (
           SELECT cp.monto FROM comprobante_pago cp INNER JOIN comprobante c ON c.id=cp.comprobante_id
           WHERE c.caja_id=$1 AND cp.metodo_pago='EFECTIVO'
           UNION ALL
           SELECT c.total AS monto FROM comprobante c WHERE c.caja_id=$1 AND c.metodo_pago='EFECTIVO'
             AND NOT EXISTS (SELECT 1 FROM comprobante_pago cp WHERE cp.comprobante_id=c.id)
         ) pagos`, [caja.id],
      );
      const variacion = await manager.query(
        `SELECT COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END),0)::numeric AS total
         FROM caja_movimiento WHERE caja_id=$1 AND metodo_pago='EFECTIVO'`, [caja.id],
      );
      const disponible = redondear2(Number(caja.saldo_inicial || 0) + Number(cobros[0]?.total || 0) + Number(variacion[0]?.total || 0));
      if (salidaEfectivo > disponible) throw new BadRequestException(`La caja solo dispone de S/ ${disponible.toFixed(2)} en efectivo; no puede registrar una salida de S/ ${salidaEfectivo.toFixed(2)}`);
    }

    for (const pago of pagos) {
      await manager.query(
        `INSERT INTO compra_pago (empresa_id, compra_id, usuario_id, caja_id, metodo_pago, monto, referencia, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [empresaId, compraId, usuarioId, pago.cajaId || null, pago.metodoPago, pago.monto,
          pago.referencia || null, pago.idempotencyKey || null],
      );
      if (pago.cajaId) {
        await manager.query(
          `INSERT INTO caja_movimiento (caja_id, usuario_id, tipo, metodo_pago, monto, motivo, compra_id)
           VALUES ($1,$2,'SALIDA',$3,$4,$5,$6)`,
          [pago.cajaId, usuarioId, pago.metodoPago, pago.monto, `Pago a proveedor · compra #${compraId}`, compraId],
        );
      }
    }
  }

  async crearCompra(dto: CrearCompraDto, usuarioId: number, empresaId: number, sucursalIds: number[]): Promise<any> {
    if (!sucursalIds?.includes(dto.sucursalId)) throw new ForbiddenException('No tiene acceso a la sucursal seleccionada');
    const pagos = this.normalizarPagos(dto.pagos);
    const lineasCompra = dto.lineas.map((linea) => {
      const cantidadEmpaques = Number(linea.cantidad);
      const unidadesPorEmpaque = Number(linea.unidadesPorEmpaque ?? 1);
      const costoEmpaque = Number(linea.costoEmpaque ?? (Number(linea.costoUnitario) * unidadesPorEmpaque));
      let conversion: ReturnType<typeof convertirEmpaqueCompra>;
      try {
        conversion = convertirEmpaqueCompra(cantidadEmpaques, unidadesPorEmpaque, costoEmpaque);
      } catch (error: any) {
        throw new BadRequestException(error?.message || 'Datos de empaque inválidos');
      }
      return {
        ...linea, cantidad: conversion.cantidadUnidades, costoUnitario: conversion.costoUnitario,
        cantidadEmpaques: conversion.cantidadEmpaques, unidadesPorEmpaque: conversion.unidadesPorEmpaque,
        costoEmpaque: conversion.costoEmpaque,
        unidadCompra: (linea.unidadCompra?.trim() || 'UNIDAD').toUpperCase().slice(0,20),
      };
    });
    if (['01', '03'].includes(dto.tipoDocumento) && (!dto.serie?.trim() || !dto.numero?.trim())) {
      throw new BadRequestException('Las facturas y boletas del proveedor deben incluir serie y número de documento');
    }
    const hoyPeru = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    if (dto.fechaDocumento && dto.fechaDocumento > hoyPeru) {
      throw new BadRequestException('La fecha del documento de compra no puede ser futura en horario de Perú');
    }
    if (dto.condicionPago === 'CREDITO' && !dto.fechaVencimiento) {
      throw new BadRequestException('Indique la fecha de vencimiento de la deuda con el proveedor');
    }
    if (dto.condicionPago === 'CONTADO' && dto.fechaVencimiento) {
      throw new BadRequestException('Una compra al contado no debe tener fecha de vencimiento');
    }
    if (dto.fechaVencimiento && dto.fechaDocumento && dto.fechaVencimiento < dto.fechaDocumento) {
      throw new BadRequestException('La fecha de vencimiento no puede ser anterior a la fecha del documento');
    }
    const clavesLineas = lineasCompra.map((l) => l.varianteId ? `v:${l.varianteId}` : `p:${l.productoId}`);
    if (new Set(clavesLineas).size !== dto.lineas.length) {
      throw new BadRequestException('No repita el mismo producto o presentación en la compra; consolide las cantidades en una sola línea');
    }
    const pagado = redondear2(pagos.reduce((sum, p) => sum + p.monto, 0));
    if (dto.condicionPago === 'CONTADO' && Math.abs(pagado) < 0.01) throw new BadRequestException('Una compra al contado debe registrar su pago');

    try {
      return await this.dataSource.transaction(async (manager) => {
        const sucursal = await manager.query('SELECT id FROM sucursal WHERE id=$1 AND empresa_id=$2', [dto.sucursalId, empresaId]);
        if (!sucursal.length) throw new ForbiddenException('La sucursal no pertenece a la empresa');
        const proveedor = await manager.query('SELECT id FROM proveedor WHERE id=$1 AND empresa_id=$2 AND activo=TRUE', [dto.proveedorId, empresaId]);
        if (!proveedor.length) throw new NotFoundException('Proveedor no encontrado o inactivo');

        // Orden consistente con ventas: caja -> inventario.
        await this.bloquearCajaDeCompra(manager, pagos, dto.sucursalId, usuarioId, empresaId);
        const productIds = [...new Set(lineasCompra.map((l) => l.productoId))].sort((a, b) => a - b);
        const productos = await manager.query(
          `SELECT p.id, p.nombre, p.tipo_igv, p.tiene_variantes
           FROM producto p
           WHERE p.id=ANY($1::int[]) AND p.empresa_id=$2 AND p.activo=TRUE
           ORDER BY p.id FOR UPDATE`,
          [productIds, empresaId],
        );
        if (productos.length !== productIds.length) throw new NotFoundException('Uno o más productos no existen o están inactivos');
        const productoMap = new Map<number, any>(productos.map((p: any) => [Number(p.id), p] as [number, any]));
        const lineasBase = lineasCompra.filter((l) => !l.varianteId);
        const stockBaseMap = new Map<number, any>();
        if (lineasBase.length) {
          const baseIds = [...new Set(lineasBase.map((l) => l.productoId))].sort((a,b)=>a-b);
          const baseStocks = await manager.query(
            `SELECT producto_id,stock,costo_promedio FROM producto_stock
             WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=ANY($3::int[])
             ORDER BY producto_id FOR UPDATE`,
            [empresaId,dto.sucursalId,baseIds],
          );
          for (const row of baseStocks) stockBaseMap.set(Number(row.producto_id), row);
        }
        const varianteIds = [...new Set(lineasCompra.filter((l) => l.varianteId).map((l) => Number(l.varianteId)))].sort((a,b)=>a-b);
        const varianteMap = new Map<number, any>();
        if (varianteIds.length) {
          const variantes = await manager.query(
            `SELECT pv.id,pv.producto_id,pv.codigo,pv.nombre,pv.precio,pv.precio_mayoreo,
                    pvs.stock,pvs.costo_promedio
             FROM producto_variante pv
             INNER JOIN producto p ON p.id=pv.producto_id AND p.empresa_id=pv.empresa_id
             INNER JOIN producto_variante_stock pvs ON pvs.variante_id=pv.id
               AND pvs.producto_id=pv.producto_id AND pvs.empresa_id=pv.empresa_id
             WHERE pv.id=ANY($1::int[]) AND pv.empresa_id=$2 AND pv.activo=TRUE
               AND p.activo=TRUE AND p.tiene_variantes=TRUE AND pvs.sucursal_id=$3
             ORDER BY pv.id FOR UPDATE OF pv,pvs`,
            [varianteIds,empresaId,dto.sucursalId],
          );
          if (variantes.length !== varianteIds.length) throw new NotFoundException('Una o más presentaciones no existen, están inactivas o no tienen inventario configurado en esta sucursal');
          for (const row of variantes) varianteMap.set(Number(row.id),row);
        }

        const lineas = lineasCompra.map((linea, index) => {
          const producto = productoMap.get(Number(linea.productoId));
          if (!producto) throw new NotFoundException(`Producto ${linea.productoId} no encontrado`);
          const tieneVariantes = producto.tiene_variantes === true;
          if (tieneVariantes && !linea.varianteId) throw new BadRequestException(`Seleccione la presentación que recibió de ${producto.nombre}`);
          if (!tieneVariantes && linea.varianteId) throw new BadRequestException(`El producto ${producto.nombre} no está configurado con presentaciones`);
          const variante = linea.varianteId ? varianteMap.get(Number(linea.varianteId)) : null;
          if (linea.varianteId && (!variante || Number(variante.producto_id) !== Number(linea.productoId))) {
            throw new BadRequestException(`La presentación seleccionada no pertenece a ${producto.nombre}`);
          }
          const stockRow = variante || stockBaseMap.get(Number(linea.productoId));
          if (!stockRow) throw new NotFoundException(`No existe saldo de inventario para ${variante?.nombre || producto.nombre} en esta sucursal`);
          const productoStock = {
            ...producto,
            stock: stockRow.stock,
            costo_promedio: stockRow.costo_promedio,
          };
          const cantidad = Number(linea.cantidad);
          const costoUnitario = Number(linea.costoUnitario);
          const tipoIgv = Number(producto.tipo_igv);
          if (Number(linea.tipoIgv) !== tipoIgv) throw new BadRequestException(`La afectación IGV enviada para ${producto.nombre} no coincide con el catálogo`);
          const calculo = calcularLineaCompra(cantidad, costoUnitario, tipoIgv);
          return { ...linea, numeroLinea: index + 1, cantidad, costoUnitario, tipoIgv, ...calculo, producto: productoStock, variante };
        });
        const total = redondear2(lineas.reduce((sum, l) => sum + l.subtotal, 0));
        const opGravadas = redondear2(lineas.filter((l) => l.tipoIgv === 10).reduce((sum, l) => sum + l.baseImponible, 0));
        const opExoneradas = redondear2(lineas.filter((l) => l.tipoIgv === 20).reduce((sum, l) => sum + l.baseImponible, 0));
        const opInafectas = redondear2(lineas.filter((l) => l.tipoIgv === 30).reduce((sum, l) => sum + l.baseImponible, 0));
        const totalIgv = redondear2(lineas.reduce((sum, l) => sum + l.igv, 0));
        if (total <= 0) throw new BadRequestException('El total de la compra debe ser mayor que cero');
        if (pagado - total > 0.01) throw new BadRequestException('Los pagos superan el total de la compra');
        if (dto.condicionPago === 'CONTADO' && Math.abs(pagado - total) > 0.01) {
          throw new BadRequestException(`La compra al contado debe pagarse íntegramente. Total: S/ ${total.toFixed(2)}`);
        }

        const headers = await manager.query(
          `INSERT INTO compra (empresa_id,sucursal_id,proveedor_id,usuario_id,tipo_documento,serie,numero,fecha_documento,
             condicion_pago,fecha_vencimiento,estado,op_gravadas,op_exoneradas,op_inafectas,total_igv,total,pagado,saldo_pendiente,idempotency_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date,CURRENT_DATE),$9,$10::date,'RECIBIDA',$11,$12,$13,$14,$15,0,$15,$16)
           RETURNING id`,
          [empresaId, dto.sucursalId, dto.proveedorId, usuarioId, dto.tipoDocumento, dto.serie?.trim() || '', dto.numero?.trim() || '',
            dto.fechaDocumento || null, dto.condicionPago, dto.fechaVencimiento || null, opGravadas, opExoneradas, opInafectas, totalIgv, total, dto.idempotencyKey],
        );
        const compraId = Number(headers[0].id);
        for (const linea of lineas) {
          const anterior = Number(linea.producto.stock);
          const costoAnterior = Number(linea.producto.costo_promedio || 0);
          const posterior = Number((anterior + linea.cantidad).toFixed(3));
          const costoPosterior = calcularCostoPromedio(anterior, costoAnterior, linea.cantidad, linea.costoUnitario);
          const lineaSql = await manager.query(
            `INSERT INTO compra_linea (compra_id,empresa_id,producto_id,variante_id,variante_nombre,variante_codigo,
              numero_linea,cantidad,costo_unitario,tipo_igv,base_imponible,igv,subtotal,stock_anterior,stock_posterior,
              costo_promedio_anterior,costo_promedio_posterior,unidad_compra,cantidad_empaques,unidades_por_empaque,costo_empaque,
              codigo_lote,fecha_vencimiento)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING id`,
            [compraId,empresaId,linea.productoId,linea.variante?.id || null,linea.variante?.nombre || null,linea.variante?.codigo || null,
              linea.numeroLinea,linea.cantidad,linea.costoUnitario,linea.tipoIgv,linea.baseImponible,linea.igv,linea.subtotal,
              anterior,posterior,costoAnterior,costoPosterior,linea.unidadCompra,linea.cantidadEmpaques,linea.unidadesPorEmpaque,linea.costoEmpaque,
              linea.codigoLote?.trim() || `COMPRA-${compraId}-${linea.numeroLinea}`,linea.fechaVencimiento || null],
          );
          await manager.query(
            `INSERT INTO inventario_lote (empresa_id,sucursal_id,producto_id,variante_id,compra_id,compra_linea_id,
              codigo_lote,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)`,
            [empresaId,dto.sucursalId,linea.productoId,linea.variante?.id || null,compraId,lineaSql[0]?.id,
              linea.codigoLote?.trim() || `COMPRA-${compraId}-${linea.numeroLinea}`,linea.fechaVencimiento || null,
              linea.cantidad,linea.costoUnitario],
          );
          const updated = linea.variante
            ? await manager.query(
                `UPDATE producto_variante_stock SET stock=$1,costo_promedio=$2,updated_at=NOW()
                 WHERE variante_id=$3 AND producto_id=$4 AND sucursal_id=$5 AND empresa_id=$6 RETURNING stock`,
                [posterior,costoPosterior,linea.variante.id,linea.productoId,dto.sucursalId,empresaId],
              )
            : await manager.query(
                `UPDATE producto_stock SET stock=$1,costo_promedio=$2,updated_at=NOW()
                 WHERE producto_id=$3 AND sucursal_id=$4 AND empresa_id=$5 RETURNING stock`,
                [posterior,costoPosterior,linea.productoId,dto.sucursalId,empresaId],
              );
          if (!updated.length) throw new BadRequestException(`No se pudo actualizar el stock de ${linea.variante?.nombre || linea.producto.nombre}`);
          await manager.query(
            `INSERT INTO movimiento_inventario (empresa_id,sucursal_id,producto_id,variante_id,compra_id,usuario_id,tipo,cantidad,
              stock_anterior,stock_posterior,motivo)
             VALUES ($1,$2,$3,$4,$5,$6,'ENTRADA',$7,$8,$9,$10)`,
            [empresaId,dto.sucursalId,linea.productoId,linea.variante?.id || null,compraId,usuarioId,linea.cantidad,anterior,posterior,
              `Recepción compra #${compraId} · ${linea.variante?.nombre || linea.producto.nombre} · ${dto.tipoDocumento} ${dto.serie || ''}-${dto.numero || ''}`.slice(0,200)],
          );
        }
        await this.validarCajaYRegistrarPagos(manager, pagos, compraId, dto.sucursalId, usuarioId, empresaId);
        await manager.query(
          `UPDATE compra SET pagado=$1,saldo_pendiente=$2 WHERE id=$3 AND empresa_id=$4`,
          [pagado, redondear2(total - pagado), compraId, empresaId],
        );
        return this.obtenerDetalleConManager(manager, compraId, empresaId, sucursalIds);
      });
    } catch (error: any) {
      const codigo = error?.code || error?.driverError?.code;
      if (codigo === '23505') {
        const previaPorClave = dto.idempotencyKey
          ? await this.dataSource.query(
              'SELECT id FROM compra WHERE empresa_id=$1 AND idempotency_key=$2 LIMIT 1',
              [empresaId, dto.idempotencyKey],
            )
          : [];
        if (previaPorClave.length) {
          return this.obtenerDetalle(Number(previaPorClave[0].id), empresaId, sucursalIds);
        }
        throw new ConflictException('Ya existe una compra con ese documento de proveedor. Revise el historial antes de volver a registrarla.');
      }
      throw error;
    }
  }

  private async obtenerDetalleConManager(manager: EntityManager, id: number, empresaId: number, sucursalIds: number[]): Promise<any> {
    const rows = await manager.query(
      `SELECT c.*, c.tipo_documento AS "tipoDocumento", c.sucursal_id AS "sucursalId",
              c.proveedor_id AS "proveedorId", c.usuario_id AS "usuarioId", c.fecha_documento AS "fechaDocumento",
              c.fecha_registro AS "fechaRegistro", c.condicion_pago AS "condicionPago", c.op_gravadas AS "opGravadas",
              c.op_exoneradas AS "opExoneradas", c.op_inafectas AS "opInafectas", c.total_igv AS "totalIgv",
              c.saldo_pendiente AS "saldoPendiente", p.nombre AS "proveedorNombre", p.numero AS "proveedorNumero"
       FROM compra c INNER JOIN proveedor p ON p.id=c.proveedor_id AND p.empresa_id=c.empresa_id
       WHERE c.id=$1 AND c.empresa_id=$2 AND c.sucursal_id=ANY($3::int[])`, [id, empresaId, sucursalIds],
    );
    if (!rows.length) throw new NotFoundException('Compra no encontrada');
    const lineas = await manager.query(
      `SELECT cl.*, cl.producto_id AS "productoId", cl.numero_linea AS "numeroLinea", cl.costo_unitario AS "costoUnitario",
              cl.codigo_lote AS "codigoLote", cl.fecha_vencimiento AS "fechaVencimiento",
              cl.tipo_igv AS "tipoIgv", cl.base_imponible AS "baseImponible", cl.stock_anterior AS "stockAnterior",
              cl.stock_posterior AS "stockPosterior", cl.costo_promedio_anterior AS "costoPromedioAnterior",
              cl.costo_promedio_posterior AS "costoPromedioPosterior", cl.variante_id AS "varianteId",
              cl.variante_nombre AS "varianteNombre",cl.variante_codigo AS "varianteCodigo",
              cl.unidad_compra AS "unidadCompra",cl.cantidad_empaques AS "cantidadEmpaques",
              cl.unidades_por_empaque AS "unidadesPorEmpaque",cl.costo_empaque AS "costoEmpaque",
              p.codigo, p.nombre AS "productoNombre", p.unidad
       FROM compra_linea cl INNER JOIN producto p ON p.id=cl.producto_id AND p.empresa_id=cl.empresa_id
       WHERE cl.compra_id=$1 AND cl.empresa_id=$2 ORDER BY cl.numero_linea`, [id, empresaId],
    );
    const pagos = await manager.query(
      `SELECT id, metodo_pago AS "metodoPago", monto, referencia, caja_id AS "cajaId", created_at AS fecha
       FROM compra_pago WHERE compra_id=$1 AND empresa_id=$2 ORDER BY id`, [id, empresaId],
    );
    const devoluciones = await manager.query(
      `SELECT id,motivo,total,aplicado_cuenta AS "aplicadoCuenta",saldo_a_favor AS "saldoAFavor",created_at AS fecha
       FROM devolucion_proveedor WHERE compra_id=$1 AND empresa_id=$2 ORDER BY id DESC`,[id,empresaId],
    );
    return { ...rows[0], lineas, pagos, devoluciones };
  }

  async obtenerDetalle(id: number, empresaId: number, sucursalIds: number[]): Promise<any> {
    if (!sucursalIds?.length) throw new NotFoundException('Compra no encontrada');
    return this.obtenerDetalleConManager(this.dataSource.manager, id, empresaId, sucursalIds);
  }


  /**
   * Recomendaciones de reposición basadas en salidas de venta reales de los
   * últimos 30 días. No incluye transferencias ni ajustes manuales.
   * La sugerencia cubre 14 días de demanda (7 de abastecimiento + 7 de seguridad).
   */
  async sugerenciasReposicion(empresaId: number, sucursalIds: number[], sucursalId?: number): Promise<any[]> {
    if (sucursalId && !sucursalIds.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const ids = sucursalId ? [sucursalId] : sucursalIds;
    if (!ids?.length) return [];
    return this.dataSource.query(
      `WITH demanda AS (
         SELECT mi.sucursal_id, mi.producto_id, mi.variante_id,
                SUM(mi.cantidad)::numeric AS unidades_vendidas,
                COUNT(DISTINCT mi.created_at::date)::int AS dias_con_venta,
                MAX(mi.created_at) AS ultima_venta
         FROM movimiento_inventario mi
         WHERE mi.empresa_id=$1 AND mi.sucursal_id=ANY($2::int[])
           AND mi.tipo='SALIDA' AND mi.comprobante_id IS NOT NULL
           AND mi.transferencia_id IS NULL
           AND mi.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY mi.sucursal_id,mi.producto_id,mi.variante_id
       ), base AS (
         SELECT ps.sucursal_id, ps.producto_id, NULL::int AS variante_id,
                p.nombre AS producto_nombre, NULL::text AS variante_nombre,
                p.codigo, p.unidad, ps.stock::numeric AS stock,
                ps.stock_minimo::numeric AS stock_minimo,
                COALESCE(ps.costo_promedio,0)::numeric AS costo_promedio,
                d.unidades_vendidas, d.dias_con_venta, d.ultima_venta,
                p.activo
         FROM producto_stock ps
         JOIN producto p ON p.id=ps.producto_id AND p.empresa_id=ps.empresa_id
         LEFT JOIN demanda d ON d.sucursal_id=ps.sucursal_id AND d.producto_id=ps.producto_id AND d.variante_id IS NULL
         WHERE ps.empresa_id=$1 AND ps.sucursal_id=ANY($2::int[]) AND p.activo=TRUE
         UNION ALL
         SELECT vs.sucursal_id, pv.producto_id, pv.id AS variante_id,
                p.nombre AS producto_nombre, pv.nombre AS variante_nombre,
                COALESCE(pv.codigo,p.codigo) AS codigo, p.unidad,
                vs.stock::numeric AS stock, vs.stock_minimo::numeric AS stock_minimo,
                COALESCE(vs.costo_promedio,0)::numeric AS costo_promedio,
                d.unidades_vendidas, d.dias_con_venta, d.ultima_venta,
                (p.activo AND pv.activo) AS activo
         FROM producto_variante_stock vs
         JOIN producto_variante pv ON pv.id=vs.variante_id AND pv.empresa_id=vs.empresa_id
         JOIN producto p ON p.id=pv.producto_id AND p.empresa_id=pv.empresa_id
         LEFT JOIN demanda d ON d.sucursal_id=vs.sucursal_id AND d.producto_id=pv.producto_id AND d.variante_id=pv.id
         WHERE vs.empresa_id=$1 AND vs.sucursal_id=ANY($2::int[]) AND p.activo=TRUE AND pv.activo=TRUE
       )
       SELECT b.sucursal_id AS "sucursalId",s.nombre AS "sucursalNombre",
              b.producto_id AS "productoId",b.variante_id AS "varianteId",
              b.producto_nombre AS "productoNombre",b.variante_nombre AS "varianteNombre",
              b.codigo,b.unidad,b.stock,b.stock_minimo AS "stockMinimo",
              b.costo_promedio AS "costoPromedio",
              COALESCE(b.unidades_vendidas,0)::numeric AS "unidadesVendidas30d",
              ROUND(COALESCE(b.unidades_vendidas,0)/30.0,3) AS "promedioDiario",
              CASE WHEN COALESCE(b.unidades_vendidas,0)>0
                   THEN ROUND(b.stock/(b.unidades_vendidas/30.0),1) ELSE NULL END AS "diasCobertura",
              b.ultima_venta AS "ultimaVenta",
              GREATEST(0,CEIL((COALESCE(b.unidades_vendidas,0)/30.0)*14 - b.stock),
                       CASE WHEN b.stock_minimo>0 AND b.stock<b.stock_minimo THEN CEIL(b.stock_minimo-b.stock) ELSE 0 END)::numeric AS "cantidadSugerida",
              ROUND(GREATEST(0,CEIL((COALESCE(b.unidades_vendidas,0)/30.0)*14 - b.stock),
                       CASE WHEN b.stock_minimo>0 AND b.stock<b.stock_minimo THEN CEIL(b.stock_minimo-b.stock) ELSE 0 END)
                    * b.costo_promedio,2) AS "inversionEstimada",
              CASE WHEN b.stock<=0 THEN 'AGOTADO'
                   WHEN b.stock_minimo>0 AND b.stock<=b.stock_minimo THEN 'STOCK_BAJO'
                   WHEN COALESCE(b.unidades_vendidas,0)>0 AND b.stock/(b.unidades_vendidas/30.0)<=7 THEN 'REPOSICION_URGENTE'
                   WHEN COALESCE(b.unidades_vendidas,0)>0 AND b.stock/(b.unidades_vendidas/30.0)<=14 THEN 'REPOSICION'
                   ELSE 'ESTABLE' END AS prioridad,
              (SELECT c.proveedor_id FROM compra c
               JOIN compra_linea cl ON cl.compra_id=c.id AND cl.empresa_id=c.empresa_id
               WHERE c.empresa_id=$1 AND c.sucursal_id=b.sucursal_id AND c.estado='RECIBIDA'
                 AND ((b.variante_id IS NULL AND cl.producto_id=b.producto_id AND cl.variante_id IS NULL)
                   OR (b.variante_id IS NOT NULL AND cl.variante_id=b.variante_id))
               ORDER BY c.fecha_registro DESC,c.id DESC LIMIT 1) AS "ultimoProveedorId",
              (SELECT pr.nombre FROM compra c
               JOIN compra_linea cl ON cl.compra_id=c.id AND cl.empresa_id=c.empresa_id
               JOIN proveedor pr ON pr.id=c.proveedor_id AND pr.empresa_id=c.empresa_id
               WHERE c.empresa_id=$1 AND c.sucursal_id=b.sucursal_id AND c.estado='RECIBIDA'
                 AND ((b.variante_id IS NULL AND cl.producto_id=b.producto_id AND cl.variante_id IS NULL)
                   OR (b.variante_id IS NOT NULL AND cl.variante_id=b.variante_id))
               ORDER BY c.fecha_registro DESC,c.id DESC LIMIT 1) AS "ultimoProveedorNombre"
       FROM base b JOIN sucursal s ON s.id=b.sucursal_id
       WHERE b.activo=TRUE
         AND (b.stock<=b.stock_minimo OR
              (COALESCE(b.unidades_vendidas,0)>0 AND b.stock/(b.unidades_vendidas/30.0)<=14))
       ORDER BY CASE WHEN b.stock<=0 THEN 0
                     WHEN b.stock<=b.stock_minimo THEN 1
                     WHEN COALESCE(b.unidades_vendidas,0)>0 AND b.stock/(b.unidades_vendidas/30.0)<=7 THEN 2
                     ELSE 3 END,
                COALESCE(b.unidades_vendidas,0) DESC
       LIMIT 500`,
      [empresaId, ids],
    );
  }


  async crearOrdenCompra(dto: any, usuarioId: number, empresaId: number, sucursalIds: number[]): Promise<any> {
    if (!sucursalIds?.includes(dto.sucursalId)) throw new ForbiddenException('No tiene acceso a la sucursal seleccionada');
    const claves = dto.lineas.map((l: any) => l.varianteId ? `v:${l.varianteId}` : `p:${l.productoId}`);
    if (new Set(claves).size !== claves.length) throw new BadRequestException('No repita productos o variantes en la orden');
    return this.dataSource.transaction(async manager => {
      const proveedor = await manager.query('SELECT id FROM proveedor WHERE id=$1 AND empresa_id=$2 AND activo=TRUE', [dto.proveedorId,empresaId]);
      if (!proveedor.length) throw new NotFoundException('Proveedor no encontrado o inactivo');
      const sucursal = await manager.query('SELECT id FROM sucursal WHERE id=$1 AND empresa_id=$2',[dto.sucursalId,empresaId]);
      if (!sucursal.length) throw new ForbiddenException('Sucursal ajena a la empresa');
      const ids = [...new Set(dto.lineas.map((l:any)=>Number(l.productoId)))];
      const productos = await manager.query('SELECT id,nombre,codigo,activo,tiene_variantes,tipo_igv FROM producto WHERE empresa_id=$1 AND id=ANY($2::int[])',[empresaId,ids]);
      if (productos.length!==ids.length || productos.some((p:any)=>!p.activo)) throw new NotFoundException('Hay productos inexistentes o inactivos');
      const pmap=new Map<number, any>(productos.map((p:any): [number, any] => [Number(p.id),p]));
      const variantIds=dto.lineas.filter((l:any)=>l.varianteId).map((l:any)=>Number(l.varianteId));
      const variantes=variantIds.length?await manager.query(
        `SELECT pv.id,pv.producto_id,pv.nombre,pv.codigo,pv.activo FROM producto_variante pv
         WHERE pv.empresa_id=$1 AND pv.id=ANY($2::int[])`,[empresaId,variantIds]):[];
      if(variantes.length!==variantIds.length)throw new NotFoundException('Variante no encontrada');
      const vmap=new Map<number, any>(variantes.map((v:any): [number, any] => [Number(v.id),v]));
      let total=0;
      for(const l of dto.lineas){
        const pr:any=pmap.get(Number(l.productoId)); const v=l.varianteId?vmap.get(Number(l.varianteId)):null;
        if(Boolean(pr.tiene_variantes)!==Boolean(l.varianteId) || (v&&(!v.activo||Number(v.producto_id)!==Number(pr.id)))) throw new BadRequestException(`La variante no corresponde al producto ${pr.nombre}`);
        total+=Number(l.cantidad)*Number(l.costoUnitarioEstimado||0);
      }
      const seq=await manager.query("SELECT nextval(pg_get_serial_sequence('orden_compra','id')) AS id");
      const id=Number(seq[0].id); const numero=`OC-${new Date().getFullYear()}-${String(id).padStart(7,'0')}`;
      await manager.query(
        `INSERT INTO orden_compra(id,empresa_id,sucursal_id,proveedor_id,usuario_id,numero_orden,fecha_entrega_esperada,observaciones,total_estimado)
         VALUES($1,$2,$3,$4,$5,$6,$7::date,$8,$9)`,
        [id,empresaId,dto.sucursalId,dto.proveedorId,usuarioId,numero,dto.fechaEntregaEsperada||null,dto.observaciones?.trim()||null,redondear2(total)]);
      for(const l of dto.lineas){
        const pr:any=pmap.get(Number(l.productoId)); const v=l.varianteId?vmap.get(Number(l.varianteId)):null;
        await manager.query(
          `INSERT INTO orden_compra_linea(empresa_id,orden_compra_id,producto_id,variante_id,descripcion,codigo,cantidad_solicitada,costo_unitario_estimado,unidad_compra,tipo_igv)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [empresaId,id,l.productoId,l.varianteId||null,`${pr.nombre}${v?` · ${v.nombre}`:''}`,v?.codigo||pr.codigo||l.codigo||null,l.cantidad,l.costoUnitarioEstimado||0,(l.unidadCompra||'UNIDAD').toUpperCase(),Number(pr.tipo_igv||10)]);
      }
      return this.detalleOrdenCompra(manager,id,empresaId,sucursalIds);
    });
  }

  private async detalleOrdenCompra(manager: EntityManager,id:number,empresaId:number,sucursalIds:number[]):Promise<any>{
    const rows=await manager.query(
      `SELECT o.id,o.numero_orden AS "numeroOrden",o.estado,o.fecha_orden AS "fechaOrden",
        o.fecha_entrega_esperada AS "fechaEntregaEsperada",o.observaciones,o.total_estimado AS "totalEstimado",
        o.sucursal_id AS "sucursalId",s.nombre AS "sucursalNombre",o.proveedor_id AS "proveedorId",
        p.nombre AS "proveedorNombre",p.numero AS "proveedorNumero"
       FROM orden_compra o JOIN sucursal s ON s.id=o.sucursal_id AND s.empresa_id=o.empresa_id
       JOIN proveedor p ON p.id=o.proveedor_id AND p.empresa_id=o.empresa_id
       WHERE o.id=$1 AND o.empresa_id=$2 AND o.sucursal_id=ANY($3::int[])`,[id,empresaId,sucursalIds]);
    if(!rows.length)throw new NotFoundException('Orden de compra no encontrada');
    rows[0].lineas=await manager.query(
      `SELECT id,producto_id AS "productoId",variante_id AS "varianteId",descripcion,codigo,
        cantidad_solicitada AS "cantidadSolicitada",cantidad_recibida AS "cantidadRecibida",
        (cantidad_solicitada-cantidad_recibida) AS "pendiente",
        costo_unitario_estimado AS "costoUnitarioEstimado",unidad_compra AS "unidadCompra",tipo_igv AS "tipoIgv"
       FROM orden_compra_linea WHERE orden_compra_id=$1 AND empresa_id=$2 ORDER BY id`,[id,empresaId]);
    rows[0].recepciones=await manager.query(
      `SELECT r.id,r.compra_id AS "compraId",c.tipo_documento AS "tipoDocumento",
        c.serie,c.numero,c.fecha_documento AS "fechaDocumento",r.total,r.created_at AS "fechaRecepcion"
       FROM orden_compra_recepcion r JOIN compra c ON c.id=r.compra_id AND c.empresa_id=r.empresa_id
       WHERE r.orden_compra_id=$1 AND r.empresa_id=$2 ORDER BY r.id`,[id,empresaId]);
    return rows[0];
  }


  async recepcionarOrdenCompra(id:number,dto:any,usuarioId:number,empresaId:number,sucursalIds:number[]):Promise<any>{
    const previa=await this.dataSource.query(
      `SELECT compra_id AS "compraId" FROM orden_compra_recepcion WHERE empresa_id=$1 AND idempotency_key=$2`,
      [empresaId,dto.idempotencyKey]);
    if(previa.length){
      const orden=await this.obtenerOrdenCompra(id,empresaId,sucursalIds);
      return {...orden,recepcionRepetida:true,compraId:Number(previa[0].compraId)};
    }
    const orden=await this.obtenerOrdenCompra(id,empresaId,sucursalIds);
    if(!['ENVIADA','RECIBIDA_PARCIAL'].includes(orden.estado))throw new BadRequestException('Solo se pueden recibir órdenes enviadas');
    const lineasRecibidas=dto.lineas.map((l:any)=>{
      const original=orden.lineas.find((x:any)=>Number(x.id)===Number(l.ordenLineaId));
      if(!original)throw new BadRequestException('Una línea no pertenece a esta orden');
      const pendiente=Number(original.cantidadSolicitada)-Number(original.cantidadRecibida);
      if(Number(l.cantidad)<=0||Number(l.cantidad)-pendiente>0.0005)throw new BadRequestException(`La cantidad recibida supera lo pendiente de ${original.descripcion}`);
      return {original,entrada:l};
    });
    if(new Set(lineasRecibidas.map(x=>x.original.id)).size!==lineasRecibidas.length)throw new BadRequestException('No repita líneas en la recepción');
    const compraDto:any={
      sucursalId:Number(orden.sucursalId),proveedorId:Number(orden.proveedorId),
      tipoDocumento:dto.tipoDocumento,serie:dto.serie||'',numero:dto.numero||`${orden.numeroOrden}-R`,
      fechaDocumento:dto.fechaDocumento,condicionPago:'CREDITO',
      fechaVencimiento:dto.fechaVencimiento||dto.fechaDocumento||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date()),
      idempotencyKey:`order-receipt-${dto.idempotencyKey}`,
      lineas:lineasRecibidas.map(({original,entrada}:any)=>({
        productoId:Number(original.productoId),...(original.varianteId?{varianteId:Number(original.varianteId)}:{}),
        cantidad:Number(entrada.cantidad),unidadCompra:original.unidadCompra||'UNIDAD',
        unidadesPorEmpaque:1,costoEmpaque:Number(entrada.costoUnitario||original.costoUnitarioEstimado||0),
        costoUnitario:Number(entrada.costoUnitario||original.costoUnitarioEstimado||0),
        tipoIgv:Number(original.tipoIgv||10),codigoLote:entrada.codigoLote||undefined,fechaVencimiento:entrada.fechaVencimiento||undefined,
      })),
      pagos:[],
    };
    // La compra real registra stock, lotes, movimiento y costo promedio mediante el flujo existente.
    const compra=await this.crearCompra(compraDto,usuarioId,empresaId,sucursalIds);
    await this.dataSource.transaction(async manager=>{
      const locked=await manager.query(
        `SELECT id,estado FROM orden_compra WHERE id=$1 AND empresa_id=$2 AND sucursal_id=ANY($3::int[]) FOR UPDATE`,
        [id,empresaId,sucursalIds]);
      if(!locked.length)throw new NotFoundException('Orden no encontrada');
      if(!['ENVIADA','RECIBIDA_PARCIAL'].includes(locked[0].estado))throw new BadRequestException('La orden cambió de estado durante la recepción');
      for(const {original,entrada} of lineasRecibidas){
        const rows=await manager.query(
          `UPDATE orden_compra_linea SET cantidad_recibida=cantidad_recibida+$1
           WHERE id=$2 AND orden_compra_id=$3 AND empresa_id=$4
             AND cantidad_recibida+$1<=cantidad_solicitada+0.0005
           RETURNING id`,
          [Number(entrada.cantidad),Number(original.id),id,empresaId]);
        if(!rows.length)throw new ConflictException(`La línea ${original.descripcion} fue recibida por otro proceso; revise el pedido antes de continuar`);
      }
      await manager.query(
        `INSERT INTO orden_compra_recepcion(empresa_id,orden_compra_id,compra_id,usuario_id,idempotency_key,total)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [empresaId,id,Number(compra.id),usuarioId,dto.idempotencyKey,Number(compra.total||0)]);
      const pendientes=await manager.query(
        `SELECT COUNT(*)::int AS total FROM orden_compra_linea
         WHERE orden_compra_id=$1 AND empresa_id=$2 AND cantidad_recibida+0.0005<cantidad_solicitada`,
        [id,empresaId]);
      await manager.query(
        `UPDATE orden_compra SET estado=$1,updated_at=NOW() WHERE id=$2 AND empresa_id=$3`,
        [Number(pendientes[0].total)===0?'RECIBIDA':'RECIBIDA_PARCIAL',id,empresaId]);
    });
    return {...await this.obtenerOrdenCompra(id,empresaId,sucursalIds),compraId:Number(compra.id),compraNumero:compra.numero||compra.id};
  }

  async obtenerOrdenCompra(id:number,empresaId:number,sucursalIds:number[]):Promise<any>{
    return this.detalleOrdenCompra(this.dataSource.manager,id,empresaId,sucursalIds);
  }

  async listarOrdenesCompra(empresaId:number,sucursalIds:number[],sucursalId?:number):Promise<any[]>{
    if(sucursalId&&!sucursalIds.includes(sucursalId))throw new ForbiddenException('No tiene acceso a esta sucursal');
    const ids=sucursalId?[sucursalId]:sucursalIds;if(!ids?.length)return [];
    const rows=await this.dataSource.query(
      `SELECT o.id,o.numero_orden AS "numeroOrden",o.estado,o.fecha_orden AS "fechaOrden",
        o.fecha_entrega_esperada AS "fechaEntregaEsperada",o.total_estimado AS "totalEstimado",
        o.sucursal_id AS "sucursalId",s.nombre AS "sucursalNombre",p.nombre AS "proveedorNombre",
        COUNT(l.id)::int AS "totalLineas",COALESCE(SUM(l.cantidad_solicitada-l.cantidad_recibida),0)::numeric AS "unidadesPendientes"
       FROM orden_compra o JOIN sucursal s ON s.id=o.sucursal_id AND s.empresa_id=o.empresa_id
       JOIN proveedor p ON p.id=o.proveedor_id AND p.empresa_id=o.empresa_id
       LEFT JOIN orden_compra_linea l ON l.orden_compra_id=o.id AND l.empresa_id=o.empresa_id
       WHERE o.empresa_id=$1 AND o.sucursal_id=ANY($2::int[])
       GROUP BY o.id,s.nombre,p.nombre ORDER BY o.created_at DESC LIMIT 500`,[empresaId,ids]);
    return rows;
  }

  async cambiarEstadoOrdenCompra(id:number,estado:'ENVIADA'|'CANCELADA',empresaId:number,sucursalIds:number[]):Promise<any>{
    return this.dataSource.transaction(async manager=>{
      const rows=await manager.query(`SELECT id,estado FROM orden_compra WHERE id=$1 AND empresa_id=$2 AND sucursal_id=ANY($3::int[]) FOR UPDATE`,[id,empresaId,sucursalIds]);
      if(!rows.length)throw new NotFoundException('Orden no encontrada');
      const actual=rows[0].estado;
      if(estado==='ENVIADA'&&actual!=='BORRADOR')throw new BadRequestException('Solo se pueden enviar órdenes en borrador');
      if(estado==='CANCELADA'&&!['BORRADOR','ENVIADA'].includes(actual))throw new BadRequestException('No se puede cancelar una orden que ya registra recepción');
      await manager.query('UPDATE orden_compra SET estado=$1,updated_at=NOW() WHERE id=$2 AND empresa_id=$3',[estado,id,empresaId]);
      return this.detalleOrdenCompra(manager,id,empresaId,sucursalIds);
    });
  }

  async listarCompras(empresaId: number, sucursalIds: number[], sucursalId?: number): Promise<any[]> {
    if (sucursalId && !sucursalIds.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const ids = sucursalId ? [sucursalId] : sucursalIds;
    if (!ids?.length) return [];
    return this.dataSource.query(
      `SELECT c.id,c.tipo_documento AS "tipoDocumento",c.serie,c.numero,c.fecha_documento AS "fechaDocumento",
              c.fecha_registro AS "fechaRegistro",c.condicion_pago AS "condicionPago",c.estado,c.total,c.pagado,
              c.saldo_pendiente AS "saldoPendiente",c.sucursal_id AS "sucursalId",p.id AS "proveedorId",
              p.nombre AS "proveedorNombre",p.numero AS "proveedorNumero",u.nombre AS responsable
       FROM compra c INNER JOIN proveedor p ON p.id=c.proveedor_id AND p.empresa_id=c.empresa_id
       INNER JOIN usuario u ON u.id=c.usuario_id AND u.empresa_id=c.empresa_id
       WHERE c.empresa_id=$1 AND c.sucursal_id=ANY($2::int[])
       ORDER BY c.fecha_registro DESC,c.id DESC LIMIT 300`, [empresaId, ids],
    );
  }

  async cuentasPorPagar(empresaId: number, sucursalIds: number[], sucursalId?: number): Promise<any[]> {
    if (sucursalId && !sucursalIds.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const ids = sucursalId ? [sucursalId] : sucursalIds;
    if (!ids?.length) return [];
    return this.dataSource.query(
      `SELECT c.id,c.fecha_documento AS "fechaDocumento",c.fecha_registro AS "fechaRegistro",
              c.fecha_vencimiento AS "fechaVencimiento",
              GREATEST(CURRENT_DATE - COALESCE(c.fecha_vencimiento,c.fecha_documento),0)::int AS "diasVencido",
              CASE WHEN c.fecha_vencimiento IS NULL THEN 'SIN_FECHA'
                   WHEN c.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDO'
                   WHEN c.fecha_vencimiento = CURRENT_DATE THEN 'VENCE_HOY'
                   WHEN c.fecha_vencimiento <= CURRENT_DATE + 7 THEN 'POR_VENCER'
                   ELSE 'VIGENTE' END AS "estadoVencimiento",
              c.tipo_documento AS "tipoDocumento",c.serie,c.numero,c.total,c.pagado,c.saldo_pendiente AS "saldoPendiente",
              p.id AS "proveedorId",p.nombre AS "proveedorNombre",p.numero AS "proveedorNumero",
              s.nombre AS "sucursalNombre",
              COALESCE((SELECT SUM(dp.saldo_a_favor) FROM devolucion_proveedor dp WHERE dp.empresa_id=c.empresa_id AND dp.proveedor_id=c.proveedor_id AND dp.sucursal_id=c.sucursal_id),0)::numeric AS "saldoAFavorProveedor"
       FROM compra c INNER JOIN proveedor p ON p.id=c.proveedor_id AND p.empresa_id=c.empresa_id
       INNER JOIN sucursal s ON s.id=c.sucursal_id AND s.empresa_id=c.empresa_id
       WHERE c.empresa_id=$1 AND c.sucursal_id=ANY($2::int[]) AND c.estado='RECIBIDA' AND c.saldo_pendiente>0
       ORDER BY c.fecha_documento ASC,c.id ASC LIMIT 500`, [empresaId, ids],
    );
  }

  async cajasAbiertas(sucursalId: number, usuarioId: number, empresaId: number, sucursalIds: number[]): Promise<any[]> {
    if (!sucursalIds.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    return this.dataSource.query(
      `SELECT c.id,c.saldo_inicial AS "saldoInicial",c.fecha_apertura AS "fechaApertura"
       FROM caja c INNER JOIN sucursal s ON s.id=c.sucursal_id
       WHERE c.sucursal_id=$1 AND c.usuario_id=$2 AND c.estado='ABIERTA' AND s.empresa_id=$3`,
      [sucursalId, usuarioId, empresaId],
    );
  }

  async registrarPago(id: number, dto: RegistrarPagoCompraDto, usuarioId: number, empresaId: number, sucursalIds: number[]): Promise<any> {
    const pagos = this.normalizarPagos([dto]);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const compraRows = await manager.query(
          `SELECT id,sucursal_id,total,pagado,saldo_pendiente,estado FROM compra
           WHERE id=$1 AND empresa_id=$2 AND sucursal_id=ANY($3::int[]) FOR UPDATE`, [id, empresaId, sucursalIds],
        );
        if (!compraRows.length) throw new NotFoundException('Compra no encontrada');
        const compra = compraRows[0];
        if (compra.estado !== 'RECIBIDA') throw new BadRequestException('No se pueden registrar pagos en una compra anulada');
        const pago = pagos[0];
        if (pago.monto - Number(compra.saldo_pendiente) > 0.01) throw new BadRequestException('El importe supera el saldo pendiente de la compra');
        await this.validarCajaYRegistrarPagos(manager, pagos, id, Number(compra.sucursal_id), usuarioId, empresaId);
        const nuevoPagado = redondear2(Number(compra.pagado) + pago.monto);
        const nuevoSaldo = redondear2(Number(compra.total) - nuevoPagado);
        await manager.query('UPDATE compra SET pagado=$1,saldo_pendiente=$2 WHERE id=$3 AND empresa_id=$4', [nuevoPagado, nuevoSaldo, id, empresaId]);
        return this.obtenerDetalleConManager(manager, id, empresaId, sucursalIds);
      });
    } catch (error: any) {
      const codigo = error?.code || error?.driverError?.code;
      if (dto.idempotencyKey && codigo === '23505') {
        const pagoPrevio = await this.dataSource.query(
          `SELECT id FROM compra_pago
           WHERE empresa_id=$1 AND compra_id=$2 AND idempotency_key=$3 LIMIT 1`,
          [empresaId, id, dto.idempotencyKey],
        );
        if (pagoPrevio.length) return this.obtenerDetalle(id, empresaId, sucursalIds);
        throw new ConflictException('La clave de este pago ya fue utilizada en otra operación. Genere una nueva clave para reintentar.');
      }
      throw error;
    }
  }

  async anularCompra(id: number, dto: AnularCompraDto, usuarioId: number, empresaId: number, sucursalIds: number[]): Promise<any> {
    const motivo = dto.motivo.trim();
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT * FROM compra WHERE id=$1 AND empresa_id=$2 AND sucursal_id=ANY($3::int[]) FOR UPDATE`, [id, empresaId, sucursalIds],
      );
      if (!rows.length) throw new NotFoundException('Compra no encontrada');
      const compra = rows[0];
      if (compra.estado === 'ANULADA') throw new BadRequestException('La compra ya está anulada');
      const devolucionesRegistradas = await manager.query(`SELECT 1 FROM devolucion_proveedor WHERE compra_id=$1 AND empresa_id=$2 LIMIT 1`, [id, empresaId]);
      if (devolucionesRegistradas.length) throw new BadRequestException('Esta compra ya tiene devoluciones al proveedor registradas; no se puede anular por el flujo simple.');
      if (Number(compra.pagado) > 0) throw new BadRequestException('La compra tiene pagos registrados. Antes de anularla debe registrarse la devolución o reverso del pago al proveedor.');
      const lineas = await manager.query(
        `SELECT * FROM compra_linea WHERE compra_id=$1 AND empresa_id=$2 ORDER BY producto_id,variante_id FOR UPDATE`, [id, empresaId],
      );
      for (const linea of lineas) {
        const varianteId = linea.variante_id == null ? null : Number(linea.variante_id);
        const saldoRows = varianteId
          ? await manager.query(
              `SELECT stock,costo_promedio FROM producto_variante_stock
               WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND variante_id=$4 FOR UPDATE`,
              [empresaId, compra.sucursal_id, linea.producto_id, varianteId],
            )
          : await manager.query(
              `SELECT stock,costo_promedio FROM producto_stock
               WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 FOR UPDATE`,
              [empresaId, compra.sucursal_id, linea.producto_id],
            );
        const stock = saldoRows[0];
        const etiqueta = linea.variante_nombre || `producto ${linea.producto_id}`;
        if (!stock || Number(stock.stock) < Number(linea.cantidad)) {
          throw new BadRequestException(`No hay existencias suficientes para revertir ${etiqueta}; revise ventas o transferencias posteriores.`);
        }
        const salidas = await manager.query(
          `SELECT COUNT(*)::int AS total FROM movimiento_inventario
           WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND tipo='SALIDA'
             AND created_at >= $4 AND (compra_id IS NULL OR compra_id <> $5)
             AND variante_id IS NOT DISTINCT FROM $6::integer`,
          [empresaId, compra.sucursal_id, linea.producto_id, compra.fecha_registro, id, varianteId],
        );
        if (Number(salidas[0]?.total || 0) > 0) {
          throw new BadRequestException(`No se puede anular: ${etiqueta} tuvo salidas posteriores. Registre una devolución al proveedor con control de existencias.`);
        }
        const stockPosterior = Number((Number(stock.stock) - Number(linea.cantidad)).toFixed(3));
        const valorActual = Number(stock.stock) * Number(stock.costo_promedio || 0);
        const valorRevertido = Number(linea.cantidad) * Number(linea.costo_unitario);
        const costoPosterior = stockPosterior > 0 ? Number(((valorActual - valorRevertido) / stockPosterior).toFixed(4)) : 0;
        if (costoPosterior < -0.0001) throw new BadRequestException('No se puede reconstruir el costo promedio al revertir esta compra; requiere revisión contable.');
        if (varianteId) {
          await manager.query(
            `UPDATE producto_variante_stock SET stock=$1,costo_promedio=$2,updated_at=NOW()
             WHERE empresa_id=$3 AND sucursal_id=$4 AND producto_id=$5 AND variante_id=$6`,
            [stockPosterior, Math.max(0, costoPosterior), empresaId, compra.sucursal_id, linea.producto_id, varianteId],
          );
        } else {
          await manager.query(
            `UPDATE producto_stock SET stock=$1,costo_promedio=$2,updated_at=NOW()
             WHERE empresa_id=$3 AND sucursal_id=$4 AND producto_id=$5`,
            [stockPosterior, Math.max(0, costoPosterior), empresaId, compra.sucursal_id, linea.producto_id],
          );
        }
        const loteCompra = await manager.query(
          `SELECT id,cantidad_disponible FROM inventario_lote
           WHERE compra_linea_id=$1 AND empresa_id=$2 AND sucursal_id=$3
             AND variante_id IS NOT DISTINCT FROM $4::integer FOR UPDATE`,
          [linea.id, empresaId, compra.sucursal_id, varianteId],
        );
        if (loteCompra.length) {
          if (Number(loteCompra[0].cantidad_disponible) < Number(linea.cantidad)) {
            throw new BadRequestException(`No queda suficiente saldo en el lote de compra ${linea.id} para anularlo.`);
          }
          await manager.query(`UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible-$1 WHERE id=$2`, [linea.cantidad, loteCompra[0].id]);
        } else {
          let porRevertir = Number(linea.cantidad);
          const lotesLegacy = await manager.query(
            `SELECT id,cantidad_disponible FROM inventario_lote
             WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3
               AND variante_id IS NOT DISTINCT FROM $4::integer AND cantidad_disponible>0
             ORDER BY fecha_vencimiento ASC NULLS LAST,id FOR UPDATE`,
            [empresaId, compra.sucursal_id, linea.producto_id, varianteId],
          );
          for (const lote of lotesLegacy) {
            if (porRevertir <= 0.0005) break;
            const quitar = Math.min(porRevertir, Number(lote.cantidad_disponible));
            await manager.query(`UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible-$1 WHERE id=$2`, [quitar, lote.id]);
            porRevertir = Number((porRevertir - quitar).toFixed(3));
          }
          if (porRevertir > 0.0005) throw new BadRequestException(`Los lotes disponibles no alcanzan para anular la compra de ${etiqueta}.`);
        }
        await manager.query(
          `INSERT INTO movimiento_inventario (empresa_id,sucursal_id,producto_id,variante_id,compra_id,usuario_id,tipo,cantidad,
            stock_anterior,stock_posterior,motivo)
           VALUES ($1,$2,$3,$4,$5,$6,'SALIDA',$7,$8,$9,$10)`,
          [empresaId, compra.sucursal_id, linea.producto_id, varianteId, id, usuarioId, Number(linea.cantidad), Number(stock.stock),
            stockPosterior, `Anulación de compra #${id}: ${motivo}`.slice(0, 200)],
        );
      }
      await manager.query(
        `UPDATE compra SET estado='ANULADA',saldo_pendiente=0,motivo_anulacion=$1 WHERE id=$2 AND empresa_id=$3`,
        [motivo, id, empresaId],
      );
      return this.obtenerDetalleConManager(manager, id, empresaId, sucursalIds);
    });
  }

  async devolverProveedor(compraId: number, dto: DevolucionProveedorDto, usuarioId: number, empresaId: number, sucursalIds: number[]) {
    const motivo = dto.motivo.trim(), key = dto.idempotencyKey.trim();
    if (!sucursalIds?.length) throw new ForbiddenException('No tiene sucursales asignadas');
    const lineasNormalizadas = [...dto.lineas]
      .map(x => ({ compraLineaId: Number(x.compraLineaId), cantidad: Number(x.cantidad) }))
      .sort((a,b) => a.compraLineaId-b.compraLineaId);
    if (new Set(lineasNormalizadas.map(x=>x.compraLineaId)).size !== lineasNormalizadas.length) throw new BadRequestException('No repita líneas de compra');
    if (lineasNormalizadas.some(x=>!Number.isInteger(x.compraLineaId)||!Number.isFinite(x.cantidad)||x.cantidad<=0||Math.round(x.cantidad*1000)!==x.cantidad*1000)) {
      throw new BadRequestException('Cantidad o línea inválida');
    }
    const hash = createHash('sha256').update(JSON.stringify({compraId,motivo,lineas:lineasNormalizadas})).digest('hex');
    return this.dataSource.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`devolucion-proveedor:${empresaId}:${usuarioId}:${key}`]);
      const prev = await manager.query(
        `SELECT id,request_hash FROM devolucion_proveedor WHERE empresa_id=$1 AND usuario_id=$2 AND idempotency_key=$3`,
        [empresaId,usuarioId,key],
      );
      if (prev.length) {
        if (prev[0].request_hash !== hash) throw new ConflictException('La clave ya fue usada con otros datos');
        return this.detalleDevolucionProveedor(manager,Number(prev[0].id),empresaId,sucursalIds);
      }
      const cr = await manager.query(
        `SELECT * FROM compra WHERE id=$1 AND empresa_id=$2 AND sucursal_id=ANY($3::int[]) FOR UPDATE`,
        [compraId,empresaId,sucursalIds],
      );
      if (!cr.length) throw new NotFoundException('Compra no encontrada');
      if (cr[0].estado !== 'RECIBIDA') throw new BadRequestException('La compra no está recibida');

      const lineas: any[] = [];
      let total = 0;
      for (const req of lineasNormalizadas) {
        const rows = await manager.query(
          `SELECT cl.id,cl.producto_id,cl.variante_id,cl.variante_nombre,cl.cantidad,cl.costo_unitario,cl.subtotal,
                  p.nombre,pv.nombre AS nombre_variante
           FROM compra_linea cl
           JOIN producto p ON p.id=cl.producto_id AND p.empresa_id=cl.empresa_id
           LEFT JOIN producto_variante pv ON pv.id=cl.variante_id AND pv.producto_id=cl.producto_id AND pv.empresa_id=cl.empresa_id
           WHERE cl.id=$1 AND cl.compra_id=$2 AND cl.empresa_id=$3 FOR UPDATE OF cl`,
          [req.compraLineaId,compraId,empresaId],
        );
        if (!rows.length) throw new NotFoundException('Línea de compra no encontrada');
        const row = rows[0];
        const varianteId = row.variante_id == null ? null : Number(row.variante_id);
        const dev = await manager.query(
          `SELECT COALESCE(SUM(dl.cantidad),0)::numeric AS cantidad
           FROM devolucion_proveedor_linea dl
           JOIN devolucion_proveedor d ON d.id=dl.devolucion_id
           WHERE dl.compra_linea_id=$1 AND d.empresa_id=$2`,
          [req.compraLineaId,empresaId],
        );
        if (req.cantidad + Number(dev[0].cantidad) > Number(row.cantidad) + 0.0005) {
          throw new BadRequestException(`Cantidad a devolver excede el saldo adquirido de ${row.nombre_variante || row.variante_nombre || row.nombre}`);
        }
        const lotesCompra = await manager.query(
          `SELECT id,cantidad_disponible,codigo_lote,fecha_vencimiento,costo_unitario
           FROM inventario_lote WHERE compra_linea_id=$1 AND empresa_id=$2 AND sucursal_id=$3
             AND variante_id IS NOT DISTINCT FROM $4::integer FOR UPDATE`,
          [req.compraLineaId,empresaId,cr[0].sucursal_id,varianteId],
        );
        let porDevolver = req.cantidad;
        const lotesDisponibles = lotesCompra.length ? lotesCompra : await manager.query(
          `SELECT id,cantidad_disponible,codigo_lote,fecha_vencimiento,costo_unitario
           FROM inventario_lote WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3
             AND variante_id IS NOT DISTINCT FROM $4::integer AND cantidad_disponible>0
           ORDER BY fecha_vencimiento ASC NULLS LAST,id FOR UPDATE`,
          [empresaId,cr[0].sucursal_id,row.producto_id,varianteId],
        );
        for (const lote of lotesDisponibles) {
          if (porDevolver <= 0.0005) break;
          const tomar = Math.min(porDevolver,Number(lote.cantidad_disponible));
          const subtotal = Number((tomar * Number(row.costo_unitario)).toFixed(2));
          total += subtotal;
          lineas.push({
            ...row, compraLineaId:req.compraLineaId, varianteId, lote_id:lote.id,
            cantidad:tomar, subtotal, etiqueta:row.nombre_variante || row.variante_nombre || row.nombre,
          });
          porDevolver = Number((porDevolver-tomar).toFixed(3));
        }
        if (porDevolver > 0.0005) throw new BadRequestException(`Stock insuficiente en los lotes disponibles para devolver ${row.nombre_variante || row.nombre}`);
      }
      total = Number(total.toFixed(2));
      if (total <= 0) throw new BadRequestException('El total de la devolución debe ser mayor a cero');
      const {aplicadoCuenta:aplicado,saldoAFavor:favor} = calcularAplicacionNotaProveedor(total,Number(cr[0].saldo_pendiente));
      const hdr = await manager.query(
        `INSERT INTO devolucion_proveedor(empresa_id,sucursal_id,compra_id,proveedor_id,usuario_id,motivo,total,aplicado_cuenta,saldo_a_favor,idempotency_key,request_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [empresaId,cr[0].sucursal_id,compraId,cr[0].proveedor_id,usuarioId,motivo,total,aplicado,favor,key,hash],
      );
      const devId = Number(hdr[0].id);
      for (const ln of lineas) {
        const stocks = ln.varianteId
          ? await manager.query(
              `SELECT stock,costo_promedio FROM producto_variante_stock
               WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND variante_id=$4 FOR UPDATE`,
              [empresaId,cr[0].sucursal_id,ln.producto_id,ln.varianteId],
            )
          : await manager.query(
              `SELECT stock,costo_promedio FROM producto_stock
               WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 FOR UPDATE`,
              [empresaId,cr[0].sucursal_id,ln.producto_id],
            );
        if (!stocks.length || Number(stocks[0].stock) < ln.cantidad) throw new BadRequestException(`Stock insuficiente para devolver ${ln.etiqueta}`);
        const stockAnterior = Number(stocks[0].stock);
        const stockNuevo = Number((stockAnterior-ln.cantidad).toFixed(3));
        const valorCalculado = stockAnterior*Number(stocks[0].costo_promedio||0)-ln.cantidad*Number(ln.costo_unitario);
        if (valorCalculado < -0.01) throw new BadRequestException(`No se puede reconstruir el costo promedio de ${ln.etiqueta} al devolver este lote; requiere revisión del costo de inventario.`);
        const costoNuevo = stockNuevo>0 ? Number((Math.max(0,valorCalculado)/stockNuevo).toFixed(4)) : 0;
        const upd = ln.varianteId
          ? await manager.query(
              `UPDATE producto_variante_stock SET stock=$1,costo_promedio=$2,updated_at=NOW()
               WHERE empresa_id=$3 AND sucursal_id=$4 AND producto_id=$5 AND variante_id=$6 RETURNING stock`,
              [stockNuevo,costoNuevo,empresaId,cr[0].sucursal_id,ln.producto_id,ln.varianteId],
            )
          : await manager.query(
              `UPDATE producto_stock SET stock=$1,costo_promedio=$2,updated_at=NOW()
               WHERE empresa_id=$3 AND sucursal_id=$4 AND producto_id=$5 RETURNING stock`,
              [stockNuevo,costoNuevo,empresaId,cr[0].sucursal_id,ln.producto_id],
            );
        const loteUpd = await manager.query(
          `UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible-$1
           WHERE id=$2 AND cantidad_disponible >= $1 RETURNING id`,
          [ln.cantidad,ln.lote_id],
        );
        if (!loteUpd.length) throw new BadRequestException('El lote cambió mientras se procesaba la devolución; vuelva a intentar');
        await manager.query(
          `INSERT INTO devolucion_proveedor_linea(devolucion_id,empresa_id,sucursal_id,compra_linea_id,lote_id,producto_id,variante_id,cantidad,costo_unitario,subtotal)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [devId,empresaId,cr[0].sucursal_id,ln.compraLineaId,ln.lote_id,ln.producto_id,ln.varianteId,ln.cantidad,ln.costo_unitario,ln.subtotal],
        );
        await manager.query(
          `INSERT INTO movimiento_inventario(empresa_id,sucursal_id,producto_id,variante_id,compra_id,usuario_id,tipo,cantidad,stock_anterior,stock_posterior,motivo)
           VALUES($1,$2,$3,$4,$5,$6,'SALIDA',$7,$8,$9,$10)`,
          [empresaId,cr[0].sucursal_id,ln.producto_id,ln.varianteId,compraId,usuarioId,ln.cantidad,stockAnterior,upd[0].stock,
            `Devolución proveedor #${devId} · ${ln.etiqueta}: ${motivo}`.slice(0,200)],
        );
      }
      await manager.query(`UPDATE compra SET saldo_pendiente=GREATEST(0,saldo_pendiente-$1) WHERE id=$2 AND empresa_id=$3`,[aplicado,compraId,empresaId]);
      return this.detalleDevolucionProveedor(manager,devId,empresaId,sucursalIds);
    });
  }

  private async detalleDevolucionProveedor(manager: EntityManager,id:number,empresaId:number,sucursalIds:number[]) {
    const rows=await manager.query(`SELECT d.*,d.sucursal_id AS "sucursalId",d.compra_id AS "compraId",d.aplicado_cuenta AS "aplicadoCuenta",d.saldo_a_favor AS "saldoAFavor",p.nombre AS "proveedorNombre" FROM devolucion_proveedor d JOIN proveedor p ON p.id=d.proveedor_id AND p.empresa_id=d.empresa_id WHERE d.id=$1 AND d.empresa_id=$2 AND d.sucursal_id=ANY($3::int[])`,[id,empresaId,sucursalIds]);
    if(!rows.length)throw new NotFoundException('Devolución no encontrada');
    rows[0].lineas=await manager.query(`SELECT dl.*,dl.compra_linea_id AS "compraLineaId",dl.variante_id AS "varianteId",p.codigo,p.nombre AS "productoNombre",pv.nombre AS "varianteNombre",l.codigo_lote AS "codigoLote",l.fecha_vencimiento AS "fechaVencimiento" FROM devolucion_proveedor_linea dl JOIN producto p ON p.id=dl.producto_id AND p.empresa_id=dl.empresa_id JOIN inventario_lote l ON l.id=dl.lote_id
       LEFT JOIN producto_variante pv ON pv.id=dl.variante_id AND pv.producto_id=dl.producto_id AND pv.empresa_id=dl.empresa_id
       WHERE dl.devolucion_id=$1 ORDER BY dl.id`,[id]);
    return rows[0];
  }
}
