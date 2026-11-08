import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations-preview/202611070029_sales_preflight_integrated.sql', 'utf8');

test('reemplaza la RPC de prevalidacion manteniendo seguridad SECURITY DEFINER y search_path fijo', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.pos_venta_preparar_auth\(p_payload jsonb\)/i);
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = pg_catalog, public, auth/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_preparar_auth\(jsonb\) FROM anon/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_venta_preparar_auth\(jsonb\) TO authenticated/i);
});

test('encadena contexto autenticado e idempotencia antes de las validaciones', () => {
  assert.match(sql, /pos_venta_contexto_auth\(p_payload\)/);
  assert.match(sql, /pos_venta_idempotencia_resolver_interna\(/);
  assert.ok(sql.indexOf('pos_venta_contexto_auth') < sql.indexOf('pos_venta_idempotencia_resolver_interna'));
});

test('el precio y tipo IGV del cálculo proceden del catálogo validado', () => {
  assert.match(sql, /pos_venta_validar_cliente_catalogo_interno\(/);
  assert.match(sql, /'precioUnitario', \(cat\.item->>'precioCatalogo'\)::numeric/);
  assert.match(sql, /'tipoIgv', \(cat\.item->>'tipoIgv'\)::integer/);
  assert.match(sql, /SALE_CATALOG_LINE_MAPPING_FAILED/);
  assert.match(sql, /pos_venta_calcular_importes_interno\(/);
});

test('valida pagos contra el total calculado en servidor y perfil de cliente interno', () => {
  assert.match(sql, /pos_venta_validar_pagos_interno\(/);
  assert.match(sql, /v_calculation->'totales'->>'total'/);
  assert.match(sql, /'limite_credito', v_catalog->'cliente'->>'limiteCredito'/);
  assert.match(sql, /'saldo_credito', v_catalog->'cliente'->>'saldoCredito'/);
});

test('declara explícitamente que no registra venta, stock, caja ni correlativo', () => {
  for (const key of ['saleCreated', 'stockReserved', 'cashMovementCreated', 'correlativoConsumed']) {
    assert.match(sql, new RegExp(`'${key}', false`));
  }
  assert.doesNotMatch(sql, /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
});
