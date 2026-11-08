import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./202611070035_sales_authenticated_transaction_orchestrator.sql', import.meta.url), 'utf8');

test('publica una sola RPC autenticada SECURITY DEFINER con search_path fijo', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.pos_venta_crear_auth\(p_payload jsonb\)/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = pg_catalog, public, auth/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_venta_crear_auth\(jsonb\) TO authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_crear_auth\(jsonb\) FROM anon/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_crear_auth\(jsonb\) FROM PUBLIC/);
});

test('deriva usuario, empresa, sucursal, rol y caja del contexto auth', () => {
  assert.match(sql, /pos_venta_contexto_auth\(p_payload\)/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.doesNotMatch(sql, /p_payload->>'(empresaId|usuarioId|cajaId|rol)'/);
});

test('serializa idempotencia y devuelve una venta existente sin repetir operaciones', () => {
  assert.match(sql, /pos_venta_idempotencia_resolver_interna/);
  assert.match(sql, /'decision', 'RETURN_EXISTING'/);
  assert.match(sql, /idempotentReplay', true/);
  assert.ok(sql.indexOf('pos_venta_idempotencia_resolver_interna') < sql.indexOf('pos_venta_validar_cliente_catalogo_interno'));
});

test('obtiene precio y tipo IGV del catálogo del servidor para cada línea', () => {
  assert.match(sql, /pos_venta_validar_cliente_catalogo_interno/);
  assert.match(sql, /'precioUnitario', v_catalog_line->'precioCatalogo'/);
  assert.match(sql, /'tipoIgv', v_catalog_line->'tipoIgv'/);
  assert.doesNotMatch(sql, /'precioUnitario', v_line->'precioUnitario'/);
});

test('calcula IGV y pagos en servidor y valida el perfil real del cliente', () => {
  assert.match(sql, /pos_venta_calcular_importes_interno\(v_calc_input, 0\)/);
  assert.match(sql, /SELECT jsonb_build_object\([\s\S]*'limite_credito', cl\.limite_credito,[\s\S]*'saldo_credito', cl\.saldo_credito[\s\S]*FROM public\.cliente cl/);
  assert.match(sql, /pos_venta_validar_pagos_interno/);
});

test('construye preflight completo y llama al escritor transaccional interno', () => {
  for (const key of ['READY_FOR_TRANSACTIONAL_SALE', 'catalogo', 'calculo', 'validacionPagos']) {
    assert.ok(sql.includes(key), `missing preflight key ${key}`);
  }
  assert.match(sql, /pos_venta_insertar_documento_pagos_interno\(\s*v_context,\s*p_payload,\s*v_preflight\s*\)/s);
  assert.match(sql, /'transactional', true/);
});

test('rechaza descuento global todavía no soportado por el escritor', () => {
  assert.match(sql, /SALE_GLOBAL_DISCOUNT_NOT_SUPPORTED_BY_CURRENT_LINE_SCHEMA/);
  assert.match(sql, /IF v_discount <> 0 THEN/);
});

test('valida forma de payload y tipo de comprobante permitido', () => {
  assert.match(sql, /SALE_PAYLOAD_LINES_OR_PAYMENTS_INVALID/);
  assert.match(sql, /SALE_DOCUMENT_TYPE_NOT_SUPPORTED_BY_WRITER/);
  assert.match(sql, /SALE_CUSTOMER_ID_REQUIRED/);
});
