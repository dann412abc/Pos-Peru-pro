import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Comprobante } from './comprobante.entity';
import { MetodoPagoEnum } from '../../common/enums';

/** Desglose de medios de pago de un comprobante, permite pagos mixtos. */
@Entity('comprobante_pago')
export class ComprobantePago {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  comprobanteId: number;

  @ManyToOne(() => Comprobante, (comprobante) => comprobante.pagos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comprobante_id' })
  comprobante: Comprobante;

  @Column({ type: 'varchar', length: 10 })
  metodoPago: MetodoPagoEnum;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  monto: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  montoRecibido: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  vuelto: number | null;
}
