import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Banknote, CalendarClock, CheckCircle2, Clock3, CreditCard,
  History, RefreshCw, Search, Smartphone, Wallet, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, ES_MODO_DEMO } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatearMoneda } from '../utils/igv';

type Cuenta = {
  id: number;
  sucursalId: number;
  comprobanteId: number;
  totalCredito: number | string;
  saldoPendiente: number | string;
  fechaVencimiento: string;
  estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'AJUSTADA' | 'ANULADA';
  tipo: string;
  serie: string;
  correlativo: number;
  fechaEmision: string;
  clienteNombre: string;
  tipoDoc: string;
  numeroCliente: string;
  clienteTelefono?: string;
  diasVencida: number;
  vencida: boolean;
  cobrado: number | string;
  montoRevertido?: number | string;
};

type Cobro = {
  id: number;
  metodoPago: string;
  monto: number | string;
  referencia?: string;
  createdAt: string;
  usuarioId: number;
};

type DetalleCuenta = Cuenta & { cobros: Cobro[]; numero?: string; telefono?: string; email?: string; direccion?: string };
type MetodoCobro = 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TARJETA' | 'TRANSFERENCIA';
type OperacionCobroPendiente = {
  huella: string;
  clave: string;
  monto: number;
  metodoPago: MetodoCobro;
  referencia: string;
};
type Resumen = {
  cuentasAbiertas: number;
  saldoTotal: number | string;
  porVencer: number | string;
  vencido1a7: number | string;
  vencido8a30: number | string;
  vencido31a60: number | string;
  vencidoMas60: number | string;
};

const METODOS = [
  { id: 'EFECTIVO', label: 'Efectivo', icon: Banknote },
  { id: 'YAPE', label: 'Yape', icon: Smartphone },
  { id: 'PLIN', label: 'Plin', icon: Smartphone },
  { id: 'TARJETA', label: 'Tarjeta', icon: CreditCard },
  { id: 'TRANSFERENCIA', label: 'Transferencia', icon: Wallet },
] as const;
const money = (n: number | string | undefined | null) => formatearMoneda(Number(n || 0));
const nuevaClaveOperacion = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? `collection-${crypto.randomUUID()}`
  : `collection-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fechaCorta = (value?: string) => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00-05:00`)) : '—';
const fechaHora = (value?: string) => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(value)) : '—';

export default function Cobranzas() {
  const { usuario } = useAuth();
  const sucursalId = Number(usuario?.sucursalId || 0);
  const claveStorageCobro = (cuentaId: number) => `mi-carrito-pos:cobro-pendiente:${usuario?.id ?? 'anon'}:${cuentaId}`;
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [cuenta, setCuenta] = useState<DetalleCuenta | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [metodoPago, setMetodoPago] = useState<MetodoCobro>('EFECTIVO');
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [operacionPendiente, setOperacionPendiente] = useState<OperacionCobroPendiente | null>(null);
  const [mostrarPagadas, setMostrarPagadas] = useState(false);

  async function recargar() {
    if (ES_MODO_DEMO || !sucursalId) return;
    setCargando(true);
    try {
      const [rCuentas, rResumen] = await Promise.all([
        api.get('/clientes/cuentas-por-cobrar', { params: { sucursalId, ...(mostrarPagadas ? { estado: 'CERRADAS' } : {}) } }),
        api.get('/clientes/cuentas-por-cobrar/resumen', { params: { sucursalId } }),
      ]);
      setCuentas(rCuentas.data || []);
      setResumen(rResumen.data || null);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo cargar la cartera de clientes');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { recargar(); }, [sucursalId, mostrarPagadas]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cuentas;
    return cuentas.filter((c) => `${c.clienteNombre} ${c.numeroCliente} ${c.serie}-${c.correlativo} ${c.comprobanteId}`.toLowerCase().includes(q));
  }, [cuentas, busqueda]);

  async function abrirCuenta(item: Cuenta) {
    try {
      const response = await api.get(`/clientes/cuentas-por-cobrar/${item.id}`);
      setCuenta(response.data);
      const pendienteGuardado = (() => {
        try {
          const raw = localStorage.getItem(claveStorageCobro(item.id));
          return raw ? JSON.parse(raw) as OperacionCobroPendiente : null;
        } catch { return null; }
      })();
      setOperacionPendiente(pendienteGuardado);
      setMonto(pendienteGuardado ? Number(pendienteGuardado.monto).toFixed(2) : Number(response.data.saldoPendiente || 0).toFixed(2));
      setMetodoPago(pendienteGuardado?.metodoPago || 'EFECTIVO');
      setReferencia(pendienteGuardado?.referencia || '');
      setModalAbierto(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo abrir la cuenta');
    }
  }

  async function registrarCobro() {
    if (!cuenta) return;
    const cantidad = Number(monto);
    const pendiente = Number(cuenta.saldoPendiente);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      toast.error('Ingrese un monto mayor a cero');
      return;
    }
    if (metodoPago === 'TRANSFERENCIA' && !referencia.trim()) {
      toast.error('Ingrese el número de operación o referencia bancaria');
      return;
    }
    const datosCobro = {
      cuentaId: cuenta.id,
      metodoPago,
      monto: Number(cantidad.toFixed(2)),
      referencia: referencia.trim(),
    };
    const huella = JSON.stringify(datosCobro);
    const esReintentoExacto = !!operacionPendiente && operacionPendiente.huella === huella;
    if (cantidad > pendiente + 0.001 && !esReintentoExacto) {
      toast.error(`Ingrese un monto entre S/ 0.01 y ${money(pendiente)}`);
      return;
    }
    setGuardando(true);
    if (operacionPendiente && operacionPendiente.huella !== huella) {
      setGuardando(false);
      toast.error('Hay un intento anterior sin confirmar. Repita exactamente el mismo cobro o revise el historial antes de cambiar los datos.');
      return;
    }
    const operacion = operacionPendiente || {
      huella,
      clave: nuevaClaveOperacion(),
      monto: datosCobro.monto,
      metodoPago,
      referencia: datosCobro.referencia,
    };
    setOperacionPendiente(operacion);
    try { localStorage.setItem(claveStorageCobro(cuenta.id), JSON.stringify(operacion)); } catch { /* La clave sigue protegida durante esta sesión. */ }
    try {
      const response = await api.post(`/clientes/cuentas-por-cobrar/${cuenta.id}/cobros`, {
        metodoPago, monto: datosCobro.monto, referencia: referencia.trim() || undefined, idempotencyKey: operacion.clave,
      });
      setCuenta(response.data);
      setOperacionPendiente(null);
      try { localStorage.removeItem(claveStorageCobro(cuenta.id)); } catch { /* No bloquea el registro confirmado. */ }
      toast.success('Cobranza registrada correctamente');
      await recargar();
      if (Number(response.data.saldoPendiente || 0) <= 0) {
        setTimeout(() => setModalAbierto(false), 500);
      } else {
        setMonto(Number(response.data.saldoPendiente).toFixed(2));
      }
    } catch (error: any) {
      const status = Number(error?.response?.status || 0);
      // Los conflictos 409 son respuestas funcionales definitivas (no un timeout):
      // se libera la clave para que el operador actualice el saldo y genere una operación nueva.
      // Timeouts, 408, 429 y 5xx conservan el mismo intento para evitar duplicados.
      if ([400, 401, 403, 404, 409, 422].includes(status)) {
        setOperacionPendiente(null);
        try { localStorage.removeItem(claveStorageCobro(cuenta.id)); } catch { /* Sin almacenamiento disponible. */ }
      }
      toast.error(error?.response?.data?.message || 'No se pudo confirmar la cobranza. Reintente con los mismos datos.');
    } finally {
      setGuardando(false);
    }
  }

  if (ES_MODO_DEMO) {
    return <div className="card p-6 text-sm text-gray-600">Las cobranzas requieren conexión con el backend y la migración de cuentas por cobrar (v1.4.1).</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-primario-700 flex items-center gap-2"><Wallet size={22} /> Cobranzas de clientes</h2>
          <p className="text-sm text-gray-500">Seguimiento de crédito, vencimientos y abonos parciales</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMostrarPagadas((v) => !v)} className="btn-secundario flex items-center gap-2">
            <History size={15} /> {mostrarPagadas ? 'Ver pendientes' : 'Ver cuentas cerradas'}
          </button>
          <button onClick={recargar} disabled={cargando} className="btn-primario flex items-center gap-2">
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="card p-4"><div className="text-xs text-gray-500">Saldo total pendiente</div><div className="text-xl font-bold text-primario-700 mt-1">{money(resumen?.saldoTotal)}</div><div className="text-[11px] text-gray-400 mt-1">{resumen?.cuentasAbiertas || 0} cuentas abiertas</div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Por vencer / vigente</div><div className="text-xl font-bold text-emerald-700 mt-1">{money(resumen?.porVencer)}</div><div className="text-[11px] text-gray-400 mt-1">Vencimiento hoy o posterior</div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Vencido hasta 30 días</div><div className="text-xl font-bold text-amber-700 mt-1">{money(Number(resumen?.vencido1a7 || 0) + Number(resumen?.vencido8a30 || 0))}</div><div className="text-[11px] text-gray-400 mt-1">Cartera en seguimiento</div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Vencido más de 30 días</div><div className="text-xl font-bold text-red-700 mt-1">{money(Number(resumen?.vencido31a60 || 0) + Number(resumen?.vencidoMas60 || 0))}</div><div className="text-[11px] text-gray-400 mt-1">Requiere gestión prioritaria</div></div>
      </div>

      <div className="card p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar cliente, DNI/RUC o comprobante..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr><th className="px-4 py-3 text-left">Cliente</th><th className="px-4 py-3 text-left">Comprobante</th><th className="px-4 py-3 text-left">Vencimiento</th><th className="px-4 py-3 text-right">Crédito</th><th className="px-4 py-3 text-right">Cobrado</th><th className="px-4 py-3 text-right">Pendiente</th><th className="px-4 py-3 text-center">Estado</th><th className="px-4 py-3 text-center">Acción</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3"><div className="font-semibold text-gray-800">{c.clienteNombre}</div><div className="text-[11px] text-gray-500">{c.tipoDoc}: {c.numeroCliente}</div></td>
                  <td className="px-4 py-3 font-mono text-xs">{c.serie}-{String(c.correlativo).padStart(8, '0')}</td>
                  <td className="px-4 py-3"><div>{fechaCorta(c.fechaVencimiento)}</div>{c.vencida && <div className="text-[11px] text-red-600">{c.diasVencida} día(s) vencida</div>}</td>
                  <td className="px-4 py-3 text-right">{money(c.totalCredito)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{money(c.cobrado)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{money(c.saldoPendiente)}</td>
                  <td className="px-4 py-3 text-center"><span className={`badge ${c.vencida ? 'bg-red-100 text-red-700' : ['PAGADA', 'AJUSTADA'].includes(c.estado) ? 'bg-emerald-100 text-emerald-700' : c.estado === 'ANULADA' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>{c.estado === 'PARCIAL' ? 'Parcial' : c.estado === 'PAGADA' ? 'Pagada' : c.estado === 'AJUSTADA' ? 'Cerrada por devolución' : c.estado === 'ANULADA' ? 'Anulada' : c.vencida ? 'Vencida' : 'Pendiente'}</span></td>
                  <td className="px-4 py-3 text-center"><button onClick={() => abrirCuenta(c)} className="btn-secundario text-xs py-1.5">{mostrarPagadas ? 'Ver detalle' : 'Cobrar / ver'}</button></td>
                </tr>
              ))}
              {filtradas.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-10">{cargando ? 'Cargando cartera...' : mostrarPagadas ? 'No hay cuentas pagadas en esta sucursal.' : 'No hay cuentas pendientes por cobrar.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modalAbierto && cuenta && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) setModalAbierto(false); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b px-5 py-4">
              <div><h3 className="font-bold text-lg text-primario-700">Cuenta #{cuenta.id}</h3><p className="text-sm text-gray-500">{cuenta.clienteNombre} · {cuenta.serie}-{String(cuenta.correlativo).padStart(8, '0')}</p></div>
              <button onClick={() => setModalAbierto(false)} className="p-2 rounded hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-gray-50 p-3"><div className="text-[11px] text-gray-500">Crédito</div><div className="font-bold">{money(cuenta.totalCredito)}</div></div>
                <div className="rounded-lg bg-emerald-50 p-3"><div className="text-[11px] text-emerald-700">Cobrado</div><div className="font-bold text-emerald-800">{money(cuenta.cobros.reduce((s, cb) => s + Number(cb.monto), 0))}</div><div className="text-[10px] text-emerald-700 mt-1">Abonos recibidos</div></div>
                <div className="rounded-lg bg-amber-50 p-3"><div className="text-[11px] text-amber-700">Pendiente</div><div className="font-bold text-amber-800">{money(cuenta.saldoPendiente)}</div><div className="text-[10px] text-amber-700 mt-1">Saldo actual</div></div>
              </div>
              {Number(cuenta.montoRevertido || 0) > 0 && <div className="rounded-lg bg-blue-50 text-blue-800 p-3 text-xs">Crédito reducido por devoluciones: <b>{money(cuenta.montoRevertido)}</b>. Este importe no es una cobranza ni un ingreso de caja.</div>}
              <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1"><span>Vencimiento: {fechaCorta(cuenta.fechaVencimiento)}</span><span>Emisión: {fechaCorta(cuenta.fechaEmision)}</span><span>Cliente: {cuenta.tipoDoc} {cuenta.numero}</span></div>

              <section>
                <h4 className="font-semibold text-sm flex items-center gap-2 mb-2"><History size={15} /> Historial de cobranzas</h4>
                {cuenta.cobros.length === 0 ? <p className="text-xs text-gray-400 py-3">Todavía no se registraron abonos.</p> : (
                  <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">{cuenta.cobros.map((cb) => <div key={cb.id} className="px-3 py-2 flex justify-between gap-3 text-sm"><div><div className="font-medium">{cb.metodoPago}</div><div className="text-[11px] text-gray-500">{fechaHora(cb.createdAt)} {cb.referencia ? `· ${cb.referencia}` : ''}</div></div><div className="font-semibold text-emerald-700">{money(cb.monto)}</div></div>)}</div>
                )}
              </section>

              {Number(cuenta.saldoPendiente) > 0 && cuenta.estado !== 'ANULADA' && (
                <section className="border-t pt-4 space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2"><CheckCircle2 size={16} /> Registrar abono</h4>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div><label className="label">Monto a cobrar (S/)</label><input type="number" min="0.01" max={Number(cuenta.saldoPendiente)} step="0.01" className="input" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
                    <div><label className="label">Medio de pago</label><select className="input" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as MetodoCobro)}>{METODOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></div>
                  </div>
                  <div><label className="label">Referencia / operación {metodoPago === 'TRANSFERENCIA' ? '*' : '(opcional)'}</label><input className="input" maxLength={120} placeholder="N.º de operación, referencia o nota" value={referencia} onChange={(e) => setReferencia(e.target.value)} /></div>
                  <div className="rounded-lg bg-blue-50 text-blue-800 text-xs p-3 flex gap-2"><AlertCircle size={15} className="shrink-0" /><span>Para efectivo, Yape, Plin o tarjeta debes tener una caja abierta en esta sucursal. La transferencia bancaria se registra en el historial sin alterar el efectivo de caja.</span></div>
                  {operacionPendiente && <div className="rounded-lg bg-amber-50 text-amber-800 text-xs p-3">Hay un cobro anterior sin confirmación. Repite exactamente el mismo importe, medio y referencia para comprobarlo sin duplicarlo.</div>}
                  <div className="flex justify-end"><button disabled={guardando} onClick={registrarCobro} className="btn-primario min-w-40">{guardando ? 'Registrando...' : `Registrar ${money(monto)}`}</button></div>
                </section>
              )}
              {Number(cuenta.saldoPendiente) <= 0 && <div className="rounded-lg bg-emerald-50 text-emerald-800 p-3 text-sm flex items-center gap-2"><CheckCircle2 size={17} /> {cuenta.estado === 'AJUSTADA' ? 'Esta cuenta fue cerrada mediante una devolución; no es un cobro.' : 'Esta cuenta está pagada.'}</div>}
              {cuenta.estado === 'ANULADA' && <div className="rounded-lg bg-red-50 text-red-800 p-3 text-sm">Esta cuenta fue anulada.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
