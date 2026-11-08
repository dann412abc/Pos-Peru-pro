import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BellRing, CalendarClock, CheckCircle2, CreditCard, Package,
  RefreshCw, Wallet, Banknote, ArrowRight, Info, ShieldAlert,
} from 'lucide-react';
import { api, ES_MODO_DEMO } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatearMoneda } from '../utils/igv';

type Panel = {
  rentabilidad?: { lineasSinCosto?: number };
  stockBajo?: Array<{ id:number; codigo:string; nombre:string; stock:number; stockMinimo:number; sucursalNombre:string }>;
  stockBajoVariantes?: Array<{ id:number; codigo:string; nombre:string; varianteId:number; varianteCodigo:string; varianteNombre:string; stock:number; stockMinimo:number; sucursalNombre:string }>;
  porVencer?: Array<{ id:number; codigoLote:string; fechaVencimiento:string; cantidadDisponible:number; productoNombre:string; sucursalNombre:string }>;
  finanzas?: {
    cuentasPorCobrar?: { cantidad:number; total:number; vencido:number; vencidas:number };
    cuentasPorPagar?: { cantidad:number; total:number; vencido:number; vencidas:number };
    gastosPendientes?: { cantidad:number; total:number; vencido:number };
  };
  cajas?: { abiertas:number; saldoInicial:number };
  mermas?: { cantidad:number; unidades:number; costo:number };
};

type Alerta = {
  id:string; nivel:'critica'|'advertencia'|'info'; categoria:string; titulo:string;
  detalle:string; destino:string; accion:string;
};

const fechaCorta = (value:string) => new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString('es-PE');
const diasHasta = (value:string) => {
  const target = new Date(`${String(value).slice(0,10)}T12:00:00`);
  const today = new Date(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date())+'T12:00:00');
  return Math.round((target.getTime()-today.getTime())/86400000);
};

export default function AlertasOperativas() {
  const { usuario } = useAuth();
  const [panel,setPanel] = useState<Panel|null>(null);
  const [cargando,setCargando] = useState(false);
  const [error,setError] = useState('');
  const [persistidas,setPersistidas] = useState<any[]>([]);
  const [sincronizando,setSincronizando] = useState(false);
  const [filtro,setFiltro] = useState<'todas'|'critica'|'advertencia'|'info'>('todas');

  const cargar = useCallback(async () => {
    if (ES_MODO_DEMO || usuario?.rol !== 'ADMIN') return;
    setCargando(true); setError('');
    try {
      const response = await api.get('/gastos/reportes/dashboard-gerencial');
      setPanel(response.data as Panel);
      const bandeja = await api.get('/notificaciones/operativas');
      setPersistidas(bandeja.data?.items || []);
    } catch (e:any) {
      setError(e?.response?.data?.message || 'No se pudieron consultar las alertas. Verifica la conexión y las migraciones instaladas.');
    } finally { setCargando(false); }
  },[usuario?.rol]);

  useEffect(()=>{ void cargar(); },[cargar]);

  const alertas = useMemo<Alerta[]>(()=>{
    if (!panel) return [];
    const result:Alerta[]=[];
    for (const p of panel.stockBajo||[]) result.push({
      id:`stock-${p.id}-${p.sucursalNombre}`,nivel:Number(p.stock)<=0?'critica':'advertencia',
      categoria:'Inventario',titulo:Number(p.stock)<=0?`Sin existencias: ${p.nombre}`:`Stock bajo: ${p.nombre}`,
      detalle:`${p.codigo} · ${p.sucursalNombre} · disponible ${p.stock} / mínimo ${p.stockMinimo}`,
      destino:'/productos',accion:'Revisar producto',
    });
    for (const v of panel.stockBajoVariantes||[]) result.push({
      id:`variante-${v.varianteId}-${v.sucursalNombre}`,nivel:Number(v.stock)<=0?'critica':'advertencia',
      categoria:'Inventario',titulo:Number(v.stock)<=0?`Variante agotada: ${v.nombre}`:`Variante bajo mínimo: ${v.nombre}`,
      detalle:`${v.varianteNombre} (${v.varianteCodigo}) · ${v.sucursalNombre} · ${v.stock} / mínimo ${v.stockMinimo}`,
      destino:'/productos',accion:'Revisar variantes',
    });
    for (const lote of panel.porVencer||[]) {
      const days=diasHasta(lote.fechaVencimiento);
      result.push({
        id:`lote-${lote.id}`,nivel:days<=7?'critica':'advertencia',categoria:'Vencimientos',
        titulo:days===0?`Vence hoy: ${lote.productoNombre}`:days<0?`Vencimiento pasado: ${lote.productoNombre}`:`Próximo a vencer: ${lote.productoNombre}`,
        detalle:`Lote ${lote.codigoLote} · ${lote.sucursalNombre} · ${lote.cantidadDisponible} unidades · fecha ${fechaCorta(lote.fechaVencimiento)}`,
        destino:'/inventario/vencimientos',accion:'Gestionar lote',
      });
    }
    const cobrar=panel.finanzas?.cuentasPorCobrar;
    if (Number(cobrar?.vencidas||0)>0) result.push({
      id:'cxc-vencidas',nivel:'critica',categoria:'Cobranza',titulo:`${cobrar!.vencidas} cuentas por cobrar vencidas`,
      detalle:`Saldo vencido: ${formatearMoneda(Number(cobrar!.vencido||0))}. Realiza seguimiento a los clientes.`,
      destino:'/cobranzas',accion:'Ver cobranzas',
    });
    const pagar=panel.finanzas?.cuentasPorPagar;
    if (Number(pagar?.vencidas||0)>0) result.push({
      id:'cxp-vencidas',nivel:'critica',categoria:'Proveedores',titulo:`${pagar!.vencidas} obligaciones con proveedores vencidas`,
      detalle:`Saldo vencido: ${formatearMoneda(Number(pagar!.vencido||0))}. Revisa la programación de pagos.`,
      destino:'/compras',accion:'Ver compras',
    });
    const gastos=panel.finanzas?.gastosPendientes;
    if (Number(gastos?.cantidad||0)>0) result.push({
      id:'gastos-pendientes',nivel:Number(gastos!.vencido||0)>0?'advertencia':'info',categoria:'Gastos',
      titulo:`${gastos!.cantidad} gastos pendientes de pago`,
      detalle:`Importe pendiente ${formatearMoneda(Number(gastos!.total||0))}${Number(gastos!.vencido||0)>0?` · vencido ${formatearMoneda(Number(gastos!.vencido||0))}`:''}.`,
      destino:'/gastos',accion:'Revisar gastos',
    });
    if (Number(panel.cajas?.abiertas||0)>0) result.push({
      id:'cajas-abiertas',nivel:'advertencia',categoria:'Caja',titulo:`${panel.cajas!.abiertas} caja(s) permanecen abiertas`,
      detalle:`Saldo inicial acumulado ${formatearMoneda(Number(panel.cajas!.saldoInicial||0))}. Verifica los turnos y realiza el cierre correspondiente.`,
      destino:'/cierre-caja',accion:'Revisar cajas',
    });
    if (Number(panel.rentabilidad?.lineasSinCosto||0)>0) result.push({
      id:'costos-faltantes',nivel:'advertencia',categoria:'Costos',titulo:`${panel.rentabilidad!.lineasSinCosto} líneas vendidas sin costo registrado`,
      detalle:'Estas líneas no se incluyen en el cálculo de utilidad bruta para evitar sobreestimarla.',
      destino:'/inventario-inteligente',accion:'Revisar costos',
    });
    if (Number(panel.mermas?.cantidad||0)>0) result.push({
      id:'mermas-recientes',nivel:'info',categoria:'Pérdidas',titulo:`${panel.mermas!.cantidad} mermas registradas en los últimos 30 días`,
      detalle:`${Number(panel.mermas!.unidades||0).toLocaleString('es-PE')} unidades · costo registrado ${formatearMoneda(Number(panel.mermas!.costo||0))}.`,
      destino:'/inventario/mermas',accion:'Ver mermas',
    });
    const order={critica:0,advertencia:1,info:2};
    return result.sort((a,b)=>order[a.nivel]-order[b.nivel]||a.categoria.localeCompare(b.categoria)||a.titulo.localeCompare(b.titulo));
  },[panel]);

  useEffect(()=>{
    if (!panel) return;
    let cancelado=false;
    setSincronizando(true);
    const payload=alertas.map(a=>({
      clave:a.id.replace(/[^a-zA-Z0-9:_-]/g,'-').slice(0,160),
      nivel:a.nivel,categoria:a.categoria,titulo:a.titulo,detalle:a.detalle,destino:a.destino,
    }));
    api.post('/notificaciones/operativas/sincronizar',{alertas:payload})
      .then(r=>{if(!cancelado)setPersistidas(r.data?.items||[]);})
      .catch(e=>{if(!cancelado)setError(e?.response?.data?.message||'No se pudo guardar el historial de alertas.');})
      .finally(()=>{if(!cancelado)setSincronizando(false);});
    return ()=>{cancelado=true;};
  },[panel,alertas]);

  const marcarLeida=async(id:number)=>{
    try { await api.patch(`/notificaciones/operativas/${id}/leida`); setPersistidas(items=>items.map(a=>a.id===id?{...a,leida:true}:a)); }
    catch(e:any){setError(e?.response?.data?.message||'No se pudo marcar la alerta como leída.');}
  };
  const marcarTodas=async()=>{
    try { await api.patch('/notificaciones/operativas/leidas'); setPersistidas(items=>items.map(a=>({...a,leida:true}))); }
    catch(e:any){setError(e?.response?.data?.message||'No se pudieron marcar las alertas como leídas.');}
  };

  const visibles=persistidas.filter(a=>filtro==='todas'||a.nivel===filtro);
  const criticas=persistidas.filter(a=>a.nivel==='critica'&&!a.leida).length;
  const advertencias=persistidas.filter(a=>a.nivel==='advertencia'&&!a.leida).length;
  const informativas=persistidas.filter(a=>a.nivel==='info'&&!a.leida).length;
  const pendientes=persistidas.filter(a=>!a.leida).length;

  if (ES_MODO_DEMO) return <div className="card p-5 text-sm text-gray-600">El centro de alertas requiere conexión con el backend. No se muestran alertas ficticias en modo demostración.</div>;
  if (usuario?.rol!=='ADMIN') return <div className="card p-5 text-sm text-gray-600">El centro de alertas operativas está disponible para el administrador.</div>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold text-primario-700 flex items-center gap-2"><BellRing size={21}/> Alertas operativas</h2>
        <p className="text-sm text-gray-500">Incidencias actuales de inventario, vencimientos, caja y finanzas de tus sucursales autorizadas.</p></div>
      <div className="flex gap-2"><button onClick={()=>void marcarTodas()} disabled={!pendientes} className="btn-secundario inline-flex items-center gap-2">Marcar todas leídas</button><button onClick={()=>void cargar()} disabled={cargando} className="btn-secundario inline-flex items-center gap-2"><RefreshCw size={15} className={cargando?'animate-spin':''}/> Actualizar</button></div>
    </div>
    {error&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="card p-4 flex items-center gap-3"><div className="rounded-xl bg-red-50 text-red-700 p-3"><ShieldAlert size={21}/></div><div><div className="text-xs text-gray-500 uppercase font-semibold">Críticas</div><div className="text-2xl font-bold">{criticas}</div></div></div>
      <div className="card p-4 flex items-center gap-3"><div className="rounded-xl bg-amber-50 text-amber-700 p-3"><AlertTriangle size={21}/></div><div><div className="text-xs text-gray-500 uppercase font-semibold">Advertencias</div><div className="text-2xl font-bold">{advertencias}</div></div></div>
      <div className="card p-4 flex items-center gap-3"><div className="rounded-xl bg-blue-50 text-blue-700 p-3"><Info size={21}/></div><div><div className="text-xs text-gray-500 uppercase font-semibold">Informativas</div><div className="text-2xl font-bold">{informativas}</div></div></div>
    </div>
    <div className="flex flex-wrap gap-2">
      {(['todas','critica','advertencia','info'] as const).map(value=><button key={value} onClick={()=>setFiltro(value)} className={`px-3 py-2 rounded-lg text-sm font-medium border ${filtro===value?'bg-primario-700 text-white border-primario-700':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{value==='todas'?'Todas':value==='critica'?'Críticas':value==='advertencia'?'Advertencias':'Informativas'}{value==='todas'?` (${alertas.length})`:''}</button>)}
    </div>
    {cargando&&!panel?<div className="card p-8 text-center text-sm text-gray-500">Consultando incidencias y sincronizando historial…</div>:visibles.length===0?
      <div className="card p-8 text-center"><CheckCircle2 size={34} className="mx-auto text-green-600"/><h3 className="font-semibold mt-3">No hay alertas activas en esta categoría</h3><p className="text-sm text-gray-500 mt-1">No se detectaron incidencias con los datos actuales.</p></div>:
      <div className="space-y-3">{visibles.map(a=><article key={a.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className={`shrink-0 rounded-xl p-3 ${a.nivel==='critica'?'bg-red-50 text-red-700':a.nivel==='advertencia'?'bg-amber-50 text-amber-700':'bg-blue-50 text-blue-700'}`}>{a.categoria==='Inventario'?<Package size={20}/>:a.categoria==='Vencimientos'?<CalendarClock size={20}/>:a.categoria==='Caja'?<Wallet size={20}/>:a.categoria==='Cobranza'?<CreditCard size={20}/>:a.categoria==='Proveedores'?<Banknote size={20}/>:<AlertTriangle size={20}/>}</div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`text-[10px] font-bold uppercase tracking-wide ${a.nivel==='critica'?'text-red-700':a.nivel==='advertencia'?'text-amber-700':'text-blue-700'}`}>{a.nivel==='critica'?'Crítica':a.nivel==='advertencia'?'Advertencia':'Informativa'}</span><span className="text-xs text-gray-400">{a.categoria}</span></div><h3 className="font-semibold text-gray-900 mt-1">{a.titulo}</h3><p className="text-sm text-gray-500 mt-1">{a.detalle}</p></div>
        <div className="flex items-center gap-2 shrink-0"><Link to={a.destino} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-primario-700 hover:bg-gray-50">Abrir módulo<ArrowRight size={15}/></Link>{!a.leida&&<button onClick={()=>void marcarLeida(a.id)} className="text-xs text-gray-500 underline">Marcar leída</button>}</div>
      </article>)}</div>}
    <p className="text-xs text-gray-400">El Worker de Cloudflare puede recalcular la bandeja cada cinco minutos cuando está desplegado y configurado; al abrir el módulo también se actualiza. {sincronizando?'Guardando cambios en el historial…':'Las alertas se guardan por administrador y se sincronizan entre sus dispositivos.'} Esto no equivale a notificaciones push ni a mensajes externos.</p>
  </div>;
}
