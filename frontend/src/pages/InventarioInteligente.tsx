import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Boxes, Download, RefreshCw, TrendingDown } from 'lucide-react';
import { api, ES_MODO_DEMO } from '../api/client';
import { useAuth } from '../context/AuthContext';

type Item = {
  sucursalId:number; sucursalNombre:string; productoId:number; varianteId:number|null; codigo:string;
  productoNombre:string; varianteNombre:string|null; stock:number; stockMinimo:number; costoPromedio:number;
  valorStock:number; vendido30:number; vendido90:number; ventaDiaria:number; ultimaVenta:string|null;
  diasCobertura:number|null; cantidadSugerida:number; estado:'SIN_STOCK'|'STOCK_BAJO'|'SIN_ROTACION'|'SOBRESTOCK'|'SALUDABLE';
};
const money=(n:number)=>`S/ ${Number(n||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const qty=(n:number)=>Number(n||0).toLocaleString('es-PE',{maximumFractionDigits:3});
const estadoLabel:Record<string,string>={SIN_STOCK:'Sin stock',STOCK_BAJO:'Stock bajo',SIN_ROTACION:'Sin rotación',SOBRESTOCK:'Sobrestock',SALUDABLE:'Saludable'};

export default function InventarioInteligente(){
  const {usuario}=useAuth(); const [items,setItems]=useState<Item[]>([]); const [cargando,setCargando]=useState(false);
  const [error,setError]=useState(''); const [filtro,setFiltro]=useState('TODOS'); const [busqueda,setBusqueda]=useState('');
  const cargar=useCallback(async()=>{if(ES_MODO_DEMO||!usuario?.sucursalId)return;setCargando(true);setError('');try{
    const r=await api.get('/inventario/inteligencia',{params:{sucursalId:Number(usuario.sucursalId)}});setItems(Array.isArray(r.data?.items)?r.data.items:[]);
  }catch(e:any){setError(e?.response?.data?.message||'No se pudo analizar el inventario. Verifica la conexión y las migraciones previas.');}finally{setCargando(false);}},[usuario?.sucursalId]);
  useEffect(()=>{cargar();},[cargar]);
  const filtrados=useMemo(()=>items.filter(x=>(filtro==='TODOS'||x.estado===filtro)&&`${x.codigo} ${x.productoNombre} ${x.varianteNombre||''}`.toLowerCase().includes(busqueda.toLowerCase())),[items,filtro,busqueda]);
  const resumen=useMemo(()=>items.reduce((a,x)=>{a.valor+=Number(x.valorStock||0);a.sugerido+=Number(x.cantidadSugerida||0);if(x.estado==='SIN_STOCK')a.sin++;if(x.estado==='STOCK_BAJO')a.bajo++;if(x.estado==='SIN_ROTACION')a.lento++;if(x.estado==='SOBRESTOCK')a.exceso++;return a;},{valor:0,sugerido:0,sin:0,bajo:0,lento:0,exceso:0}),[items]);
  function exportar(){const cols=['Sucursal','Código','Producto','Presentación','Stock','Stock mínimo','Vendido 30 días','Vendido 90 días','Días cobertura','Cantidad sugerida','Costo promedio','Valor stock','Estado'];const rows=filtrados.map(x=>[x.sucursalNombre,x.codigo,x.productoNombre,x.varianteNombre||'',x.stock,x.stockMinimo,x.vendido30,x.vendido90,x.diasCobertura??'',x.cantidadSugerida,x.costoPromedio,x.valorStock,estadoLabel[x.estado]]);const csv=[cols,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='inventario-inteligente.csv';a.click();URL.revokeObjectURL(url);}
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-xl bg-primario-100 p-3 text-primario-700"><Activity size={24}/></div><div><h2 className="text-xl font-bold text-primario-700">Inventario inteligente</h2><p className="text-sm text-gray-500">Rotación, cobertura, alertas y sugerencias de reposición calculadas con ventas recientes.</p></div></div><button onClick={cargar} disabled={cargando} className="btn-secundario flex items-center gap-2"><RefreshCw size={16} className={cargando?'animate-spin':''}/> Actualizar</button></div>
    {ES_MODO_DEMO&&<div className="card p-4 text-sm text-gray-600">Este análisis requiere conexión al backend.</div>}
    {error&&<div className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</div>}
    <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
      <div className="card p-4"><div className="text-xs text-gray-500">Valor del inventario</div><div className="text-lg font-bold">{money(resumen.valor)}</div></div>
      <div className="card p-4"><div className="text-xs text-gray-500">Sin stock</div><div className="text-2xl font-bold text-red-700">{resumen.sin}</div></div>
      <div className="card p-4"><div className="text-xs text-gray-500">Stock bajo</div><div className="text-2xl font-bold text-amber-700">{resumen.bajo}</div></div>
      <div className="card p-4"><div className="text-xs text-gray-500">Sin rotación (+30 días)</div><div className="text-2xl font-bold text-orange-700">{resumen.lento}</div></div>
      <div className="card p-4"><div className="text-xs text-gray-500">Sobrestock (+60 días cobertura)</div><div className="text-2xl font-bold text-blue-700">{resumen.exceso}</div></div>
    </div>
    <div className="card p-4 space-y-3"><div className="flex flex-wrap gap-2"><input className="input flex-1 min-w-[190px]" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por código o producto"/><select className="input w-full sm:w-56" value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="TODOS">Todos los productos</option>{Object.entries(estadoLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><button onClick={exportar} className="btn-secundario flex items-center gap-2"><Download size={16}/> Exportar CSV</button></div>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[980px]"><thead><tr className="text-left text-xs text-gray-500 border-b"><th className="p-2">Producto</th><th className="p-2">Stock</th><th className="p-2">Mínimo</th><th className="p-2">Venta 30d</th><th className="p-2">Cobertura</th><th className="p-2">Última venta</th><th className="p-2">Sugerencia</th><th className="p-2">Valor stock</th><th className="p-2">Estado</th></tr></thead><tbody>
        {filtrados.map(x=><tr key={`${x.sucursalId}-${x.productoId}-${x.varianteId??'base'}`} className="border-b last:border-0 hover:bg-gray-50"><td className="p-2"><div className="font-medium">{x.productoNombre}</div><div className="text-xs text-gray-500">{x.varianteNombre?`${x.varianteNombre} · `:''}{x.codigo}</div></td><td className="p-2 font-semibold">{qty(x.stock)}</td><td className="p-2">{qty(x.stockMinimo)}</td><td className="p-2">{qty(x.vendido30)}</td><td className="p-2">{x.diasCobertura==null?'—':`${qty(x.diasCobertura)} días`}</td><td className="p-2">{x.ultimaVenta?new Date(x.ultimaVenta).toLocaleDateString('es-PE'):'Nunca'}</td><td className="p-2 font-semibold">{qty(x.cantidadSugerida)}</td><td className="p-2">{money(x.valorStock)}</td><td className="p-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${x.estado==='SIN_STOCK'?'bg-red-100 text-red-700':x.estado==='STOCK_BAJO'?'bg-amber-100 text-amber-800':x.estado==='SIN_ROTACION'?'bg-orange-100 text-orange-800':x.estado==='SOBRESTOCK'?'bg-blue-100 text-blue-800':'bg-green-100 text-green-800'}`}>{estadoLabel[x.estado]}</span></td></tr>)}
        {!filtrados.length&&<tr><td colSpan={9} className="p-8 text-center text-gray-500">{cargando?'Analizando inventario…':'No hay productos para mostrar con este filtro.'}</td></tr>}
      </tbody></table></div><p className="text-xs text-gray-500 flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0"/>Las sugerencias usan ventas de los últimos 30 días y buscan cubrir 30 días de demanda o el stock mínimo, lo que sea mayor. No constituyen una orden automática de compra. Los productos sin ventas recientes se marcan para revisión.</p></div>
  </div>;
}
