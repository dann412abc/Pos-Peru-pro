import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations-preview/202611070039_sales_comprobante_detail_auth.sql'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'frontend/functions/api/edge/[[path]].js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'frontend/src/api/supabaseSales.ts'), 'utf8');
const screen = fs.readFileSync(path.join(root, 'frontend/src/pages/VentaRapida.tsx'), 'utf8');

test('RPC de detalle deriva identidad y limita empresa/sucursal', () => {
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /c\.empresa_id = v_empresa_id/);
  assert.match(sql, /usuario_sucursal us/);
  assert.match(sql, /SALE_DETAIL_NOT_FOUND_OR_FORBIDDEN/);
  assert.match(sql, /GRANT EXECUTE[\s\S]*TO authenticated/);
  assert.match(sql, /REVOKE ALL[\s\S]*FROM anon/);
});

test('RPC devuelve cabecera, cliente, líneas con variante, pagos y estado electrónico', () => {
  for (const field of ['op_gravadas','op_exoneradas','op_inafectas','total_igv','motivo_descuento','tipo_doc','variante_nombre','variante_codigo','metodo_pago','estado_actual']) {
    assert.match(sql, new RegExp(field));
  }
  assert.match(sql, /jsonb_agg[\s\S]*ORDER BY li\.numero_linea/);
  assert.match(sql, /jsonb_agg[\s\S]*ORDER BY cp\.id/);
});

test('Edge expone ruta autenticada de lectura de detalle sin service role', () => {
  assert.match(edge, /sales\/comprobante-detail/);
  assert.match(edge, /pos_comprobante_detalle_auth/);
  assert.match(edge, /authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('frontend consulta detalle oficial y lo mapea antes de limpiar el intento', () => {
  assert.match(api, /consultarDetalleComprobanteSupabase/);
  assert.match(api, /sales\/comprobante-detail/);
  assert.match(screen, /consultarDetalleComprobanteSupabase/);
  assert.match(screen, /mapComprobante/);
  assert.ok(screen.indexOf('consultarDetalleComprobanteSupabase') < screen.indexOf('limpiarClaveVentaSupabase(storageKey)'));
});
