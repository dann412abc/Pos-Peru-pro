import {
  Column, CreateDateColumn, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn,
} from 'typeorm';
import { RolUsuarioEnum } from '../../common/enums';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';

/** Usuario del sistema. Puede tener acceso a varias sucursales (RBAC por sucursal). */
@Entity('usuario')
export class Usuario {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  username: string;

  /** UUID de auth.users en Supabase. Nullable durante la migración gradual. */
  @Column({ name: 'supabase_auth_user_id', type: 'uuid', nullable: true })
  supabaseAuthUserId: string | null;

  /** Contraseña hasheada con bcrypt. */
  @Column({ type: 'varchar', length: 100 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'varchar', length: 10 })
  rol: RolUsuarioEnum;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column()
  empresaId: number;

  /** Sucursales a las que tiene acceso el usuario. */
  @ManyToMany(() => Sucursal, { eager: false })
  @JoinTable({
    name: 'usuario_sucursal',
    joinColumn: { name: 'usuario_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'sucursal_id', referencedColumnName: 'id' },
  })
  sucursales: Sucursal[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
