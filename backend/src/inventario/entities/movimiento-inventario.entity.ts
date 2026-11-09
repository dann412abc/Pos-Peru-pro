import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('movimiento_inventario')
export class MovimientoInventario {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresaId: number;

  @Column()
  sucursalId: number;

  @Column()
  productoId: number;

  @Column({ type: 'int', nullable: true })
  varianteId: number | null;

  @Column({ type: 'int', nullable: true })
  comprobanteId: number | null;

  @Column()
  usuarioId: number;

  @Column({ type: 'varchar', length: 10 })
  tipo: 'SALIDA' | 'ENTRADA';

  @Column({ type: 'numeric', precision: 12, scale: 3 })
  cantidad: number;

  @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
  stockAnterior: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
  stockPosterior: number | null;

  @Column({ type: 'int', nullable: true })
  transferenciaId: number | null;

  @Column({
    type: 'bigint', nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | number | null) => value === null ? null : Number(value),
    },
  })
  compraId: number | null;

  @Column({ type: 'varchar', length: 200 })
  motivo: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
