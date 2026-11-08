import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('axios', () => ({ default: { post } }));
vi.mock('./client', () => ({ getAccessToken: () => 'valid-supabase-jwt' }));

import { crearVentaSupabase, consultarEstadoVentaSupabase, obtenerClaveVentaSupabase, limpiarClaveVentaSupabase, guardarIntentoVentaPendienteSupabase, obtenerIntentoVentaPendienteSupabase, consultarDetalleComprobanteSupabase } from './supabaseSales';

const payload = {
  sucursalId: 2,
  clienteId: 8,
  tipo: '03' as const,
  pagos: [{ metodo: 'EFECTIVO' as const, monto: 10, montoRecibido: 10 }],
  descuentoGlobal: 0,
  lineas: [{ productoId: 12, cantidad: 1, precioUnitario: 10, descuento: 0 }],
  idempotencyKey: 'sale-test-1',
};

describe('adaptador de ventas Supabase', () => {
  beforeEach(() => { post.mockReset(); localStorage.clear(); });

  it('llama exclusivamente a la RPC autenticada con p_payload', async () => {
    post.mockResolvedValue({ data: { ok: true, decision: 'CREATED', comprobanteId: 90, serie: 'B001', correlativo: 5, total: 10 } });
    const result = await crearVentaSupabase(payload);
    expect(post).toHaveBeenCalledWith('/api/edge/rpc/pos_venta_crear_auth', { p_payload: payload }, expect.objectContaining({
      headers: { Authorization: 'Bearer valid-supabase-jwt' },
      timeout: 45000,
    }));
    expect(result.comprobanteId).toBe(90);
    expect(result.serie).toBe('B001');
  });

  it('rechaza respuesta sin confirmación completa', async () => {
    post.mockResolvedValue({ data: { ok: true, comprobanteId: 90 } });
    await expect(crearVentaSupabase(payload)).rejects.toThrow(/confirmación completa/);
  });

  it('no llama a red si falta cliente remoto o la clave', async () => {
    await expect(crearVentaSupabase({ ...payload, clienteId: 0 })).rejects.toThrow(/cliente/);
    await expect(crearVentaSupabase({ ...payload, idempotencyKey: '' })).rejects.toThrow(/clave/);
    expect(post).not.toHaveBeenCalled();
  });

  it('conserva el mensaje de rechazo y no intenta una segunda API', async () => {
    post.mockRejectedValue({ response: { status: 403, data: { message: 'RPC no permitida' } } });
    await expect(crearVentaSupabase(payload)).rejects.toThrow(/no está habilitada en Cloudflare/);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('recupera una venta confirmada si la respuesta inicial se pierde', async () => {
    post.mockRejectedValueOnce({ isAxiosError: true, message: 'timeout' })
      .mockResolvedValueOnce({ data: {
        ok: true, existente: true, decision: 'SALE_CONFIRMED',
        comprobanteId: 91, tipo: '03', serie: 'B001', correlativo: 6,
        total: 10, pagos: [{ metodo: 'YAPE', monto: 10 }],
      } });
    const result = await crearVentaSupabase(payload);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][0]).toBe('/api/edge/sales/idempotency-check');
    expect(post.mock.calls[1][1]).toEqual({ payload });
    expect(result.comprobanteId).toBe(91);
    expect(result.idempotentReplay).toBe(true);
  });

  it('mantiene resultado ambiguo si la preconsulta aún no ve la venta', async () => {
    post.mockRejectedValueOnce({ isAxiosError: true, message: 'network' })
      .mockResolvedValueOnce({ data: { ok: true, existente: false, decision: 'NOT_FOUND_YET' } });
    await expect(crearVentaSupabase(payload)).rejects.toThrow(/podría seguir en curso/);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual({ payload });
  });

  it('consulta el detalle oficial de comprobante con ID validado', async () => {
    const detail = { id: 90, serie: 'B001', correlativo: 5, total: 10, cliente: { nombre: 'Cliente' }, lineas: [{ productoId: 12 }], pagos: [{ metodoPago: 'YAPE', monto: 10 }] };
    post.mockResolvedValue({ data: detail });
    await expect(consultarDetalleComprobanteSupabase(90)).resolves.toEqual(detail);
    expect(post).toHaveBeenCalledWith('/api/edge/sales/comprobante-detail', { comprobanteId: 90 }, expect.objectContaining({ timeout: 20000 }));
  });

  it('rechaza detalle incompleto y no valida IDs incorrectos', async () => {
    await expect(consultarDetalleComprobanteSupabase(0)).rejects.toThrow(/identificador/);
    post.mockResolvedValue({ data: { id: 90, serie: 'B001' } });
    await expect(consultarDetalleComprobanteSupabase(90)).rejects.toThrow(/incompleto/);
  });

  it('consulta estado de forma aislada sin ejecutar el RPC de creación', async () => {
    post.mockResolvedValue({ data: { ok: true, existente: false, decision: 'NOT_FOUND_YET' } });
    const result = await consultarEstadoVentaSupabase(payload);
    expect(result.existente).toBe(false);
    expect(post).toHaveBeenCalledWith('/api/edge/sales/idempotency-check', { payload }, expect.any(Object));
  });

  it('conserva la misma clave en almacenamiento durable entre recargas', () => {
    const a = obtenerClaveVentaSupabase('user:2', 'fingerprint-123');
    const b = obtenerClaveVentaSupabase('user:2', 'fingerprint-123');
    expect(a).toBe(b);
    expect(localStorage.getItem('micarrito:sale-idempotency:user:2')).toContain(a);
    limpiarClaveVentaSupabase('user:2');
    expect(obtenerClaveVentaSupabase('user:2', 'fingerprint-123')).not.toBe(a);
  });

  it('persiste el snapshot exacto sin credenciales y lo recupera después de reiniciar la vista', () => {
    const key = obtenerClaveVentaSupabase('user:2', 'fingerprint-123');
    const snapshot = { ...payload, idempotencyKey: key };
    guardarIntentoVentaPendienteSupabase('user:2', 'fingerprint-123', snapshot);
    const restored = obtenerIntentoVentaPendienteSupabase('user:2');
    expect(restored?.payload).toEqual(snapshot);
    expect(JSON.stringify(restored)).not.toMatch(/Bearer|access_token|refresh_token/i);
  });

  it('persiste el snapshot del ticket para reconstruirlo tras iniciar sesión', () => {
    const key = obtenerClaveVentaSupabase('user:2', 'fingerprint-ticket');
    const ticket = {
      serie: 'B001', correlativo: 1, tipoComprobante: '03' as const,
      cliente: { tipoDoc: 'DNI' as const, numero: '00000000', nombre: 'CONSUMIDOR FINAL' },
      lineas: [{ codigo: 'P01', nombre: 'Producto', cantidad: 1, precioUnitario: 10, tipoIgv: '10' as const, descuento: 0 }],
      pagos: [{ metodo: 'YAPE' as const, monto: 10 }], fecha: '2026-11-07T12:00:00.000Z', usuarioId: 'user-2',
      opGravadas: 8.47, opExoneradas: 0, opInafectas: 0, descuentoTotal: 0, igvTotal: 1.53, total: 10, estadoFE: 'Pendiente' as const,
      idempotencyKey: key,
    };
    guardarIntentoVentaPendienteSupabase('user:2', 'fingerprint-ticket', { ...payload, idempotencyKey: key }, ticket);
    expect(obtenerIntentoVentaPendienteSupabase('user:2')?.ticketSnapshot).toEqual(ticket);
  });

  it('bloquea un carrito distinto mientras exista un intento ambiguo', () => {
    const key = obtenerClaveVentaSupabase('user:2', 'fingerprint-123');
    guardarIntentoVentaPendienteSupabase('user:2', 'fingerprint-123', { ...payload, idempotencyKey: key });
    expect(() => obtenerClaveVentaSupabase('user:2', 'fingerprint-456')).toThrow(/cobro anterior pendiente/);
  });

  it('no permite reemplazar un intento pendiente con otro payload', () => {
    const key = obtenerClaveVentaSupabase('user:2', 'fingerprint-123');
    guardarIntentoVentaPendienteSupabase('user:2', 'fingerprint-123', { ...payload, idempotencyKey: key });
    expect(() => guardarIntentoVentaPendienteSupabase('user:2', 'fingerprint-456', { ...payload, idempotencyKey: 'sale-other' })).toThrow(/otro cobro pendiente/);
  });
});
