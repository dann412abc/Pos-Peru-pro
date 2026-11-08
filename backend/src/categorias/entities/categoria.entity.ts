import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Categoria de productos. */
@Entity('categoria')
export class Categoria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresaId: number;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
