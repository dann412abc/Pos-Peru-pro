import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum CanalNotificacionEnum {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
}

export enum EstadoEnvioNotificacionEnum {
  PENDIENTE = 'PENDIENTE',
  ENVIADO = 'ENVIADO',
  FALLIDO = 'FALLIDO',
}

/** Registro/log de cada envio de comprobante por email o WhatsApp. */
@Entity('envios_notificacion')
export class EnvioNotificacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  comprobanteId: number;

  @Column({ type: 'varchar', length: 10 })
  canal: CanalNotificacionEnum;

  /** Email o numero de telefono destino. */
  @Column({ type: 'varchar', length: 200 })
  destino: string;

  @Column({ type: 'varchar', length: 10, default: EstadoEnvioNotificacionEnum.PENDIENTE })
  estado: EstadoEnvioNotificacionEnum;

  @Column({ type: 'text', nullable: true })
  mensajeError: string | null;

  /** True cuando se simulo el envio por faltar credenciales. */
  @Column({ type: 'boolean', default: false })
  simulado: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaEnvio: Date;
}
