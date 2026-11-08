import { db } from '../db';
import { api } from './client';
import type { PendingItem, Venta } from '../types';

// Cola de sincronización offline-first.
// Si una petición falla o no hay conexión (navigator.onLine === false),
// se encola en IndexedDB (pending_sales / pending_docs).
// Al recuperar conexión (evento 'online') se reintenta el envío.

export type TipoCola = 'venta' | 'comprobante';

/** Encola un item pendiente de sincronización. */
export async function encolar(tipo: TipoCola, payload: unknown, usuarioId?: string): Promise<void> {
  const idempotencyKey = (payload as { idempotencyKey?: string })?.idempotencyKey;
  let usuarioActual: string | undefined;
  try { usuarioActual = JSON.parse(localStorage.getItem('micarrito_usuario') || 'null')?.id; } catch { usuarioActual = undefined; }
  const item: PendingItem = {
    tipo,
    payload,
    idempotencyKey,
    usuarioId: usuarioId || usuarioActual,
    intentos: 0,
    createdAt: new Date().toISOString(),
  };
  if (tipo === 'venta') {
    await db.pending_sales.add(item);
  } else {
    await db.pending_docs.add(item);
  }
}

/** Guarda la venta localmente (caché) y la encola para envío al backend. */
export async function guardarVentaOffline(venta: Venta, payload: unknown = venta): Promise<void> {
  await db.ventas.add({ ...venta, enCola: true, estadoFE: 'Pendiente' });
  await encolar('venta', payload, venta.usuarioId);
}

/** Reintenta enviar todos los items pendientes de una tabla. */
async function procesarCola(tabla: 'pending_sales' | 'pending_docs', endpoint: string, forzarRevision = false): Promise<{ enviados: number; requierenRevision: number }> {
  const items = await db[tabla].toArray();
  let enviados = 0;
  let requierenRevision = 0;
  let usuarioActivo: string | undefined;
  try { usuarioActivo = JSON.parse(localStorage.getItem('micarrito_usuario') || 'null')?.id; } catch { usuarioActivo = undefined; }
  for (const item of items) {
    if (item.usuarioId && usuarioActivo && String(item.usuarioId) !== String(usuarioActivo)) continue;
    if (item.needsReview && !forzarRevision) { requierenRevision++; continue; }
    try {
      const response = await api.post(endpoint, item.payload);
      await db[tabla].delete(item.id!);
      // La clave idempotente identifica la venta, aunque el servidor asigne otra serie/correlativo.
      if (tabla === 'pending_sales' && item.idempotencyKey) {
        const local = await db.ventas.where('idempotencyKey').equals(item.idempotencyKey).first();
        if (local?.id) {
          await db.ventas.update(local.id, {
            serverId: response.data?.id ?? local.serverId,
            serie: response.data?.serie ?? local.serie,
            correlativo: response.data?.correlativo ?? local.correlativo,
            enCola: false,
            estadoFE: 'Enviando',
          });
        }
      }
      enviados++;
    } catch (error: any) {
      const status = Number(error?.response?.status || 0);
      const mensaje = String(error?.response?.data?.message || error?.message || 'Error de sincronización');
      const definitivo = status >= 400 && status < 500;
      await db[tabla].update(item.id!, {
        intentos: (item.intentos || 0) + 1,
        needsReview: definitivo,
        ultimoError: mensaje,
        ultimoEstadoHttp: status || undefined,
      });
      if (definitivo) {
        requierenRevision++;
        if (tabla === 'pending_sales' && item.idempotencyKey) {
          const local = await db.ventas.where('idempotencyKey').equals(item.idempotencyKey).first();
          if (local?.id) await db.ventas.update(local.id, {
            estadoFE: 'Rechazado', enCola: false, cdrObservacion: mensaje,
          });
        }
      }
    }
  }
  return { enviados, requierenRevision };
}


/** Reintenta envíos de correo de comprobantes ya sincronizados en el backend. */
async function procesarColaDocumentos(): Promise<{ enviados: number; requierenRevision: number }> {
  const items = await db.pending_docs.toArray();
  let enviados = 0;
  let requierenRevision = 0;
  let usuarioActivo: string | undefined;
  try { usuarioActivo = JSON.parse(localStorage.getItem('micarrito_usuario') || 'null')?.id; } catch { usuarioActivo = undefined; }

  for (const item of items) {
    if (item.usuarioId && usuarioActivo && String(item.usuarioId) !== String(usuarioActivo)) continue;
    if (item.needsReview) { requierenRevision++; continue; }
    const payload = item.payload as { accion?: string; serverId?: number; email?: string };
    if (payload?.accion !== 'enviar-email' || !Number.isSafeInteger(payload.serverId) || Number(payload.serverId) <= 0 || !payload.email) {
      await db.pending_docs.update(item.id!, {
        needsReview: true, ultimoError: 'Documento pendiente sin acción, ID de servidor o correo válido.',
      });
      requierenRevision++;
      continue;
    }
    try {
      const response = await api.post(`/fe/comprobantes/${payload.serverId}/enviar-email`, { email: payload.email });
      if (response.data?.estado === 'FALLIDO' || response.data?.simulado) {
        await db.pending_docs.update(item.id!, {
          needsReview: true,
          ultimoError: response.data?.mensajeError || (response.data?.simulado ? 'El envío fue simulado y no llegó al destinatario.' : 'El servidor registró un envío fallido.'),
        });
        requierenRevision++;
        continue;
      }
      if (response.data?.estado !== 'ENVIADO') {
        await db.pending_docs.update(item.id!, { needsReview: true, ultimoError: 'El servidor no confirmó el envío del correo.' });
        requierenRevision++;
        continue;
      }
      await db.pending_docs.delete(item.id!);
      enviados++;
    } catch (error: any) {
      const status = Number(error?.response?.status || 0);
      const mensaje = String(error?.response?.data?.message || error?.message || 'Error de envío de correo');
      // Un timeout/5xx puede ocurrir después de que SMTP haya aceptado el mensaje.
      // Requiere revisión manual para evitar duplicar correos en reintentos automáticos.
      await db.pending_docs.update(item.id!, {
        intentos: (item.intentos || 0) + 1,
        needsReview: true,
        ultimoError: mensaje,
        ultimoEstadoHttp: status || undefined,
      });
      requierenRevision++;
    }
  }
  return { enviados, requierenRevision };
}

/** Dispara la sincronización de ambas colas. Los 4xx quedan en revisión manual. */
export async function sincronizarPendientes(forzarRevision = false): Promise<{ ventas: number; docs: number; requierenRevision: number }> {
  if (!navigator.onLine || sincronizando) return { ventas: 0, docs: 0, requierenRevision: 0 };
  sincronizando = true;
  try {
    if (forzarRevision) {
      for (const tabla of ['pending_sales', 'pending_docs'] as const) {
        const items = await db[tabla].toArray();
        for (const item of items) if (item.needsReview && item.id) {
          await db[tabla].update(item.id, { needsReview: false, ultimoError: undefined, ultimoEstadoHttp: undefined });
        }
      }
    }
    const [ventas, docs] = await Promise.all([
      procesarCola('pending_sales', '/ventas', forzarRevision),
      procesarColaDocumentos(),
    ]);
    return {
      ventas: ventas.enviados,
      docs: docs.enviados,
      requierenRevision: ventas.requierenRevision + docs.requierenRevision,
    };
  } finally {
    sincronizando = false;
  }
}

let iniciado = false;
let sincronizando = false;

/** Registra el listener del evento 'online' para reintentar automáticamente. */
export function iniciarSyncListener(onSync?: (res: { ventas: number; docs: number; requierenRevision: number }) => void): void {
  if (iniciado) return;
  iniciado = true;
  window.addEventListener('online', async () => {
    const res = await sincronizarPendientes();
    onSync?.(res);
  });
  // Intento inicial al cargar la app.
  sincronizarPendientes().then((res) => onSync?.(res)).catch(() => undefined);
}
