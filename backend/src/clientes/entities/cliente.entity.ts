import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { TipoDocClienteEnum } from '../../common/enums';

/** Cliente. DNI = 8 digitos; RUC = 11 dígitos con prefijo y dígito verificador válidos. */
@Entity('cliente')
@Unique('uq_cliente_empresa_doc', ['empresaId', 'tipoDoc', 'numero'])
export class Cliente {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresaId: number;

  @Column({ type: 'varchar', length: 3 })
  tipoDoc: TipoDocClienteEnum;

  @Column({ type: 'varchar', length: 11 })
  numero: string;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  direccion: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  limiteCredito: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  saldoCredito: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
