import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn,
} from 'typeorm';
import { EstadoFeEnum } from '../../common/enums';
import { FeEvento } from './fe-evento.entity';
import { Comprobante } from '../../ventas/entities/comprobante.entity';

/**
 * Comprobante Electronico (agregado raiz del event-sourcing de FE).
 * Estados: CREADO -> FIRMADO -> ENVIADO -> ACEPTADO / RECHAZADO.
 */
@Entity('comprobante_electronico')
export class ComprobanteElectronico {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  comprobanteId: number;

  @ManyToOne(() => Comprobante, { eager: false })
  @JoinColumn({ name: 'comprobante_id' })
  comprobante: Comprobante;

  @Column({ type: 'varchar', length: 20, default: EstadoFeEnum.CREADO })
  estadoActual: EstadoFeEnum;

  /** Ruta del archivo XML UBL 2.1 generado. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  xmlUblPath: string | null;

  /** Hash del CDR (Comprobante de RecepciOn) devuelto por SUNAT/OSE. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  hashCdr: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  nombreArchivoCdr: string | null;

  /** Numero de intentos de envio (backoff exponencial, max 5). */
  @Column({ type: 'int', default: 0 })
  intentosEnvio: number;

  /** true cuando el resultado provino del adaptador local de pruebas y no de SUNAT/OSE. */
  @Column({ name: 'es_simulacion', type: 'boolean', default: false })
  esSimulacion: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => FeEvento, (e) => e.comprobanteElectronico, { cascade: true })
  eventos: FeEvento[];
}
