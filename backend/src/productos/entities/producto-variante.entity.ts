import { CreateDateColumn, Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Variante comercial de un producto: presentación, tamaño, color, empaque, etc.
 * El precio se expresa con IGV incluido, igual que Producto.precio.
 */
@Entity('producto_variante')
@Index('uq_producto_variante_codigo', ['empresaId', 'codigo'], { unique: true })
@Index('uq_producto_variante_barras', ['empresaId', 'codigoBarras'], { unique: true, where: '"codigo_barras" IS NOT NULL' })
export class ProductoVariante {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'empresa_id', type: 'int' })
  empresaId: number;

  @Column({ name: 'producto_id', type: 'int' })
  productoId: number;

  @Column({ type: 'varchar', length: 60 })
  codigo: string;

  @Column({ name: 'codigo_barras', type: 'varchar', length: 80, nullable: true })
  codigoBarras: string | null;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  precio: number;

  @Column({ name: 'precio_mayoreo', type: 'numeric', precision: 12, scale: 2, nullable: true })
  precioMayoreo: number | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
