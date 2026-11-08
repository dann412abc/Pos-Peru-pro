import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateVarianteDto } from './dto/create-variante.dto';
import { UpdateVarianteDto } from './dto/update-variante.dto';

@Injectable()
export class ProductoVariantesService {
  constructor(private readonly dataSource: DataSource) {}

  async listar(empresaId: number, productoId: number, sucursalId: number) {
    const parent = await this.dataSource.query(
      'SELECT id FROM producto WHERE id = $1 AND empresa_id = $2 AND activo = TRUE AND tiene_variantes = TRUE',
      [productoId, empresaId],
    );
    if (!parent.length) throw new NotFoundException('Producto no encontrado');
    const branch = await this.dataSource.query(
      'SELECT id FROM sucursal WHERE id=$1 AND empresa_id=$2', [sucursalId, empresaId],
    );
    if (!branch.length) throw new NotFoundException('Sucursal no encontrada');
    return this.dataSource.query(
      `SELECT pv.id, pv.empresa_id AS "empresaId", pv.producto_id AS "productoId",
              pv.codigo, pv.codigo_barras AS "codigoBarras", pv.nombre, pv.precio,
              pv.precio_mayoreo AS "precioMayoreo", pv.activo, pv.created_at AS "createdAt",
              COALESCE(vs.stock,0)::numeric AS stock,
              COALESCE(vs.stock_minimo,0)::numeric AS "stockMinimo",
              COALESCE(vs.costo_promedio,0)::numeric AS "costoPromedio"
       FROM producto_variante pv
       LEFT JOIN producto_variante_stock vs
         ON vs.variante_id=pv.id AND vs.producto_id=pv.producto_id
        AND vs.empresa_id=pv.empresa_id AND vs.sucursal_id=$3
       WHERE pv.empresa_id=$1 AND pv.producto_id=$2
       ORDER BY pv.id`,
      [empresaId, productoId, sucursalId],
    );
  }

  async buscarPorCodigo(empresaId: number, sucursalId: number, codigo: string) {
    const branch = await this.dataSource.query(
      'SELECT id FROM sucursal WHERE id=$1 AND empresa_id=$2', [sucursalId, empresaId],
    );
    if (!branch.length) throw new NotFoundException('Sucursal no encontrada');
    const limpio = codigo.trim();
    if (!limpio) throw new NotFoundException('Código de variante vacío');
    const rows = await this.dataSource.query(
      `SELECT pv.id AS "varianteId",pv.producto_id AS "productoId",pv.codigo,
              pv.codigo_barras AS "codigoBarras",pv.nombre AS "varianteNombre",
              pv.precio,p.tipo_igv AS "tipoIgv",p.codigo AS "productoCodigo",
              p.nombre AS "productoNombre",p.tiene_variantes AS "tieneVariantes",COALESCE(vs.stock,0)::numeric AS stock
       FROM producto_variante pv
       INNER JOIN producto p ON p.id=pv.producto_id AND p.empresa_id=pv.empresa_id
       LEFT JOIN producto_variante_stock vs
         ON vs.variante_id=pv.id AND vs.producto_id=pv.producto_id
        AND vs.empresa_id=pv.empresa_id AND vs.sucursal_id=$2
       WHERE pv.empresa_id=$1 AND pv.activo=TRUE AND p.activo=TRUE AND p.tiene_variantes=TRUE
         AND (pv.codigo_barras=$3 OR pv.codigo=$3)
       LIMIT 2`,
      [empresaId, sucursalId, limpio],
    );
    if (!rows.length) return null;
    if (rows.length > 1) throw new ConflictException('El código coincide con más de una variante; revise el catálogo');
    return rows[0];
  }

  async crear(empresaId: number, productoId: number, dto: CreateVarianteDto) {
    const parent = await this.dataSource.query(
      'SELECT id FROM producto WHERE id = $1 AND empresa_id = $2 AND activo = TRUE AND tiene_variantes = TRUE',
      [productoId, empresaId],
    );
    if (!parent.length) throw new NotFoundException('Producto no encontrado');
    if (dto.codigoBarras?.trim()) {
      const duplicadoProducto = await this.dataSource.query(
        'SELECT id FROM producto WHERE empresa_id=$1 AND (codigo_barras=$2 OR codigo=$2) LIMIT 1',
        [empresaId, dto.codigoBarras.trim()],
      );
      if (duplicadoProducto.length) throw new ConflictException('El código de barras ya pertenece a un producto único');
    }
    try {
      const rows = await this.dataSource.query(
        `INSERT INTO producto_variante
          (empresa_id, producto_id, codigo, codigo_barras, nombre, precio, precio_mayoreo, activo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
         RETURNING id, empresa_id AS "empresaId", producto_id AS "productoId",
                   codigo, codigo_barras AS "codigoBarras", nombre, precio,
                   precio_mayoreo AS "precioMayoreo", activo`,
        [empresaId, productoId, dto.codigo.trim(), dto.codigoBarras?.trim() || null,
          dto.nombre.trim(), dto.precio, dto.precioMayoreo ?? null],
      );
      return rows[0];
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('El código interno o código de barras ya está registrado en esta empresa');
      throw error;
    }
  }

  async actualizar(empresaId: number, productoId: number, varianteId: number, dto: UpdateVarianteDto) {
    const current = await this.dataSource.query(
      'SELECT id FROM producto_variante WHERE id = $1 AND producto_id = $2 AND empresa_id = $3',
      [varianteId, productoId, empresaId],
    );
    if (!current.length) throw new NotFoundException('Variante no encontrada');
    if (dto.codigoBarras?.trim()) {
      const duplicadoProducto = await this.dataSource.query(
        'SELECT id FROM producto WHERE empresa_id=$1 AND (codigo_barras=$2 OR codigo=$2) LIMIT 1',
        [empresaId, dto.codigoBarras.trim()],
      );
      if (duplicadoProducto.length) throw new ConflictException('El código de barras ya pertenece a un producto único');
    }
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = {
      codigo: 'codigo', codigoBarras: 'codigo_barras', nombre: 'nombre',
      precio: 'precio', precioMayoreo: 'precio_mayoreo', activo: 'activo',
    };
    for (const [key, column] of Object.entries(map)) {
      if ((dto as any)[key] !== undefined) {
        values.push(key === 'codigo' || key === 'nombre' || key === 'codigoBarras'
          ? ((dto as any)[key]?.trim() || null) : (dto as any)[key]);
        fields.push(`${column} = $${values.length}`);
      }
    }
    if (!fields.length) {
      const rows = await this.dataSource.query(
        `SELECT id,empresa_id AS "empresaId",producto_id AS "productoId",codigo,
                codigo_barras AS "codigoBarras",nombre,precio,precio_mayoreo AS "precioMayoreo",activo
         FROM producto_variante WHERE id=$1 AND producto_id=$2 AND empresa_id=$3`,
        [varianteId, productoId, empresaId],
      );
      return rows[0];
    }
    values.push(varianteId, productoId, empresaId);
    try {
      const rows = await this.dataSource.query(
        `UPDATE producto_variante SET ${fields.join(', ')}
         WHERE id = $${values.length - 2} AND producto_id = $${values.length - 1} AND empresa_id = $${values.length}
         RETURNING id, empresa_id AS "empresaId", producto_id AS "productoId",
                   codigo, codigo_barras AS "codigoBarras", nombre, precio,
                   precio_mayoreo AS "precioMayoreo", activo`,
        values,
      );
      return rows[0];
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('El código interno o código de barras ya está registrado en esta empresa');
      throw error;
    }
  }

  async desactivar(empresaId: number, productoId: number, varianteId: number) {
    const rows = await this.dataSource.query(
      `UPDATE producto_variante SET activo = FALSE
       WHERE id = $1 AND producto_id = $2 AND empresa_id = $3
       RETURNING id`,
      [varianteId, productoId, empresaId],
    );
    if (!rows.length) throw new NotFoundException('Variante no encontrada');
    return { ok: true, id: varianteId };
  }
}
