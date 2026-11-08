import {
  Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Comprobante } from './comprobante.entity';
import { Producto } from '../../productos/entities/producto.entity';

/** Linea / item de un comprobante de pago. */
@Entity('comprobante_linea')
export class ComprobanteLinea {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  comprobanteId: number;

  @ManyToOne(() => Comprobante, (c) => c.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comprobante_id' })
  comprobante: Comprobante;

  @Column({ type: 'int' })
  numeroLinea: number;

  @Column()
  productoId: number;

  @Column({ name: 'variante_id', type: 'int', nullable: true })
  varianteId: number | null;

  @Column({ name: 'variante_nombre', type: 'varchar', length: 120, nullable: true })
  varianteNombre: string | null;

  @Column({ name: 'variante_codigo', type: 'varchar', length: 60, nullable: true })
  varianteCodigo: string | null;

  @ManyToOne(() => Producto, { eager: false })
  @JoinColumn({ name: 'producto_id' })
  producto: Producto;

  @Column({ type: 'numeric', precision: 12, scale: 3 })
  cantidad: number;

  /** Precio unitario (INCLUYE IGV). */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  precioUnitario: number;

  /** Costo promedio de inventario al momento de vender (snapshot por sucursal). */
  @Column({ type: 'numeric', precision: 12, scale: 4, default: 0 })
  costoUnitario: number;

  /** Descuento en monto (soles), restado antes de calcular IGV. */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  descuento: number;

  /** 10=gravado, 20=exonerado, 30=inafecto. */
  @Column({ type: 'int' })
  tipoIgv: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  baseImponible: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  igv: number;

  /** subtotal = baseImponible + igv. */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  subtotal: number;
}
