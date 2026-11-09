import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, PackageCheck, RefreshCw, RotateCcw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, ES_MODO_DEMO, ES_SUPABASE_AUTH } from '../api/client';
import { fetchSupabaseReturns, searchSupabaseReturnReceipts, fetchSupabaseReturnAvailability } from '../api/supabaseReturns';
import { useAuth } from '../context/AuthContext';
import { formatearMoneda } from '../utils/igv';

type VentaResumen = {
  id: number; tipo: string; serie: string; correlativo: number; total: number | string;
  estado: string; fechaEmision: string; cliente?: { nombre?: string };
};
type LineaDisponible = {
  comprobanteLineaId: number; productoId: number; codigo: string; productoNombre: string;
  cantidadOriginal: number | string; cantidadDevuelta: number | string; cantidadDisponible: number | string;
  importeOriginal: number | string; importeDisponible: number | string;
};
type Disponibilidad = {
  comprobante: { id: number; sucursalId: number; tipo: string; serie: string; correlativo: number; total: number | string; clienteNombre: string };
  lineas: LineaDisponible[];
  cuentaCredito: { saldoPendiente: number | string; totalCredito: number | string } | null;
};
type LineaSeleccion = { comprobanteLineaId: number; cantidad: number; reingresarStock: boolean };
type Medio = 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TARJETA';
type Devolucion = {
  id: number; comprobanteId: number; serie: string; correlativo: number; tipo: string;
  clienteNombre: string; responsable: string; motivo: string; totalDevolucion: number | string;
  creditoRevertido: number | string; montoReembolsado: number | string; createdAt: string;
  notaCreditoId?: number | null; notaCreditoSerie?: string | null; notaCreditoCorrelativo?: number | null;
};

const money = (v: number | string | null | undefined) => formatearMoneda(Number(v || 0));
const claveNueva = () => `return-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export default function Devoluciones() {
  const { usuario } = useAuth();
  const sucursalId = Number(usuario?.sucursalId || 0);
  const [ventas, setVentas] = useState<VentaResumen[]>([]);
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [ventaId, setVentaId] = useState('');
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad | null>(null);
  const [seleccion, setSeleccion] = useState<Record<number, LineaSeleccion>>({});
  const [motivo, setMotivo] = useState('');
  const [medio, setMedio] = useState<Medio>('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  async function recargar() {
    if (ES_MODO_DEMO || !sucursalId) return;
    setCargando(true);
    try {
      if (ES_SUPABASE_AUTH) {
        const historial = await fetchSupabaseReturns(sucursalId);
        setVentas([]);
        setDevoluciones(historial);
      } else {
        const [rVentas, rDevoluciones] = await Promise.all([
          api.get('/ventas', { params: { sucursalId } }),
          api.get('/devoluciones', { params: { sucursalId } }),
        ]);
        setVentas((rVentas.data || []).filter((v: VentaResumen) => ['01', '03'].includes(v.tipo) && v.estado !== 'ANULADA'));
        setDevoluciones(rDevoluciones.data || []);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo cargar el historial de devoluciones');
    } finally { setCargando(false); }
  }

  useEffect(() => { recargar(); }, [sucursalId]);

  async function seleccionarVenta(id: string) {
    setVentaId(id);
    setDisponibilidad(null);
    setSeleccion({});
    if (!id) return;
    try {
      const r = ES_SUPABASE_AUTH
        ? { data: await fetchSupabaseReturnAvailability(Number(id)) }
        : await api.get(`/devoluciones/ventas/${id}/disponibilidad`);
      setDisponibilidad(r.data);
      const inicial: Record<number, LineaSeleccion> = {};
      (r.data.lineas || []).forEach((l: LineaDisponible) => {
        inicial[Number(l.comprobanteLineaId)] = {
          comprobanteLineaId: Number(l.comprobanteLineaId), cantidad: 0, reingresarStock: true,
        };
      });
      setSeleccion(inicial);
    } catch (error: any) { toast.error(error?.response?.data?.message || 'No se pudo consultar el comprobante'); }
  }

  const lineasElegidas = useMemo(() => Object.values(seleccion).filter((l) => l.cantidad > 0), [seleccion]);
  const totalDevolucion = useMemo(() => {
    if (!disponibilidad) return 0;
    return round2(lineasElegidas.reduce((sum, selected) => {
      const original = disponibilidad.lineas.find((l) => Number(l.comprobanteLineaId) === selected.comprobanteLineaId);
      if (!original) return sum;
      const disponibleQty = Number(original.cantidadDisponible);
      const importeDisponible = Number(original.importeDisponible);
      const importe = Math.abs(selected.cantidad - disponibleQty) < 0.0001
        ? importeDisponible
        : round2(Number(original.importeOriginal) * selected.cantidad / Number(original.cantidadOriginal));
      return sum + importe;
    }, 0));
  }, [disponibilidad, lineasElegidas]);
  const creditoAplicado = Math.min(totalDevolucion, Number(disponibilidad?.cuentaCredito?.saldoPendiente || 0));
  const reembolso = round2(totalDevolucion - creditoAplicado);

  const ventasFiltradas = useMemo(() => ventas.slice(0, 100), [ventas]);

  async function buscarComprobantes() {
    const q = busqueda.trim();
    if (q.length < 2) { await recargar(); return; }
    setCargando(true);
    try {
      const resultados = ES_SUPABASE_AUTH
        ? await searchSupabaseReturnReceipts(q, sucursalId)
        : (await api.get('/devoluciones/ventas/buscar', { params: { q, sucursalId } })).data;
      setVentas((resultados || []).filter((v: VentaResumen) => ['01', '03'].includes(v.tipo) && v.estado !== 'ANULADA'));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo buscar el comprobante');
    } finally { setCargando(false); }
  }

  function actualizarLinea(id: number, patch: Partial<LineaSeleccion>) {
    setSeleccion((actual) => ({ ...actual, [id]: { ...actual[id], ...patch } }));
  }

  async function registrarDevolucion() {
    if (!disponibilidad || !lineasElegidas.length) { toast.error('Seleccione las cantidades que se devolverán'); return; }
    if (motivo.trim().length < 5) { toast.error('Indique un motivo de al menos 5 caracteres'); return; }
    if (reembolso > 0 && ['YAPE', 'PLIN'].includes(medio) && !referencia.trim()) {
      toast.error('Ingrese el número de operación del reembolso'); return;
    }
    const payloadBase = {
      motivo: motivo.trim(),
      lineas: lineasElegidas.map((l) => ({ ...l })),
      pagos: reembolso > 0 ? [{ metodoPago: medio, monto: reembolso, referencia: referencia.trim() || undefined }] : [],
    };
    const claveStorage = `mi-carrito-pos:devolucion-pendiente:${usuario?.id || 'anon'}:${disponibilidad.comprobante.id}`;
    let operacion: any;
    try {
      const pendiente = localStorage.getItem(claveStorage);
      if (pendiente) {
        const guardado = JSON.parse(pendiente);
        const comparable = JSON.stringify({ motivo: payloadBase.motivo, lineas: payloadBase.lineas, pagos: payloadBase.pagos });
        if (guardado.huella !== comparable) {
          toast.error('Hay un intento anterior sin confirmar. Repita exactamente los mismos datos o revise el historial antes de cambiar la devolución.');
          return;
        }
        operacion = guardado;
      } else {
        const huella = JSON.stringify({ motivo: payloadBase.motivo, lineas: payloadBase.lineas, pagos: payloadBase.pagos });
        operacion = { huella, clave: claveNueva(), payload: payloadBase };
        localStorage.setItem(claveStorage, JSON.stringify(operacion));
      }
    } catch {
      toast.error('No se pudo guardar la clave de seguridad de la operación.'); return;
    }
    setGuardando(true);
    try {
      await api.post(`/devoluciones/ventas/${disponibilidad.comprobante.id}`, { ...operacion.payload, idempotencyKey: operacion.clave });
      localStorage.removeItem(claveStorage);
      toast.success('Devolución registrada correctamente');
      setVentaId(''); setDisponibilidad(null); setSeleccion({}); setMotivo(''); setReferencia('');
      setMostrarFormulario(false);
      await recargar();
    } catch (error: any) {
      const status = Number(error?.response?.status || 0);
      if ([400, 401, 403, 404, 409, 422].includes(status)) localStorage.removeItem(claveStorage);
      toast.error(error?.response?.data?.message || 'No se confirmó la devolución. Reintente con los mismos datos.');
    } finally { setGuardando(false); }
  }

  async function emitirNotaCredito(devolucion: Devolucion) {
    try {
      const respuesta = await api.post(`/devoluciones/${devolucion.id}/nota-credito`);
      toast.success(`Nota de crédito ${respuesta.data.serie}-${String(respuesta.data.correlativo).padStart(8, '0')} registrada. Revise Facturación Electrónica para su estado.`);
      await recargar();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo registrar la nota de crédito');
    }
  }

  if (ES_MODO_DEMO) return <div className="card p-6 text-sm text-gray-600">Las devoluciones requieren conexión al backend y ejecutar la migración 0006.</div>;
  if (usuario?.rol !== 'ADMIN') return <div className="card p-6 text-sm text-gray-600">El registro de devoluciones está reservado al administrador.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-primario-700 flex items-center gap-2"><RotateCcw size={22} /> Devoluciones de clientes</h2>
          <p className="text-sm text-gray-500">Devoluciones parciales o totales, reingreso de stock y reembolsos por medio de pago.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secundario flex items-center gap-2" onClick={recargar} disabled={cargando}><RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /> Actualizar</button>
          <button className="btn-ambar flex items-center gap-2" onClick={() => setMostrarFormulario((v) => !v)}><RotateCcw size={16} /> {ES_SUPABASE_AUTH ? 'Consultar devolución' : 'Nueva devolución'}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-xs text-gray-500">Devoluciones registradas</div><div className="text-2xl font-bold text-primario-700">{devoluciones.length}</div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Importe devuelto</div><div className="text-2xl font-bold text-red-700">{money(devoluciones.reduce((s, d) => s + Number(d.totalDevolucion || 0), 0))}</div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Ajustes de crédito</div><div className="text-2xl font-bold text-primario-700">{money(devoluciones.reduce((s, d) => s + Number(d.creditoRevertido || 0), 0))}</div></div>
      </div>

      {ES_SUPABASE_AUTH && <div className="card p-4 text-sm text-amber-800 bg-amber-50">Modo Supabase: historial, búsqueda y disponibilidad están habilitados en solo lectura. El registro y la emisión de notas de crédito siguen bloqueados hasta completar y probar la operación transaccional.</div>}
      {mostrarFormulario && <div className="card p-4 sm:p-5 space-y-4">
        <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 rounded-lg p-3"><AlertTriangle size={18} className="shrink-0 mt-0.5" /><span>Seleccione el comprobante original. El sistema limitará las cantidades a lo que realmente se vendió y aún no se devolvió. Los importes se calculan en el servidor.</span></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Buscar comprobante</label>
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9" placeholder="Serie, número, DNI/RUC o cliente" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarComprobantes(); } }} /></div>
              <button type="button" className="btn-secundario" onClick={buscarComprobantes} disabled={cargando}>Buscar</button>
            </div>
            <select className="input" value={ventaId} onChange={(e) => seleccionarVenta(e.target.value)}>
              <option value="">Seleccione una venta</option>
              {ventasFiltradas.map((v) => <option key={v.id} value={v.id}>{v.serie}-{String(v.correlativo).padStart(8, '0')} · {v.cliente?.nombre || 'Sin cliente'} · {money(v.total)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Motivo de devolución</label>
            <textarea className="input min-h-[88px]" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Producto defectuoso, producto equivocado..." />
          </div>
        </div>

        {disponibilidad && <>
          <div className="flex flex-wrap gap-3 text-sm text-gray-600"><span><b>Comprobante:</b> {disponibilidad.comprobante.serie}-{String(disponibilidad.comprobante.correlativo).padStart(8, '0')}</span><span><b>Cliente:</b> {disponibilidad.comprobante.clienteNombre || 'Sin cliente'}</span><span><b>Crédito pendiente:</b> {money(disponibilidad.cuentaCredito?.saldoPendiente)}</span></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead><tr className="text-left border-b text-gray-500"><th className="py-2">Producto</th><th>Vendida</th><th>Devuelta</th><th>Disponible</th><th>Cantidad a devolver</th><th>Reingresar</th></tr></thead>
              <tbody>{disponibilidad.lineas.map((l) => {
                const id = Number(l.comprobanteLineaId); const state = seleccion[id]; const max = Number(l.cantidadDisponible);
                return <tr key={id} className="border-b border-gray-100"><td className="py-3"><div className="font-medium">{l.productoNombre}</div><div className="text-xs text-gray-500">{l.codigo}</div></td><td>{Number(l.cantidadOriginal)}</td><td>{Number(l.cantidadDevuelta)}</td><td>{max}</td><td><input className="input w-28" type="number" min="0" max={max} step="0.001" disabled={ES_SUPABASE_AUTH || max <= 0} value={state?.cantidad || ''} onChange={(e) => actualizarLinea(id, { cantidad: Math.min(max, Math.max(0, Number(e.target.value) || 0)) })} /></td><td><label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!state?.reingresarStock} disabled={ES_SUPABASE_AUTH} onChange={(e) => actualizarLinea(id, { reingresarStock: e.target.checked })} /> Sí</label></td></tr>;
              })}</tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="card bg-gray-50 p-3"><div className="text-xs text-gray-500">Total devolución</div><div className="text-xl font-bold">{money(totalDevolucion)}</div></div>
            <div className="card bg-gray-50 p-3"><div className="text-xs text-gray-500">Reducción de crédito</div><div className="text-xl font-bold">{money(creditoAplicado)}</div></div>
            <div className="card bg-gray-50 p-3"><div className="text-xs text-gray-500">Reembolso al cliente</div><div className="text-xl font-bold text-red-700">{money(reembolso)}</div></div>
          </div>
          {reembolso > 0 && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="label">Devolver mediante</label><select className="input" value={medio} onChange={(e) => setMedio(e.target.value as Medio)}><option value="EFECTIVO">Efectivo</option><option value="YAPE">Yape</option><option value="PLIN">Plin</option><option value="TARJETA">Tarjeta</option></select></div>
            <div><label className="label">Número de operación / referencia</label><input className="input" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Opcional, obligatorio para Yape y Plin" /></div>
          </div>}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t pt-4">
            <div className="text-xs text-gray-500">Se registrará una salida en caja por el importe reembolsado. El ajuste del crédito reduce la cuenta pendiente del cliente.</div>
            {!ES_SUPABASE_AUTH && <button className="btn-ambar flex items-center justify-center gap-2" onClick={registrarDevolucion} disabled={guardando || totalDevolucion <= 0 || !lineasElegidas.length}><CheckCircle2 size={16} /> {guardando ? 'Registrando...' : 'Confirmar devolución'}</button>}
          </div>
        </>}
      </div>}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between"><h3 className="font-semibold text-primario-700">Historial de devoluciones</h3><span className="text-xs text-gray-500">Últimas 300 · Sucursal activa</span></div>
        {devoluciones.length === 0 ? <div className="p-8 text-center text-sm text-gray-500"><PackageCheck size={30} className="mx-auto mb-2 text-gray-300" />Aún no hay devoluciones registradas.</div> : <div className="overflow-x-auto"><table className="w-full text-sm min-w-[900px]"><thead className="bg-gray-50 text-gray-500"><tr className="text-left"><th className="px-4 py-3">Fecha</th><th>Comprobante</th><th>Cliente</th><th>Motivo</th><th>Total</th><th>Crédito</th><th>Reembolso</th><th>Nota electrónica</th></tr></thead><tbody>{devoluciones.map((d) => <tr key={d.id} className="border-t"><td className="px-4 py-3 whitespace-nowrap">{new Date(d.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</td><td className="font-medium">{d.serie}-{String(d.correlativo).padStart(8, '0')}</td><td>{d.clienteNombre || 'Sin cliente'}</td><td className="max-w-[220px] truncate" title={d.motivo}>{d.motivo}</td><td className="font-semibold">{money(d.totalDevolucion)}</td><td>{money(d.creditoRevertido)}</td><td className="text-red-700">{money(d.montoReembolsado)}</td><td>{d.notaCreditoId ? <span className="text-emerald-700">{d.notaCreditoSerie}-{String(d.notaCreditoCorrelativo).padStart(8, '0')}</span> : (ES_SUPABASE_AUTH ? <span className="text-xs text-gray-500">Pendiente de integración</span> : <button className="text-xs text-primario-700 underline" onClick={() => emitirNotaCredito(d)}>Emitir nota de crédito</button>)}</td></tr>)}</tbody></table></div>}
      </div>
      <div className="text-xs text-gray-500 flex items-center gap-2"><Clock size={14} /> Reembolso en efectivo sujeto a saldo disponible en caja. Las cantidades y los importes finales se vuelven a validar en el servidor.</div>
    </div>
  );
}
