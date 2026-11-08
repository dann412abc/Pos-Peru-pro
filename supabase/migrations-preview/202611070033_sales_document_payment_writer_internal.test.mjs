import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./202611070033_sales_document_payment_writer_internal.sql', import.meta.url), 'utf8');

test('define helper interno con contexto, payload y preflight', () => {
  assert.match(sql, /pos_venta_insertar_documento_pagos_interno\s*\(\s*p_context jsonb,\s*p_payload jsonb,\s*p_preflight jsonb/s);
  assert.match(sql, /contextValidated/);
  assert.match(sql, /READY_FOR_TRANSACTIONAL_SALE/);
});

test('no concede ejecución a clientes ni roles públicos', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_insertar_documento_pagos_interno[\s\S]*FROM PUBLIC/i);
  assert.match(sql, /FROM anon/i);
  assert.match(sql, /FROM authenticated/i);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.pos_venta_insertar_documento_pagos_interno/i);
});

test('usa idempotencia SHA-256 y rechaza payload diferente', () => {
  assert.match(sql, /sha256\(convert_to\(\(p_payload - 'idempotencyKey'\)::text, 'UTF8'\)\)/);
  assert.match(sql, /SALE_IDEMPOTENCY_KEY_PAYLOAD_CONFLICT/);
  assert.match(sql, /idempotency_key, request_hash/);
});

test('reserva correlativo con UPDATE RETURNING y serie peruana', () => {
  assert.match(sql, /UPDATE public\.serie_correlativo[\s\S]*RETURNING ultimo_correlativo INTO v_correlativo/i);
  assert.match(sql, /WHEN '01' THEN 'F001' WHEN '03' THEN 'B001'/);
  assert.doesNotMatch(sql, /MAX\s*\(\s*correlativo\s*\)/i);
});

test('inserta cabecera, líneas y pagos dentro de la misma transacción llamadora', () => {
  for (const table of ['public.comprobante', 'public.comprobante_linea', 'public.comprobante_pago']) {
    assert.ok(sql.includes(`INSERT INTO ${table}`), `missing ${table}`);
  }
  assert.match(sql, /DOCUMENT_PAYMENTS_INVENTORY_CASH_CREDIT_COMPLETE_PENDING_RUNTIME_TEST/);
});

test('lee costo desde stock y no desde el payload', () => {
  assert.match(sql, /SELECT ps\.costo_promedio INTO v_costo[\s\S]*FROM public\.producto_stock ps/);
  assert.match(sql, /SELECT pvs\.costo_promedio[\s\S]*FROM public\.producto_variante_stock pvs/);
  assert.doesNotMatch(sql, /p_payload->>'costoUnitario'/);
});

test('autoriza descuentos solo a ADMIN y exige motivo', () => {
  assert.match(sql, /SALE_DISCOUNT_ADMIN_REQUIRED/);
  assert.match(sql, /SALE_DISCOUNT_REASON_INVALID/);
});

test('bloquea descuento global hasta que el esquema pueda representarlo sin doble contabilización', () => {
  assert.match(sql, /SALE_GLOBAL_DISCOUNT_NOT_SUPPORTED_BY_CURRENT_LINE_SCHEMA/);
  assert.match(sql, /v_descuento := round\(COALESCE\(\(v_calc_linea->>'descuentoLinea'\)::numeric,0\), 2\)/);
});

test('bloquea y valida la caja abierta, asignada al usuario y sucursal', () => {
  assert.match(sql, /SELECT c\.estado, c\.sucursal_id, c\.usuario_id[\s\S]*FROM public\.caja c/);
  assert.match(sql, /SALE_CASH_REGISTER_NOT_OPEN_OR_NOT_OWNED/);
  assert.match(sql, /FOR UPDATE OF c/);
});

test('separa pagos al contado y crédito desde el desglose validado', () => {
  assert.match(sql, /SUM\(\(p\.value->>'monto'\)::numeric\) FILTER \(WHERE p\.value->>'metodo' = 'CREDITO'\)/);
  assert.match(sql, /SALE_PAYMENT_TOTAL_MISMATCH/);
});

test('valida límite de crédito y bloquea al cliente antes de aumentar saldo', () => {
  assert.match(sql, /SELECT cl\.limite_credito, cl\.saldo_credito, cl\.numero[\s\S]*FOR UPDATE/);
  assert.match(sql, /SALE_CREDIT_LIMIT_EXCEEDED/);
  assert.match(sql, /UPDATE public\.cliente[\s\S]*saldo_credito = COALESCE\(saldo_credito, 0\) \+ v_monto_credito/);
});

test('crea cuenta por cobrar solo por la parte financiada', () => {
  assert.match(sql, /INSERT INTO public\.cuenta_cobrar/);
  assert.match(sql, /total_credito, saldo_pendiente, fecha_vencimiento, estado/);
  assert.match(sql, /v_monto_credito, v_monto_credito, v_fecha_vencimiento, 'PENDIENTE'/);
});

test('no duplica ingresos de caja que ya provienen de comprobante_pago', () => {
  assert.match(sql, /cashIncomeSource', 'COMPROBANTE_PAGO'/);
  assert.match(sql, /cashMovementsCreated', 0/);
  assert.match(sql, /Avoid duplicate counting/);
  assert.doesNotMatch(sql, /INSERT INTO public\.caja_movimiento/);
});

test('declara los bloques de inventario, caja y crédito como una sola operación pendiente de runtime', () => {
  assert.match(sql, /'inventoryUpdated', true/);
  assert.match(sql, /'cashRegisterLockedAndValidated', true/);
  assert.match(sql, /'receivableCreated', \(v_cuenta_cobrar_id IS NOT NULL\)/);
});
