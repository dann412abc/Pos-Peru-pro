import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../src/pages/VentaRapida.tsx', import.meta.url), 'utf8');

test('Venta Rápida consulta caja abierta mediante RPC Supabase en modo Supabase', () => {
  assert.match(source, /listarCajasAbiertasComprasSupabase\(sucursalId\)/);
  assert.match(source, /esSupabase\s*\?\s*listarCajasAbiertasComprasSupabase/);
  assert.match(source, /api\.get\('\/caja\/estado'/);
});

test('Venta Rápida guarda en caché la caja abierta con sucursal y saldo inicial', () => {
  assert.match(source, /saldoInicial:\s*Number\(cajaResp\.data\.saldoInicial\s*\|\|\s*0\)/);
  assert.match(source, /sucursalId:\s*String\(sucursalId\)/);
  assert.match(source, /db\.cash_register\.put\(cajaMapeada\)/);
});
