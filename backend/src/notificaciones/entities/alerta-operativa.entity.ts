import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type NivelAlertaOperativa = 'critica' | 'advertencia' | 'info';

@Entity('alerta_operativa')
@Index('uq_alerta_operativa_usuario_clave', ['empresaId','usuarioId','clave'], { unique: true })
@Index('ix_alerta_operativa_usuario_estado_fecha', ['empresaId','usuarioId','activa','leida','actualizadaAt'])
export class AlertaOperativa {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'empresa_id', type: 'integer' })
  empresaId: number;

  @Column({ name: 'usuario_id', type: 'integer' })
  usuarioId: number;

  @Column({ name: 'sucursal_id', type: 'integer', nullable: true })
  sucursalId: number | null;

  @Column({ type: 'varchar', length: 160 })
  clave: string;

  @Column({ type: 'varchar', length: 16 })
  nivel: NivelAlertaOperativa;

  @Column({ type: 'varchar', length: 60 })
  categoria: string;

  @Column({ type: 'varchar', length: 220 })
  titulo: string;

  @Column({ type: 'varchar', length: 1200 })
  detalle: string;

  @Column({ type: 'varchar', length: 160 })
  destino: string;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @Column({ type: 'boolean', default: false })
  leida: boolean;

  @Column({ name: 'leida_at', type: 'timestamptz', nullable: true })
  leidaAt: Date | null;

  @CreateDateColumn({ name: 'creada_at', type: 'timestamptz' })
  creadaAt: Date;

  @UpdateDateColumn({ name: 'actualizada_at', type: 'timestamptz' })
  actualizadaAt: Date;

  @Column({ name: 'ultima_deteccion_at', type: 'timestamptz', default: () => 'NOW()' })
  ultimaDeteccionAt: Date;
}
