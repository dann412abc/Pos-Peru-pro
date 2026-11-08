import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prepara el vínculo entre usuario POS y auth.users de Supabase.
 * No crea usuarios en Supabase ni activa el proveedor de autenticación.
 */
export class SupabaseAuthIdentity1710000000010 implements MigrationInterface {
  name = 'SupabaseAuthIdentity1710000000010';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE usuario
        ADD COLUMN IF NOT EXISTS supabase_auth_user_id UUID NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_supabase_auth_user_id
        ON usuario (supabase_auth_user_id)
        WHERE supabase_auth_user_id IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const linked = await queryRunner.query(`
      SELECT COUNT(*)::int AS total
      FROM usuario
      WHERE supabase_auth_user_id IS NOT NULL
    `);
    if (Number(linked?.[0]?.total || 0) > 0) {
      throw new Error('No se puede revertir: hay usuarios vinculados a Supabase Auth. Desvincule las identidades con un procedimiento aprobado.');
    }
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_usuario_supabase_auth_user_id;
      ALTER TABLE usuario DROP COLUMN IF EXISTS supabase_auth_user_id;
    `);
  }
}
