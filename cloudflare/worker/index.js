/**
 * Worker independiente para Cloudflare Queues + Cron.
 * Los RPC permitidos deben ser funciones SQL estrechas, auditadas e idempotentes.
 * Nunca se expone SUPABASE_SERVICE_ROLE_KEY al navegador ni a Pages.
 */
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

async function callPrivilegedRpc(env, name, args = {}) {
  const allowed = String(env.PRIVILEGED_RPC_ALLOWLIST || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!allowed.includes(name)) throw new Error(`RPC no permitida: ${name}`);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Falta configuración privada de Supabase');
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== 'https:') throw new Error('SUPABASE_URL debe usar HTTPS');
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, base), {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`Supabase RPC ${name} respondió ${response.status}`);
  return response.status === 204 ? null : response.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'mi-carrito-pos-jobs', mode: 'prepared' });
    return json({ error: 'NOT_FOUND' }, 404);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const jobs = String(env.CRON_RPC_ALLOWLIST || '').split(',').map(x => x.trim()).filter(Boolean);
      for (const name of jobs) await callPrivilegedRpc(env, name, {});
    })());
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        const body = message.body || {};
        if (!body || typeof body.rpc !== 'string' || !body.args || typeof body.args !== 'object' || Array.isArray(body.args)) {
          throw new Error('Mensaje de cola inválido');
        }
        const allowed = String(env.QUEUE_RPC_ALLOWLIST || '').split(',').map(x => x.trim()).filter(Boolean);
        if (!allowed.includes(body.rpc)) throw new Error('Tipo de tarea no permitido');
        await callPrivilegedRpc(env, body.rpc, body.args);
        message.ack();
      } catch (error) {
        // No imprimir payloads, tokens ni datos del cliente en logs.
        console.error('POS queue task failed:', error instanceof Error ? error.message : 'unknown');
        message.retry();
      }
    }
  },
};
