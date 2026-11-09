import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = (name: string) => readFileSync(
  resolve(process.cwd(), '..', 'supabase', 'migrations-preview', name),
  'utf8',
);

describe('cash preview migrations: auth identity and refund reconciliation', () => {
  const files = [
    '202611070042_cash_register_summary_auth.sql',
    '202611070043_cash_register_lifecycle_auth.sql',
    '202611070044_cash_movements_history_auth.sql',
    '202611070045_cash_refund_reconciliation_auth.sql',
  ];

  it.each(files)('%s uses the real usuario.auth_user_id column', (file) => {
    const sql = migration(file);
    expect(sql).toContain('auth_user_id');
    expect(sql).not.toContain('supabase_auth_user_id');
  });

  it('does not subtract refund payments twice from expected cash', () => {
    const sql = migration('202611070045_cash_refund_reconciliation_auth.sql');
    expect(sql).toContain('COALESCE(v_efectivo,0)+COALESCE(v_mov_efectivo,0)');
    expect(sql).not.toContain('COALESCE(v_efectivo,0)-COALESCE(v_dev_efectivo,0)+COALESCE(v_mov_efectivo,0)');
  });

  it('uses the persisted cash movement as the single refund history record', () => {
    const sql = migration('202611070045_cash_refund_reconciliation_auth.sql');
    expect(sql).toContain('FROM public.caja_movimiento cm');
    expect(sql).not.toContain("'id',-dp.id");
    expect(sql).not.toContain('FROM public.devolucion_venta_pago dp');
  });
});
