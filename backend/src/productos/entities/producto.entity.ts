import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn,
} from 'typeorm';
import { TipoIgvEnum, UNIDAD_POR_DEFECTO } from '../../common/enums';

/**
 * Producto. El precio INCLUYE IGV.
 * tipo_igv: 10=gravado, 20=exonerado, 30=inafecto (Catalogo SUNAT 07).
 */
@Entity('producto')
export class Producto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresaId: number;

  @Column({ type: 'varchar', length: 30 })
  codigo: string;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ nullable: true })
  categoriaId: number;

  /** Código de barras para productos que se venden como unidad única. */
  @Column({ name: 'codigo_barras', type: 'varchar', length: 80, nullable: true })
  codigoBarras: string | null;

  /** TRUE: familia comercial cuyo inventario y venta se controlan por variante. */
  @Column({ name: 'tiene_variantes', type: 'boolean', default: false })
  tieneVariantes: boolean;

  /** Unidad de medida (NIU por defecto, Catalogo SUNAT 03). */
  @Column({ type: 'varchar', length: 3, default: UNIDAD_POR_DEFECTO })
  unidad: string;

  /** Precio de venta unitario (INCLUYE IGV). */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  precio: number;

  /** Precio de mayoreo (incluye IGV), opcional. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  precioMayoreo: number;

  /** Columna histórica conservada por compatibilidad. El saldo operativo reside en producto_stock por sucursal. */
  @Column({ type: 'numeric', precision: 12, scale: 3, default: 0 })
  stock: number;

  /** Valor predeterminado histórico; el mínimo operativo se copia a producto_stock por sucursal. */
  @Column({ type: 'numeric', precision: 12, scale: 3, default: 0 })
  stockMinimo: number;

  @Column({ type: 'int', default: TipoIgvEnum.GRAVADO })
  tipoIgv: TipoIgvEnum;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
