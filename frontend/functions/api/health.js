const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
};

export async function onRequest({ env }) {
  return new Response(JSON.stringify({
    ok: true,
    service: 'controla-ventas-pages',
    deployment: 'cloudflare-pages',
    supabaseConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
    legacyApiConfigured: Boolean(env.API_ORIGIN),
    version: '1.44.79',
  }), { status: 200, headers });
}
