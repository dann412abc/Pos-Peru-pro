import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { EstadoFeEnum } from '../../common/enums';
import { ComprobanteElectronico } from './comprobante-electronico.entity';

/** Evento del event-sourcing de facturacion electronica. */
@Entity('fe_evento')
export class FeEvento {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  comprobanteElectronicoId: number;

  @ManyToOne(() => ComprobanteElectronico, (c) => c.eventos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comprobante_electronico_id' })
  comprobanteElectronico: ComprobanteElectronico;

  @Column({ type: 'varchar', length: 20 })
  estado: EstadoFeEnum;

  @Column({ type: 'text', nullable: true })
  observaciones: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  hashCdr: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  nombreArchivoCdr: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
