import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn,
} from 'typeorm';
import { EstadoCajaEnum } from '../../common/enums';

/**
 * Caja / turno de caja. Apertura con saldo_inicial; cierre con arqueo.
 * Solo una caja ABIERTA por sucursal+usuario (unique parcial en BD).
 * El arqueo por metodo de pago se guarda en JSONB:
 *   [{ metodoPago: 'EFECTIVO', montoEsperado: 100.00, montoContado: 100.00 }, ...]
 */
@Entity('caja')
export class Caja {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sucursalId: number;

  @Column()
  usuarioId: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  saldoInicial: number;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaApertura: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fechaCierre: Date;

  @Column({ type: 'varchar', length: 10, default: EstadoCajaEnum.ABIERTA })
  estado: EstadoCajaEnum;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  efectivoContado: number;

  /** diferencia = efectivoContado - (saldoInicial + ventas_efectivo). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  diferencia: number;

  /** Arqueo detallado por metodo de pago (JSONB). */
  @Column({ type: 'jsonb', nullable: true })
  arqueo: Array<{ metodoPago: string; montoEsperado: number; montoContado: number }>;
}
