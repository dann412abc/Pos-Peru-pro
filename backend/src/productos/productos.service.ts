import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Producto } from './entities/producto.entity';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { MovimientoInventario } from '../inventario/entities/movimiento-inventario.entity';

@Injectable()
export class ProductosService {
  constructor(
    @InjectRepository(Producto) private readonly repo: Repository<Producto>,
    private readonly dataSource: DataSource,
  ) {}

  private async resolverSucursal(empresaId: number, sucursalId?: number): Promise<number> {
    const rows = sucursalId
      ? await this.dataSource.query('SELECT id FROM sucursal WHERE id = $1 AND empresa_id = $2', [sucursalId, empresaId])
      : await this.dataSource.query('SELECT id FROM sucursal WHERE empresa_id = $1 ORDER BY id LIMIT 1', [empresaId]);
    if (!rows.length) throw new NotFoundException('No existe una sucursal válida para consultar el inventario');
    return Number(rows[0].id);
  }

  private async consultarProducto(id: number, empresaId: number, sucursalId: number): Promise<any> {
    const rows = await this.dataSource.query(
      `SELECT p.id, p.empresa_id AS "empresaId", p.codigo, p.codigo_barras AS "codigoBarras", p.tiene_variantes AS "tieneVariantes", p.nombre,
              p.categoria_id AS "categoriaId",
              CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('nombre', c.nombre) END AS categoria,
              p.unidad, p.precio, p.precio_mayoreo AS "precioMayoreo",
              COALESCE(ps.stock, 0)::numeric AS stock,
              COALESCE(ps.stock_minimo, p.stock_minimo)::numeric AS "stockMinimo",
              COALESCE(ps.costo_promedio, 0)::numeric AS "costoPromedio",
              p.tipo_igv AS "tipoIgv", p.activo, p.created_at AS "createdAt",
              $3::integer AS "sucursalId"
       FROM producto p
       LEFT JOIN categoria c ON c.id = p.categoria_id AND c.empresa_id = p.empresa_id
       LEFT JOIN producto_stock ps ON ps.producto_id = p.id AND ps.empresa_id = p.empresa_id AND ps.sucursal_id = $3
       WHERE p.id = $1 AND p.empresa_id = $2`,
      [id, empresaId, sucursalId],
    );
    if (!rows.length) throw new NotFoundException('Producto no encontrado');
    return rows[0];
  }

  async findAll(empresaId: number, sucursalId?: number): Promise<any[]> {
    const branchId = await this.resolverSucursal(empresaId, sucursalId);
    return this.dataSource.query(
      `SELECT p.id, p.empresa_id AS "empresaId", p.codigo, p.codigo_barras AS "codigoBarras", p.tiene_variantes AS "tieneVariantes", p.nombre,
              p.categoria_id AS "categoriaId",
              CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('nombre', c.nombre) END AS categoria,
              p.unidad, p.precio, p.precio_mayoreo AS "precioMayoreo",
              COALESCE(ps.stock, 0)::numeric AS stock,
              COALESCE(ps.stock_minimo, p.stock_minimo)::numeric AS "stockMinimo",
              COALESCE(ps.costo_promedio, 0)::numeric AS "costoPromedio",
              p.tipo_igv AS "tipoIgv", p.activo, p.created_at AS "createdAt",
              $2::integer AS "sucursalId"
       FROM producto p
       LEFT JOIN categoria c ON c.id = p.categoria_id AND c.empresa_id = p.empresa_id
       LEFT JOIN producto_stock ps ON ps.producto_id = p.id AND ps.empresa_id = p.empresa_id AND ps.sucursal_id = $2
       WHERE p.empresa_id = $1 AND p.activo = TRUE
       ORDER BY p.id ASC`,
      [empresaId, branchId],
    );
  }

  async findOne(id: number, empresaId: number, sucursalId?: number): Promise<any> {
    const branchId = await this.resolverSucursal(empresaId, sucursalId);
    return this.consultarProducto(id, empresaId, branchId);
  }

  async validarCategoria(empresaId: number, categoriaId?: number): Promise<void> {
    if (!categoriaId) return;
    const filas = await this.repo.manager.query(
      'SELECT id FROM categoria WHERE id = $1 AND empresa_id = $2 AND activo = TRUE',
      [categoriaId, empresaId],
    );
    if (!filas.length) throw new NotFoundException('La categoría no existe o no pertenece a esta empresa');
  }

  async create(empresaId: number, usuarioId: number, sucursalId: number, dto: CreateProductoDto): Promise<any> {
    await this.validarCategoria(empresaId, dto.categoriaId);
    if (dto.codigoBarras?.trim()) {
      const duplicadoVariante = await this.dataSource.query(
        'SELECT id FROM producto_variante WHERE empresa_id=$1 AND (codigo_barras=$2 OR codigo=$2) LIMIT 1',
        [empresaId, dto.codigoBarras.trim()],
      );
      if (duplicadoVariante.length) throw new ConflictException('El código de barras ya pertenece a una presentación');
    }
    if (!Number.isInteger(sucursalId) || sucursalId <= 0) throw new ForbiddenException('El usuario no tiene una sucursal activa para registrar el stock inicial');
    return this.dataSource.transaction(async (manager) => {
      const sucursal = await manager.query('SELECT id FROM sucursal WHERE id = $1 AND empresa_id = $2', [sucursalId, empresaId]);
      if (!sucursal.length) throw new ForbiddenException('La sucursal no pertenece a su empresa');
      const tieneVariantes = dto.tieneVariantes === true;
      const stockInicial = Number(dto.stock || 0);
      if (tieneVariantes && stockInicial > 0) {
        throw new ConflictException('Un producto con variantes debe iniciar con stock cero; registre existencias en cada presentación');
      }
      const producto = await manager.getRepository(Producto).save(manager.getRepository(Producto).create({
        ...dto, empresaId, unidad: dto.unidad || 'NIU', activo: true, stock: 0,
        tieneVariantes, codigoBarras: dto.codigoBarras?.trim() || null,
        precio: tieneVariantes ? 0 : dto.precio,
      }));
      const stockRows = await manager.query(
        `UPDATE producto_stock SET stock = $1, updated_at = NOW()
         WHERE producto_id = $2 AND sucursal_id = $3 AND empresa_id = $4 RETURNING stock`,
        [stockInicial, producto.id, sucursalId, empresaId],
      );
      if (!stockRows.length) throw new Error('No se creó el saldo inicial del producto para la sucursal');
      if (stockInicial > 0) {
        await manager.query(`INSERT INTO inventario_lote(empresa_id,sucursal_id,producto_id,codigo_lote,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario) VALUES($1,$2,$3,$4,NULL,$5,$5,0)`,[empresaId,sucursalId,producto.id,`INICIAL-${producto.id}-${sucursalId}`,stockInicial]);
        await manager.getRepository(MovimientoInventario).save(manager.getRepository(MovimientoInventario).create({
          empresaId, sucursalId, productoId: producto.id, comprobanteId: null, usuarioId,
          tipo: 'ENTRADA', cantidad: stockInicial, stockAnterior: 0, stockPosterior: stockInicial,
          motivo: 'Stock inicial al crear el producto',
        }));
      }
      return this.consultarProductoEnManager(manager, producto.id, empresaId, sucursalId);
    });
  }

  private async consultarProductoEnManager(manager: any, id: number, empresaId: number, sucursalId: number): Promise<any> {
    const rows = await manager.query(
      `SELECT p.id, p.empresa_id AS "empresaId", p.codigo, p.codigo_barras AS "codigoBarras", p.tiene_variantes AS "tieneVariantes", p.nombre,
              p.categoria_id AS "categoriaId",
              CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('nombre', c.nombre) END AS categoria,
              p.unidad, p.precio, p.precio_mayoreo AS "precioMayoreo",
              ps.stock, ps.stock_minimo AS "stockMinimo", ps.costo_promedio AS "costoPromedio", p.tipo_igv AS "tipoIgv",
              p.activo, p.created_at AS "createdAt", ps.sucursal_id AS "sucursalId"
       FROM producto p INNER JOIN producto_stock ps ON ps.producto_id = p.id AND ps.sucursal_id = $3 AND ps.empresa_id = p.empresa_id
       LEFT JOIN categoria c ON c.id = p.categoria_id AND c.empresa_id = p.empresa_id
       WHERE p.id = $1 AND p.empresa_id = $2`,
      [id, empresaId, sucursalId],
    );
    if (!rows.length) throw new NotFoundException('No se pudo recuperar el producto creado');
    return rows[0];
  }

  async update(id: number, empresaId: number, data: UpdateProductoDto, sucursalId?: number): Promise<any> {
    const existente = await this.repo.findOne({ where: { id, empresaId } });
    if (!existente) throw new NotFoundException('Producto no encontrado');
    await this.validarCategoria(empresaId, data.categoriaId);
    if (data.codigoBarras?.trim()) {
      const duplicadoVariante = await this.dataSource.query(
        'SELECT id FROM producto_variante WHERE empresa_id=$1 AND (codigo_barras=$2 OR codigo=$2) LIMIT 1',
        [empresaId, data.codigoBarras.trim()],
      );
      if (duplicadoVariante.length) throw new ConflictException('El código de barras ya pertenece a una presentación');
    }
    const { stock: _stockNoPermitido, ...actualizacionSegura } = data as UpdateProductoDto & { stock?: number };
    await this.dataSource.transaction(async (manager) => {
      // Serializa el cambio de modalidad frente a ventas que bloquean el producto padre.
      await manager.query('SELECT id FROM producto WHERE id=$1 AND empresa_id=$2 FOR UPDATE', [id, empresaId]);
      if (data.tieneVariantes !== undefined && data.tieneVariantes !== existente.tieneVariantes) {
        if (data.tieneVariantes) {
          const saldos = await manager.query(
            'SELECT COALESCE(SUM(stock),0)::numeric AS stock FROM producto_stock WHERE producto_id=$1 AND empresa_id=$2',
            [id, empresaId],
          );
          if (Number(saldos[0]?.stock || 0) > 0) {
            throw new ConflictException('No se puede activar variantes mientras el producto tenga stock. Primero regularice el inventario.');
          }
        } else {
          const activas = await manager.query(
            'SELECT COUNT(*)::int AS total FROM producto_variante WHERE producto_id=$1 AND empresa_id=$2 AND activo=TRUE',
            [id, empresaId],
          );
          if (Number(activas[0]?.total || 0) > 0) {
            throw new ConflictException('Desactive primero todas las presentaciones antes de convertirlo en producto único.');
          }
          const saldos = await manager.query(
            'SELECT COALESCE(SUM(stock),0)::numeric AS stock FROM producto_variante_stock WHERE producto_id=$1 AND empresa_id=$2',
            [id, empresaId],
          );
          if (Number(saldos[0]?.stock || 0) > 0) {
            throw new ConflictException('No se puede desactivar el modo variantes mientras existan existencias en presentaciones.');
          }
        }
      }
      const payload = { ...actualizacionSegura } as any;
      if (data.codigoBarras !== undefined) payload.codigoBarras = data.codigoBarras?.trim() || null;
      if (data.tieneVariantes === true) { payload.precio = 0; payload.precioMayoreo = null; payload.codigoBarras = null; }
      await manager.getRepository(Producto).update({ id, empresaId }, payload);
      if (data.stockMinimo !== undefined && sucursalId) {
        await manager.query(
          `UPDATE producto_stock SET stock_minimo = $1, updated_at = NOW()
           WHERE producto_id = $2 AND empresa_id = $3 AND sucursal_id = $4`,
          [data.stockMinimo, id, empresaId, sucursalId],
        );
      }
    });
    return this.findOne(id, empresaId, sucursalId);
  }

  async remove(id: number, empresaId: number): Promise<void> {
    const p = await this.repo.findOne({ where: { id, empresaId } });
    if (!p) throw new NotFoundException('Producto no encontrado');
    await this.repo.update({ id, empresaId }, { activo: false });
  }
}
