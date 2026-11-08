import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CrearGastoDto, PagarGastoDto } from './dto/gasto.dto';

@Injectable()
export class GastosService {
  constructor(private readonly dataSource: DataSource) {}

  private async validarSucursal(manager: any, sucursalId: number, empresaId: number, sucursalIds: number[]) {
    if (!Number.isInteger(sucursalId) || sucursalId <= 0) throw new BadRequestException('Sucursal inválida');
    if (!sucursalIds.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const rows = await manager.query('SELECT id FROM sucursal WHERE id=$1 AND empresa_id=$2', [sucursalId, empresaId]);
    if (!rows.length) throw new ForbiddenException('La sucursal no pertenece a su empresa');
  }


  async dashboardGerencial(empresaId: number, sucursalIds: number[], sucursalId?: number) {
    const ids = sucursalId ? [sucursalId] : sucursalIds;
    if (sucursalId) await this.validarSucursal(this.dataSource, sucursalId, empresaId, sucursalIds);
    if (!ids.length) return {
      periodo: { diasTopProductos: 30, diasBajaRotacion: 30, diasAlertaVencimiento: 30, diasMermas: 30 },
      ventas: { ventasHoy: 0, comprobantesHoy: 0, ventasMes: 0, ventasMesAnterior: 0, variacionMensual: null },
      rentabilidad: { ventasNetas: 0, ventasConCosto: 0, ventasSinCosto: 0, costoMercaderia: 0, utilidadBruta: 0, gastosOperativos: 0, utilidadOperativa: 0, lineasSinCosto: 0 },
      topProductos: [], bajaRotacion: [], stockBajo: [], stockBajoVariantes: [], porVencer: [], sucursales: [],
      finanzas: {
        cuentasPorCobrar: { cantidad: 0, total: 0, vencido: 0, vencidas: 0 },
        cuentasPorPagar: { cantidad: 0, total: 0, vencido: 0, vencidas: 0 },
        gastosPendientes: { cantidad: 0, total: 0, vencido: 0 },
      },
      mermas: { cantidad: 0, unidades: 0, costo: 0 },
      cajas: { abiertas: 0, saldoInicial: 0 },
      tendencias: { ventasDiarias: [], ventasMensuales: [] },
    };

    const ventas = await this.dataSource.query(
      `SELECT
        COALESCE(SUM(CASE WHEN c.tipo='07' THEN -c.total ELSE c.total END) FILTER (WHERE (c.fecha_emision AT TIME ZONE 'America/Lima')::date=(NOW() AT TIME ZONE 'America/Lima')::date AND c.tipo IN ('01','03','07','08')),0)::numeric AS "ventasHoy",
        COUNT(*) FILTER (WHERE (c.fecha_emision AT TIME ZONE 'America/Lima')::date=(NOW() AT TIME ZONE 'America/Lima')::date AND c.tipo IN ('01','03','07','08'))::int AS "comprobantesHoy",
        COALESCE(SUM(CASE WHEN c.tipo='07' THEN -c.total ELSE c.total END) FILTER (WHERE c.fecha_emision >= (date_trunc('month',NOW() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima') AND c.tipo IN ('01','03','07','08')),0)::numeric AS "ventasMes",
        COALESCE(SUM(CASE WHEN c.tipo='07' THEN -c.total ELSE c.total END) FILTER (WHERE c.fecha_emision >= (date_trunc('month',NOW() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima') - interval '1 month' AND c.fecha_emision < (date_trunc('month',NOW() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima') AND c.tipo IN ('01','03','07','08')),0)::numeric AS "ventasMesAnterior"
       FROM comprobante c WHERE c.empresa_id=$1 AND c.sucursal_id=ANY($2::int[]) AND c.estado <> 'ANULADA'`,
      [empresaId, ids],
    );
    const resultado = await this.estadoResultados(empresaId, sucursalIds, sucursalId,
      new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }),
      new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }));
    const topProductos = await this.dataSource.query(
      `SELECT p.id AS "productoId",p.codigo,p.nombre,
        SUM(GREATEST(0,cl.cantidad-COALESCE(dev.cantidad_devuelta,0)))::numeric AS "cantidadVendida",
        SUM(GREATEST(0,cl.base_imponible-CASE WHEN cl.subtotal>0 THEN cl.base_imponible*COALESCE(dev.importe_devuelto,0)/cl.subtotal ELSE 0 END))::numeric AS "ventasNetas",
        SUM(GREATEST(0,cl.base_imponible-CASE WHEN cl.subtotal>0 THEN cl.base_imponible*COALESCE(dev.importe_devuelto,0)/cl.subtotal ELSE 0 END)-GREATEST(0,cl.cantidad-COALESCE(dev.cantidad_devuelta,0))*cl.costo_unitario/CASE WHEN cl.tipo_igv=10 THEN 1.18 ELSE 1 END) FILTER(WHERE cl.costo_unitario>0)::numeric AS "utilidadBruta",
        COUNT(*) FILTER(WHERE cl.costo_unitario=0)::int AS "lineasSinCosto"
       FROM comprobante_linea cl JOIN comprobante c ON c.id=cl.comprobante_id AND c.empresa_id=$1
       JOIN producto p ON p.id=cl.producto_id AND p.empresa_id=$1
       LEFT JOIN LATERAL (SELECT SUM(dl.cantidad)::numeric cantidad_devuelta,SUM(dl.monto)::numeric importe_devuelto FROM devolucion_venta_linea dl JOIN devolucion_venta dv ON dv.id=dl.devolucion_id WHERE dl.comprobante_linea_id=cl.id AND dv.empresa_id=$1 AND dv.estado='REGISTRADA') dev ON TRUE
       WHERE c.sucursal_id=ANY($2::int[]) AND c.estado<>'ANULADA' AND c.tipo IN ('01','03') AND c.fecha_emision>=NOW()-interval '30 days'
       GROUP BY p.id,p.codigo,p.nombre ORDER BY "cantidadVendida" DESC LIMIT 8`, [empresaId,ids]);
    const stockBajo = await this.dataSource.query(
      `SELECT p.id,p.codigo,p.nombre,ps.stock,ps.stock_minimo AS "stockMinimo",ps.sucursal_id AS "sucursalId",s.nombre AS "sucursalNombre"
       FROM producto_stock ps JOIN producto p ON p.id=ps.producto_id AND p.empresa_id=ps.empresa_id
       JOIN sucursal s ON s.id=ps.sucursal_id WHERE ps.empresa_id=$1 AND ps.sucursal_id=ANY($2::int[])
       AND p.activo=TRUE AND ps.stock<=ps.stock_minimo ORDER BY (ps.stock-ps.stock_minimo),p.nombre LIMIT 12`,[empresaId,ids]);
    const porVencer = await this.dataSource.query(
      `SELECT l.id,l.codigo_lote AS "codigoLote",l.fecha_vencimiento AS "fechaVencimiento",l.cantidad_disponible AS "cantidadDisponible",l.sucursal_id AS "sucursalId",p.nombre AS "productoNombre",s.nombre AS "sucursalNombre"
       FROM inventario_lote l JOIN producto p ON p.id=l.producto_id AND p.empresa_id=l.empresa_id JOIN sucursal s ON s.id=l.sucursal_id
       WHERE l.empresa_id=$1 AND l.sucursal_id=ANY($2::int[]) AND l.cantidad_disponible>0 AND l.fecha_vencimiento BETWEEN (NOW() AT TIME ZONE 'America/Lima')::date AND ((NOW() AT TIME ZONE 'America/Lima')::date+30)
       ORDER BY l.fecha_vencimiento LIMIT 12`,[empresaId,ids]);
    const bajaRotacion = await this.dataSource.query(
      `SELECT p.id,p.codigo,p.nombre,ps.stock,MAX(c.fecha_emision) AS "ultimaVenta"
       FROM producto_stock ps JOIN producto p ON p.id=ps.producto_id AND p.empresa_id=ps.empresa_id
       LEFT JOIN comprobante_linea cl ON cl.producto_id=p.id LEFT JOIN comprobante c ON c.id=cl.comprobante_id AND c.empresa_id=$1 AND c.sucursal_id=ps.sucursal_id AND c.estado<>'ANULADA' AND c.tipo IN ('01','03')
       WHERE ps.empresa_id=$1 AND ps.sucursal_id=ANY($2::int[]) AND p.activo=TRUE AND ps.stock>0
       GROUP BY p.id,p.codigo,p.nombre,ps.stock HAVING MAX(c.fecha_emision) IS NULL OR MAX(c.fecha_emision)<NOW()-interval '30 days'
       ORDER BY MAX(c.fecha_emision) NULLS FIRST LIMIT 8`,[empresaId,ids]);
    const sucursales = sucursalId ? [] : await this.dataSource.query(
      `SELECT s.id,s.nombre,COALESCE(SUM(CASE WHEN c.tipo='07' THEN -c.total ELSE c.total END),0)::numeric AS ventas FROM sucursal s LEFT JOIN comprobante c ON c.sucursal_id=s.id AND c.empresa_id=$1 AND c.estado<>'ANULADA' AND c.tipo IN ('01','03','07','08') AND c.fecha_emision>=(date_trunc('month',NOW() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima') WHERE s.empresa_id=$1 AND s.id=ANY($2::int[]) GROUP BY s.id,s.nombre ORDER BY ventas DESC`,[empresaId,ids]);

    // Alertas financieras: se leen los saldos vigentes, no se recalculan ni modifican cuentas.
    const [cuentasCobrar, cuentasPagar, gastosPendientes, mermas, cajasAbiertas, ventasDiarias, ventasMensuales, stockBajoVariantes] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(saldo_pendiente),0)::numeric AS total,
                COALESCE(SUM(saldo_pendiente) FILTER (WHERE fecha_vencimiento < (NOW() AT TIME ZONE 'America/Lima')::date),0)::numeric AS vencido,
                COUNT(*) FILTER (WHERE fecha_vencimiento < (NOW() AT TIME ZONE 'America/Lima')::date)::int AS vencidas
           FROM cuenta_cobrar WHERE empresa_id=$1 AND sucursal_id=ANY($2::int[]) AND estado IN ('PENDIENTE','PARCIAL') AND saldo_pendiente>0`, [empresaId, ids]),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(saldo_pendiente),0)::numeric AS total,
                COALESCE(SUM(saldo_pendiente) FILTER (WHERE fecha_vencimiento < (NOW() AT TIME ZONE 'America/Lima')::date),0)::numeric AS vencido,
                COUNT(*) FILTER (WHERE fecha_vencimiento < (NOW() AT TIME ZONE 'America/Lima')::date)::int AS vencidas
           FROM compra WHERE empresa_id=$1 AND sucursal_id=ANY($2::int[]) AND estado='RECIBIDA' AND saldo_pendiente>0`, [empresaId, ids]),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(monto),0)::numeric AS total,
                COALESCE(SUM(monto) FILTER (WHERE fecha_vencimiento < (NOW() AT TIME ZONE 'America/Lima')::date),0)::numeric AS vencido
           FROM gasto_operativo WHERE empresa_id=$1 AND sucursal_id=ANY($2::int[]) AND estado='PENDIENTE'`, [empresaId, ids]),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(cantidad),0)::numeric AS unidades,
                COALESCE(SUM(costo_total),0)::numeric AS costo
           FROM inventario_merma WHERE empresa_id=$1 AND sucursal_id=ANY($2::int[])
             AND created_at >= NOW()-interval '30 days'`, [empresaId, ids]),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(saldo_inicial),0)::numeric AS saldo_inicial
           FROM caja WHERE sucursal_id=ANY($1::int[]) AND estado='ABIERTA'`, [ids]),
      this.dataSource.query(
        `SELECT (c.fecha_emision AT TIME ZONE 'America/Lima')::date AS fecha,
                SUM(CASE WHEN c.tipo='07' THEN -c.total ELSE c.total END)::numeric AS ventas
           FROM comprobante c WHERE c.empresa_id=$1 AND c.sucursal_id=ANY($2::int[]) AND c.estado<>'ANULADA'
             AND c.tipo IN ('01','03','07','08')
             AND (c.fecha_emision AT TIME ZONE 'America/Lima')::date >= (NOW() AT TIME ZONE 'America/Lima')::date-6
           GROUP BY 1 ORDER BY 1`, [empresaId, ids]),
      this.dataSource.query(
        `SELECT TO_CHAR(date_trunc('month',c.fecha_emision AT TIME ZONE 'America/Lima'),'YYYY-MM') AS periodo,
                SUM(CASE WHEN c.tipo='07' THEN -c.total ELSE c.total END)::numeric AS ventas
           FROM comprobante c WHERE c.empresa_id=$1 AND c.sucursal_id=ANY($2::int[]) AND c.estado<>'ANULADA'
             AND c.tipo IN ('01','03','07','08')
             AND c.fecha_emision >= ((date_trunc('month',NOW() AT TIME ZONE 'America/Lima')-interval '5 months') AT TIME ZONE 'America/Lima')
           GROUP BY 1 ORDER BY 1`, [empresaId, ids]),
      this.dataSource.query(
        `SELECT p.id,p.codigo,p.nombre,pv.id AS "varianteId",pv.codigo AS "varianteCodigo",pv.nombre AS "varianteNombre",
                pvs.stock,pvs.stock_minimo AS "stockMinimo",pvs.sucursal_id AS "sucursalId",s.nombre AS "sucursalNombre"
           FROM producto_variante_stock pvs JOIN producto_variante pv ON pv.id=pvs.variante_id AND pv.empresa_id=pvs.empresa_id
           JOIN producto p ON p.id=pvs.producto_id AND p.empresa_id=pvs.empresa_id
           JOIN sucursal s ON s.id=pvs.sucursal_id
          WHERE pvs.empresa_id=$1 AND pvs.sucursal_id=ANY($2::int[]) AND p.activo=TRUE AND pv.activo=TRUE
            AND pvs.stock<=pvs.stock_minimo ORDER BY (pvs.stock-pvs.stock_minimo),p.nombre LIMIT 12`, [empresaId, ids]),
    ]);
    const v=ventas[0]||{}; const actual=Number(v.ventasMes||0), anterior=Number(v.ventasMesAnterior||0);
    const cc=cuentasCobrar[0]||{}, cp=cuentasPagar[0]||{}, gp=gastosPendientes[0]||{}, mm=mermas[0]||{}, ca=cajasAbiertas[0]||{};
    return { periodo:{ diasTopProductos:30, diasBajaRotacion:30, diasAlertaVencimiento:30, diasMermas:30 },
      ventas:{ ventasHoy:Number(v.ventasHoy||0), comprobantesHoy:Number(v.comprobantesHoy||0), ventasMes:actual, ventasMesAnterior:anterior,
        variacionMensual:anterior>0?Number(((actual-anterior)/anterior*100).toFixed(2)):null },
      rentabilidad:resultado.resumen, topProductos, bajaRotacion, stockBajo, stockBajoVariantes, porVencer, sucursales,
      finanzas:{ cuentasPorCobrar:{cantidad:Number(cc.cantidad||0),total:Number(cc.total||0),vencido:Number(cc.vencido||0),vencidas:Number(cc.vencidas||0)},
        cuentasPorPagar:{cantidad:Number(cp.cantidad||0),total:Number(cp.total||0),vencido:Number(cp.vencido||0),vencidas:Number(cp.vencidas||0)},
        gastosPendientes:{cantidad:Number(gp.cantidad||0),total:Number(gp.total||0),vencido:Number(gp.vencido||0)} },
      mermas:{cantidad:Number(mm.cantidad||0),unidades:Number(mm.unidades||0),costo:Number(mm.costo||0)},
      cajas:{abiertas:Number(ca.cantidad||0),saldoInicial:Number(ca.saldo_inicial||0)},
      tendencias:{ ventasDiarias:ventasDiarias.map((x:any)=>({fecha:x.fecha,ventas:Number(x.ventas||0)})),
        ventasMensuales:ventasMensuales.map((x:any)=>({periodo:x.periodo,ventas:Number(x.ventas||0)})) } };
  }

  async estadoResultados(
    empresaId: number, sucursalIds: number[], sucursalId?: number, desde?: string, hasta?: string,
  ) {
    const ids = sucursalId ? [sucursalId] : sucursalIds;
    if (sucursalId) await this.validarSucursal(this.dataSource, sucursalId, empresaId, sucursalIds);
    if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new BadRequestException('Fecha desde inválida');
    if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) throw new BadRequestException('Fecha hasta inválida');
    if (desde && hasta && desde > hasta) throw new BadRequestException('El rango de fechas es inválido');
    if (!ids.length) return { resumen: { ventasNetas: 0, ventasConCosto: 0, ventasSinCosto: 0, costoMercaderia: 0, utilidadBruta: 0, gastosOperativos: 0, utilidadOperativa: 0, lineasSinCosto: 0 }, diario: [], gastosPorCategoria: [] };

    const diario = await this.dataSource.query(
      `WITH ventas_linea AS (
         SELECT (c.fecha_emision AT TIME ZONE 'America/Lima')::date AS fecha,
                (CASE WHEN c.tipo='07' THEN -1 ELSE 1 END *
                  GREATEST(0, cl.base_imponible -
                    CASE WHEN cl.subtotal > 0 THEN cl.base_imponible * COALESCE(dev.importe_devuelto,0) / cl.subtotal ELSE 0 END
                  ))::numeric AS venta_neta,
                (CASE WHEN c.tipo='07' THEN -1 ELSE 1 END *
                  GREATEST(0,cl.cantidad-COALESCE(dev.cantidad_devuelta,0)) * cl.costo_unitario /
                  CASE WHEN cl.tipo_igv=10 THEN 1.18 ELSE 1 END)::numeric AS costo_neto,
                CASE WHEN cl.costo_unitario > 0 THEN 0 ELSE 1 END AS sin_costo
           FROM comprobante_linea cl
           INNER JOIN comprobante c ON c.id=cl.comprobante_id AND c.empresa_id=$1
           LEFT JOIN LATERAL (
             SELECT SUM(dl.cantidad)::numeric AS cantidad_devuelta,SUM(dl.monto)::numeric AS importe_devuelto
               FROM devolucion_venta_linea dl
               INNER JOIN devolucion_venta dv ON dv.id=dl.devolucion_id
              WHERE dl.comprobante_linea_id=cl.id AND dv.empresa_id=$1 AND dv.estado='REGISTRADA'
           ) dev ON TRUE
          WHERE c.sucursal_id=ANY($2::int[]) AND c.estado <> 'ANULADA'
            AND c.tipo IN ('01','03','07','08')
            -- La devolución ya reduce la venta original mediante devolucion_venta_linea.
            -- Excluir su nota de crédito vinculada evita descontar el mismo importe dos veces.
            AND NOT (c.tipo='07' AND c.devolucion_venta_id IS NOT NULL)
            AND ($3::date IS NULL OR (c.fecha_emision AT TIME ZONE 'America/Lima')::date >= $3::date)
            AND ($4::date IS NULL OR (c.fecha_emision AT TIME ZONE 'America/Lima')::date <= $4::date)
       ), ventas_dia AS (
         SELECT fecha,SUM(venta_neta)::numeric AS ventas_netas,
                SUM(venta_neta) FILTER (WHERE sin_costo=0)::numeric AS ventas_con_costo,
                SUM(venta_neta) FILTER (WHERE sin_costo=1)::numeric AS ventas_sin_costo,
                SUM(costo_neto) FILTER (WHERE sin_costo=0)::numeric AS costo_mercaderia,
                COUNT(*) FILTER (WHERE sin_costo=1)::int AS lineas_sin_costo
           FROM ventas_linea GROUP BY fecha
       ), gastos_dia AS (
         SELECT fecha,SUM(monto)::numeric AS gastos_operativos
           FROM gasto_operativo
          WHERE empresa_id=$1 AND sucursal_id=ANY($2::int[])
            AND ($3::date IS NULL OR fecha >= $3::date)
            AND ($4::date IS NULL OR fecha <= $4::date)
          GROUP BY fecha
       ), dias AS (
         SELECT fecha FROM ventas_dia UNION SELECT fecha FROM gastos_dia
       )
       SELECT d.fecha,
              COALESCE(v.ventas_netas,0)::numeric AS "ventasNetas",
              COALESCE(v.ventas_con_costo,0)::numeric AS "ventasConCosto",
              COALESCE(v.ventas_sin_costo,0)::numeric AS "ventasSinCosto",
              COALESCE(v.costo_mercaderia,0)::numeric AS "costoMercaderia",
              (COALESCE(v.ventas_con_costo,0)-COALESCE(v.costo_mercaderia,0))::numeric AS "utilidadBruta",
              COALESCE(g.gastos_operativos,0)::numeric AS "gastosOperativos",
              (COALESCE(v.ventas_con_costo,0)-COALESCE(v.costo_mercaderia,0)-COALESCE(g.gastos_operativos,0))::numeric AS "utilidadOperativa",
              COALESCE(v.lineas_sin_costo,0)::int AS "lineasSinCosto"
         FROM dias d LEFT JOIN ventas_dia v ON v.fecha=d.fecha
         LEFT JOIN gastos_dia g ON g.fecha=d.fecha
        ORDER BY d.fecha`,
      [empresaId, ids, desde || null, hasta || null],
    );

    const gastosPorCategoria = await this.dataSource.query(
      `SELECT categoria,SUM(monto)::numeric AS total,COUNT(*)::int AS cantidad
         FROM gasto_operativo
        WHERE empresa_id=$1 AND sucursal_id=ANY($2::int[])
          AND ($3::date IS NULL OR fecha >= $3::date)
          AND ($4::date IS NULL OR fecha <= $4::date)
        GROUP BY categoria ORDER BY total DESC,categoria`,
      [empresaId, ids, desde || null, hasta || null],
    );
    const resumen = diario.reduce((a: any, r: any) => ({
      ventasNetas: a.ventasNetas + Number(r.ventasNetas || 0),
      ventasConCosto: a.ventasConCosto + Number(r.ventasConCosto || 0),
      ventasSinCosto: a.ventasSinCosto + Number(r.ventasSinCosto || 0),
      costoMercaderia: a.costoMercaderia + Number(r.costoMercaderia || 0),
      utilidadBruta: a.utilidadBruta + Number(r.utilidadBruta || 0),
      gastosOperativos: a.gastosOperativos + Number(r.gastosOperativos || 0),
      utilidadOperativa: a.utilidadOperativa + Number(r.utilidadOperativa || 0),
      lineasSinCosto: a.lineasSinCosto + Number(r.lineasSinCosto || 0),
    }), { ventasNetas: 0, ventasConCosto: 0, ventasSinCosto: 0, costoMercaderia: 0, utilidadBruta: 0, gastosOperativos: 0, utilidadOperativa: 0, lineasSinCosto: 0 });
    return { resumen, diario, gastosPorCategoria };
  }

  async listar(empresaId: number, sucursalIds: number[], sucursalId?: number, desde?: string, hasta?: string) {
    const ids = sucursalId ? [sucursalId] : sucursalIds;
    if (sucursalId) await this.validarSucursal(this.dataSource, sucursalId, empresaId, sucursalIds);
    if (desde && hasta && desde > hasta) throw new BadRequestException('El rango de fechas es inválido');
    if (!ids.length) return [];
    return this.dataSource.query(
      `SELECT g.id,g.sucursal_id AS "sucursalId",s.nombre AS "sucursalNombre",
              g.categoria,g.descripcion,g.monto,g.metodo_pago AS "metodoPago",
              g.fecha,g.fecha_vencimiento AS "fechaVencimiento",g.estado,
              g.metodo_pago_real AS "metodoPagoReal",g.referencia_pago AS "referenciaPago",
              g.fecha_pago AS "fechaPago",g.created_at AS "createdAt"
         FROM gasto_operativo g INNER JOIN sucursal s ON s.id=g.sucursal_id
        WHERE g.empresa_id=$1 AND g.sucursal_id=ANY($2::int[])
          AND ($3::date IS NULL OR g.fecha >= $3::date)
          AND ($4::date IS NULL OR g.fecha <= $4::date)
        ORDER BY g.fecha DESC,g.id DESC`,
      [empresaId, ids, desde || null, hasta || null],
    );
  }

  async crearEnSucursal(sucursalId: number, dto: CrearGastoDto, usuarioRef: string, empresaId: number, sucursalIds: number[]) {
    await this.validarSucursal(this.dataSource, sucursalId, empresaId, sucursalIds);
    if (dto.fechaVencimiento && dto.fechaVencimiento < dto.fecha) throw new BadRequestException('El vencimiento no puede ser anterior a la fecha del gasto');
    const rows = await this.dataSource.query(
      `INSERT INTO gasto_operativo
        (empresa_id,sucursal_id,usuario_ref,categoria,descripcion,monto,metodo_pago,fecha,fecha_vencimiento,estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,'PENDIENTE')
       RETURNING id`,
      [empresaId,sucursalId,usuarioRef,dto.categoria,dto.descripcion.trim(),dto.monto,dto.metodoPago,dto.fecha,dto.fechaVencimiento||null],
    );
    return { id: rows[0].id, mensaje: 'Gasto registrado como pendiente de pago' };
  }

  async pagar(id: number, dto: PagarGastoDto, empresaId: number, sucursalIds: number[]) {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT id,sucursal_id FROM gasto_operativo WHERE id=$1 AND empresa_id=$2 FOR UPDATE`, [id,empresaId],
      );
      if (!rows.length) throw new NotFoundException('Gasto no encontrado');
      await this.validarSucursal(manager, Number(rows[0].sucursal_id), empresaId, sucursalIds);
      const updated = await manager.query(
        `UPDATE gasto_operativo SET estado='PAGADO',metodo_pago_real=$2,referencia_pago=$3,fecha_pago=$4::date
          WHERE id=$1 AND estado='PENDIENTE' RETURNING id`,
        [id,dto.metodoPago,dto.referencia?.trim()||null,dto.fechaPago],
      );
      if (!updated.length) throw new BadRequestException('El gasto ya fue pagado o no está pendiente');
      return { id, estado: 'PAGADO', mensaje: 'Pago del gasto registrado' };
    });
  }
}
