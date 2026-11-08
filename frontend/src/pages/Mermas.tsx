import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, RefreshCw, Trash2, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, ES_MODO_DEMO } from '../api/client';
import { useAuth } from '../context/AuthContext';

type Lote={id:number;sucursalNombre:string;productoNombre:string;varianteNombre:string|null;codigoLote:string;fechaVencimiento:string|null;cantidadDisponible:number;costoUnitario:number};
type Merma={id:number;sucursalNombre:string;productoNombre:string;varianteNombre:string|null;codigoLote:string;fechaVencimiento:string|null;motivoTipo:string;observacion:string;cantidad:number;costoUnitario:number;costoTotal:number;usuarioNombre:string;createdAt:string};
const money=(n:number)=>`S/ ${Number(n||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const qty=(n:number)=>Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:3});
const motivos:Record<string,string>={VENCIDO:'Producto vencido',DANADO:'Producto dañado',PERDIDA:'Pérdida',CONTAMINACION:'Contaminación',OTRO:'Otro'};
export default function Mermas(){
 const {usuario}=useAuth();const [lotes,setLotes]=useState<Lote[]>([]);const [historial,setHistorial]=useState<Merma[]>([]);
 const [loteId,setLoteId]=useState('');const [cantidad,setCantidad]=useState('1');const [motivoTipo,setMotivoTipo]=useState('VENCIDO');const [observacion,setObservacion]=useState('');
 const [cargando,setCargando]=useState(false);const [guardando,setGuardando]=useState(false);const [error,setError]=useState('');
 const cargar=useCallback(async()=>{if(ES_MODO_DEMO||!usuario?.sucursalId)return;setCargando(true);setError('');try{
  const [a,b]=await Promise.all([api.get('/inventario/lotes-disponibles'),api.get('/inventario/mermas')]);
  setLotes(Array.isArray(a.data)?a.data:[]);setHistorial(Array.isArray(b.data)?b.data:[]);
 }catch(e:any){setError(e?.response?.data?.message||'No se pudo cargar el control de mermas. Verifica la migración de la etapa 32.');}finally{setCargando(false);}},[usuario?.sucursalId]);
 useEffect(()=>{cargar();},[cargar]);
 const lote=useMemo(()=>lotes.find(x=>String(x.id)===loteId),[lotes,loteId]);
 const total=useMemo(()=>historial.reduce((a,x)=>a+Number(x.costoTotal||0),0),[historial]);
 async function registrar(e:React.FormEvent){
  e.preventDefault();if(!lote){toast.error('Selecciona un lote');return;}
  const n=Number(cantidad);if(!Number.isFinite(n)||n<=0||n>Number(lote.cantidadDisponible)){toast.error('La cantidad debe ser positiva y no superar el saldo del lote');return;}
  if(observacion.trim().length<5){toast.error('Describe el motivo con al menos 5 caracteres');return;}
  if(!window.confirm(`Se descontarán ${qty(n)} unidades del lote ${lote.codigoLote}. Costo estimado de la merma: ${money(n*Number(lote.costoUnitario))}. ¿Confirmas?`))return;
  setGuardando(true);try{
   await api.post('/inventario/mermas',{loteId:lote.id,cantidad:n,motivoTipo,observacion:observacion.trim(),idempotencyKey:crypto.randomUUID()});
   toast.success('Merma registrada y stock actualizado');setCantidad('1');setObservacion('');await cargar();
  }catch(e:any){toast.error(e?.response?.data?.message||'No se pudo registrar la merma');}finally{setGuardando(false);}
 }
 function exportar(){const cols=['Fecha','Sucursal','Producto','Presentación','Lote','Motivo','Observación','Cantidad','Costo unitario','Costo total','Usuario'];const rows=historial.map(x=>[new Date(x.createdAt).toLocaleString('es-PE'),x.sucursalNombre,x.productoNombre,x.varianteNombre||'',x.codigoLote,motivos[x.motivoTipo]||x.motivoTipo,x.observacion,x.cantidad,x.costoUnitario,x.costoTotal,x.usuarioNombre]);const csv=[cols,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='historial-mermas.csv';a.click();URL.revokeObjectURL(url);}
 return <div className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-xl bg-red-100 p-3 text-red-700"><Trash2 size={24}/></div><div><h2 className="text-xl font-bold text-primario-700">Mermas y pérdidas</h2><p className="text-sm text-gray-500">Registra bajas por lote con trazabilidad y costo estimado.</p></div></div><button onClick={cargar} disabled={cargando} className="btn-secundario flex items-center gap-2"><RefreshCw size={16} className={cargando?'animate-spin':''}/> Actualizar</button></div>
  {ES_MODO_DEMO&&<div className="card p-4 text-sm text-gray-600">El registro de mermas requiere conexión al backend.</div>}
  {error&&<div className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</div>}
  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
   <form onSubmit={registrar} className="card p-4 space-y-3 xl:col-span-1">
    <h3 className="font-semibold flex items-center gap-2"><AlertTriangle size={18}/> Registrar baja de inventario</h3>
    <div><label className="label">Lote / producto</label><select className="input w-full" value={loteId} onChange={e=>setLoteId(e.target.value)} required><option value="">Seleccionar lote con saldo</option>{lotes.map(x=><option key={x.id} value={x.id}>{x.productoNombre}{x.varianteNombre?` · ${x.varianteNombre}`:''} · Lote ${x.codigoLote} · Disp. ${qty(x.cantidadDisponible)}</option>)}</select></div>
    {lote&&<div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1"><div><b>Disponible:</b> {qty(lote.cantidadDisponible)}</div><div><b>Costo unitario:</b> {money(lote.costoUnitario)}</div><div><b>Vencimiento:</b> {lote.fechaVencimiento?new Date(`${lote.fechaVencimiento}T12:00:00`).toLocaleDateString('es-PE'):'Sin fecha registrada'}</div><div><b>Costo estimado:</b> {money(Number(cantidad||0)*Number(lote.costoUnitario))}</div></div>}
    <div><label className="label">Cantidad a dar de baja</label><input className="input w-full" type="number" min="0.001" step="0.001" max={lote?.cantidadDisponible} value={cantidad} onChange={e=>setCantidad(e.target.value)} required/></div>
    <div><label className="label">Motivo</label><select className="input w-full" value={motivoTipo} onChange={e=>setMotivoTipo(e.target.value)}>{Object.entries(motivos).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
    <div><label className="label">Observación / sustento</label><textarea className="input w-full min-h-20" maxLength={500} value={observacion} onChange={e=>setObservacion(e.target.value)} placeholder="Ej. Producto vencido detectado durante revisión..." required/></div>
    <button disabled={guardando||!lote} className="btn-primario w-full flex items-center justify-center gap-2">{guardando?'Registrando…':'Registrar merma'}</button>
    <p className="text-xs text-gray-500">La operación descuenta el lote y el stock de la presentación/producto en una transacción, y registra el movimiento y el responsable.</p>
   </form>
   <div className="card p-4 space-y-3 xl:col-span-2">
    <div className="flex flex-wrap justify-between items-center gap-2"><h3 className="font-semibold flex items-center gap-2"><ClipboardList size={18}/> Historial de mermas</h3><button onClick={exportar} className="btn-secundario flex items-center gap-2"><Download size={16}/> Exportar CSV</button></div>
    <div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Registros</div><div className="text-xl font-bold">{historial.length}</div></div><div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Costo acumulado registrado</div><div className="text-xl font-bold">{money(total)}</div></div></div>
    <div className="overflow-x-auto"><table className="w-full text-sm min-w-[850px]"><thead><tr className="text-left text-xs text-gray-500 border-b"><th className="p-2">Fecha</th><th className="p-2">Producto / lote</th><th className="p-2">Motivo</th><th className="p-2">Cantidad</th><th className="p-2">Costo</th><th className="p-2">Usuario</th></tr></thead><tbody>
     {historial.map(x=><tr key={x.id} className="border-b last:border-0"><td className="p-2 whitespace-nowrap">{new Date(x.createdAt).toLocaleDateString('es-PE')}</td><td className="p-2"><div className="font-medium">{x.productoNombre}{x.varianteNombre?` · ${x.varianteNombre}`:''}</div><div className="text-xs text-gray-500">Lote {x.codigoLote} · {x.sucursalNombre}</div></td><td className="p-2"><div>{motivos[x.motivoTipo]||x.motivoTipo}</div><div className="text-xs text-gray-500 max-w-56 truncate" title={x.observacion}>{x.observacion}</div></td><td className="p-2">{qty(x.cantidad)}</td><td className="p-2 font-semibold">{money(x.costoTotal)}</td><td className="p-2">{x.usuarioNombre}</td></tr>)}
     {!historial.length&&<tr><td colSpan={6} className="p-8 text-center text-gray-500">{cargando?'Cargando historial…':'Todavía no hay mermas registradas.'}</td></tr>}
    </tbody></table></div>
   </div>
  </div>
 </div>;
}
