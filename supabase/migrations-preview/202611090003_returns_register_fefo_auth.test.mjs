import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations-preview/202611090003_returns_register_fefo_auth.sql','utf8');
const edge=fs.readFileSync('frontend/functions/api/edge/[[path]].js','utf8');

test('authenticated wrapper validates ADMIN and delegates legacy transactional accounting',()=>{
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/public\.mi_rol\(\) IS DISTINCT FROM 'ADMIN'/);
  assert.match(sql,/public\.pos_registrar_devolucion\(/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.pos_devolucion_registrar_auth\(integer,jsonb\) FROM PUBLIC,anon/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.pos_devolucion_registrar_auth\(integer,jsonb\) TO authenticated/);
});

test('FEFO return traces original sale lots and prevents over-returning a lot',()=>{
  assert.match(sql,/public\.comprobante_lote_salida/);
  assert.match(sql,/public\.devolucion_venta_lote/);
  assert.match(sql,/asign\.cantidad-COALESCE\(previo\.cantidad,0\)/);
  assert.match(sql,/dline\.comprobante_linea_id=v_linea_id/);
  assert.match(sql,/cls\.comprobante_linea_id=v_linea_id/);
  assert.match(sql,/SELECT COUNT\(\*\) INTO v_origen_count/);
  assert.match(sql,/La trazabilidad original no cubre la cantidad a devolver/);
  assert.match(sql,/DEVCLIENTE-/);
});

test('partial returns serialize on the original sale line and cap restoration to its exact lot allocations',()=>{
  const writer=fs.readFileSync('supabase/migrations-preview/202611090012_returns_transactional_writer_auth.sql','utf8');
  assert.match(writer,/WHERE cl\.id=v_linea_id AND cl\.comprobante_id=p_comprobante_id[\s\S]*FOR UPDATE OF cl/);
  assert.match(writer,/v_cantidad>v_disponible\+0\.0001/);
  assert.match(sql,/cls\.comprobante_linea_id=v_linea_id/);
  assert.match(sql,/SUM\(cls\.cantidad\)::numeric\(12,3\) AS cantidad/);
  assert.match(sql,/dline\.comprobante_linea_id=v_linea_id/);
  assert.match(sql,/asign\.cantidad-COALESCE\(previo\.cantidad,0\)/);
  assert.match(sql,/UPDATE public\.inventario_lote[\s\S]*SET cantidad_disponible=cantidad_disponible\+v_tomar/);
  assert.match(sql,/INSERT INTO public\.devolucion_venta_lote\(devolucion_linea_id,lote_id,cantidad\)/);
});

test('duplicate original sale lines are rejected before the transactional writer runs',()=>{
  assert.match(sql,/Una línea original solo puede aparecer una vez por devolución/);
  assert.match(sql,/GROUP BY NULLIF\(entrada\.value->>'comprobanteLineaId',''\)[\s\S]*HAVING COUNT\(\*\)>1/);
  assert.ok(sql.indexOf("Una línea de venta no puede repetirse")<sql.indexOf("v_result:=public.pos_registrar_devolucion("));
});

test('same transaction is used and retries do not duplicate lot movements',()=>{
  assert.match(sql,/public\.pos_registrar_devolucion\(/);
  assert.match(sql,/v_result->>'reintento'/);
  assert.match(sql,/trazabilidadRepetida/);
  assert.match(sql,/BEGIN;/);
  assert.match(sql,/COMMIT;\s*$/);
});

test('Cloudflare endpoint calls the authenticated wrapper payload shape',()=>{
  assert.match(edge,/pos_devolucion_registrar_auth/);
  assert.match(edge,/p_payload:\s*\{/);
  assert.doesNotMatch(edge,/new URL\('\/rest\/v1\/rpc\/pos_registrar_devolucion'/);
});

test('nota de venta cancellation uses the authenticated FEFO wrapper, not the internal writer',()=>{
  const cancel=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.pos_anular_nota_venta'));
  assert.ok(cancel.includes("c.tipo='NV'"));
  assert.ok(cancel.includes("public.pos_devolucion_registrar_auth("));
  assert.ok(cancel.includes("'idempotencyKey',v_clave"));
  assert.equal(cancel.includes("public.pos_registrar_devolucion("),false);
  assert.ok(cancel.includes("estado='ANULADA'"));
});

test('nota cancellation retry hash uses the same canonical payload as the transaction writer',()=>{
  const cancel=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.pos_anular_nota_venta'));
  for(const key of ["'comprobanteId',p_comprobante_id","'motivo',v_motivo_devolucion",
    "'comprobanteLineaId'","'reingresarStock'","'metodoPago'","'referencia'"])
    assert.ok(cancel.includes(key),key);
  assert.ok(cancel.includes("request_hash IS DISTINCT FROM v_hash"));
  assert.ok(cancel.includes("v_existente.request_hash"));
});

test('legacy note cancellation hashes remain accepted on retries after migration',()=>{
  const cancel=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.pos_anular_nota_venta'));
  assert.ok(cancel.includes("v_hash_legacy:=md5(jsonb_build_object("));
  assert.ok(cancel.includes("'motivo',v_motivo_devolucion,'lineas',v_lineas,'pagos',p_pagos"));
  assert.ok(cancel.includes("v_existente.request_hash IS DISTINCT FROM v_hash_legacy"));
});
