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
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'RECOVERY_TOKEN_REQUIRED', message: 'El enlace de recuperación no contiene un token válido.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  if (typeof body.password !== 'string' || body.password.length < 8) {
    return json({ error: 'WEAK_PASSWORD', message: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
  }
  let base;
  try {
    base = new URL(env.SUPABASE_URL);
    if (base.protocol !== 'https:' || base.username || base.password) throw new Error('invalid url');
  } catch { return json({ error: 'SUPABASE_CONFIGURATION_INVALID' }, 503); }
  try {
    const response = await fetch(new URL('/auth/v1/user', base), {
      method: 'PUT',
      headers: { apikey: env.SUPABASE_ANON_KEY, authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ password: body.password }),
    });
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? 401 : response.status === 422 ? 400 : 502;
      return json({ error: 'PASSWORD_UPDATE_FAILED', message: status === 401
        ? 'El enlace de recuperación venció o ya fue utilizado. Solicita uno nuevo.'
        : 'Supabase no pudo actualizar la contraseña.' }, status);
    }
    return json({ ok: true });
  } catch {
    return json({ error: 'AUTH_PROVIDER_UNAVAILABLE', message: 'No se pudo conectar con Supabase Auth.' }, 502);
  }
}
