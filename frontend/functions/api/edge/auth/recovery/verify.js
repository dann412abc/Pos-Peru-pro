const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}
export async function onRequestPost({ request, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'SUPABASE_CONFIGURATION_MISSING', message: 'Supabase no está configurado en Cloudflare.' }, 503);
  }
  let base;
  try {
    base = new URL(env.SUPABASE_URL);
    if (base.protocol !== 'https:' || base.username || base.password) throw new Error('invalid url');
  } catch {
    return json({ error: 'SUPABASE_CONFIGURATION_INVALID' }, 503);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  if (typeof body.token_hash !== 'string' || body.token_hash.length < 20 || body.token_hash.length > 2048) {
    return json({ error: 'RECOVERY_TOKEN_REQUIRED', message: 'El enlace no contiene un token de recuperación válido.' }, 400);
  }
  try {
    const response = await fetch(new URL('/auth/v1/verify', base), {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ token_hash: body.token_hash, type: 'recovery' }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
      const status = response.status === 400 || response.status === 401 || response.status === 403 ? 400 : 502;
      return json({
        error: 'RECOVERY_TOKEN_INVALID',
        message: status === 400
          ? 'El enlace venció, ya fue utilizado o no corresponde a una recuperación. Solicita uno nuevo.'
          : 'No se pudo validar el enlace con Supabase Auth.',
      }, status);
    }
    return json({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token || null,
      token_type: payload.token_type || 'bearer',
      expires_in: payload.expires_in || null,
    });
  } catch {
    return json({ error: 'AUTH_PROVIDER_UNAVAILABLE', message: 'No se pudo conectar con Supabase Auth.' }, 502);
  }
}
