import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const returnsPage = readFileSync(new URL('../../../src/pages/Devoluciones.tsx', import.meta.url), 'utf8');
const returnsClient = readFileSync(new URL('../../../src/api/supabaseReturns.ts', import.meta.url), 'utf8');
const cashPage = readFileSync(new URL('../../../src/pages/CierreCaja.tsx', import.meta.url), 'utf8');
const cashClient = readFileSync(new URL('../../../src/api/supabaseCash.ts', import.meta.url), 'utf8');
const edge = readFileSync(new URL('./[[path]].js', import.meta.url), 'utf8');
const cashSql = readFileSync(new URL('../../../..//supabase/migrations-preview/202611070045_cash_refund_reconciliation_auth.sql', import.meta.url), 'utf8');
const returnsSql = readFileSync(new URL('../../../..//supabase/migrations-preview/202611090012_returns_transactional_writer_auth.sql', import.meta.url), 'utf8');

test('returns screen commits through the authenticated Supabase path and refreshes history', () => {
  assert.match(returnsPage, /ES_SUPABASE_AUTH[\s\S]*?registerSupabaseReturn/);
  assert.match(returnsPage, /await registerSupabaseReturn\(disponibilidad\.comprobante\.id/);
  assert.match(returnsPage, /localStorage\.removeItem\(claveStorage\)/);
  assert.match(returnsPage, /await recargar\(\)/);
  assert.match(returnsClient, /\/api\/edge\/returns\/register/);
  assert.match(edge, /route === 'returns\/register'[\s\S]*?pos_devolucion_registrar_auth/);
});

test('return refund payment is linked to its return and its cash movement is marked to prevent double counting', () => {
  assert.match(returnsSql, /INSERT INTO public\.devolucion_venta_pago/);
  assert.match(returnsSql, /devolucion_venta_id/);
  assert.match(returnsSql, /'SALIDA'/);
  assert.match(cashSql, /devolucion_venta_id IS NULL/);
  assert.match(cashSql, /FROM public\.devolucion_venta_pago/);
});

test('cash screen reloads authoritative summary and refund movement history from Supabase', () => {
  assert.match(cashPage, /await fetchSupabaseCashSummary\(cajaActual\.id\)/);
  assert.match(cashPage, /await fetchSupabaseCashMovements\(cajaActual\.id\)/);
  assert.match(cashClient, /\/api\/edge\/cash\/summary/);
  assert.match(cashClient, /\/api\/edge\/cash\/movements/);
  assert.match(edge, /pos_caja_resumen_auth/);
  assert.match(edge, /pos_caja_movimientos_listar_auth/);
});

test('cash reconciliation subtracts actual refund method and excludes linked cash ledger duplicate', () => {
  assert.match(cashSql, /SUM\(dp\.monto\) FILTER\(WHERE dp\.metodo_pago='EFECTIVO'\)/);
  assert.match(cashSql, /v_efectivo_esperado:=round\(COALESCE\(v_saldo,0\)\+COALESCE\(v_efectivo,0\)-COALESCE\(v_dev_efectivo,0\)\+COALESCE\(v_mov_efectivo,0\),2\)/);
  assert.match(cashSql, /'totalDevoluciones',round\(COALESCE\(v_dev_total,0\),2\)/);
});

test('refund result is not treated as a successful receipt until required amounts are present', () => {
  assert.match(returnsClient, /result\.totalDevolucion/);
  assert.match(returnsClient, /result\.creditoRevertido/);
  assert.match(returnsClient, /result\.montoReembolsado/);
});
