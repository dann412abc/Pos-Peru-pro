import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const edge=fs.readFileSync(path.join(here,'[[path]].js'),'utf8');
const api=fs.readFileSync(path.join(here,'../../../src/api/supabaseCash.ts'),'utf8');
const page=fs.readFileSync(path.join(here,'../../../src/pages/CierreCaja.tsx'),'utf8');
const sql=fs.readFileSync(path.join(here,'../../../../supabase/migrations-preview/202611070044_cash_movements_history_auth.sql'),'utf8');
test('Edge historial de caja autenticado',()=>{
 assert.ok(edge.includes("route === 'cash/movements'"));
 assert.ok(edge.includes('CASH_MOVEMENTS_MIGRATION_REQUIRED'));
 assert.ok(edge.includes('pos_caja_movimientos_listar_auth'));
});
test('helper acepta ids negativos sintéticos para reembolsos',()=>{
 assert.ok(api.includes('fetchSupabaseCashMovements'));
 assert.ok(api.includes('id === 0'));
 assert.ok(api.includes('Supabase devolvió un movimiento de caja inválido'));
});
test('CierreCaja recarga movimientos persistentes',()=>{
 assert.ok(page.includes('fetchSupabaseCashMovements(cajaActual.id)'));
});
test('RPC de historial deriva identidad y limita resultados',()=>{
 assert.ok(sql.includes('auth.uid()'));
 assert.ok(sql.includes('usuario_sucursal'));
 assert.ok(sql.includes('LIMIT 100'));
 assert.ok(sql.includes('REVOKE ALL'));
});
