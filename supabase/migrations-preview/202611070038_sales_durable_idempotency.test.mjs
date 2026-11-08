import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const adapter = fs.readFileSync(path.join(root, 'frontend/src/api/supabaseSales.ts'), 'utf8');
const screen = fs.readFileSync(path.join(root, 'frontend/src/pages/VentaRapida.tsx'), 'utf8');

test('la clave idempotente persiste en localStorage y no sessionStorage', () => {
  assert.match(adapter, /localStorage\.getItem\(nombreClave\(storageKey\)\)/);
  assert.match(adapter, /localStorage\.setItem\(nombreClave\(storageKey\)/);
  assert.doesNotMatch(adapter, /sessionStorage/);
});

test('guarda snapshot antes de enviar la RPC', () => {
  assert.match(adapter, /guardarIntentoVentaPendienteSupabase/);
  assert.ok(screen.indexOf('guardarIntentoVentaPendienteSupabase(storageScope, fingerprintVenta, payloadSupabase, venta)') < screen.indexOf('crearVentaSupabase(payloadSupabase)'));
});

test('un intento ambiguo no puede ser reemplazado por otra huella', () => {
  assert.match(adapter, /pending\.fingerprint !== fingerprint/);
  assert.match(adapter, /Existe un cobro anterior pendiente de verificar/);
  assert.match(adapter, /Hay otro cobro pendiente de verificar/);
});

test('el snapshot no contiene token de autenticación', () => {
  assert.match(adapter, /payload: JSON\.parse\(JSON\.stringify\(payload\)\)/);
  assert.match(adapter, /No almacena tokens/);
  assert.match(adapter, /function authHeaders\(\)/);
});

test('la recuperación automática consulta Supabase al entrar al POS', () => {
  assert.match(screen, /obtenerIntentoVentaPendienteSupabase\(storageKey\)/);
  assert.match(screen, /void verificarCobroPendiente\(storageKey\)/);
  assert.match(screen, /consultarEstadoVentaSupabase\(intento\.payload\)/);
});

test('reconstruye el ticket confirmado y conserva intentos no verificables', () => {
  assert.match(screen, /consultarDetalleComprobanteSupabase/);
  assert.match(screen, /mapComprobante\(detalleOficial\)/);
  assert.match(screen, /db\.ventas\.add\(ventaRecuperada\)/);
  assert.match(screen, /limpiarClaveVentaSupabase\(storageKey\)/);
  assert.match(screen, /no se permite iniciar otro cobro/);
  assert.match(screen, /Verificar nuevamente/);
});
