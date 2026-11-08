import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import {
  EstadoComprobanteEnum, MetodoPagoEnum,
} from '../../common/enums';
import { ComprobanteLinea } from './comprobante-linea.entity';
import { ComprobantePago } from './comprobante-pago.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';

/** Comprobante de pago (venta): factura, boleta, nota credito/debito. */
@Entity('comprobante')
@Unique('uq_comprobante_sucursal_tipo_serie_correlativo', ['sucursalId', 'tipo', 'serie', 'correlativo'])
export class Comprobante {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresaId: number;

  @Column()
  sucursalId: number;

  @Column({ nullable: true })
  cajaId: number;

  @Column()
  usuarioId: number;

  @Column()
  clienteId: number;

  @ManyToOne(() => Cliente, { eager: false })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Cliente;

  /** 01=factura, 03=boleta, 07=nota credito, 08=nota debito. */
  @Column({ type: 'varchar', length: 2 })
  tipo: string;

  @Column({ type: 'varchar', length: 4 })
  serie: string;

  @Column({ type: 'int' })
  correlativo: number;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaEmision: Date;

  // --- Totales (calculados por el motor IGV) ---
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  opGravadas: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  opExoneradas: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  opInafectas: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  descuentoGlobal: number;

  @Column({ type: 'varchar', length: 250, nullable: true })
  motivoDescuento: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  totalIgv: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  total: number;

  // --- Pago ---
  @Column({ type: 'varchar', length: 10 })
  metodoPago: MetodoPagoEnum;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  montoRecibido: number;

  /** Vuelto (solo efectivo). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  vuelto: number;

  @Column({ type: 'varchar', length: 10, default: EstadoComprobanteEnum.PAGADA })
  estado: EstadoComprobanteEnum;

  @Column({ type: 'varchar', length: 100, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'int', nullable: true })
  referenciaComprobanteId: number | null;

  @ManyToOne(() => Comprobante, { nullable: true, eager: false })
  @JoinColumn({ name: 'referencia_comprobante_id' })
  referenciaComprobante: Comprobante | null;

  @Column({ type: 'bigint', nullable: true })
  devolucionVentaId: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  codigoMotivoNota: string | null;

  @Column({ type: 'varchar', length: 250, nullable: true })
  descripcionMotivoNota: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestHash: string | null;

  @Column({ type: 'text', nullable: true })
  motivoAnulacion: string | null;

  @OneToMany(() => ComprobanteLinea, (l) => l.comprobante, { cascade: true })
  lineas: ComprobanteLinea[];

  @OneToMany(() => ComprobantePago, (p) => p.comprobante, { cascade: true })
  pagos: ComprobantePago[];
}
