import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Wallet, Plus, CheckCircle2, RefreshCw } from 'lucide-react';
import { api, ES_MODO_DEMO } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatearMoneda } from '../utils/igv';

type Gasto = {
  id: number; categoria: string; descripcion: string; monto: number; fecha: string;
  fechaVencimiento?: string | null; estado: 'PENDIENTE' | 'PAGADO';
  metodoPago: string; metodoPagoReal?: string | null; fechaPago?: string | null;
  referenciaPago?: string | null; sucursalNombre?: string;
};

const CATEGORIAS = [
  ['ALQUILER','Alquiler'],['SERVICIOS','Servicios (luz, agua, internet)'],
  ['PERSONAL','Personal'],['TRANSPORTE','Transporte'],['MANTENIMIENTO','Mantenimiento'],
  ['SUMINISTROS','Suministros'],['IMPUESTOS','Impuestos'],['OTROS','Otros'],
];
const MEDIOS = ['EFECTIVO','YAPE','PLIN','TRANSFERENCIA','TARJETA'];
const hoy = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date());

export default function Gastos() {
  const { usuario } = useAuth();
  const [gastos,setGastos] = useState<Gasto[]>([]);
  const [cargando,setCargando] = useState(false);
  const [error,setError] = useState('');
  const [categoria,setCategoria] = useState('OTROS');
  const [descripcion,setDescripcion] = useState('');
  const [monto,setMonto] = useState('');
  const [metodoPago,setMetodoPago] = useState('EFECTIVO');
  const [fecha,setFecha] = useState(hoy());
  const [fechaVencimiento,setFechaVencimiento] = useState('');
  const [desde,setDesde] = useState('');
  const [hasta,setHasta] = useState('');
  const [registrando,setRegistrando] = useState(false);

  const cargar = useCallback(async () => {
    if (ES_MODO_DEMO || !usuario?.sucursalId) return;
    setCargando(true); setError('');
    try {
      const r = await api.get('/gastos',{params:{sucursalId:Number(usuario.sucursalId),desde:desde||undefined,hasta:hasta||undefined}});
      setGastos(Array.isArray(r.data)?r.data:[]);
    } catch { setError('No se pudieron cargar los gastos. Verifica la conexión y la migración de la etapa 23.'); }
    finally { setCargando(false); }
  },[usuario?.sucursalId,desde,hasta]);

  useEffect(()=>{cargar();},[cargar]);

  async function registrar(e: FormEvent) {
    e.preventDefault();
    if (!usuario?.sucursalId) return;
    if (fechaVencimiento && fechaVencimiento < fecha) { setError('El vencimiento no puede ser anterior a la fecha del gasto.'); return; }
    setRegistrando(true); setError('');
    try {
      await api.post(`/gastos/${Number(usuario.sucursalId)}`,{
        categoria,descripcion,monto:Number(monto),metodoPago,fecha,
        fechaVencimiento:fechaVencimiento||undefined,
      });
      setDescripcion(''); setMonto(''); setFechaVencimiento('');
      await cargar();
    } catch (err:any) { setError(err?.response?.data?.message || 'No se pudo registrar el gasto.'); }
    finally { setRegistrando(false); }
  }

  async function pagar(gasto:Gasto) {
    const medio = window.prompt('Medio de pago: EFECTIVO, YAPE, PLIN, TRANSFERENCIA o TARJETA','EFECTIVO');
    if (!medio) return;
    const normalizado = medio.trim().toUpperCase();
    if (!MEDIOS.includes(normalizado)) { setError('Medio de pago no válido.'); return; }
    const referencia = window.prompt('Referencia o número de operación (opcional)','') || '';
    try {
      await api.post(`/gastos/${gasto.id}/pagar`,{metodoPago:normalizado,referencia,fechaPago:hoy()});
      await cargar();
    } catch (err:any) { setError(err?.response?.data?.message || 'No se pudo registrar el pago.'); }
  }

  const pendientes = useMemo(()=>gastos.filter(g=>g.estado==='PENDIENTE').reduce((a,g)=>a+Number(g.monto),0),[gastos]);
  const pagados = useMemo(()=>gastos.filter(g=>g.estado==='PAGADO').reduce((a,g)=>a+Number(g.monto),0),[gastos]);
  const total = pendientes+pagados;

  return <div className="space-y-4">
    <div className="flex items-center gap-3">
      <div className="rounded-xl bg-primario-100 p-3 text-primario-700"><Wallet size={24}/></div>
      <div><h2 className="text-xl font-bold text-primario-700">Gastos operativos</h2><p className="text-sm text-gray-500">Registra obligaciones, pagos y gastos de cada sucursal.</p></div>
    </div>
    {ES_MODO_DEMO && <div className="card p-4 text-sm text-gray-500">El módulo de gastos requiere el backend conectado y la migración 1.23.</div>}
    {error && <div className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</div>}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="card p-4"><div className="text-xs text-gray-500">Gastos del periodo</div><div className="text-xl font-bold">{formatearMoneda(total)}</div></div>
      <div className="card p-4"><div className="text-xs text-gray-500">Pendientes de pago</div><div className="text-xl font-bold text-amber-700">{formatearMoneda(pendientes)}</div></div>
      <div className="card p-4"><div className="text-xs text-gray-500">Pagados</div><div className="text-xl font-bold text-green-700">{formatearMoneda(pagados)}</div></div>
    </div>
    <form onSubmit={registrar} className="card p-5 space-y-3">
      <h3 className="font-semibold text-primario-700 flex items-center gap-2"><Plus size={18}/> Registrar gasto</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">Categoría<select className="input mt-1" value={categoria} onChange={e=>setCategoria(e.target.value)}>{CATEGORIAS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label className="text-sm">Monto (S/.)<input className="input mt-1" type="number" min="0.01" step="0.01" required value={monto} onChange={e=>setMonto(e.target.value)} placeholder="0.00"/></label>
        <label className="text-sm sm:col-span-2">Descripción<input className="input mt-1" required minLength={5} maxLength={240} value={descripcion} onChange={e=>setDescripcion(e.target.value)} placeholder="Ej. recibo de electricidad del local"/></label>
        <label className="text-sm">Medio previsto<select className="input mt-1" value={metodoPago} onChange={e=>setMetodoPago(e.target.value)}>{MEDIOS.map(m=><option key={m}>{m}</option>)}</select></label>
        <label className="text-sm">Fecha del gasto<input className="input mt-1" type="date" required value={fecha} onChange={e=>setFecha(e.target.value)}/></label>
        <label className="text-sm">Vencimiento (opcional)<input className="input mt-1" type="date" value={fechaVencimiento} onChange={e=>setFechaVencimiento(e.target.value)}/></label>
      </div>
      <p className="text-xs text-gray-500">El registro se crea como pendiente. El pago se confirma por separado para conservar su fecha y medio real.</p>
      <button className="btn-primario flex items-center gap-2" disabled={registrando||ES_MODO_DEMO}>{registrando?'Guardando…':'Registrar gasto pendiente'}</button>
    </form>
    <section className="card p-5 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Desde<input className="input mt-1" type="date" value={desde} onChange={e=>setDesde(e.target.value)}/></label>
        <label className="text-sm">Hasta<input className="input mt-1" type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/></label>
        <button className="btn-secundario flex items-center gap-2" onClick={cargar}><RefreshCw size={15}/> Actualizar</button>
      </div>
      <div className="flex items-center justify-between"><h3 className="font-semibold text-primario-700">Historial de gastos</h3><span className="text-xs text-gray-500">{gastos.length} registros</span></div>
      {cargando?<p className="text-sm text-gray-400">Cargando…</p>:gastos.length===0?<p className="text-sm text-gray-400">No hay gastos en el periodo seleccionado.</p>:
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[760px]"><thead className="bg-gray-50 text-xs text-gray-600"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Categoría / detalle</th><th className="p-2 text-right">Monto</th><th className="p-2 text-left">Estado</th><th className="p-2 text-left">Pago</th><th className="p-2 text-left">Vencimiento</th><th className="p-2">Acción</th></tr></thead><tbody className="divide-y">{gastos.map(g=><tr key={g.id}><td className="p-2">{String(g.fecha).slice(0,10)}</td><td className="p-2"><div className="font-medium">{CATEGORIAS.find(c=>c[0]===g.categoria)?.[1]||g.categoria}</div><div className="text-xs text-gray-500">{g.descripcion}</div></td><td className="p-2 text-right font-semibold">{formatearMoneda(Number(g.monto))}</td><td className="p-2">{g.estado==='PAGADO'?<span className="text-green-700">Pagado</span>:<span className="text-amber-700">Pendiente</span>}</td><td className="p-2 text-xs">{g.metodoPagoReal||g.metodoPago}{g.referenciaPago?` · ${g.referenciaPago}`:''}</td><td className="p-2">{g.fechaVencimiento?String(g.fechaVencimiento).slice(0,10):'—'}</td><td className="p-2 text-center">{g.estado==='PENDIENTE'?<button className="text-primario-700 hover:underline inline-flex items-center gap-1" onClick={()=>pagar(g)}><CheckCircle2 size={15}/> Pagar</button>:'—'}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
