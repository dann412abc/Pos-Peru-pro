import { describe, it, expect } from 'vitest';
import { onRequest } from './[[path]].js';

function ctx(path, request, env = {}) { return { params: { path }, request, env }; }

describe('Cloudflare Edge API foundation', () => {
  it('health informa modo de migración sin filtrar secretos', async () => {
    const res = await onRequest(ctx(['health'], new Request('https://pos.test/api/edge/health')));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('migration');
    expect(JSON.stringify(body)).not.toContain('service_role');
  });
  it('rechaza configuración Supabase ausente', async () => {
    const res = await onRequest(ctx(['auth', 'me'], new Request('https://pos.test/api/edge/auth/me')));
    expect(res.status).toBe(503);
  });
  it('no permite ejecutar RPC fuera de allowlist', async () => {
    const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-anon', SUPABASE_RPC_ALLOWLIST: '' };
    const req = new Request('https://pos.test/api/edge/rpc/create_sale', { method: 'POST', headers: { authorization: 'Bearer test' }, body: '{}' });
    const res = await onRequest(ctx(['rpc', 'create_sale'], req, env));
    expect(res.status).toBe(403);
  });
  it('no activa endpoints de negocio no migrados', async () => {
    const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-anon' };
    const res = await onRequest(ctx(['ventas'], new Request('https://pos.test/api/edge/ventas'), env));
    expect(res.status).toBe(501);
  });
});

describe('Supabase Auth POS profile resolution', () => {
  it('rechaza perfil sin sesión', async () => {
    const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-anon' };
    const res = await onRequest(ctx(['auth', 'profile'], new Request('https://pos.test/api/edge/auth/profile'), env));
    expect(res.status).toBe(401);
  });

  it('resuelve el perfil con el JWT y no acepta un usuario_id del cliente', async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, init) => {
      captured = { url: String(url), init };
      return new Response(JSON.stringify({ id: '17', username: 'caja1', nombre: 'Caja 1', rol: 'CAJERO', sucursales: [{ id: '3', nombre: 'Principal' }] }), { status: 200 });
    };
    try {
      const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-anon' };
      const req = new Request('https://pos.test/api/edge/auth/profile?usuario_id=999', { headers: { authorization: 'Bearer signed-user-token' } });
      const res = await onRequest(ctx(['auth', 'profile'], req, env));
      expect(res.status).toBe(200);
      expect(captured.url).toBe('https://example.supabase.co/rest/v1/rpc/pos_mi_perfil_auth');
      expect(captured.init.headers.authorization).toBe('Bearer signed-user-token');
      expect(captured.init.body).toBe('{}');
      expect(captured.init.body).not.toContain('999');
      expect((await res.json()).profile.username).toBe('caja1');
    } finally { globalThis.fetch = originalFetch; }
  });
});

describe('Supabase Auth lifecycle endpoints', () => {
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-anon' };
  const originalFetch = globalThis.fetch;
  it('valida formato de login sin llamar a Supabase', async () => {
    const req = new Request('https://pos.test/api/edge/auth/login', { method: 'POST', body: JSON.stringify({ email: 'mal-correo', password: 'x' }) });
    const res = await onRequest(ctx(['auth', 'login'], req, env));
    expect(res.status).toBe(400);
  });
  it('renueva sesión usando refresh_token sin exponer credenciales', async () => {
    let captured;
    globalThis.fetch = async (url, init) => { captured = { url: String(url), body: JSON.parse(init.body) }; return new Response(JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }), { status: 200 }); };
    try {
      const req = new Request('https://pos.test/api/edge/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: 'old-refresh' }) });
      const res = await onRequest(ctx(['auth', 'refresh'], req, env));
      expect(res.status).toBe(200);
      expect(captured.url).toContain('/auth/v1/token?grant_type=refresh_token');
      expect(captured.body.refresh_token).toBe('old-refresh');
      expect((await res.json()).access_token).toBe('new-access');
    } finally { globalThis.fetch = originalFetch; }
  });
  it('cierre de sesión exige Bearer', async () => {
    const req = new Request('https://pos.test/api/edge/auth/logout', { method: 'POST' });
    const res = await onRequest(ctx(['auth', 'logout'], req, env));
    expect(res.status).toBe(401);
  });
  it('recuperación no revela si el correo existe', async () => {
    const req = new Request('https://pos.test/api/edge/auth/recover', { method: 'POST', body: JSON.stringify({ email: 'cliente@example.com' }) });
    globalThis.fetch = async () => new Response('', { status: 200 });
    try {
      const res = await onRequest(ctx(['auth', 'recover'], req, env));
      expect(res.status).toBe(200);
      expect((await res.json()).message).toContain('Si el correo está registrado');
    } finally { globalThis.fetch = originalFetch; }
  });
});

describe('Supabase catalog read endpoint', () => {
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-anon' };
  it('rechaza catálogo sin sesión', async () => {
    const res = await onRequest(ctx(['catalog', 'base'], new Request('https://pos.test/api/edge/catalog/base'), env));
    expect(res.status).toBe(401);
  });
  it('valida sucursal antes de consultar Supabase', async () => {
    const res = await onRequest(ctx(['catalog', 'base'], new Request('https://pos.test/api/edge/catalog/base?sucursal_id=-2', { headers: { authorization: 'Bearer token' } }), env));
    expect(res.status).toBe(400);
  });
  it('envía el JWT del usuario a la RPC de catálogo y no usa service role', async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, init) => {
      captured = { url: String(url), init };
      return new Response(JSON.stringify({ empresa_id: 8, sucursal_id: 3, sucursales: [{ id: 3, nombre: 'Principal' }], categorias: [], productos: [], variantes: [], stock: [], clientes: [] }), { status: 200 });
    };
    try {
      const req = new Request('https://pos.test/api/edge/catalog/base?sucursal_id=3', { headers: { authorization: 'Bearer user-jwt' } });
      const res = await onRequest(ctx(['catalog', 'base'], req, env));
      expect(res.status).toBe(200);
      expect(captured.url).toBe('https://example.supabase.co/rest/v1/rpc/pos_catalogo_base_auth');
      expect(captured.init.headers.authorization).toBe('Bearer user-jwt');
      expect(captured.init.body).toBe('{"p_sucursal_id":3}');
      expect(JSON.stringify(captured.init.headers)).not.toContain('service_role');
    } finally { globalThis.fetch = originalFetch; }
  });
});

describe('Supabase suppliers read endpoint', () => {
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-anon' };
  it('requires an authenticated Supabase session', async () => {
    const res = await onRequest(ctx(['parties', 'suppliers'], new Request('https://pos.test/api/edge/parties/suppliers'), env));
    expect(res.status).toBe(401);
  });
  it('calls the company-scoped RPC with the user JWT and no client company id', async () => {
    const originalFetch = globalThis.fetch;
    let captured;
    globalThis.fetch = async (url, init) => { captured = { url: String(url), init }; return new Response('[{"id":4,"nombre":"Proveedor"}]', { status: 200, headers: { 'content-type': 'application/json' } }); };
    try {
      const req = new Request('https://pos.test/api/edge/parties/suppliers?empresa_id=999', { headers: { authorization: 'Bearer user-jwt' } });
      const res = await onRequest(ctx(['parties', 'suppliers'], req, env));
      expect(res.status).toBe(200);
      expect(captured.url).toBe('https://example.supabase.co/rest/v1/rpc/pos_proveedores_listar_auth');
      expect(captured.init.headers.authorization).toBe('Bearer user-jwt');
      expect(captured.init.body).toBe('{}');
      expect(captured.init.body).not.toContain('999');
      expect(await res.json()).toHaveLength(1);
    } finally { globalThis.fetch = originalFetch; }
  });
});
