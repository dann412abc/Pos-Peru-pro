/**
 * Edge API base para la migración gradual a Supabase + Cloudflare.
 * No contiene service_role ni expone secretos al navegador.
 * Rutas: GET /api/edge/health, GET /api/edge/auth/me, POST /api/edge/rpc/:name
 */
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function getBearer(request) {
  const value = request.headers.get('authorization') || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function validSupabaseConfig(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  try {
    const url = new URL(env.SUPABASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

export async function onRequest({ request, env, params }) {
  const segments = Array.isArray(params?.path) ? params.path : [];
  const route = segments.join('/');
  const supabase = validSupabaseConfig(env);

  if (request.method === 'GET' && route === 'health') {
    return json({ ok: true, service: 'mi-carrito-pos-edge-api', mode: 'migration', supabaseConfigured: Boolean(supabase) });
  }
  if (!supabase) return json({ error: 'SUPABASE_CONFIGURATION_MISSING', message: 'Configura SUPABASE_URL y SUPABASE_ANON_KEY en Cloudflare.' }, 503);

  // Supabase Auth: password login, refresh, logout y recuperación.
  if (request.method === 'POST' && route === 'auth/login') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || !body.email.includes('@') || body.password.length < 1) {
      return json({ error: 'INVALID_CREDENTIALS_FORMAT', message: 'Ingresa correo electrónico y contraseña.' }, 400);
    }
    try {
      const response = await fetch(new URL('/auth/v1/token?grant_type=password', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ email: body.email.trim().toLowerCase(), password: body.password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return json({ error: 'AUTH_LOGIN_FAILED', message: response.status === 400 || response.status === 401 ? 'Correo o contraseña incorrectos.' : 'No se pudo iniciar sesión.' }, response.status === 429 ? 429 : 401);
      return json({ access_token: payload.access_token, refresh_token: payload.refresh_token, expires_in: payload.expires_in, token_type: payload.token_type, user: { id: payload.user?.id, email: payload.user?.email } });
    } catch { return json({ error: 'AUTH_PROVIDER_UNAVAILABLE' }, 502); }
  }

  if (request.method === 'POST' && route === 'auth/refresh') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    if (typeof body.refresh_token !== 'string' || !body.refresh_token) return json({ error: 'REFRESH_TOKEN_REQUIRED' }, 400);
    try {
      const response = await fetch(new URL('/auth/v1/token?grant_type=refresh_token', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: body.refresh_token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return json({ error: 'INVALID_REFRESH_TOKEN', message: 'La sesión expiró. Inicia sesión nuevamente.' }, 401);
      return json({ access_token: payload.access_token, refresh_token: payload.refresh_token, expires_in: payload.expires_in, token_type: payload.token_type });
    } catch { return json({ error: 'AUTH_PROVIDER_UNAVAILABLE' }, 502); }
  }

  if (request.method === 'POST' && route === 'auth/logout') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED' }, 401);
    try {
      const response = await fetch(new URL('/auth/v1/logout', supabase), { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
      if (!response.ok) return json({ error: 'AUTH_LOGOUT_FAILED' }, response.status === 401 ? 401 : 502);
      return json({ ok: true });
    } catch { return json({ error: 'AUTH_PROVIDER_UNAVAILABLE' }, 502); }
  }

  if (request.method === 'POST' && route === 'auth/recover') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    if (typeof body.email !== 'string' || !body.email.includes('@')) return json({ error: 'EMAIL_REQUIRED', message: 'Ingresa un correo válido.' }, 400);
    try {
      const response = await fetch(new URL('/auth/v1/recover', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ email: body.email.trim().toLowerCase(), redirect_to: body.redirect_to }),
      });
      if (!response.ok) return json({ error: 'RECOVERY_REQUEST_FAILED', message: 'No se pudo solicitar la recuperación.' }, response.status === 429 ? 429 : 502);
      return json({ ok: true, message: 'Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.' });
    } catch { return json({ error: 'AUTH_PROVIDER_UNAVAILABLE' }, 502); }
  }

  if (request.method === 'GET' && route === 'auth/me') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    try {
      const response = await fetch(new URL('/auth/v1/user', supabase), {
        headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
      });
      if (!response.ok) return json({ error: 'INVALID_SESSION', message: 'La sesión Supabase no es válida o expiró.' }, 401);
      const user = await response.json();
      return json({ user: { id: user.id, email: user.email || null, role: user.role || null }, authenticated: true });
    } catch {
      return json({ error: 'AUTH_PROVIDER_UNAVAILABLE', message: 'No se pudo validar la sesión en Supabase Auth.' }, 502);
    }
  }

  if (request.method === 'GET' && route === 'auth/profile') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    try {
      // La función SQL usa auth.uid(); nunca se acepta un usuario_id del navegador.
      const response = await fetch(new URL('/rest/v1/rpc/pos_mi_perfil_auth', supabase), {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'accept-profile': 'public',
          'content-profile': 'public',
        },
        body: '{}',
      });
      if (response.status === 401 || response.status === 403) {
        return json({ error: 'INVALID_SESSION', message: 'La sesión no tiene acceso al perfil POS.' }, 401);
      }
      if (!response.ok) {
        const code = response.status === 404 ? 'AUTH_IDENTITY_NOT_LINKED' : 'AUTH_PROFILE_UNAVAILABLE';
        return json({ error: code, message: response.status === 404
          ? 'La identidad Supabase todavía no está vinculada a un usuario POS activo.'
          : 'No se pudo resolver el perfil POS. Verifica la migración y las sucursales asignadas.' }, 409);
      }
      const profile = await response.json();
      if (!profile || typeof profile !== 'object' || !profile.id || !profile.username || !Array.isArray(profile.sucursales) || !profile.sucursales.length) {
        return json({ error: 'INVALID_POS_PROFILE', message: 'El perfil POS devuelto no cumple el contrato requerido.' }, 409);
      }
      return json({ authenticated: true, profile });
    } catch {
      return json({ error: 'AUTH_PROVIDER_UNAVAILABLE', message: 'No se pudo consultar el perfil POS en Supabase.' }, 502);
    }
  }

  // Escrituras de catálogo: RPCs estrechas, sesión Supabase obligatoria y autorización en SQL.
  if (request.method === 'POST' && route === 'catalog/mutate') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    const allowedActions = new Set(['product_create', 'product_update', 'product_deactivate', 'category_create', 'category_update', 'category_deactivate']);
    if (!body || !allowedActions.has(body.action) || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      return json({ error: 'INVALID_CATALOG_MUTATION', message: 'La operación de catálogo no es válida.' }, 400);
    }
    const response = await fetch(new URL('/rest/v1/rpc/pos_catalogo_mutar_auth', supabase), {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
      body: JSON.stringify({ p_action: body.action, p_payload: body.payload }),
    }).catch(() => null);
    if (!response) return json({ error: 'CATALOG_UNAVAILABLE' }, 502);
    const payload = await response.text();
    if (response.status === 404) return json({ error: 'CATALOG_WRITE_MIGRATION_REQUIRED', message: 'Falta instalar la función SQL de escritura en el entorno de pruebas.' }, 409);
    if (response.status === 401 || response.status === 403) return json({ error: 'CATALOG_WRITE_FORBIDDEN' }, 403);
    return new Response(payload, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
  }

  // Lectura aislada de proveedores para la pantalla Compras; empresa derivada en SQL.
  if (request.method === 'GET' && route === 'parties/suppliers') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_proveedores_listar_auth', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' }, body: '{}',
      });
      const payload = await response.text();
      if (response.status === 404) return json({ error: 'SUPPLIERS_READ_MIGRATION_REQUIRED', message: 'Falta instalar la lectura segura de proveedores en staging.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'SUPPLIERS_FORBIDDEN' }, 403);
      return new Response(payload, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'SUPPLIERS_UNAVAILABLE', message: 'No se pudo consultar proveedores en Supabase.' }, 502); }
  }

  // Detalle oficial de comprobante: lectura autenticada, autorizada en SQL por auth.uid().
  if (request.method === 'POST' && route === 'sales/comprobante-detail') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    const comprobanteId = Number(body?.comprobanteId);
    if (!Number.isSafeInteger(comprobanteId) || comprobanteId <= 0) {
      return json({ error: 'INVALID_COMPROBANTE_ID', message: 'El identificador del comprobante no es válido.' }, 400);
    }
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_comprobante_detalle_auth', supabase), {
        method: 'POST',
        headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify({ p_comprobante_id: comprobanteId }),
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'SALES_DETAIL_MIGRATION_REQUIRED', message: 'La consulta oficial del comprobante aún no está instalada en el entorno Supabase.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'SALES_DETAIL_FORBIDDEN', message: 'No tienes acceso a este comprobante o tu sesión expiró.' }, response.status);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'SALES_DETAIL_UNAVAILABLE', message: 'No se pudo consultar el detalle oficial del comprobante.' }, 502); }
  }

  // Preconsulta de idempotencia de ventas. No registra comprobantes ni modifica stock.
  if (request.method === 'POST' && route === 'sales/idempotency-check') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    const payload = body?.payload;
    const validPositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
    const validNonNegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    const validLine = (line) => line && typeof line === 'object' && !Array.isArray(line) &&
      Number.isSafeInteger(line.productoId) && line.productoId > 0 &&
      (line.varianteId == null || (Number.isSafeInteger(line.varianteId) && line.varianteId > 0)) &&
      validPositive(line.cantidad) && validNonNegative(line.precioUnitario) &&
      (line.descuento == null || validNonNegative(line.descuento));
    const paymentMethods = new Set(['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'CREDITO']);
    const validPayment = (payment) => payment && typeof payment === 'object' && !Array.isArray(payment) &&
      paymentMethods.has(payment.metodo) && validPositive(payment.monto) &&
      (payment.montoRecibido == null || validNonNegative(payment.montoRecibido));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        !Number.isSafeInteger(Number(payload.sucursalId)) || Number(payload.sucursalId) <= 0 ||
        typeof payload.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{12,100}$/.test(payload.idempotencyKey) ||
        !Array.isArray(payload.lineas) || payload.lineas.length < 1 || payload.lineas.length > 200 || !payload.lineas.every(validLine) ||
        !Array.isArray(payload.pagos) || payload.pagos.length > 20 || !payload.pagos.every(validPayment)) {
      return json({ error: 'INVALID_SALES_IDEMPOTENCY_QUERY', message: 'Verifica sucursal, clave, productos, cantidades, precios, descuentos y pagos.' }, 400);
    }
    const encoded = JSON.stringify({ p_payload: payload });
    if (encoded.length > 64_000) return json({ error: 'SALES_PAYLOAD_TOO_LARGE' }, 413);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_venta_idempotencia_consultar_auth', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: encoded,
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'SALES_IDEMPOTENCY_MIGRATION_REQUIRED', message: 'La preconsulta de idempotencia aún no está instalada; no se registró ninguna venta.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'SALES_IDEMPOTENCY_FORBIDDEN' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'SALES_IDEMPOTENCY_UNAVAILABLE', message: 'No se pudo verificar la clave; no se confirmó ninguna venta.' }, 502); }
  }

  // Ciclo de caja Supabase: cada operación usa una RPC estrecha y auth.uid() en SQL.
  if (request.method === 'POST' && ['cash/open','cash/movement','cash/close'].includes(route)) {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    let rpc, args;
    if (route === 'cash/open') {
      const sucursalId = Number(body?.sucursalId);
      const saldoInicial = Number(body?.saldoInicial);
      if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0 || !Number.isFinite(saldoInicial) || saldoInicial < 0 || Math.round(saldoInicial*100)!==saldoInicial*100) return json({ error: 'INVALID_CASH_OPEN' }, 400);
      rpc = 'pos_caja_abrir_auth'; args = { p_sucursal_id: sucursalId, p_saldo_inicial: saldoInicial };
    } else if (route === 'cash/movement') {
      const cajaId = Number(body?.cajaId), monto = Number(body?.monto);
      if (!Number.isSafeInteger(cajaId) || cajaId <= 0 || !['INGRESO','SALIDA'].includes(body?.tipo) || !['EFECTIVO','TARJETA','YAPE','PLIN'].includes(body?.metodoPago) || !Number.isFinite(monto) || monto <= 0 || Math.round(monto*100)!==monto*100 || typeof body?.motivo !== 'string' || body.motivo.trim().length < 5 || body.motivo.length > 200) return json({ error: 'INVALID_CASH_MOVEMENT' }, 400);
      rpc = 'pos_caja_movimiento_auth'; args = { p_caja_id: cajaId, p_tipo: body.tipo, p_metodo: body.metodoPago, p_monto: monto, p_motivo: body.motivo.trim() };
    } else {
      const cajaId = Number(body?.cajaId), efectivoContado = Number(body?.efectivoContado);
      if (!Number.isSafeInteger(cajaId) || cajaId <= 0 || !Number.isFinite(efectivoContado) || efectivoContado < 0 || Math.round(efectivoContado*100)!==efectivoContado*100 || !Array.isArray(body?.arqueo)) return json({ error: 'INVALID_CASH_CLOSE' }, 400);
      rpc = 'pos_caja_cerrar_auth'; args = { p_caja_id: cajaId, p_efectivo_contado: efectivoContado, p_arqueo: body.arqueo };
    }
    try {
      const response = await fetch(new URL(`/rest/v1/rpc/${rpc}`, supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify(args),
      });
      const payload = await response.text();
      if (response.status === 404) return json({ error: 'CASH_LIFECYCLE_MIGRATION_REQUIRED', message: 'Instala el ciclo de caja en staging antes de usar estas operaciones.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'CASH_OPERATION_FORBIDDEN' }, 403);
      return new Response(payload, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'CASH_OPERATION_UNAVAILABLE' }, 502); }
  }

  // Historial persistente de movimientos de caja, limitado y autorizado por auth.uid() en SQL.
  if (request.method === 'GET' && route === 'cash/movements') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    const cajaId = Number(new URL(request.url).searchParams.get('cajaId'));
    if (!Number.isSafeInteger(cajaId) || cajaId <= 0) return json({ error: 'INVALID_CASH_REGISTER_QUERY', message: 'Selecciona una caja válida.' }, 400);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_caja_movimientos_listar_auth', supabase), {
        method: 'POST',
        headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify({ p_caja_id: cajaId }),
      });
      const payload = await response.text();
      if (response.status === 404) return json({ error: 'CASH_MOVEMENTS_MIGRATION_REQUIRED', message: 'Falta instalar el historial de movimientos seguro en staging.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'CASH_MOVEMENTS_FORBIDDEN' }, 403);
      return new Response(payload, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'CASH_MOVEMENTS_UNAVAILABLE', message: 'No se pudo consultar el historial de caja en Supabase.' }, 502); }
  }

  // Resumen de caja: lectura autenticada; empresa, sucursal y propietario se derivan en SQL.
  if (request.method === 'GET' && route === 'cash/summary') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    const cajaId = Number(new URL(request.url).searchParams.get('cajaId'));
    if (!Number.isSafeInteger(cajaId) || cajaId <= 0) return json({ error: 'INVALID_CASH_REGISTER_QUERY', message: 'Selecciona una caja válida.' }, 400);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_caja_resumen_auth', supabase), {
        method: 'POST',
        headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify({ p_caja_id: cajaId }),
      });
      const payload = await response.text();
      if (response.status === 404) return json({ error: 'CASH_SUMMARY_MIGRATION_REQUIRED', message: 'Falta instalar el resumen de caja seguro en staging.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'CASH_SUMMARY_FORBIDDEN' }, 403);
      return new Response(payload, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'CASH_SUMMARY_UNAVAILABLE', message: 'No se pudo consultar el resumen de caja en Supabase.' }, 502); }
  }

  // Consultas de devoluciones en Supabase: historial, búsqueda y disponibilidad; el registro usa la ruta transaccional independiente.
  if (request.method === 'GET' && ['returns/list','returns/search','returns/availability'].includes(route)) {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    const url = new URL(request.url);
    const sucursalRaw = url.searchParams.get('sucursalId');
    const sucursalId = sucursalRaw === null || sucursalRaw === '' ? null : Number(sucursalRaw);
    if (sucursalId !== null && (!Number.isSafeInteger(sucursalId) || sucursalId <= 0)) return json({ error: 'INVALID_BRANCH_QUERY' }, 400);
    let rpc, args;
    if (route === 'returns/list') { rpc = 'pos_devoluciones_listar_auth'; args = { p_sucursal_id: sucursalId }; }
    else if (route === 'returns/search') {
      const termino = String(url.searchParams.get('q') || '').trim();
      if (termino.length < 2 || termino.length > 80) return json({ error: 'INVALID_RETURN_SEARCH' }, 400);
      rpc = 'pos_devoluciones_buscar_auth'; args = { p_termino: termino, p_sucursal_id: sucursalId };
    } else {
      const comprobanteId = Number(url.searchParams.get('comprobanteId'));
      if (!Number.isSafeInteger(comprobanteId) || comprobanteId <= 0) return json({ error: 'INVALID_RECEIPT_QUERY' }, 400);
      rpc = 'pos_disponibilidad_devolucion'; args = { p_comprobante_id: comprobanteId };
    }
    try {
      const response = await fetch(new URL(`/rest/v1/rpc/${rpc}`, supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify(args),
      });
      const payload = await response.text();
      if (response.status === 404) return json({ error: 'RETURNS_READ_MIGRATION_REQUIRED', message: 'Falta instalar las consultas seguras de devoluciones en staging.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'RETURNS_READ_FORBIDDEN' }, 403);
      return new Response(payload, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'RETURNS_READ_UNAVAILABLE' }, 502); }
  }

  // Cajas abiertas para Compras: la RPC limita usuario, empresa y sucursal desde auth.uid().
  if (request.method === 'GET' && route === 'purchases/cash-registers') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    const sucursalId = Number(new URL(request.url).searchParams.get('sucursalId'));
    if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0) return json({ error: 'INVALID_CASH_REGISTER_QUERY', message: 'Selecciona una sucursal válida.' }, 400);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_compras_cajas_abiertas_auth', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify({ p_sucursal_id: sucursalId }),
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'PURCHASE_CASH_MIGRATION_REQUIRED', message: 'La consulta segura de cajas no está instalada en staging.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'PURCHASE_CASH_FORBIDDEN' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'PURCHASE_CASH_UNAVAILABLE', message: 'No se pudieron consultar las cajas abiertas en Supabase.' }, 502); }
  }

  // Analítica de proveedores: agregados calculados en SQL y limitados a la sucursal autorizada.
  if (request.method === 'GET' && route === 'purchases/supplier-analytics') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    const sucursalId = Number(new URL(request.url).searchParams.get('sucursalId'));
    if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0) return json({ error: 'INVALID_SUPPLIER_ANALYTICS_QUERY', message: 'Selecciona una sucursal válida.' }, 400);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_compras_analisis_proveedores_auth', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify({ p_sucursal_id: sucursalId }),
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'SUPPLIER_ANALYTICS_MIGRATION_REQUIRED', message: 'La analítica segura de proveedores no está instalada en staging.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'SUPPLIER_ANALYTICS_FORBIDDEN' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'SUPPLIER_ANALYTICS_UNAVAILABLE', message: 'No se pudo consultar el análisis de proveedores en Supabase.' }, 502); }
  }

  // Control de vencimientos: consulta de solo lectura por sucursal autorizada.
  if (request.method === 'GET' && route === 'inventory/expiries') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    const params = new URL(request.url).searchParams;
    const sucursalId = Number(params.get('sucursalId'));
    const dias = Number(params.get('dias') || 90);
    if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0 || ![30, 60, 90, 180, 365].includes(dias)) {
      return json({ error: 'INVALID_EXPIRY_QUERY', message: 'Sucursal o rango de días inválido.' }, 400);
    }
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_inventario_vencimientos_auth', supabase), {
        method: 'POST',
        headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify({ p_sucursal_id: sucursalId, p_dias: dias }),
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'EXPIRY_MIGRATION_REQUIRED', message: 'El control de vencimientos no está instalado en staging.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'EXPIRY_FORBIDDEN' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'EXPIRY_UNAVAILABLE', message: 'No se pudo consultar el control de vencimientos en Supabase.' }, 502); }
  }

  // Reposición sugerida: demanda real de salidas, stock y costo por producto/variante.
  if (request.method === 'GET' && route === 'purchases/replenishment') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    const sucursalId = Number(new URL(request.url).searchParams.get('sucursalId'));
    if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0) return json({ error: 'INVALID_REPLENISHMENT_QUERY', message: 'Selecciona una sucursal válida.' }, 400);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_compras_sugerencias_reposicion_auth', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify({ p_sucursal_id: sucursalId }),
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'REPLENISHMENT_MIGRATION_REQUIRED', message: 'La sugerencia segura de reposición no está instalada en staging.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'REPLENISHMENT_FORBIDDEN' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'REPLENISHMENT_UNAVAILABLE', message: 'No se pudo consultar la reposición sugerida en Supabase.' }, 502); }
  }

  // Historial y detalle de compras: lectura por RPC, limitada a la sucursal autorizada.
  if (request.method === 'GET' && route === 'purchases') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    const url = new URL(request.url);
    const sucursalId = Number(url.searchParams.get('sucursalId'));
    const compraRaw = url.searchParams.get('compraId');
    const compraId = compraRaw === null ? null : Number(compraRaw);
    if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0 || (compraId !== null && (!Number.isSafeInteger(compraId) || compraId <= 0))) {
      return json({ error: 'INVALID_PURCHASE_QUERY', message: 'Sucursal o compra no válida.' }, 400);
    }
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_compras_consultar_auth', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify({ p_sucursal_id: sucursalId, p_compra_id: compraId }),
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'PURCHASE_READ_MIGRATION_REQUIRED', message: 'Falta instalar la lectura de compras en staging.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'PURCHASE_READ_FORBIDDEN' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'PURCHASE_READ_UNAVAILABLE', message: 'No se pudo consultar el historial de compras en Supabase.' }, 502); }
  }

  // Recepción de compras: RPC transaccional; nunca aceptar empresa/usuario desde el navegador.
  if (request.method === 'POST' && route === 'purchases/receive') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      return json({ error: 'INVALID_PURCHASE_PAYLOAD', message: 'La solicitud de recepción no tiene el formato esperado.' }, 400);
    }
    const payload = body.payload;
    if (!Number.isSafeInteger(Number(payload.sucursalId)) || Number(payload.sucursalId) <= 0 ||
        !Number.isSafeInteger(Number(payload.proveedorId)) || Number(payload.proveedorId) <= 0 ||
        typeof payload.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{12,100}$/.test(payload.idempotencyKey) ||
        !Array.isArray(payload.lineas) || payload.lineas.length < 1 || payload.lineas.length > 200 ||
        !Array.isArray(payload.pagos) || payload.pagos.length > 20) {
      return json({ error: 'INVALID_PURCHASE_PAYLOAD', message: 'Verifica sucursal, proveedor, clave de idempotencia, líneas y pagos.' }, 400);
    }
    const encoded = JSON.stringify({ p_payload: payload });
    if (encoded.length > 64_000) return json({ error: 'PURCHASE_PAYLOAD_TOO_LARGE', message: 'La compra supera el tamaño permitido.' }, 413);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_compra_recibir_auth', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' }, body: encoded,
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'PURCHASE_MIGRATION_REQUIRED', message: 'La recepción transaccional aún no está instalada en staging; la compra no se registró.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'PURCHASE_FORBIDDEN', message: 'La sesión no tiene permiso para recibir compras en esta sucursal.' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'PURCHASES_UNAVAILABLE', message: 'No se pudo contactar con Supabase; no se confirmó la recepción.' }, 502); }
  }

  // Pagos posteriores de compras: saldo, idempotencia y caja se actualizan en una RPC atómica.
  if (request.method === 'POST' && route === 'purchases/payment') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    const payload = body?.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        !Number.isSafeInteger(Number(payload.compraId)) || Number(payload.compraId) <= 0 ||
        !Number.isFinite(Number(payload.monto)) || Number(payload.monto) <= 0 ||
        !['EFECTIVO','YAPE','PLIN','TARJETA','TRANSFERENCIA'].includes(String(payload.metodoPago || '').toUpperCase()) ||
        typeof payload.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{12,100}$/.test(payload.idempotencyKey)) {
      return json({ error: 'INVALID_PURCHASE_PAYMENT', message: 'Verifica compra, importe, medio de pago y clave de operación.' }, 400);
    }
    if (JSON.stringify({ p_payload: payload }).length > 8000) return json({ error: 'PURCHASE_PAYMENT_TOO_LARGE' }, 413);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_compra_registrar_pago_auth', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify({ p_payload: payload }),
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'PURCHASE_PAYMENT_MIGRATION_REQUIRED', message: 'Falta instalar la RPC de pagos a proveedores en staging; no se registró el pago.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'PURCHASE_PAYMENT_FORBIDDEN', message: 'La sesión no tiene permiso para pagar esta compra.' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'PURCHASE_PAYMENT_UNAVAILABLE', message: 'No se pudo confirmar el pago en Supabase.' }, 502); }
  }

  // Prevalidación de devolución a proveedor: consulta autenticada y sin mutaciones.
  if (request.method === 'POST' && route === 'purchases/return-preview') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    const payload = body?.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        !Number.isSafeInteger(payload.compraId) || payload.compraId <= 0 ||
        !Array.isArray(payload.lineas) || payload.lineas.length < 1 || payload.lineas.length > 100 ||
        payload.lineas.some(x => !x || !Number.isSafeInteger(x.compraLineaId) || x.compraLineaId <= 0 || !Number.isSafeInteger(x.loteId) || x.loteId <= 0 || !Number.isFinite(x.cantidad) || x.cantidad <= 0)) {
      return json({ error: 'INVALID_PURCHASE_RETURN', message: 'Compra, lotes o cantidades inválidos.' }, 400);
    }
    const encoded = JSON.stringify({ p_payload: payload });
    if (encoded.length > 16000) return json({ error: 'PURCHASE_RETURN_TOO_LARGE' }, 413);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_compra_devolucion_prevalidar_auth', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' }, body: encoded,
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'PURCHASE_RETURN_PREVIEW_MIGRATION_REQUIRED', message: 'La prevalidación de devoluciones aún no está instalada.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'PURCHASE_RETURN_FORBIDDEN' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'PURCHASE_RETURN_UNAVAILABLE', message: 'No se pudo prevalidar la devolución.' }, 502); }
  }

  // Devolución definitiva a proveedor: RPC transaccional con stock, lotes y saldo.
  if (request.method === 'POST' && route === 'purchases/return') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    const payload = body?.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        !Number.isSafeInteger(payload.compraId) || payload.compraId <= 0 ||
        typeof payload.motivo !== 'string' || payload.motivo.trim().length < 5 || payload.motivo.length > 500 ||
        typeof payload.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{12,100}$/.test(payload.idempotencyKey) ||
        !Array.isArray(payload.lineas) || payload.lineas.length < 1 || payload.lineas.length > 100 ||
        payload.lineas.some(x => !x || !Number.isSafeInteger(x.compraLineaId) || x.compraLineaId <= 0 || !Number.isFinite(x.cantidad) || x.cantidad <= 0 || Math.round(x.cantidad * 1000) !== x.cantidad * 1000)) {
      return json({ error: 'INVALID_PURCHASE_RETURN', message: 'Verifica compra, motivo, líneas y cantidades.' }, 400);
    }
    if (new Set(payload.lineas.map(x => x.compraLineaId)).size !== payload.lineas.length) return json({ error: 'DUPLICATE_PURCHASE_LINES', message: 'No repitas líneas de compra.' }, 400);
    const encoded = JSON.stringify({ p_payload: payload });
    if (encoded.length > 16000) return json({ error: 'PURCHASE_RETURN_TOO_LARGE' }, 413);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_compra_devolucion_registrar_auth', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' }, body: encoded,
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'PURCHASE_RETURN_MIGRATION_REQUIRED', message: 'La devolución definitiva no está instalada en staging; no se modificó el inventario.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'PURCHASE_RETURN_FORBIDDEN', message: 'La sesión no tiene permiso para devolver esta compra.' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'PURCHASE_RETURN_UNAVAILABLE', message: 'No se pudo confirmar la devolución en Supabase.' }, 502); }
  }

  // Anulación conservadora de compra: la RPC valida pagos, devoluciones y stock intacto.
  if (request.method === 'POST' && route === 'purchases/cancel') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    const payload = body?.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        !Number.isSafeInteger(payload.compraId) || payload.compraId <= 0 ||
        typeof payload.motivo !== 'string' || payload.motivo.trim().length < 5 || payload.motivo.length > 500) {
      return json({ error: 'INVALID_PURCHASE_CANCEL', message: 'Indica una compra válida y un motivo de al menos 5 caracteres.' }, 400);
    }
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_compra_anular_auth', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify({ p_payload: payload }),
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'PURCHASE_CANCEL_MIGRATION_REQUIRED', message: 'La anulación segura no está instalada en staging; no se modificó la compra.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'PURCHASE_CANCEL_FORBIDDEN', message: 'La sesión no tiene permiso para anular esta compra.' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'PURCHASE_CANCEL_UNAVAILABLE', message: 'No se pudo confirmar la anulación en Supabase.' }, 502); }
  }

  // Órdenes de compra: listado, creación, detalle, envío, cancelación y recepción parcial en RPC.
  if ((request.method === 'GET' && route === 'purchases/orders') || (request.method === 'POST' && route === 'purchases/orders')) {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    let action, payload;
    if (request.method === 'GET') {
      const url = new URL(request.url); action = url.searchParams.get('ordenId') ? 'detail' : 'list';
      payload = { sucursalId: url.searchParams.get('sucursalId'), ordenId: url.searchParams.get('ordenId') };
    } else {
      let body; try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
      action = body?.action; payload = body?.payload;
    }
    const allowed = new Set(['list','detail','create','send','cancel','receive']);
    if (!allowed.has(action) || !payload || typeof payload !== 'object' || Array.isArray(payload)) return json({ error: 'INVALID_PURCHASE_ORDER', message: 'La operación de orden no es válida.' }, 400);
    if (action === 'create' && (!Number.isSafeInteger(Number(payload.sucursalId)) || Number(payload.sucursalId) <= 0 || !Number.isSafeInteger(Number(payload.proveedorId)) || Number(payload.proveedorId) <= 0 || !Array.isArray(payload.lineas) || payload.lineas.length < 1 || payload.lineas.length > 200)) return json({ error: 'INVALID_PURCHASE_ORDER', message: 'Verifica sucursal, proveedor y líneas de la orden.' }, 400);
    if (action === 'receive' && (!Number.isSafeInteger(Number(payload.ordenId)) || Number(payload.ordenId) <= 0 || typeof payload.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{12,80}$/.test(payload.idempotencyKey) || !Array.isArray(payload.lineas) || !payload.lineas.length || payload.lineas.length > 200)) return json({ error: 'INVALID_ORDER_RECEIPT', message: 'La recepción parcial no cumple los datos mínimos.' }, 400);
    if (action === 'receive' && new Set(payload.lineas.map(x => x?.ordenLineaId)).size !== payload.lineas.length) return json({ error: 'DUPLICATE_ORDER_LINES', message: 'No repitas líneas en una recepción.' }, 400);
    const encoded = JSON.stringify({ p_action: action, p_payload: payload });
    if (encoded.length > 64000) return json({ error: 'PURCHASE_ORDER_TOO_LARGE' }, 413);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_ordenes_compra_auth', supabase), { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' }, body: encoded });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'PURCHASE_ORDERS_MIGRATION_REQUIRED', message: 'Las órdenes de compra aún no están instaladas en staging; no se modificó la orden.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'PURCHASE_ORDERS_FORBIDDEN' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'PURCHASE_ORDERS_UNAVAILABLE', message: 'No se pudo contactar con Supabase.' }, 502); }
  }

  // CRUD de clientes y proveedores: empresa derivada de auth.uid() dentro de SQL.
  if (request.method === 'POST' && route === 'parties/mutate') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    const actions = new Set(['customer_create','customer_update','customer_deactivate','supplier_create','supplier_update','supplier_deactivate']);
    if (!body || !actions.has(body.action) || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) return json({ error: 'INVALID_PARTY_MUTATION' }, 400);
    // Evita enviar cuerpos excesivos desde el navegador a la función RPC.
    const encodedBody = JSON.stringify({ p_action: body.action, p_payload: body.payload });
    if (encodedBody.length > 32_000) return json({ error: 'PARTY_PAYLOAD_TOO_LARGE', message: 'Los datos del cliente o proveedor exceden el tamaño permitido.' }, 413);
    let response;
    try {
      response = await fetch(new URL('/rest/v1/rpc/pos_terceros_mutar_auth', supabase), {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: encodedBody,
      });
    } catch {
      return json({ error: 'PARTIES_UNAVAILABLE', message: 'No se pudo contactar con Supabase. Verifica tu conexión e inténtalo nuevamente.' }, 502);
    }
    const payload = await response.text();
    if (response.status === 404) return json({ error: 'PARTIES_MIGRATION_REQUIRED', message: 'Falta instalar la migración de clientes y proveedores en staging.' }, 409);
    if (response.status === 401 || response.status === 403) return json({ error: 'PARTIES_FORBIDDEN' }, 403);
    return new Response(payload, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
  }

  // CRUD de variantes: la empresa y el usuario se derivan en SQL desde auth.uid().
  if (request.method === 'POST' && route === 'catalog/variant-mutate') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON' }, 400); }
    const actions = new Set(['variant_create', 'variant_update', 'variant_deactivate']);
    if (!body || !actions.has(body.action) || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      return json({ error: 'INVALID_VARIANT_MUTATION' }, 400);
    }
    const response = await fetch(new URL('/rest/v1/rpc/pos_variante_mutar_auth', supabase), {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
      body: JSON.stringify({ p_action: body.action, p_payload: body.payload }),
    }).catch(() => null);
    if (!response) return json({ error: 'VARIANT_UNAVAILABLE' }, 502);
    const payload = await response.text();
    if (response.status === 404) return json({ error: 'VARIANT_MIGRATION_REQUIRED', message: 'Falta instalar la migración de variantes en staging.' }, 409);
    if (response.status === 401 || response.status === 403) return json({ error: 'VARIANT_FORBIDDEN' }, 403);
    return new Response(payload, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
  }

  // Catálogo de solo lectura: la función SQL deriva empresa/usuario desde auth.uid().
  // El cliente solo puede elegir una sucursal que ya tenga asignada.
  if (request.method === 'GET' && route === 'catalog/base') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    const branchRaw = new URL(request.url).searchParams.get('sucursal_id');
    const branchId = branchRaw === null ? null : Number(branchRaw);
    if (branchRaw !== null && (!Number.isSafeInteger(branchId) || branchId <= 0)) {
      return json({ error: 'INVALID_BRANCH', message: 'La sucursal solicitada no es válida.' }, 400);
    }
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_catalogo_base_auth', supabase), {
        method: 'POST',
        headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: JSON.stringify({ p_sucursal_id: branchId }),
      });
      const payload = await response.text();
      if (response.status === 401 || response.status === 403) return json({ error: 'INVALID_SESSION' }, 401);
      if (response.status === 404) return json({ error: 'CATALOG_MIGRATION_REQUIRED', message: 'Falta instalar la función SQL de catálogo en el entorno de pruebas.' }, 409);
      return new Response(payload, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch { return json({ error: 'CATALOG_UNAVAILABLE' }, 502); }
  }

  // Registro transaccional de devolución de venta. La RPC deriva usuario/empresa desde auth.uid().
  if (request.method === 'POST' && route === 'returns/register') {
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON', message: 'El cuerpo debe ser JSON válido.' }, 400); }
    const comprobanteId = Number(body?.comprobanteId);
    const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : '';
    const key = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    const lineas = body?.lineas;
    const pagos = body?.pagos;
    if (!Number.isSafeInteger(comprobanteId) || comprobanteId <= 0 ||
        motivo.length < 5 || motivo.length > 500 ||
        !/^[A-Za-z0-9._:-]{8,100}$/.test(key) ||
        !Array.isArray(lineas) || lineas.length < 1 || lineas.length > 100 ||
        lineas.some(x => !x || !Number.isSafeInteger(Number(x.comprobanteLineaId)) || Number(x.comprobanteLineaId) <= 0 ||
          !Number.isFinite(Number(x.cantidad)) || Number(x.cantidad) <= 0 || Math.round(Number(x.cantidad) * 1000) !== Number(x.cantidad) * 1000 ||
          (x.reingresarStock !== undefined && typeof x.reingresarStock !== 'boolean')) ||
        new Set(lineas.map(x => Number(x.comprobanteLineaId))).size !== lineas.length ||
        !Array.isArray(pagos) || pagos.length > 4 ||
        pagos.some(x => !x || !['EFECTIVO','TARJETA','YAPE','PLIN'].includes(x.metodoPago) ||
          !Number.isFinite(Number(x.monto)) || Number(x.monto) <= 0 || Math.round(Number(x.monto) * 100) !== Number(x.monto) * 100 ||
          (x.referencia != null && (typeof x.referencia !== 'string' || x.referencia.trim().length > 120)))) {
      return json({ error: 'INVALID_RETURN_PAYLOAD', message: 'Verifica comprobante, motivo, clave, líneas y medios de reembolso.' }, 400);
    }
    if (new Set(pagos.map(x => x.metodoPago)).size !== pagos.length) {
      return json({ error: 'DUPLICATE_RETURN_PAYMENT_METHOD', message: 'Consolida los importes de cada medio de reembolso.' }, 400);
    }
    const encoded = JSON.stringify({
      p_comprobante_id: comprobanteId,
      p_motivo: motivo,
      p_lineas: lineas.map(x => ({ comprobanteLineaId: Number(x.comprobanteLineaId), cantidad: Number(x.cantidad), reingresarStock: x.reingresarStock !== false })),
      p_pagos: pagos.map(x => ({ metodoPago: x.metodoPago, monto: Number(x.monto), referencia: x.referencia?.trim() || null })),
      p_idempotency_key: key,
    });
    if (encoded.length > 32000) return json({ error: 'RETURN_PAYLOAD_TOO_LARGE', message: 'La devolución supera el tamaño permitido.' }, 413);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/pos_registrar_devolucion', supabase), {
        method: 'POST',
        headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'accept-profile': 'public', 'content-profile': 'public' },
        body: encoded,
      });
      const result = await response.text();
      if (response.status === 404) return json({ error: 'RETURN_REGISTER_NOT_INSTALLED', message: 'La RPC transaccional de devoluciones no está disponible en Supabase.' }, 409);
      if (response.status === 401 || response.status === 403) return json({ error: 'RETURN_REGISTER_FORBIDDEN', message: 'La sesión no tiene autorización para registrar esta devolución.' }, 403);
      return new Response(result, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch {
      return json({ error: 'RETURN_REGISTER_UNAVAILABLE', message: 'No se pudo confirmar la devolución en Supabase. Conserva la misma clave para reintentar.' }, 502);
    }
  }

  if (request.method === 'POST' && route.startsWith('rpc/')) {
    const rpcName = route.slice(4);
    const allowlist = String(env.SUPABASE_RPC_ALLOWLIST || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(rpcName) || !allowlist.includes(rpcName)) {
      return json({ error: 'RPC_NOT_ALLOWED', message: 'La función RPC no está habilitada en la lista permitida.' }, 403);
    }
    const token = getBearer(request);
    if (!token) return json({ error: 'UNAUTHORIZED', message: 'Falta la sesión Bearer de Supabase.' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'INVALID_JSON', message: 'El cuerpo debe ser JSON válido.' }, 400); }
    try {
      const response = await fetch(new URL(`/rest/v1/rpc/${rpcName}`, supabase), {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'accept-profile': 'public',
          'content-profile': 'public',
        },
        body: JSON.stringify(body),
      });
      const payload = await response.text();
      return new Response(payload, { status: response.status, headers: { ...JSON_HEADERS, 'content-type': response.headers.get('content-type') || JSON_HEADERS['content-type'] } });
    } catch {
      return json({ error: 'SUPABASE_RPC_UNAVAILABLE', message: 'No se pudo ejecutar la operación en Supabase.' }, 502);
    }
  }

  return json({
    error: 'EDGE_ROUTE_NOT_MIGRATED',
    message: 'Este módulo todavía utiliza la API anterior. No se ha activado una ruta incompleta para operaciones del POS.',
    route,
  }, 501);
}
