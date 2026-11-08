import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Empresa } from '../../empresas/entities/empresa.entity';

/** Sucursal / local de venta. Pertenece a una empresa (tenant). */
@Entity('sucursal')
export class Sucursal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresaId: number;

  @ManyToOne(() => Empresa, (e) => e.sucursales, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa: Empresa;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'varchar', length: 300 })
  direccion: string;

  @Column({ type: 'varchar', length: 6 })
  ubigeo: string;

  @Column({ type: 'varchar', length: 100 })
  departamento: string;

  @Column({ type: 'varchar', length: 100 })
  provincia: string;

  @Column({ type: 'varchar', length: 100 })
  distrito: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
