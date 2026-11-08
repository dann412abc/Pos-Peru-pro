import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { MovimientoInventario } from './entities/movimiento-inventario.entity';
import { AjusteInventarioDto } from './dto/ajuste-inventario.dto';
import { TransferirInventarioDto } from './dto/transferir-inventario.dto';
import { AjusteVarianteInventarioDto } from './dto/ajuste-variante-inventario.dto';
import { RegistrarMermaDto } from './dto/registrar-merma.dto';
import { AbrirConteoDto, RegistrarConteoLineaDto } from './dto/conteo-inventario.dto';

@Injectable()
export class InventarioService {
  constructor(
    @InjectRepository(MovimientoInventario) private readonly movimientoRepo: Repository<MovimientoInventario>,
    private readonly dataSource: DataSource,
  ) {}

  async inteligenciaStock(empresaId: number, sucursalIds: number[], sucursalId?: number) {
    const ids = sucursalId ? [sucursalId] : [...new Set((sucursalIds || []).map(Number).filter(Number.isInteger))];
    if (!ids.length) return { resumen: { total: 0, stockBajo: 0, sinStock: 0, sinRotacion: 0, sobrestock: 0 }, items: [] };
    if (ids.some((id) => !sucursalIds.includes(id))) throw new ForbiddenException('No tiene acceso a una de las sucursales solicitadas');
    const items = await this.dataSource.query(`
      WITH catalogo AS (
        SELECT ps.empresa_id,ps.sucursal_id,p.id AS producto_id,NULL::int AS variante_id,
          p.codigo,p.nombre AS producto_nombre,NULL::text AS variante_nombre,
          ps.stock,ps.stock_minimo,ps.costo_promedio
        FROM producto_stock ps JOIN producto p ON p.id=ps.producto_id AND p.empresa_id=ps.empresa_id
        WHERE ps.empresa_id=$1 AND ps.sucursal_id=ANY($2::int[]) AND p.activo=TRUE AND COALESCE(p.tiene_variantes,FALSE)=FALSE
        UNION ALL
        SELECT vs.empresa_id,vs.sucursal_id,p.id,pv.id,COALESCE(pv.codigo,p.codigo),p.nombre,pv.nombre,
          vs.stock,vs.stock_minimo,vs.costo_promedio
        FROM producto_variante_stock vs JOIN producto_variante pv ON pv.id=vs.variante_id AND pv.empresa_id=vs.empresa_id
        JOIN producto p ON p.id=pv.producto_id AND p.empresa_id=pv.empresa_id
        WHERE vs.empresa_id=$1 AND vs.sucursal_id=ANY($2::int[]) AND pv.activo=TRUE AND p.activo=TRUE
      ), ventas AS (
        SELECT c.empresa_id,c.sucursal_id,cl.producto_id,cl.variante_id,
          SUM(cl.cantidad) FILTER (WHERE c.fecha_emision >= NOW()-INTERVAL '30 days') AS vendido_30,
          SUM(cl.cantidad) FILTER (WHERE c.fecha_emision >= NOW()-INTERVAL '90 days') AS vendido_90,
          MAX(c.fecha_emision) AS ultima_venta
        FROM comprobante_linea cl JOIN comprobante c ON c.id=cl.comprobante_id AND c.empresa_id=cl.empresa_id
        WHERE c.empresa_id=$1 AND c.sucursal_id=ANY($2::int[]) AND c.estado='PAGADA'
          AND c.tipo NOT IN ('07','08') AND c.fecha_emision >= NOW()-INTERVAL '90 days'
        GROUP BY c.empresa_id,c.sucursal_id,cl.producto_id,cl.variante_id
      ), base AS (
        SELECT ca.*,s.nombre AS sucursal_nombre,COALESCE(v.vendido_30,0)::numeric AS vendido_30,
          COALESCE(v.vendido_90,0)::numeric AS vendido_90,v.ultima_venta,
          ROUND(COALESCE(v.vendido_30,0)/30.0,3) AS venta_diaria,
          CASE WHEN COALESCE(v.vendido_30,0)>0 THEN ROUND(ca.stock/(v.vendido_30/30.0),1) ELSE NULL END AS dias_cobertura
        FROM catalogo ca JOIN sucursal s ON s.id=ca.sucursal_id AND s.empresa_id=ca.empresa_id
        LEFT JOIN ventas v ON v.empresa_id=ca.empresa_id AND v.sucursal_id=ca.sucursal_id
          AND v.producto_id=ca.producto_id AND v.variante_id IS NOT DISTINCT FROM ca.variante_id
      )
      SELECT sucursal_id AS "sucursalId",sucursal_nombre AS "sucursalNombre",producto_id AS "productoId",
        variante_id AS "varianteId",codigo,producto_nombre AS "productoNombre",variante_nombre AS "varianteNombre",
        stock,stock_minimo AS "stockMinimo",costo_promedio AS "costoPromedio",
        ROUND(stock*costo_promedio,2) AS "valorStock",vendido_30 AS "vendido30",vendido_90 AS "vendido90",
        venta_diaria AS "ventaDiaria",ultima_venta AS "ultimaVenta",dias_cobertura AS "diasCobertura",
        GREATEST(0,CEIL(GREATEST(stock_minimo,venta_diaria*30)-stock))::numeric AS "cantidadSugerida",
        CASE WHEN stock<=0 THEN 'SIN_STOCK' WHEN stock<=stock_minimo THEN 'STOCK_BAJO'
          WHEN ultima_venta IS NULL OR ultima_venta < NOW()-INTERVAL '30 days' THEN 'SIN_ROTACION'
          WHEN dias_cobertura>60 THEN 'SOBRESTOCK' ELSE 'SALUDABLE' END AS estado
      FROM base ORDER BY CASE WHEN stock<=0 THEN 0 WHEN stock<=stock_minimo THEN 1
        WHEN ultima_venta IS NULL OR ultima_venta<NOW()-INTERVAL '30 days' THEN 2 WHEN dias_cobertura>60 THEN 3 ELSE 4 END,
        producto_nombre,variante_nombre NULLS FIRST LIMIT 2000`, [empresaId, ids]);
    const resumen = items.reduce((a: any, x: any) => {
      a.total++; if (x.estado === 'SIN_STOCK') a.sinStock++; if (x.estado === 'STOCK_BAJO') a.stockBajo++;
      if (x.estado === 'SIN_ROTACION') a.sinRotacion++; if (x.estado === 'SOBRESTOCK') a.sobrestock++;
      return a;
    }, { total: 0, stockBajo: 0, sinStock: 0, sinRotacion: 0, sobrestock: 0 });
    return { resumen, items };
  }

  async alertasVencimiento(empresaId:number,sucursalIds:number[],dias=30) {
    const ids=[...new Set((sucursalIds||[]).map(Number).filter(Number.isInteger))];
    if(!ids.length)return [];
    return this.dataSource.query(`SELECT l.id,l.sucursal_id AS "sucursalId",s.nombre AS "sucursalNombre",
      l.producto_id AS "productoId",l.variante_id AS "varianteId",p.codigo,p.nombre AS "productoNombre",
      pv.nombre AS "varianteNombre",COALESCE(pv.codigo,p.codigo) AS "codigoPresentacion",
      l.codigo_lote AS "codigoLote",l.fecha_vencimiento AS "fechaVencimiento",
      l.cantidad_disponible AS "cantidadDisponible",l.costo_unitario AS "costoUnitario",
      ROUND((l.cantidad_disponible*l.costo_unitario)::numeric,2) AS "valorEnRiesgo",
      ((l.fecha_vencimiento-(NOW() AT TIME ZONE 'America/Lima')::date))::int AS "diasRestantes",
      CASE WHEN l.fecha_vencimiento < (NOW() AT TIME ZONE 'America/Lima')::date THEN 'VENCIDO'
           WHEN l.fecha_vencimiento = (NOW() AT TIME ZONE 'America/Lima')::date THEN 'VENCE_HOY'
           WHEN l.fecha_vencimiento <= (NOW() AT TIME ZONE 'America/Lima')::date+7 THEN 'CRITICO'
           WHEN l.fecha_vencimiento <= (NOW() AT TIME ZONE 'America/Lima')::date+15 THEN 'PROXIMO'
           ELSE 'VIGENTE' END AS estado
      FROM inventario_lote l
      JOIN producto p ON p.id=l.producto_id AND p.empresa_id=l.empresa_id
      LEFT JOIN producto_variante pv ON pv.id=l.variante_id AND pv.empresa_id=l.empresa_id
      JOIN sucursal s ON s.id=l.sucursal_id AND s.empresa_id=l.empresa_id
      WHERE l.empresa_id=$1 AND l.sucursal_id=ANY($2::int[]) AND l.cantidad_disponible>0
        AND l.fecha_vencimiento IS NOT NULL
        AND l.fecha_vencimiento <= ((NOW() AT TIME ZONE 'America/Lima')::date + $3::int)
      ORDER BY l.fecha_vencimiento,l.id LIMIT 2000`,[empresaId,ids,Math.max(0,Math.min(365,dias))]);
  }

  async registrarMerma(dto: RegistrarMermaDto, usuarioId: number, empresaId: number, sucursalIds: number[]) {
    const cantidad = Number(dto.cantidad);
    const observacion = dto.observacion?.trim();
    if (!Number.isFinite(cantidad) || cantidad <= 0 || Math.round(cantidad * 1000) !== cantidad * 1000) {
      throw new BadRequestException('La cantidad debe ser positiva y tener hasta 3 decimales');
    }
    if (!observacion || observacion.length < 5) throw new BadRequestException('Indique una observación de al menos 5 caracteres');
    const key = dto.idempotencyKey?.trim() || null;

    return this.dataSource.transaction(async (manager) => {
      if (key) {
        const previous = await manager.query(
          `SELECT m.id,m.cantidad,m.costo_total AS "costoTotal",m.motivo_tipo AS "motivoTipo",
                  m.lote_id AS "loteId",m.created_at AS "createdAt"
           FROM inventario_merma m
           WHERE m.empresa_id=$1 AND m.usuario_id=$2 AND m.idempotency_key=$3`,
          [empresaId, usuarioId, key],
        );
        if (previous.length) {
          if (Number(previous[0].loteId) !== dto.loteId || Number(previous[0].cantidad) !== cantidad ||
              previous[0].motivoTipo !== dto.motivoTipo) {
            throw new BadRequestException('La clave de idempotencia ya fue utilizada con otros datos');
          }
          return { merma: previous[0], repetido: true };
        }
      }

      const lotes = await manager.query(
        `SELECT l.id,l.empresa_id AS "empresaId",l.sucursal_id AS "sucursalId",l.producto_id AS "productoId",
                l.variante_id AS "varianteId",l.cantidad_disponible AS "cantidadDisponible",
                l.costo_unitario AS "costoUnitario",l.codigo_lote AS "codigoLote",
                p.nombre AS "productoNombre"
         FROM inventario_lote l
         JOIN producto p ON p.id=l.producto_id AND p.empresa_id=l.empresa_id
         WHERE l.id=$1 AND l.empresa_id=$2`,
        [dto.loteId, empresaId],
      );
      if (!lotes.length) throw new NotFoundException('No se encontró el lote para esta empresa');
      const lote = lotes[0];
      const sucursalId = Number(lote.sucursalId);
      if (!sucursalIds?.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a la sucursal del lote');
      const disponible = Number(lote.cantidadDisponible);
      if (cantidad > disponible + 0.0005) {
        throw new BadRequestException(`La cantidad supera el saldo del lote. Disponible: ${disponible}`);
      }
      const varianteId = lote.varianteId === null ? null : Number(lote.varianteId);
      let stockAnterior = 0;
      let stockPosterior = 0;
      if (varianteId !== null) {
        const stocks = await manager.query(
          `SELECT stock FROM producto_variante_stock
           WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND variante_id=$4 FOR UPDATE`,
          [empresaId,sucursalId,lote.productoId,varianteId],
        );
        if (!stocks.length) throw new NotFoundException('No existe saldo de la presentación en esta sucursal');
        stockAnterior = Number(stocks[0].stock);
        if (stockAnterior + 0.0005 < cantidad) throw new BadRequestException('El stock de la presentación es inferior a la cantidad de merma');
        const updated = await manager.query(
          `UPDATE producto_variante_stock SET stock=stock-$1,updated_at=NOW()
           WHERE empresa_id=$2 AND sucursal_id=$3 AND producto_id=$4 AND variante_id=$5 AND stock >= $1 RETURNING stock`,
          [cantidad,empresaId,sucursalId,lote.productoId,varianteId],
        );
        if (!updated.length) throw new BadRequestException('No se pudo descontar el stock de la presentación');
        stockPosterior = Number(updated[0].stock);
      } else {
        const stocks = await manager.query(
          `SELECT stock FROM producto_stock WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 FOR UPDATE`,
          [empresaId,sucursalId,lote.productoId],
        );
        if (!stocks.length) throw new NotFoundException('No existe saldo del producto en esta sucursal');
        stockAnterior = Number(stocks[0].stock);
        if (stockAnterior + 0.0005 < cantidad) throw new BadRequestException('El stock del producto es inferior a la cantidad de merma');
        const updated = await manager.query(
          `UPDATE producto_stock SET stock=stock-$1,updated_at=NOW()
           WHERE empresa_id=$2 AND sucursal_id=$3 AND producto_id=$4 AND stock >= $1 RETURNING stock`,
          [cantidad,empresaId,sucursalId,lote.productoId],
        );
        if (!updated.length) throw new BadRequestException('No se pudo descontar el stock del producto');
        stockPosterior = Number(updated[0].stock);
      }

      // Mantener el mismo orden de bloqueo que las operaciones de venta: saldo y luego lote.
      const loteActual = await manager.query(
        `SELECT cantidad_disponible FROM inventario_lote
         WHERE id=$1 AND empresa_id=$2 FOR UPDATE`,
        [dto.loteId,empresaId],
      );
      if (!loteActual.length || Number(loteActual[0].cantidad_disponible) + 0.0005 < cantidad) {
        throw new BadRequestException('El saldo del lote cambió; vuelva a consultar el inventario');
      }
      const loteActualizado = await manager.query(
        `UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible-$1
         WHERE id=$2 AND empresa_id=$3 AND cantidad_disponible >= $1
         RETURNING cantidad_disponible`,
        [cantidad,dto.loteId,empresaId],
      );
      if (!loteActualizado.length) throw new BadRequestException('El saldo del lote cambió; vuelva a consultar el inventario');

      const costoUnitario = Number(lote.costoUnitario || 0);
      const costoTotal = Number((cantidad * costoUnitario).toFixed(2));
      const motivo = `MERMA ${dto.motivoTipo}: ${observacion}`.slice(0,200);
      const movimientos = await manager.query(
        `INSERT INTO movimiento_inventario
          (empresa_id,sucursal_id,producto_id,variante_id,comprobante_id,usuario_id,tipo,cantidad,
           stock_anterior,stock_posterior,transferencia_id,compra_id,motivo,idempotency_key)
         VALUES($1,$2,$3,$4,NULL,$5,'SALIDA',$6,$7,$8,NULL,NULL,$9,$10)
         RETURNING id`,
        [empresaId,sucursalId,lote.productoId,varianteId,usuarioId,cantidad,stockAnterior,stockPosterior,motivo,key],
      );
      const rows = await manager.query(
        `INSERT INTO inventario_merma
          (empresa_id,sucursal_id,producto_id,variante_id,lote_id,movimiento_id,usuario_id,motivo_tipo,
           observacion,cantidad,costo_unitario,costo_total,idempotency_key)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id,cantidad,costo_total AS "costoTotal",motivo_tipo AS "motivoTipo",
                   lote_id AS "loteId",created_at AS "createdAt"`,
        [empresaId,sucursalId,lote.productoId,varianteId,dto.loteId,movimientos[0].id,usuarioId,
         dto.motivoTipo,observacion,cantidad,costoUnitario,costoTotal,key],
      );
      return { merma: rows[0], repetido: false, stockAnterior, stockActual: stockPosterior,
        productoNombre: lote.productoNombre, codigoLote: lote.codigoLote };
    });
  }

  async abrirConteo(dto: AbrirConteoDto, usuarioId: number, empresaId: number, sucursalIds: number[]) {
    if (!sucursalIds?.includes(dto.sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const observacion = dto.observacion?.trim();
    if (!observacion || observacion.length < 5) throw new BadRequestException('Indique una descripción del conteo');
    return this.dataSource.transaction(async (manager) => {
      const existentes = await manager.query(
        `SELECT id FROM inventario_conteo WHERE empresa_id=$1 AND sucursal_id=$2 AND estado='ABIERTO' FOR UPDATE`,
        [empresaId,dto.sucursalId],
      );
      if (existentes.length) throw new BadRequestException('Ya existe un inventario físico abierto para esta sucursal');
      const cab = await manager.query(
        `INSERT INTO inventario_conteo(empresa_id,sucursal_id,usuario_apertura_id,observacion)
         VALUES($1,$2,$3,$4) RETURNING id`,
        [empresaId,dto.sucursalId,usuarioId,observacion],
      );
      const conteoId = Number(cab[0].id);
      await manager.query(
        `INSERT INTO inventario_conteo_linea
          (conteo_id,empresa_id,sucursal_id,producto_id,variante_id,codigo,producto_nombre,variante_nombre,stock_sistema,costo_unitario)
         SELECT $1,ps.empresa_id,ps.sucursal_id,p.id,NULL,COALESCE(p.codigo_barras,p.codigo),p.nombre,NULL,ps.stock,ps.costo_promedio
         FROM producto_stock ps JOIN producto p ON p.id=ps.producto_id AND p.empresa_id=ps.empresa_id
         WHERE ps.empresa_id=$2 AND ps.sucursal_id=$3 AND p.activo=TRUE AND COALESCE(p.tiene_variantes,FALSE)=FALSE
         ON CONFLICT DO NOTHING`,
        [conteoId,empresaId,dto.sucursalId],
      );
      await manager.query(
        `INSERT INTO inventario_conteo_linea
          (conteo_id,empresa_id,sucursal_id,producto_id,variante_id,codigo,producto_nombre,variante_nombre,stock_sistema,costo_unitario)
         SELECT $1,vs.empresa_id,vs.sucursal_id,p.id,pv.id,COALESCE(pv.codigo_barras,pv.codigo,p.codigo_barras,p.codigo),p.nombre,pv.nombre,vs.stock,vs.costo_promedio
         FROM producto_variante_stock vs JOIN producto_variante pv ON pv.id=vs.variante_id AND pv.empresa_id=vs.empresa_id
         JOIN producto p ON p.id=pv.producto_id AND p.empresa_id=pv.empresa_id
         WHERE vs.empresa_id=$2 AND vs.sucursal_id=$3 AND pv.activo=TRUE AND p.activo=TRUE
         ON CONFLICT DO NOTHING`,
        [conteoId,empresaId,dto.sucursalId],
      );
      const count = await manager.query('SELECT COUNT(*)::int AS total FROM inventario_conteo_linea WHERE conteo_id=$1',[conteoId]);
      await manager.query('UPDATE inventario_conteo SET total_lineas=$1 WHERE id=$2',[count[0].total,conteoId]);
      return this.detalleConteo(empresaId,sucursalIds,conteoId,manager);
    });
  }

  async detalleConteo(empresaId:number,sucursalIds:number[],conteoId:number,manager:any=this.dataSource) {
    const rows = await manager.query(
      `SELECT c.id,c.sucursal_id AS "sucursalId",s.nombre AS "sucursalNombre",c.estado,c.observacion,
        c.total_lineas AS "totalLineas",c.lineas_contadas AS "lineasContadas",
        c.diferencia_unidades AS "diferenciaUnidades",c.costo_diferencia AS "costoDiferencia",
        c.created_at AS "createdAt",c.closed_at AS "closedAt",
        l.id AS "lineaId",l.producto_id AS "productoId",l.variante_id AS "varianteId",
        l.codigo,l.producto_nombre AS "productoNombre",l.variante_nombre AS "varianteNombre",
        l.stock_sistema AS "stockSistema",l.cantidad_contada AS "cantidadContada",
        l.diferencia,l.costo_unitario AS "costoUnitario",l.costo_diferencia AS "costoDiferenciaLinea"
       FROM inventario_conteo c JOIN sucursal s ON s.id=c.sucursal_id AND s.empresa_id=c.empresa_id
       LEFT JOIN inventario_conteo_linea l ON l.conteo_id=c.id
       WHERE c.id=$1 AND c.empresa_id=$2 AND c.sucursal_id=ANY($3::int[])
       ORDER BY l.producto_nombre,l.variante_nombre NULLS FIRST,l.id`,
      [conteoId,empresaId,sucursalIds],
    );
    if (!rows.length) throw new NotFoundException('No se encontró el inventario físico');
    const { lineaId,productoId,varianteId,codigo,productoNombre,varianteNombre,stockSistema,cantidadContada,diferencia,costoUnitario,costoDiferenciaLinea,...cab }=rows[0];
    return {...cab,lineas:rows.filter((r:any)=>r.lineaId!==null).map((r:any)=>({
      lineaId:r.lineaId,productoId:r.productoId,varianteId:r.varianteId,codigo:r.codigo,
      productoNombre:r.productoNombre,varianteNombre:r.varianteNombre,stockSistema:r.stockSistema,
      cantidadContada:r.cantidadContada,diferencia:r.diferencia,costoUnitario:r.costoUnitario,
      costoDiferencia:r.costoDiferenciaLinea,
    }))};
  }

  async listarConteos(empresaId:number,sucursalIds:number[]) {
    if (!sucursalIds?.length) return [];
    return this.dataSource.query(
      `SELECT c.id,c.sucursal_id AS "sucursalId",s.nombre AS "sucursalNombre",c.estado,c.observacion,
        c.total_lineas AS "totalLineas",c.lineas_contadas AS "lineasContadas",
        c.diferencia_unidades AS "diferenciaUnidades",c.costo_diferencia AS "costoDiferencia",
        c.created_at AS "createdAt",c.closed_at AS "closedAt",u.nombre AS "usuarioApertura"
       FROM inventario_conteo c JOIN sucursal s ON s.id=c.sucursal_id AND s.empresa_id=c.empresa_id
       JOIN usuario u ON u.id=c.usuario_apertura_id
       WHERE c.empresa_id=$1 AND c.sucursal_id=ANY($2::int[])
       ORDER BY c.created_at DESC LIMIT 200`,
      [empresaId,sucursalIds],
    );
  }

  async registrarLineaConteo(dto:RegistrarConteoLineaDto,empresaId:number,sucursalIds:number[]) {
    const cantidad=Number(dto.cantidadContada);
    if(!Number.isFinite(cantidad)||cantidad<0||Math.round(cantidad*1000)!==cantidad*1000)
      throw new BadRequestException('La cantidad contada debe ser cero o positiva y tener hasta 3 decimales');
    return this.dataSource.transaction(async(manager)=>{
      const rows=await manager.query(
        `SELECT c.id,c.estado FROM inventario_conteo c
         JOIN inventario_conteo_linea l ON l.conteo_id=c.id
         WHERE l.id=$1 AND c.empresa_id=$2 AND c.sucursal_id=ANY($3::int[])
         FOR UPDATE OF c,l`,
        [dto.lineaId,empresaId,sucursalIds],
      );
      if(!rows.length)throw new NotFoundException('No se encontró la línea del inventario');
      if(rows[0].estado!=='ABIERTO')throw new BadRequestException('El inventario ya no está abierto');
      await manager.query(
        `UPDATE inventario_conteo_linea SET cantidad_contada=$1,
          diferencia=$1-stock_sistema,costo_diferencia=ROUND(($1-stock_sistema)*costo_unitario,2),contado_at=NOW()
         WHERE id=$2`,
        [cantidad,dto.lineaId],
      );
      await manager.query(
        `UPDATE inventario_conteo c SET lineas_contadas=q.total
         FROM (SELECT COUNT(*)::int AS total FROM inventario_conteo_linea WHERE conteo_id=$1 AND cantidad_contada IS NOT NULL) q
         WHERE c.id=$1`,
        [rows[0].id],
      );
      return this.detalleConteo(empresaId,sucursalIds,Number(rows[0].id),manager);
    });
  }

  async cerrarConteo(conteoId:number,usuarioId:number,empresaId:number,sucursalIds:number[]) {
    if(!Number.isInteger(conteoId)||conteoId<=0)throw new BadRequestException('Inventario inválido');
    return this.dataSource.transaction(async(manager)=>{
      const cab=await manager.query(
        `SELECT * FROM inventario_conteo WHERE id=$1 AND empresa_id=$2 AND sucursal_id=ANY($3::int[]) FOR UPDATE`,
        [conteoId,empresaId,sucursalIds],
      );
      if(!cab.length)throw new NotFoundException('No se encontró el inventario físico');
      if(cab[0].estado!=='ABIERTO')throw new BadRequestException('El inventario ya fue cerrado o cancelado');
      const faltantes=await manager.query(
        `SELECT COUNT(*)::int AS total FROM inventario_conteo_linea WHERE conteo_id=$1 AND cantidad_contada IS NULL`,
        [conteoId],
      );
      if(Number(faltantes[0].total)>0)throw new BadRequestException(`Faltan contar ${faltantes[0].total} productos o presentaciones`);
      const lineas=await manager.query(
        `SELECT * FROM inventario_conteo_linea WHERE conteo_id=$1 ORDER BY producto_id,variante_id NULLS FIRST FOR UPDATE`,
        [conteoId],
      );
      let totalDiff=0,totalCosto=0;
      for(const l of lineas){
        const counted=Number(l.cantidad_contada),snapshot=Number(l.stock_sistema);
        let delta=0;
        const varianteId=l.variante_id===null?null:Number(l.variante_id);
        let stockAnterior=0,stockPosterior=0,costoUnitario=Number(l.costo_unitario||0);
        if(varianteId!==null){
          const current=await manager.query(
            `SELECT stock,costo_promedio AS costo FROM producto_variante_stock
             WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND variante_id=$4 FOR UPDATE`,
            [empresaId,cab[0].sucursal_id,l.producto_id,varianteId]);
          if(!current.length)throw new NotFoundException('No existe stock de la presentación');
          stockAnterior=Number(current[0].stock);costoUnitario=Number(current[0].costo||costoUnitario);
          delta=Number((counted-stockAnterior).toFixed(3));
          if(delta===0){await manager.query(`UPDATE inventario_conteo_linea SET diferencia=0,costo_diferencia=0 WHERE id=$1`,[l.id]);continue;}
          await manager.query(`UPDATE producto_variante_stock SET stock=$1,updated_at=NOW()
            WHERE empresa_id=$2 AND sucursal_id=$3 AND producto_id=$4 AND variante_id=$5`,
            [counted,empresaId,cab[0].sucursal_id,l.producto_id,varianteId]);
        }else{
          const current=await manager.query(
            `SELECT stock,costo_promedio AS costo FROM producto_stock
             WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 FOR UPDATE`,
            [empresaId,cab[0].sucursal_id,l.producto_id]);
          if(!current.length)throw new NotFoundException('No existe stock del producto');
          stockAnterior=Number(current[0].stock);costoUnitario=Number(current[0].costo||costoUnitario);
          delta=Number((counted-stockAnterior).toFixed(3));
          if(delta===0){await manager.query(`UPDATE inventario_conteo_linea SET diferencia=0,costo_diferencia=0 WHERE id=$1`,[l.id]);continue;}
          await manager.query(`UPDATE producto_stock SET stock=$1,updated_at=NOW()
            WHERE empresa_id=$2 AND sucursal_id=$3 AND producto_id=$4`,
            [counted,empresaId,cab[0].sucursal_id,l.producto_id]);
        }
        stockPosterior=counted;
        // Conservar consistencia entre el saldo general y sus lotes: las bajas consumen FEFO;
        // los sobrantes se registran en un lote de regularización sin fecha de vencimiento.
        if(delta<0){
          let restante=Math.abs(delta);
          const lotes=await manager.query(
            `SELECT id,cantidad_disponible FROM inventario_lote
             WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3
               AND variante_id IS NOT DISTINCT FROM $4 AND cantidad_disponible>0
             ORDER BY fecha_vencimiento ASC NULLS LAST,created_at ASC,id ASC FOR UPDATE`,
            [empresaId,cab[0].sucursal_id,l.producto_id,varianteId]);
          for(const lote of lotes){
            if(restante<=0.0005)break;
            const disponible=Number(lote.cantidad_disponible),tomar=Math.min(restante,disponible);
            await manager.query(`UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible-$1 WHERE id=$2`,
              [tomar,lote.id]);restante=Number((restante-tomar).toFixed(3));
          }
          if(restante>0.0005)throw new BadRequestException(`Los lotes no cubren la diferencia negativa de ${l.producto_nombre}. Regularice lotes antes de cerrar.`);
        }else{
          const codigoLote=`CONTEO-${conteoId}-${l.producto_id}-${varianteId||0}`.slice(0,80);
          await manager.query(
            `INSERT INTO inventario_lote(empresa_id,sucursal_id,producto_id,variante_id,codigo_lote,fecha_vencimiento,
              cantidad_inicial,cantidad_disponible,costo_unitario)
             VALUES($1,$2,$3,$4,$5,NULL,$6,$6,$7)`,
            [empresaId,cab[0].sucursal_id,l.producto_id,varianteId,codigoLote,delta,costoUnitario]);
        }
        const movimiento=await manager.query(
          `INSERT INTO movimiento_inventario(empresa_id,sucursal_id,producto_id,variante_id,comprobante_id,
            usuario_id,tipo,cantidad,stock_anterior,stock_posterior,transferencia_id,compra_id,motivo)
           VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,NULL,NULL,$10) RETURNING id`,
          [empresaId,cab[0].sucursal_id,l.producto_id,varianteId,usuarioId,delta>0?'ENTRADA':'SALIDA',
           Math.abs(delta),stockAnterior,stockPosterior,`AJUSTE INVENTARIO FISICO #${conteoId}`]);
        const costoDif=Number((delta*costoUnitario).toFixed(2));
        await manager.query(`UPDATE inventario_conteo_linea SET diferencia=$1,costo_diferencia=$2,movimiento_id=$3 WHERE id=$4`,
          [delta,costoDif,movimiento[0].id,l.id]);
        totalDiff+=delta;totalCosto+=costoDif;
      }
      await manager.query(
        `UPDATE inventario_conteo SET estado='CERRADO',usuario_cierre_id=$1,closed_at=NOW(),
          diferencia_unidades=$2,costo_diferencia=$3 WHERE id=$4`,
        [usuarioId,Number(totalDiff.toFixed(3)),Number(totalCosto.toFixed(2)),conteoId]);
      return this.detalleConteo(empresaId,sucursalIds,conteoId,manager);
    });
  }

  async listarLotesDisponibles(empresaId: number, sucursalIds: number[], sucursalId?: number) {
    const ids = sucursalId ? [sucursalId] : [...new Set((sucursalIds || []).map(Number).filter(Number.isInteger))];
    if (!ids.length) return [];
    if (ids.some((id) => !sucursalIds.includes(id))) throw new ForbiddenException('No tiene acceso a una de las sucursales solicitadas');
    return this.dataSource.query(
      `SELECT l.id,l.sucursal_id AS "sucursalId",s.nombre AS "sucursalNombre",
        l.producto_id AS "productoId",l.variante_id AS "varianteId",p.codigo,p.nombre AS "productoNombre",
        pv.nombre AS "varianteNombre",l.codigo_lote AS "codigoLote",l.fecha_vencimiento AS "fechaVencimiento",
        l.cantidad_disponible AS "cantidadDisponible",l.costo_unitario AS "costoUnitario"
       FROM inventario_lote l
       JOIN producto p ON p.id=l.producto_id AND p.empresa_id=l.empresa_id
       LEFT JOIN producto_variante pv ON pv.id=l.variante_id AND pv.empresa_id=l.empresa_id
       JOIN sucursal s ON s.id=l.sucursal_id AND s.empresa_id=l.empresa_id
       WHERE l.empresa_id=$1 AND l.sucursal_id=ANY($2::int[]) AND l.cantidad_disponible>0
       ORDER BY l.fecha_vencimiento ASC NULLS LAST,l.created_at ASC,l.id ASC LIMIT 3000`,
      [empresaId,ids],
    );
  }

  async listarMermas(empresaId: number, sucursalIds: number[], sucursalId?: number) {
    const ids = sucursalId ? [sucursalId] : [...new Set((sucursalIds || []).map(Number).filter(Number.isInteger))];
    if (!ids.length) return [];
    if (ids.some((id) => !sucursalIds.includes(id))) throw new ForbiddenException('No tiene acceso a una de las sucursales solicitadas');
    return this.dataSource.query(
      `SELECT m.id,m.sucursal_id AS "sucursalId",s.nombre AS "sucursalNombre",
        m.producto_id AS "productoId",p.nombre AS "productoNombre",m.variante_id AS "varianteId",
        pv.nombre AS "varianteNombre",l.codigo_lote AS "codigoLote",l.fecha_vencimiento AS "fechaVencimiento",
        m.motivo_tipo AS "motivoTipo",m.observacion,m.cantidad,m.costo_unitario AS "costoUnitario",
        m.costo_total AS "costoTotal",u.nombre AS "usuarioNombre",m.created_at AS "createdAt"
       FROM inventario_merma m
       JOIN producto p ON p.id=m.producto_id AND p.empresa_id=m.empresa_id
       LEFT JOIN producto_variante pv ON pv.id=m.variante_id AND pv.empresa_id=m.empresa_id
       JOIN inventario_lote l ON l.id=m.lote_id
       JOIN sucursal s ON s.id=m.sucursal_id AND s.empresa_id=m.empresa_id
       JOIN usuario u ON u.id=m.usuario_id
       WHERE m.empresa_id=$1 AND m.sucursal_id=ANY($2::int[])
       ORDER BY m.created_at DESC,m.id DESC LIMIT 1000`,
      [empresaId,ids],
    );
  }

  async ajustar(dto: AjusteInventarioDto, usuarioId: number, empresaId: number, sucursalIds: number[]) {
    if (!sucursalIds?.includes(dto.sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    if (!['ENTRADA', 'SALIDA'].includes(dto.tipo)) throw new BadRequestException('Tipo de movimiento inválido');
    const cantidad = Number(dto.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0 || Math.round(cantidad * 1000) !== cantidad * 1000) {
      throw new BadRequestException('La cantidad debe ser mayor a cero y tener como máximo 3 decimales');
    }
    const motivo = dto.motivo?.trim();
    if (!motivo || motivo.length < 5) throw new BadRequestException('Indique un motivo de al menos 5 caracteres');

    return this.dataSource.transaction(async (manager) => {
      const stockRows = await manager.query(
        `SELECT ps.stock FROM producto_stock ps
         INNER JOIN producto p ON p.id = ps.producto_id AND p.empresa_id = ps.empresa_id
         INNER JOIN sucursal s ON s.id = ps.sucursal_id AND s.empresa_id = ps.empresa_id
         WHERE ps.producto_id = $1 AND ps.sucursal_id = $2 AND ps.empresa_id = $3
           AND p.activo = TRUE AND s.empresa_id = $3
         FOR UPDATE OF p, ps`,
        [dto.productoId, dto.sucursalId, empresaId],
      );
      if (!stockRows.length) throw new NotFoundException('Producto o saldo de inventario no encontrado en esta sucursal');
      const stockAnterior = Number(stockRows[0].stock || 0);
      if (dto.tipo === 'SALIDA' && stockAnterior < cantidad) {
        throw new BadRequestException(`Stock insuficiente. Disponible en esta sucursal: ${stockAnterior}`);
      }
      const operador = dto.tipo === 'ENTRADA' ? '+' : '-';
      const actualizado = await manager.query(
        `UPDATE producto_stock SET stock = stock ${operador} $1, updated_at = NOW()
         WHERE producto_id = $2 AND sucursal_id = $3 AND empresa_id = $4
           AND ($5::text = 'ENTRADA' OR stock >= $1) RETURNING stock`,
        [cantidad, dto.productoId, dto.sucursalId, empresaId, dto.tipo],
      );
      if (!actualizado.length) throw new BadRequestException('No se pudo aplicar el movimiento: stock insuficiente');
      const stockPosterior = Number(actualizado[0].stock);
      if(dto.tipo==='ENTRADA') {
        await manager.query(`INSERT INTO inventario_lote(empresa_id,sucursal_id,producto_id,codigo_lote,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario) VALUES($1,$2,$3,$4,NULL,$5,$5,0)`,[empresaId,dto.sucursalId,dto.productoId,`AJUSTE-${Date.now()}-${usuarioId}`,cantidad]);
      } else {
        let restante=cantidad;
        const lotes=await manager.query(`SELECT id,cantidad_disponible FROM inventario_lote WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND cantidad_disponible>0 ORDER BY fecha_vencimiento ASC NULLS LAST,id FOR UPDATE`,[empresaId,dto.sucursalId,dto.productoId]);
        for(const lote of lotes){if(restante<=0.0005)break;const toma=Math.min(restante,Number(lote.cantidad_disponible));await manager.query(`UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible-$1 WHERE id=$2`,[toma,lote.id]);restante=Number((restante-toma).toFixed(3));}
        if(restante>0.0005)throw new BadRequestException('Los lotes no cuadran con el saldo de stock. Revise el inventario antes del ajuste.');
      }
      const movimiento = await manager.getRepository(MovimientoInventario).save(
        manager.getRepository(MovimientoInventario).create({
          empresaId, sucursalId: dto.sucursalId, productoId: dto.productoId,
          comprobanteId: null, usuarioId, tipo: dto.tipo, cantidad,
          stockAnterior, stockPosterior, motivo: motivo.slice(0, 200),
        }),
      );
      return { movimiento, stockAnterior, stockActual: stockPosterior };
    });
  }


  async consultarStockVariante(empresaId: number, varianteId: number, sucursalId: number, sucursalIds: number[]) {
    if (!sucursalIds?.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const rows = await this.dataSource.query(
      `SELECT pv.id AS "varianteId", pv.producto_id AS "productoId", p.nombre AS "productoNombre",
              pv.nombre AS "varianteNombre", pv.codigo, pv.codigo_barras AS "codigoBarras",
              pv.precio, vs.stock, vs.stock_minimo AS "stockMinimo", vs.updated_at AS "updatedAt",
              s.nombre AS "sucursalNombre"
       FROM producto_variante_stock vs
       JOIN producto_variante pv ON pv.id=vs.variante_id AND pv.empresa_id=vs.empresa_id
       JOIN producto p ON p.id=pv.producto_id AND p.empresa_id=pv.empresa_id
       JOIN sucursal s ON s.id=vs.sucursal_id AND s.empresa_id=vs.empresa_id
       WHERE vs.empresa_id=$1 AND vs.variante_id=$2 AND vs.sucursal_id=$3
         AND pv.activo=TRUE AND p.activo=TRUE`,
      [empresaId, varianteId, sucursalId],
    );
    if (!rows.length) throw new NotFoundException('Variante o saldo no encontrado en esta sucursal');
    return rows[0];
  }

  async ajustarStockVariante(dto: AjusteVarianteInventarioDto, usuarioId: number, empresaId: number, sucursalIds: number[]) {
    if (!sucursalIds?.includes(dto.sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const cantidad = Number(dto.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0 || Math.round(cantidad * 1000) !== cantidad * 1000) {
      throw new BadRequestException('La cantidad debe ser positiva y tener hasta 3 decimales');
    }
    const motivo = dto.motivo?.trim();
    if (!motivo || motivo.length < 5) throw new BadRequestException('Indique un motivo de al menos 5 caracteres');
    const key = dto.idempotencyKey?.trim();
    if (key) {
      const prev = await this.dataSource.query(
        `SELECT id, sucursal_id AS "sucursalId", tipo, cantidad,
                stock_anterior AS "stockAnterior", stock_posterior AS "stockPosterior"
         FROM movimiento_inventario
         WHERE empresa_id=$1 AND usuario_id=$2 AND idempotency_key=$3 AND variante_id=$4`,
        [empresaId, usuarioId, key, dto.varianteId],
      );
      if (prev.length) {
        const row = prev[0];
        if (row.tipo !== dto.tipo || Number(row.cantidad) !== cantidad || Number(row.sucursalId) !== dto.sucursalId) {
          throw new BadRequestException('La clave de idempotencia ya fue utilizada con otros datos');
        }
        return { movimiento: row, repetido: true };
      }
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const rows = await manager.query(
          `SELECT vs.stock, pv.producto_id
           FROM producto_variante_stock vs
           JOIN producto_variante pv ON pv.id=vs.variante_id AND pv.empresa_id=vs.empresa_id
           JOIN producto p ON p.id=pv.producto_id AND p.empresa_id=pv.empresa_id
           WHERE vs.empresa_id=$1 AND vs.variante_id=$2 AND vs.sucursal_id=$3
             AND pv.activo=TRUE AND p.activo=TRUE
           FOR UPDATE OF vs, pv, p`,
          [empresaId, dto.varianteId, dto.sucursalId],
        );
        if (!rows.length) throw new NotFoundException('Variante o saldo no encontrado en esta sucursal');
        const productoId = Number(rows[0].producto_id);
        const anterior = Number(rows[0].stock);
        if (dto.tipo === 'SALIDA' && anterior < cantidad) {
          throw new BadRequestException(`Stock insuficiente. Disponible: ${anterior}`);
        }
        const op = dto.tipo === 'ENTRADA' ? '+' : '-';
        const updated = await manager.query(
          `UPDATE producto_variante_stock SET stock=stock ${op} $1, updated_at=NOW()
           WHERE empresa_id=$2 AND variante_id=$3 AND sucursal_id=$4
             AND ($5::text='ENTRADA' OR stock >= $1)
           RETURNING stock`,
          [cantidad, empresaId, dto.varianteId, dto.sucursalId, dto.tipo],
        );
        if (!updated.length) throw new BadRequestException('No se pudo actualizar el stock de la variante');
        const posterior = Number(updated[0].stock);

        if (dto.tipo === 'ENTRADA') {
          await manager.query(
            `INSERT INTO inventario_lote
              (empresa_id,sucursal_id,producto_id,variante_id,codigo_lote,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario)
             VALUES($1,$2,$3,$4,$5,NULL,$6,$6,0)`,
            [empresaId, dto.sucursalId, productoId, dto.varianteId, `VAR-AJ-${Date.now()}-${usuarioId}`, cantidad],
          );
        } else {
          let restante = cantidad;
          const lots = await manager.query(
            `SELECT id,cantidad_disponible FROM inventario_lote
             WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND variante_id=$4
               AND cantidad_disponible>0
             ORDER BY fecha_vencimiento ASC NULLS LAST,id FOR UPDATE`,
            [empresaId, dto.sucursalId, productoId, dto.varianteId],
          );
          for (const lot of lots) {
            if (restante <= 0.0005) break;
            const take = Math.min(restante, Number(lot.cantidad_disponible));
            await manager.query('UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible-$1 WHERE id=$2', [take, lot.id]);
            restante = Number((restante - take).toFixed(3));
          }
          if (restante > 0.0005) throw new BadRequestException('Los lotes de esta variante no cuadran con su saldo. Revise el inventario.');
        }

        const movement = await manager.query(
          `INSERT INTO movimiento_inventario
            (empresa_id,sucursal_id,producto_id,variante_id,comprobante_id,usuario_id,tipo,cantidad,stock_anterior,stock_posterior,transferencia_id,compra_id,motivo,idempotency_key)
           VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,NULL,NULL,$10,$11)
           RETURNING id, tipo, cantidad, stock_anterior AS "stockAnterior", stock_posterior AS "stockPosterior"`,
          [empresaId, dto.sucursalId, productoId, dto.varianteId, usuarioId, dto.tipo, cantidad, anterior, posterior, motivo.slice(0,200), key || null],
        );
        return { movimiento: movement[0], stockAnterior: anterior, stockActual: posterior, repetido: false };
      });
    } catch (error: any) {
      const code = error?.code || error?.driverError?.code;
      if (key && code === '23505') {
        const prev = await this.dataSource.query(
          `SELECT id,tipo,cantidad,stock_anterior AS "stockAnterior",stock_posterior AS "stockPosterior"
           FROM movimiento_inventario WHERE empresa_id=$1 AND usuario_id=$2 AND idempotency_key=$3`,
          [empresaId, usuarioId, key],
        );
        if (prev.length) return { movimiento: prev[0], repetido: true };
      }
      throw error;
    }
  }

  private async buscarTransferenciaPorClave(empresaId: number, usuarioId: number, clave: string) {
    const rows = await this.dataSource.query(
      `SELECT t.id, t.empresa_id AS "empresaId", t.sucursal_origen_id AS "sucursalOrigenId",
              t.sucursal_destino_id AS "sucursalDestinoId", t.usuario_id AS "usuarioId",
              t.motivo, t.created_at AS fecha
       FROM transferencia_inventario t
       WHERE t.empresa_id = $1 AND t.usuario_id = $2 AND t.idempotency_key = $3`,
      [empresaId, usuarioId, clave],
    );
    if (!rows.length) return null;
    const movimientos = await this.movimientoRepo.find({
      where: { transferenciaId: Number(rows[0].id) }, order: { id: 'ASC' },
    });
    const lineasRows = await this.dataSource.query(
      `SELECT mi.producto_id AS "productoId", mi.variante_id AS "varianteId", p.nombre,
              pv.nombre AS "varianteNombre", SUM(mi.cantidad)::numeric AS cantidad
       FROM movimiento_inventario mi
       INNER JOIN producto p ON p.id = mi.producto_id AND p.empresa_id=mi.empresa_id
       LEFT JOIN producto_variante pv ON pv.id=mi.variante_id AND pv.producto_id=mi.producto_id AND pv.empresa_id=mi.empresa_id
       WHERE mi.transferencia_id = $1 AND mi.tipo = 'SALIDA'
       GROUP BY mi.producto_id, mi.variante_id, p.nombre, pv.nombre ORDER BY mi.producto_id, mi.variante_id`,
      [rows[0].id],
    );
    return { ...rows[0], lineas: lineasRows, movimientos };
  }

  async transferir(dto: TransferirInventarioDto, usuarioId: number, empresaId: number, sucursalIds: number[]) {
    const { sucursalOrigenId, sucursalDestinoId } = dto;
    if (sucursalOrigenId === sucursalDestinoId) throw new BadRequestException('La sucursal de origen y destino deben ser diferentes');
    if (!sucursalIds?.includes(sucursalOrigenId) || !sucursalIds?.includes(sucursalDestinoId)) {
      throw new ForbiddenException('Debe tener acceso a las sucursales de origen y destino');
    }
    const motivo = dto.motivo?.trim();
    if (!motivo || motivo.length < 5) throw new BadRequestException('Indique un motivo de al menos 5 caracteres');
    if (!Array.isArray(dto.lineas) || dto.lineas.length === 0 || dto.lineas.length > 200) {
      throw new BadRequestException('La transferencia debe incluir entre 1 y 200 productos');
    }
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (idempotencyKey) {
      const previa = await this.buscarTransferenciaPorClave(empresaId, usuarioId, idempotencyKey);
      if (previa) return previa;
    }

    const cantidades = new Map<number, number>();
    for (const linea of dto.lineas) {
      const productoId = Number(linea.productoId);
      const cantidad = Number(linea.cantidad);
      if (!Number.isInteger(productoId) || productoId <= 0 || !Number.isFinite(cantidad)
        || cantidad <= 0 || Math.round(cantidad * 1000) !== cantidad * 1000) {
        throw new BadRequestException('Cada producto debe tener un ID válido y una cantidad positiva de hasta 3 decimales');
      }
      cantidades.set(productoId, (cantidades.get(productoId) || 0) + cantidad);
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
      const sucursales = await manager.query(
        'SELECT id FROM sucursal WHERE id = ANY($1::int[]) AND empresa_id = $2',
        [[sucursalOrigenId, sucursalDestinoId], empresaId],
      );
      if (sucursales.length !== 2) throw new ForbiddenException('Una de las sucursales no pertenece a esta empresa');

      const productoIds = [...cantidades.keys()].sort((a, b) => a - b);
      const saldos = await manager.query(
        `SELECT ps.producto_id, ps.sucursal_id, ps.stock, p.nombre
         FROM producto_stock ps
         INNER JOIN producto p ON p.id = ps.producto_id AND p.empresa_id = ps.empresa_id
         WHERE ps.producto_id = ANY($1::int[]) AND ps.sucursal_id = ANY($2::int[])
           AND ps.empresa_id = $3 AND p.activo = TRUE
         ORDER BY ps.producto_id, ps.sucursal_id FOR UPDATE OF p, ps`,
        [productoIds, [sucursalOrigenId, sucursalDestinoId].sort((a, b) => a - b), empresaId],
      );
      if (saldos.length !== productoIds.length * 2) {
        throw new NotFoundException('Uno o más productos no tienen saldo en ambas sucursales o están inactivos');
      }
      const stockPorClave = new Map<string, number>();
      const nombrePorId = new Map<number, string>();
      for (const saldo of saldos) {
        stockPorClave.set(`${Number(saldo.producto_id)}:${Number(saldo.sucursal_id)}`, Number(saldo.stock));
        nombrePorId.set(Number(saldo.producto_id), String(saldo.nombre));
      }
      for (const [productoId, cantidad] of cantidades) {
        const disponible = stockPorClave.get(`${productoId}:${sucursalOrigenId}`) ?? 0;
        if (disponible < cantidad) {
          throw new BadRequestException(`Stock insuficiente de ${nombrePorId.get(productoId) || `producto ${productoId}`} en la sucursal de origen. Disponible: ${disponible}`);
        }
      }

      const transferencia = await manager.query(
        `INSERT INTO transferencia_inventario (empresa_id, sucursal_origen_id, sucursal_destino_id, usuario_id, motivo, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
        [empresaId, sucursalOrigenId, sucursalDestinoId, usuarioId, motivo.slice(0, 200), idempotencyKey || null],
      );
      const transferenciaId = Number(transferencia[0].id);
      const movimientos: MovimientoInventario[] = [];
      for (const [productoId, cantidad] of [...cantidades.entries()].sort((a, b) => a[0] - b[0])) {
        const stockOrigenAnterior = stockPorClave.get(`${productoId}:${sucursalOrigenId}`) ?? 0;
        const stockDestinoAnterior = stockPorClave.get(`${productoId}:${sucursalDestinoId}`) ?? 0;
        let porTransferir=cantidad;
        const lotesOrigen=await manager.query(`SELECT id,codigo_lote,fecha_vencimiento,cantidad_disponible,costo_unitario FROM inventario_lote WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND cantidad_disponible>0 ORDER BY fecha_vencimiento ASC NULLS LAST,id FOR UPDATE`,[empresaId,sucursalOrigenId,productoId]);
        const lotesTraslado:any[]=[];
        for(const lote of lotesOrigen){if(porTransferir<=0.0005)break;const toma=Math.min(porTransferir,Number(lote.cantidad_disponible));await manager.query(`UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible-$1 WHERE id=$2`,[toma,lote.id]);lotesTraslado.push({lote,cantidad:toma});porTransferir=Number((porTransferir-toma).toFixed(3));}
        if(porTransferir>0.0005)throw new BadRequestException(`Los lotes no cuadran con el stock del producto ${productoId}; no se puede transferir.`);
        const origen = await manager.query(
          `UPDATE producto_stock SET stock = stock - $1, updated_at = NOW()
           WHERE producto_id = $2 AND sucursal_id = $3 AND empresa_id = $4 AND stock >= $1 RETURNING stock`,
          [cantidad, productoId, sucursalOrigenId, empresaId],
        );
        if (!origen.length) throw new BadRequestException(`No se pudo descontar el producto ${productoId} del origen`);
        const destino = await manager.query(
          `UPDATE producto_stock SET stock = stock + $1, updated_at = NOW()
           WHERE producto_id = $2 AND sucursal_id = $3 AND empresa_id = $4 RETURNING stock`,
          [cantidad, productoId, sucursalDestinoId, empresaId],
        );
        if (!destino.length) throw new NotFoundException(`No se encontró saldo de destino para el producto ${productoId}`);
        for(const traslado of lotesTraslado) await manager.query(`INSERT INTO inventario_lote(empresa_id,sucursal_id,producto_id,codigo_lote,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario) VALUES($1,$2,$3,$4,$5,$6,$6,$7)`,[empresaId,sucursalDestinoId,productoId,`TR-${transferenciaId}-${traslado.lote.id}`,traslado.lote.fecha_vencimiento,traslado.cantidad,traslado.lote.costo_unitario]);

        const movimientoRepo = manager.getRepository(MovimientoInventario);
        movimientos.push(...await movimientoRepo.save([
          movimientoRepo.create({
            empresaId, sucursalId: sucursalOrigenId, productoId, comprobanteId: null,
            transferenciaId, usuarioId, tipo: 'SALIDA', cantidad,
            stockAnterior: stockOrigenAnterior, stockPosterior: Number(origen[0].stock),
            motivo: `Traslado #${transferenciaId} hacia sucursal ${sucursalDestinoId}: ${motivo}`.slice(0, 200),
          }),
          movimientoRepo.create({
            empresaId, sucursalId: sucursalDestinoId, productoId, comprobanteId: null,
            transferenciaId, usuarioId, tipo: 'ENTRADA', cantidad,
            stockAnterior: stockDestinoAnterior, stockPosterior: Number(destino[0].stock),
            motivo: `Traslado #${transferenciaId} desde sucursal ${sucursalOrigenId}: ${motivo}`.slice(0, 200),
          }),
        ]));
      }

      return {
        id: transferenciaId,
        sucursalOrigenId,
        sucursalDestinoId,
        motivo,
        fecha: transferencia[0].created_at,
        lineas: [...cantidades.entries()].map(([productoId, cantidad]) => ({
          productoId, nombre: nombrePorId.get(productoId), cantidad,
        })),
        movimientos,
      };
      });
    } catch (error: any) {
      const codigo = error?.code || error?.driverError?.code;
      if (idempotencyKey && codigo === '23505') {
        const previa = await this.buscarTransferenciaPorClave(empresaId, usuarioId, idempotencyKey);
        if (previa) return previa;
      }
      throw error;
    }
  }

  async transferirVariante(dto: { sucursalOrigenId: number; sucursalDestinoId: number; varianteId: number; cantidad: number; motivo: string; idempotencyKey?: string }, usuarioId: number, empresaId: number, sucursalIds: number[]) {
    const { sucursalOrigenId, sucursalDestinoId, varianteId } = dto;
    const cantidad = Number(dto.cantidad);
    const motivo = dto.motivo?.trim();
    if (sucursalOrigenId === sucursalDestinoId) throw new BadRequestException('Las sucursales deben ser diferentes');
    if (!sucursalIds?.includes(sucursalOrigenId) || !sucursalIds?.includes(sucursalDestinoId)) throw new ForbiddenException('No tiene acceso a ambas sucursales');
    if (!Number.isInteger(varianteId) || varianteId <= 0 || !Number.isFinite(cantidad) || cantidad <= 0 || Math.round(cantidad * 1000) !== cantidad * 1000) throw new BadRequestException('Variante o cantidad inválida');
    if (!motivo || motivo.length < 5) throw new BadRequestException('Indique un motivo de al menos 5 caracteres');
    const key = dto.idempotencyKey?.trim();
    if (key) {
      const previa = await this.buscarTransferenciaPorClave(empresaId, usuarioId, key);
      if (previa) return previa;
    }
    try {
      return await this.dataSource.transaction(async (manager) => {
        const rows = await manager.query(
          `SELECT pv.id AS variante_id, pv.producto_id, pv.nombre AS variante_nombre, p.nombre AS producto_nombre,
                  o.stock AS stock_origen, d.stock AS stock_destino,
                  o.costo_promedio AS costo_origen, d.costo_promedio AS costo_destino
           FROM producto_variante pv
           JOIN producto p ON p.id=pv.producto_id AND p.empresa_id=pv.empresa_id AND p.tiene_variantes=TRUE
           JOIN producto_variante_stock o ON o.variante_id=pv.id AND o.producto_id=pv.producto_id AND o.empresa_id=pv.empresa_id AND o.sucursal_id=$2
           JOIN producto_variante_stock d ON d.variante_id=pv.id AND d.producto_id=pv.producto_id AND d.empresa_id=pv.empresa_id AND d.sucursal_id=$3
           WHERE pv.id=$1 AND pv.empresa_id=$4 AND pv.activo=TRUE AND p.activo=TRUE
           FOR UPDATE OF pv,p,o,d`, [varianteId, sucursalOrigenId, sucursalDestinoId, empresaId]);
        if (!rows.length) throw new NotFoundException('Variante o saldos no encontrados en ambas sucursales');
        const r=rows[0], origenAnterior=Number(r.stock_origen), destinoAnterior=Number(r.stock_destino);
        if (origenAnterior < cantidad) throw new BadRequestException(`Stock insuficiente de ${r.variante_nombre}. Disponible: ${origenAnterior}`);
        let restante=cantidad;
        const lotes=await manager.query(
          `SELECT id,codigo_lote,fecha_vencimiento,cantidad_disponible,costo_unitario
           FROM inventario_lote WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND variante_id=$4 AND cantidad_disponible>0
           ORDER BY fecha_vencimiento ASC NULLS LAST,id FOR UPDATE`, [empresaId,sucursalOrigenId,r.producto_id,varianteId]);
        const movLotes:any[]=[];
        for (const lote of lotes) { if(restante<=0.0005) break; const toma=Math.min(restante,Number(lote.cantidad_disponible)); await manager.query('UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible-$1 WHERE id=$2',[toma,lote.id]); movLotes.push({lote,cantidad:toma}); restante=Number((restante-toma).toFixed(3)); }
        if (restante>0.0005) throw new BadRequestException('Los lotes de la variante no cuadran con el stock. Revise el inventario antes de transferir.');
        const t=await manager.query(
          `INSERT INTO transferencia_inventario(empresa_id,sucursal_origen_id,sucursal_destino_id,usuario_id,motivo,idempotency_key)
           VALUES($1,$2,$3,$4,$5,$6) RETURNING id,created_at`, [empresaId,sucursalOrigenId,sucursalDestinoId,usuarioId,motivo.slice(0,200),key||null]);
        const transferenciaId=Number(t[0].id);
        const out=await manager.query(`UPDATE producto_variante_stock SET stock=stock-$1,updated_at=NOW() WHERE empresa_id=$2 AND variante_id=$3 AND sucursal_id=$4 AND stock >= $1 RETURNING stock`,[cantidad,empresaId,varianteId,sucursalOrigenId]);
        const inn=await manager.query(`UPDATE producto_variante_stock SET stock=stock+$1,costo_promedio=CASE WHEN stock+$1>0 THEN ((stock*costo_promedio)+($1*$2))/(stock+$1) ELSE $2 END,updated_at=NOW() WHERE empresa_id=$3 AND variante_id=$4 AND sucursal_id=$5 RETURNING stock`,[cantidad,Number(movLotes.reduce((a,x)=>a+x.cantidad*Number(x.lote.costo_unitario||0),0)/cantidad),empresaId,varianteId,sucursalDestinoId]);
        if(!out.length || !inn.length) throw new BadRequestException('No se pudo actualizar el stock de las sucursales');
        for(const x of movLotes) await manager.query(
          `INSERT INTO inventario_lote(empresa_id,sucursal_id,producto_id,variante_id,codigo_lote,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario)
           VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8)`, [empresaId,sucursalDestinoId,r.producto_id,varianteId,`TR-${transferenciaId}-${x.lote.id}`,x.lote.fecha_vencimiento,x.cantidad,x.lote.costo_unitario]);
        const repo=manager.getRepository(MovimientoInventario);
        const movimientos=await repo.save([
          repo.create({empresaId,sucursalId:sucursalOrigenId,productoId:Number(r.producto_id),varianteId,comprobanteId:null,transferenciaId,usuarioId,tipo:'SALIDA',cantidad,stockAnterior:origenAnterior,stockPosterior:Number(out[0].stock),motivo:`Traslado #${transferenciaId} · ${r.variante_nombre} hacia sucursal ${sucursalDestinoId}`.slice(0,200)}),
          repo.create({empresaId,sucursalId:sucursalDestinoId,productoId:Number(r.producto_id),varianteId,comprobanteId:null,transferenciaId,usuarioId,tipo:'ENTRADA',cantidad,stockAnterior:destinoAnterior,stockPosterior:Number(inn[0].stock),motivo:`Traslado #${transferenciaId} · ${r.variante_nombre} desde sucursal ${sucursalOrigenId}`.slice(0,200)})
        ]);
        return {id:transferenciaId,sucursalOrigenId,sucursalDestinoId,motivo,fecha:t[0].created_at,lineas:[{productoId:Number(r.producto_id),varianteId,nombre:r.producto_nombre,varianteNombre:r.variante_nombre,cantidad}],movimientos};
      });
    } catch(error:any) {
      const code=error?.code||error?.driverError?.code;
      if(key && code==='23505'){const previa=await this.buscarTransferenciaPorClave(empresaId,usuarioId,key);if(previa)return previa;}
      throw error;
    }
  }

  async listarTransferencias(empresaId: number, sucursalIds: number[]): Promise<any[]> {
    const idsPermitidos = [...new Set((sucursalIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (idsPermitidos.length < 2) return [];

    const transferencias = await this.dataSource.query(
      `SELECT t.id, t.sucursal_origen_id AS "sucursalOrigenId",
              so.nombre AS "sucursalOrigen", t.sucursal_destino_id AS "sucursalDestinoId",
              sd.nombre AS "sucursalDestino", t.usuario_id AS "usuarioId",
              u.nombre AS responsable, t.motivo, t.created_at AS fecha
       FROM transferencia_inventario t
       INNER JOIN sucursal so ON so.id = t.sucursal_origen_id AND so.empresa_id = t.empresa_id
       INNER JOIN sucursal sd ON sd.id = t.sucursal_destino_id AND sd.empresa_id = t.empresa_id
       INNER JOIN usuario u ON u.id = t.usuario_id AND u.empresa_id = t.empresa_id
       WHERE t.empresa_id = $1
         AND t.sucursal_origen_id = ANY($2::int[])
         AND t.sucursal_destino_id = ANY($2::int[])
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT 100`,
      [empresaId, idsPermitidos],
    );
    if (!transferencias.length) return [];

    const transferenciaIds = transferencias.map((t: any) => Number(t.id));
    const lineas = await this.dataSource.query(
      `SELECT mi.transferencia_id AS "transferenciaId", mi.producto_id AS "productoId",
              mi.variante_id AS "varianteId", p.codigo, p.nombre, pv.nombre AS "varianteNombre",
              SUM(mi.cantidad)::numeric AS cantidad
       FROM movimiento_inventario mi
       INNER JOIN producto p ON p.id = mi.producto_id AND p.empresa_id = mi.empresa_id
       LEFT JOIN producto_variante pv ON pv.id=mi.variante_id AND pv.producto_id=mi.producto_id AND pv.empresa_id=mi.empresa_id
       WHERE mi.empresa_id = $1 AND mi.transferencia_id = ANY($2::int[]) AND mi.tipo = 'SALIDA'
       GROUP BY mi.transferencia_id, mi.producto_id, mi.variante_id, p.codigo, p.nombre, pv.nombre
       ORDER BY mi.transferencia_id DESC, p.nombre ASC, pv.nombre ASC`,
      [empresaId, transferenciaIds],
    );
    const porTransferencia = new Map<number, any[]>();
    for (const linea of lineas) {
      const id = Number(linea.transferenciaId);
      const lista = porTransferencia.get(id) || [];
      lista.push({
        productoId: Number(linea.productoId), varianteId: linea.varianteId == null ? null : Number(linea.varianteId),
        codigo: linea.codigo, nombre: linea.nombre, varianteNombre: linea.varianteNombre || null, cantidad: Number(linea.cantidad),
      });
      porTransferencia.set(id, lista);
    }
    return transferencias.map((t: any) => ({
      ...t,
      id: Number(t.id),
      sucursalOrigenId: Number(t.sucursalOrigenId),
      sucursalDestinoId: Number(t.sucursalDestinoId),
      lineas: porTransferencia.get(Number(t.id)) || [],
    }));
  }

  async listar(empresaId: number, sucursalIds: number[], productoId?: number): Promise<MovimientoInventario[]> {
    if (!sucursalIds?.length) return [];
    const where: any = { empresaId, sucursalId: In(sucursalIds) };
    if (productoId !== undefined) where.productoId = productoId;
    return this.movimientoRepo.find({ where, order: { id: 'DESC' }, take: 200 });
  }

  async reporteStockValorizado(empresaId: number, sucursalIds: number[], sucursalId?: number) {
    const ids = sucursalId ? [sucursalId] : [...new Set((sucursalIds || []).map(Number).filter(Number.isInteger))];
    if (!ids.length) return [];
    if (ids.some((id) => !sucursalIds.includes(id))) throw new ForbiddenException('No tiene acceso a una de las sucursales solicitadas');
    return this.dataSource.query(`
      SELECT q."sucursalId", q."sucursalNombre", q."productoId", q."productoNombre",
             q."varianteId", q."varianteNombre", q.codigo, q.stock, q."stockMinimo",
             q."costoPromedio", ROUND(q.stock*q."costoPromedio",2) AS "valorInventario",
             ROUND(q.stock*q."costoPromedio"*0.18,2) AS "igvReferencial"
      FROM (
        SELECT ps.sucursal_id AS "sucursalId", s.nombre AS "sucursalNombre", p.id AS "productoId",
               p.nombre AS "productoNombre", NULL::int AS "varianteId", NULL::text AS "varianteNombre",
               p.codigo, ps.stock, ps.stock_minimo AS "stockMinimo", ps.costo_promedio AS "costoPromedio"
        FROM producto_stock ps JOIN producto p ON p.id=ps.producto_id AND p.empresa_id=ps.empresa_id
        JOIN sucursal s ON s.id=ps.sucursal_id AND s.empresa_id=ps.empresa_id
        WHERE ps.empresa_id=$1 AND ps.sucursal_id=ANY($2::int[]) AND p.activo=TRUE AND COALESCE(p.tiene_variantes,FALSE)=FALSE
        UNION ALL
        SELECT vs.sucursal_id, s.nombre, p.id, p.nombre, pv.id, pv.nombre,
               COALESCE(pv.codigo,p.codigo), vs.stock, vs.stock_minimo, vs.costo_promedio
        FROM producto_variante_stock vs JOIN producto_variante pv ON pv.id=vs.variante_id AND pv.empresa_id=vs.empresa_id
        JOIN producto p ON p.id=pv.producto_id AND p.empresa_id=pv.empresa_id
        JOIN sucursal s ON s.id=vs.sucursal_id AND s.empresa_id=vs.empresa_id
        WHERE vs.empresa_id=$1 AND vs.sucursal_id=ANY($2::int[]) AND pv.activo=TRUE AND p.activo=TRUE
      ) q ORDER BY q."sucursalNombre",q."productoNombre",q."varianteNombre" NULLS FIRST`, [empresaId, ids]);
  }

  async kardex(empresaId: number, sucursalIds: number[], productoId: number, varianteId?: number, desde?: string, hasta?: string) {
    if (!Number.isInteger(productoId) || productoId <= 0) throw new BadRequestException('Producto inválido');
    if (varianteId !== undefined && (!Number.isInteger(varianteId) || varianteId <= 0)) throw new BadRequestException('Variante inválida');
    const validDate = (v?: string) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!validDate(desde) || !validDate(hasta) || (desde && hasta && desde > hasta)) throw new BadRequestException('Rango de fechas inválido');
    if (!sucursalIds?.length) return [];
    return this.dataSource.query(`
      SELECT mi.id, mi.created_at AS fecha, mi.sucursal_id AS "sucursalId", s.nombre AS "sucursalNombre",
             mi.producto_id AS "productoId", p.nombre AS "productoNombre", mi.variante_id AS "varianteId",
             pv.nombre AS "varianteNombre", mi.tipo, mi.cantidad, mi.stock_anterior AS "stockAnterior",
             mi.stock_posterior AS "stockPosterior", mi.motivo, mi.transferencia_id AS "transferenciaId",
             mi.compra_id AS "compraId", mi.comprobante_id AS "comprobanteId"
      FROM movimiento_inventario mi JOIN producto p ON p.id=mi.producto_id AND p.empresa_id=mi.empresa_id
      JOIN sucursal s ON s.id=mi.sucursal_id AND s.empresa_id=mi.empresa_id
      LEFT JOIN producto_variante pv ON pv.id=mi.variante_id AND pv.producto_id=mi.producto_id AND pv.empresa_id=mi.empresa_id
      WHERE mi.empresa_id=$1 AND mi.sucursal_id=ANY($2::int[]) AND mi.producto_id=$3
        AND (($4::int IS NULL AND mi.variante_id IS NULL) OR mi.variante_id=$4)
        AND ($5::date IS NULL OR mi.created_at >= $5::date)
        AND ($6::date IS NULL OR mi.created_at < ($6::date + INTERVAL '1 day'))
      ORDER BY mi.created_at DESC,mi.id DESC LIMIT 2000`, [empresaId, sucursalIds, productoId, varianteId ?? null, desde || null, hasta || null]);
  }

}
