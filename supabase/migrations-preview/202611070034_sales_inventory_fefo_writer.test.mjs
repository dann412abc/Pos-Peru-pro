import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./202611070033_sales_document_payment_writer_internal.sql', import.meta.url), 'utf8');

test('bloquea saldos de producto y variante en orden determinista', () => {
  assert.match(sql, /ORDER BY x\."productoId", x\."varianteId" NULLS FIRST[\s\S]*FOR UPDATE/);
  assert.match(sql, /FROM public\.producto_stock ps[\s\S]*FOR UPDATE/);
  assert.match(sql, /FROM public\.producto_variante_stock pvs[\s\S]*FOR UPDATE/);
});

test('descuenta cada saldo en su tabla exclusiva', () => {
  assert.match(sql, /UPDATE public\.producto_stock[\s\S]*stock = stock - v_item\.cantidad/);
  assert.match(sql, /UPDATE public\.producto_variante_stock[\s\S]*stock = stock - v_item\.cantidad/);
});

test('asigna lotes FEFO por vencimiento y excluye vencidos', () => {
  assert.match(sql, /ORDER BY l\.fecha_vencimiento ASC NULLS LAST, l\.id ASC/);
  assert.match(sql, /l\.fecha_vencimiento IS NULL OR l\.fecha_vencimiento >= CURRENT_DATE/);
  assert.match(sql, /FOR UPDATE\s+LOOP/);
  assert.match(sql, /SALE_FEFO_LOTS_INSUFFICIENT_OR_EXPIRED/);
});

test('registra asignación de lotes con variante y movimiento de salida', () => {
  assert.match(sql, /INSERT INTO public\.comprobante_lote_salida[\s\S]*variante_id, cantidad/);
  assert.match(sql, /INSERT INTO public\.movimiento_inventario\s*\([\s\S]*stock_anterior, stock_posterior, variante_id\s*\)[\s\S]*'SALIDA'/);
});

test('no permite confirmar el bloque si falta stock o asignación FEFO', () => {
  assert.match(sql, /SALE_STOCK_CHANGED_OR_INSUFFICIENT/);
  assert.match(sql, /SALE_STOCK_DECREMENT_FAILED/);
  assert.match(sql, /IF v_restante > 0 THEN[\s\S]*RAISE EXCEPTION 'SALE_FEFO_LOTS_INSUFFICIENT_OR_EXPIRED:/);
  assert.match(sql, /DOCUMENT_PAYMENTS_INVENTORY_CASH_CREDIT_COMPLETE_PENDING_RUNTIME_TEST/);
});

test('el resultado identifica inventario, caja y crédito procesados', () => {
  assert.match(sql, /'inventoryUpdated', true/);
  assert.match(sql, /'inventoryMovementsCreated', v_inventario_movimientos/);
  assert.match(sql, /'lotAllocationsCreated', v_lotes_asignados/);
  assert.match(sql, /'cashMovementsCreated', 0/);
  assert.match(sql, /'receivableCreated', \(v_cuenta_cobrar_id IS NOT NULL\)/);
});

test('el helper sigue sin permisos para roles cliente', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_insertar_documento_pagos_interno[\s\S]*FROM PUBLIC/i);
  assert.match(sql, /FROM anon/i);
  assert.match(sql, /FROM authenticated/i);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.pos_venta_insertar_documento_pagos_interno/i);
});
