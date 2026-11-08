import {
  Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';

/** Empresa / Tenant. RUC de 11 dígitos validado con dígito verificador. */
@Entity('empresa')
export class Empresa {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 11, unique: true })
  ruc: string;

  @Column({ type: 'varchar', length: 200 })
  razonSocial: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  nombreComercial: string;

  @Column({ type: 'varchar', length: 300 })
  direccion: string;

  /** Ubigeo de 6 digitos (ej. 120101 = Huancayo). */
  @Column({ type: 'varchar', length: 6 })
  ubigeo: string;

  @Column({ type: 'varchar', length: 100 })
  departamento: string;

  @Column({ type: 'varchar', length: 100 })
  provincia: string;

  @Column({ type: 'varchar', length: 100 })
  distrito: string;

  @OneToMany(() => Sucursal, (s) => s.empresa)
  sucursales: Sucursal[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
