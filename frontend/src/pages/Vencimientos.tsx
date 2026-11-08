import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Download, RefreshCw, PackageX } from 'lucide-react';
import { api, ES_MODO_DEMO } from '../api/client';
import { fetchSupabaseInventoryExpiries } from '../api/supabasePurchases';
import { useAuth } from '../context/AuthContext';

type Lote = {
  id:number; sucursalId:number; sucursalNombre:string; productoId:number; varianteId:number|null;
  codigo:string; codigoPresentacion:string; productoNombre:string; varianteNombre:string|null;
  codigoLote:string; fechaVencimiento:string; cantidadDisponible:number; costoUnitario:number;
  valorEnRiesgo:number; diasRestantes:number; estado:'VENCIDO'|'VENCE_HOY'|'CRITICO'|'PROXIMO'|'VIGENTE';
};
const money=(n:number)=>`S/ ${Number(n||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const qty=(n:number)=>Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:3});
const labels:Record<string,string>={VENCIDO:'Vencido',VENCE_HOY:'Vence hoy',CRITICO:'≤ 7 días',PROXIMO:'8–15 días',VIGENTE:'16+ días'};
const badge:Record<string,string>={VENCIDO:'bg-red-100 text-red-700',VENCE_HOY:'bg-red-100 text-red-700',CRITICO:'bg-orange-100 text-orange-800',PROXIMO:'bg-amber-100 text-amber-800',VIGENTE:'bg-green-100 text-green-800'};

export default function Vencimientos(){
  const {usuario}=useAuth();
  const [lotes,setLotes]=useState<Lote[]>([]);
  const [dias,setDias]=useState('90');
  const [filtro,setFiltro]=useState('TODOS');
  const [busqueda,setBusqueda]=useState('');
  const [cargando,setCargando]=useState(false);
  const [error,setError]=useState('');
  const cargar=useCallback(async()=>{
    if(ES_MODO_DEMO||!usuario?.sucursalId)return;
    setCargando(true);setError('');
    try{
      if(import.meta.env.VITE_AUTH_PROVIDER==='supabase'){
        const rows=await fetchSupabaseInventoryExpiries(Number(usuario.sucursalId),Number(dias));
        setLotes(rows as Lote[]);
      }else{
        const r=await api.get('/inventario/vencimientos',{params:{dias:Number(dias)}});
        setLotes(Array.isArray(r.data)?r.data:[]);
      }
    }
    catch(e:any){setError(e?.response?.data?.message||'No se pudo cargar el control de vencimientos. Verifica las migraciones de lotes.');}
    finally{setCargando(false);}
  },[usuario?.sucursalId,dias]);
  useEffect(()=>{cargar();},[cargar]);
  const filtrados=useMemo(()=>lotes.filter(x=>(filtro==='TODOS'||x.estado===filtro)&&`${x.codigo} ${x.productoNombre} ${x.varianteNombre||''} ${x.codigoLote} ${x.sucursalNombre}`.toLowerCase().includes(busqueda.toLowerCase())),[lotes,filtro,busqueda]);
  const resumen=useMemo(()=>lotes.reduce((a,x)=>{a.unidades+=Number(x.cantidadDisponible||0);a.valor+=Number(x.valorEnRiesgo||0);if(x.estado==='VENCIDO')a.vencidos++;if(['VENCE_HOY','CRITICO'].includes(x.estado))a.criticos++;if(x.estado==='PROXIMO')a.proximos++;return a;},{unidades:0,valor:0,vencidos:0,criticos:0,proximos:0}),[lotes]);
  function exportar(){
    const cols=['Sucursal','Producto','Presentación','Código','Lote','Vencimiento','Días restantes','Cantidad','Costo unitario','Valor en riesgo','Estado'];
    const rows=filtrados.map(x=>[x.sucursalNombre,x.productoNombre,x.varianteNombre||'',x.codigoPresentacion||x.codigo,x.codigoLote,x.fechaVencimiento,x.diasRestantes,x.cantidadDisponible,x.costoUnitario,x.valorEnRiesgo,labels[x.estado]]);
    const csv=[cols,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='control-vencimientos-lotes.csv';a.click();URL.revokeObjectURL(url);
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-primario-100 p-3 text-primario-700"><CalendarClock size={24}/></div><div><h2 className="text-xl font-bold text-primario-700">Control de lotes y vencimientos</h2><p className="text-sm text-gray-500">Prioriza mercadería por vencer y cuantifica el inventario expuesto.</p></div></div>
      <div className="flex gap-2"><select className="input" value={dias} onChange={e=>setDias(e.target.value)}><option value="30">Próximos 30 días</option><option value="60">Próximos 60 días</option><option value="90">Próximos 90 días</option><option value="180">Próximos 180 días</option><option value="365">Próximos 365 días</option></select><button onClick={cargar} disabled={cargando} className="btn-secundario flex items-center gap-2"><RefreshCw size={16} className={cargando?'animate-spin':''}/> Actualizar</button></div>
    </div>
    {ES_MODO_DEMO&&<div className="card p-4 text-sm text-gray-600">El control de lotes requiere iniciar sesión y conexión con Supabase o el backend configurado.</div>}
    {error&&<div className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</div>}
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <div className="card p-4"><div className="text-xs text-gray-500">Valor del inventario expuesto</div><div className="text-xl font-bold">{money(resumen.valor)}</div></div>
      <div className="card p-4"><div className="text-xs text-gray-500">Lotes vencidos</div><div className="text-2xl font-bold text-red-700">{resumen.vencidos}</div></div>
      <div className="card p-4"><div className="text-xs text-gray-500">Vencen hoy o en 7 días</div><div className="text-2xl font-bold text-orange-700">{resumen.criticos}</div></div>
      <div className="card p-4"><div className="text-xs text-gray-500">Unidades comprometidas</div><div className="text-2xl font-bold">{qty(resumen.unidades)}</div></div>
    </div>
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap gap-2"><input className="input flex-1 min-w-[190px]" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar producto, código, lote o sucursal"/><select className="input w-full sm:w-52" value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="TODOS">Todos los estados</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><button onClick={exportar} className="btn-secundario flex items-center gap-2"><Download size={16}/> Exportar CSV</button></div>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1050px]"><thead><tr className="text-left text-xs text-gray-500 border-b"><th className="p-2">Producto / presentación</th><th className="p-2">Lote</th><th className="p-2">Sucursal</th><th className="p-2">Vencimiento</th><th className="p-2">Días</th><th className="p-2">Cantidad</th><th className="p-2">Costo</th><th className="p-2">Valor expuesto</th><th className="p-2">Estado</th></tr></thead><tbody>
      {filtrados.map(x=><tr key={x.id} className="border-b last:border-0 hover:bg-gray-50"><td className="p-2"><div className="font-medium">{x.productoNombre}</div><div className="text-xs text-gray-500">{x.varianteNombre?`${x.varianteNombre} · `:''}{x.codigoPresentacion||x.codigo}</div></td><td className="p-2">{x.codigoLote}</td><td className="p-2">{x.sucursalNombre}</td><td className="p-2">{new Date(`${x.fechaVencimiento}T12:00:00`).toLocaleDateString('es-PE')}</td><td className="p-2 font-semibold">{x.diasRestantes<0?`${Math.abs(x.diasRestantes)} días vencido`:x.diasRestantes===0?'Hoy':x.diasRestantes}</td><td className="p-2">{qty(x.cantidadDisponible)}</td><td className="p-2">{money(x.costoUnitario)}</td><td className="p-2 font-semibold">{money(x.valorEnRiesgo)}</td><td className="p-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${badge[x.estado]}`}>{labels[x.estado]}</span></td></tr>)}
      {!filtrados.length&&<tr><td colSpan={9} className="p-8 text-center text-gray-500">{cargando?'Cargando lotes…':'No hay lotes con vencimiento dentro del rango seleccionado.'}</td></tr>}
      </tbody></table></div>
      <p className="text-xs text-gray-500 flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0"/>El valor expuesto es una estimación (cantidad disponible × costo unitario); no equivale automáticamente a una pérdida contable. Los lotes sin fecha de vencimiento no aparecen en este reporte. Esta pantalla no elimina stock ni registra mermas.</p>
    </div>
  </div>;
}
