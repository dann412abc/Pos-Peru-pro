import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Control de correlativos por sucursal + tipo + serie.
 * El incremento se hace de forma atomica con:
 *   UPDATE serie_correlativo SET ultimo_correlativo = ultimo_correlativo + 1
 *   WHERE ... RETURNING ultimo_correlativo
 * (row-level lock => no se repiten correlativos concurrentemente).
 */
@Entity('serie_correlativo')
@Unique('uq_serie_correlativo_sucursal_tipo_serie', ['sucursalId', 'tipoComprobante', 'serie'])
export class SerieCorrelativo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sucursalId: number;

  /** 01=factura, 03=boleta, 07=NC, 08=ND. */
  @Column({ type: 'varchar', length: 2 })
  tipoComprobante: string;

  /** F001 / B001 / NC01 ... */
  @Column({ type: 'varchar', length: 4 })
  serie: string;

  @Column({ type: 'int', default: 0 })
  ultimoCorrelativo: number;
}
