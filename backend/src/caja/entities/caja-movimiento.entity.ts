import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Caja } from './caja.entity';

@Entity('caja_movimiento')
export class CajaMovimiento {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  cajaId: number;

  @ManyToOne(() => Caja, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'caja_id' })
  caja: Caja;

  @Column()
  usuarioId: number;

  @Column({ type: 'varchar', length: 10 })
  tipo: 'INGRESO' | 'SALIDA';

  @Column({ type: 'varchar', length: 10 })
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'YAPE' | 'PLIN';

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  monto: number;

  @Column({ type: 'varchar', length: 200 })
  motivo: string;

  @Column({ nullable: true })
  comprobanteId: number | null;

  @Column({
    type: 'bigint', nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | number | null) => value === null ? null : Number(value),
    },
  })
  compraId: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
