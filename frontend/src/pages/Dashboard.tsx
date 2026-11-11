import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CalendarClock, Package, RefreshCw, ShoppingBag, TrendingDown, TrendingUp, Wallet, CreditCard, Banknote, Trash2 } from 'lucide-react';
import { api, ES_MODO_DEMO, ES_SUPABASE_AUTH } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatearMoneda } from '../utils/igv';

type DashboardData = {
  ventas: { ventasHoy: number; comprobantesHoy: number; ventasMes: number; ventasMesAnterior: number; variacionMensual: number | null };
  rentabilidad: { ventasNetas: number; utilidadBruta: number; gastosOperativos: number; utilidadOperativa: number; lineasSinCosto: number };
  topProductos: Array<{ productoId: number; codigo: string; nombre: string; cantidadVendida: number; ventasNetas: number; utilidadBruta: number | null; lineasSinCosto: number }>;
  bajaRotacion: Array<{ id: number; codigo: string; nombre: string; stock: number; ultimaVenta: string | null }>;
  stockBajo: Array<{ id: number; codigo: string; nombre: string; stock: number; stockMinimo: number; sucursalNombre: string }>;
  porVencer: Array<{ id: number; codigoLote: string; fechaVencimiento: string; cantidadDisponible: number; productoNombre: string; sucursalNombre: string }>;
  sucursales: Array<{ id: number; nombre: string; ventas: number }>;
  stockBajoVariantes?: Array<{ id:number; codigo:string; nombre:string; varianteId:number; varianteCodigo:string; varianteNombre:string; stock:number; stockMinimo:number; sucursalNombre:string }>;
  finanzas?: { cuentasPorCobrar:{cantidad:number;total:number;vencido:number;vencidas:number}; cuentasPorPagar:{cantidad:number;total:number;vencido:number;vencidas:number}; gastosPendientes:{cantidad:number;total:number;vencido:number} };
  mermas?: { cantidad:number; unidades:number; costo:number };
  cajas?: { abiertas:number; saldoInicial:number };
  tendencias?: { ventasDiarias:Array<{fecha:string;ventas:number}>; ventasMensuales:Array<{periodo:string;ventas:number}> };
};
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const fecha = (v?: string | null) => v ? new Date(`${String(v).slice(0,10)}T12:00:00`).toLocaleDateString('es-PE') : 'Sin ventas registradas';

function Indicador({ titulo, valor, detalle, icono: Icono, color = 'blue' }: { titulo: string; valor: string; detalle: string; icono: any; color?: string }) {
  const colores: Record<string,string> = { blue:'bg-blue-50 text-blue-700', green:'bg-green-50 text-green-700', amber:'bg-amber-50 text-amber-700', purple:'bg-purple-50 text-purple-700' };
  return <div className="card p-4 sm:p-5 flex items-start gap-3"><div className={`rounded-xl p-3 ${colores[color]}`}><Icono size={22}/></div><div className="min-w-0"><div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</div><div className="mt-1 text-xl sm:text-2xl font-bold text-gray-900">{valor}</div><div className="mt-1 text-xs text-gray-500">{detalle}</div></div></div>;
}

export default function Dashboard() {
  const { usuario } = useAuth();
  const [data,setData] = useState<DashboardData|null>(null);
  const [cargando,setCargando] = useState(false);
  const [error,setError] = useState('');
  const cargar = useCallback(async () => {
    if (ES_MODO_DEMO || usuario?.rol !== 'ADMIN' || !usuario?.sucursalId) return;
    setCargando(true); setError('');
    if (ES_SUPABASE_AUTH) {
      setData(null);
      setError('El Dashboard gerencial todavía no está migrado a Supabase. No se consultó la API heredada ni se modificó información.');
      setCargando(false);
      return;
    }
    try {
      const r = await api.get('/gastos/reportes/dashboard-gerencial');
      setData(r.data as DashboardData);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo cargar el dashboard. Verifica la conexión y las migraciones previamente instaladas.');
    } finally { setCargando(false); }
  },[usuario?.rol,usuario?.sucursalId]);
  useEffect(()=>{ cargar(); },[cargar]);

  if (ES_MODO_DEMO) return <div className="space-y-3"><h2 className="text-xl font-bold text-primario-700">Dashboard gerencial</h2><div className="card p-5 text-sm text-gray-600">El panel gerencial avanzado requiere conexión con el backend. El modo demostración no representa información contable ni inventario real.</div></div>;
  if (usuario?.rol !== 'ADMIN') return <div className="card p-5"><h2 className="text-xl font-bold text-primario-700">Dashboard</h2><p className="mt-2 text-sm text-gray-600">Los indicadores gerenciales están disponibles para el administrador. Puedes continuar usando Venta rápida, Caja y tus módulos autorizados.</p></div>;
  const v=data?.ventas; const r=data?.rentabilidad;
  const variacion=v?.variacionMensual ?? null;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-primario-700">Dashboard gerencial</h2><p className="text-sm text-gray-500">Resumen de tus sucursales autorizadas · {fecha(hoy())}</p></div><button onClick={cargar} disabled={cargando} className="btn-secundario inline-flex items-center gap-2"><RefreshCw size={15} className={cargando?'animate-spin':''}/> Actualizar</button></div>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {cargando && !data ? <div className="card p-8 text-center text-sm text-gray-500">Cargando indicadores gerenciales…</div> : data && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Indicador titulo="Ventas de hoy" valor={formatearMoneda(v?.ventasHoy||0)} detalle={`${v?.comprobantesHoy||0} comprobantes emitidos`} icono={ShoppingBag} color="blue"/>
        <Indicador titulo="Ventas del mes" valor={formatearMoneda(v?.ventasMes||0)} detalle={variacion===null?'Sin base para comparar':`${variacion>=0?'+':''}${variacion}% frente al mes anterior`} icono={variacion!==null&&variacion<0?TrendingDown:TrendingUp} color="green"/>
        <Indicador titulo="Utilidad bruta de hoy" valor={formatearMoneda(r?.utilidadBruta||0)} detalle="Solo líneas con costo registrado" icono={Activity} color="purple"/>
        <Indicador titulo="Utilidad operativa parcial" valor={formatearMoneda(r?.utilidadOperativa||0)} detalle={`Gastos registrados: ${formatearMoneda(r?.gastosOperativos||0)}`} icono={Wallet} color="amber"/>
      </div>
      {!!r?.lineasSinCosto && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><strong>Atención:</strong> {r.lineasSinCosto} línea(s) de venta de hoy no tienen costo registrado. No se incluyen en la utilidad para evitar sobreestimarla.</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Indicador titulo="Por cobrar" valor={formatearMoneda(data.finanzas?.cuentasPorCobrar.total||0)} detalle={`${data.finanzas?.cuentasPorCobrar.cantidad||0} cuentas · vencido ${formatearMoneda(data.finanzas?.cuentasPorCobrar.vencido||0)}`} icono={CreditCard} color="amber"/>
        <Indicador titulo="Por pagar a proveedores" valor={formatearMoneda(data.finanzas?.cuentasPorPagar.total||0)} detalle={`${data.finanzas?.cuentasPorPagar.cantidad||0} compras · vencido ${formatearMoneda(data.finanzas?.cuentasPorPagar.vencido||0)}`} icono={Banknote} color="purple"/>
        <Indicador titulo="Gastos pendientes" valor={formatearMoneda(data.finanzas?.gastosPendientes.total||0)} detalle={`${data.finanzas?.gastosPendientes.cantidad||0} gastos · vencido ${formatearMoneda(data.finanzas?.gastosPendientes.vencido||0)}`} icono={Wallet} color="amber"/>
        <Indicador titulo="Cajas abiertas" valor={String(data.cajas?.abiertas||0)} detalle={`Saldo inicial acumulado ${formatearMoneda(data.cajas?.saldoInicial||0)}`} icono={Wallet} color="green"/>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="card p-4"><h3 className="font-semibold text-primario-700 mb-3 flex items-center gap-2"><Activity size={17}/> Ventas · últimos 7 días</h3>{!data.tendencias?.ventasDiarias.length?<p className="text-sm text-gray-400">Sin ventas en el periodo.</p>:<div className="space-y-2">{data.tendencias.ventasDiarias.map(d=>{const max=Math.max(1,...data.tendencias!.ventasDiarias.map(x=>Number(x.ventas)));return <div key={String(d.fecha)}><div className="flex justify-between text-xs mb-1"><span>{fecha(String(d.fecha))}</span><strong>{formatearMoneda(Number(d.ventas))}</strong></div><div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-primario-500 rounded-full" style={{width:`${Number(d.ventas)/max*100}%`}}/></div></div>})}</div>}</section>
        <section className="card p-4"><h3 className="font-semibold text-primario-700 mb-3 flex items-center gap-2"><Activity size={17}/> Ventas · últimos 6 meses</h3>{!data.tendencias?.ventasMensuales.length?<p className="text-sm text-gray-400">Sin ventas en el periodo.</p>:<div className="space-y-2">{data.tendencias.ventasMensuales.map(d=>{const max=Math.max(1,...data.tendencias!.ventasMensuales.map(x=>Number(x.ventas)));return <div key={d.periodo}><div className="flex justify-between text-xs mb-1"><span>{d.periodo}</span><strong>{formatearMoneda(Number(d.ventas))}</strong></div><div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{width:`${Number(d.ventas)/max*100}%`}}/></div></div>})}</div>}</section>
        <section className="card p-4"><h3 className="font-semibold text-primario-700 mb-3 flex items-center gap-2"><Trash2 size={17}/> Mermas · últimos 30 días</h3><div className="text-2xl font-bold">{formatearMoneda(data.mermas?.costo||0)}</div><p className="text-xs text-gray-500 mt-1">Costo registrado de {data.mermas?.cantidad||0} mermas · {Number(data.mermas?.unidades||0).toLocaleString('es-PE')} unidades</p><p className="text-xs text-gray-400 mt-3">Este importe se muestra como pérdida de inventario; no se descuenta otra vez de la utilidad operativa.</p></section>
      </div>
      {(Number(data.finanzas?.cuentasPorCobrar.vencidas||0)>0 || Number(data.finanzas?.cuentasPorPagar.vencidas||0)>0) && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><strong>Alertas de vencimiento:</strong> {data.finanzas?.cuentasPorCobrar.vencidas||0} cuentas por cobrar y {data.finanzas?.cuentasPorPagar.vencidas||0} cuentas por pagar vencidas. Revisa los saldos antes de programar pagos o nuevas ventas a crédito.</div>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="card p-4"><h3 className="font-semibold text-primario-700 mb-3">Productos más vendidos · últimos 30 días</h3>{data.topProductos.length===0?<p className="text-sm text-gray-400">Todavía no hay ventas para este periodo.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs text-gray-500 border-b"><th className="py-2 text-left">Producto</th><th className="py-2 text-right">Unidades</th><th className="py-2 text-right">Venta neta</th><th className="py-2 text-right">Utilidad bruta</th></tr></thead><tbody className="divide-y">{data.topProductos.map(p=><tr key={p.productoId}><td className="py-2 pr-2"><div className="font-medium">{p.nombre}</div><div className="text-xs text-gray-400">{p.codigo}</div></td><td className="py-2 text-right">{Number(p.cantidadVendida).toLocaleString('es-PE')}</td><td className="py-2 text-right">{formatearMoneda(Number(p.ventasNetas||0))}</td><td className="py-2 text-right">{p.utilidadBruta===null?'—':formatearMoneda(Number(p.utilidadBruta||0))}</td></tr>)}</tbody></table></div>}</section>
        <section className="card p-4"><h3 className="font-semibold text-primario-700 mb-3 flex items-center gap-2"><AlertTriangle size={17}/> Inventario bajo mínimo</h3>{data.stockBajo.length===0?<p className="text-sm text-green-700">No hay productos por debajo de su stock mínimo.</p>:<div className="space-y-2">{data.stockBajo.map(p=><div key={`${p.id}-${p.sucursalNombre}`} className="flex items-center justify-between gap-3 border-b last:border-0 pb-2"><div className="min-w-0"><div className="text-sm font-medium truncate">{p.nombre}</div><div className="text-xs text-gray-400">{p.codigo} · {p.sucursalNombre}</div></div><div className="shrink-0 text-right"><div className="font-semibold text-red-700">{Number(p.stock).toLocaleString('es-PE')}</div><div className="text-xs text-gray-400">Mín. {Number(p.stockMinimo).toLocaleString('es-PE')}</div></div></div>)}</div>}</section>
        <section className="card p-4"><h3 className="font-semibold text-primario-700 mb-3 flex items-center gap-2"><AlertTriangle size={17}/> Variantes bajo mínimo</h3>{!data.stockBajoVariantes?.length?<p className="text-sm text-green-700">No hay variantes por debajo del mínimo.</p>:<div className="space-y-2">{data.stockBajoVariantes.map(v=><div key={`${v.varianteId}-${v.sucursalNombre}`} className="flex justify-between gap-3 border-b last:border-0 pb-2"><div className="min-w-0"><div className="text-sm font-medium truncate">{v.nombre} · {v.varianteNombre}</div><div className="text-xs text-gray-400">{v.varianteCodigo} · {v.sucursalNombre}</div></div><div className="shrink-0 text-right"><div className="font-semibold text-red-700">{Number(v.stock)}</div><div className="text-xs text-gray-400">Mín. {Number(v.stockMinimo)}</div></div></div>)}</div>}</section>
        <section className="card p-4"><h3 className="font-semibold text-primario-700 mb-3 flex items-center gap-2"><CalendarClock size={17}/> Lotes por vencer · próximos 30 días</h3>{data.porVencer.length===0?<p className="text-sm text-green-700">No hay lotes con vencimiento en los próximos 30 días.</p>:<div className="space-y-2">{data.porVencer.map(l=><div key={l.id} className="flex justify-between gap-3 border-b last:border-0 pb-2"><div className="min-w-0"><div className="text-sm font-medium truncate">{l.productoNombre}</div><div className="text-xs text-gray-400">Lote {l.codigoLote} · {l.sucursalNombre}</div></div><div className="shrink-0 text-right"><div className="font-semibold text-amber-700">{fecha(l.fechaVencimiento)}</div><div className="text-xs text-gray-400">Stock {Number(l.cantidadDisponible)}</div></div></div>)}</div>}</section>
        <section className="card p-4"><h3 className="font-semibold text-primario-700 mb-3 flex items-center gap-2"><Package size={17}/> Productos sin movimiento · 30 días</h3>{data.bajaRotacion.length===0?<p className="text-sm text-gray-400">No se detectaron productos con stock y sin ventas recientes.</p>:<div className="space-y-2">{data.bajaRotacion.map(p=><div key={p.id} className="flex items-center justify-between gap-3 border-b last:border-0 pb-2"><div className="min-w-0"><div className="text-sm font-medium truncate">{p.nombre}</div><div className="text-xs text-gray-400">{p.codigo} · Última venta: {fecha(p.ultimaVenta)}</div></div><div className="shrink-0 text-sm font-semibold">Stock {Number(p.stock)}</div></div>)}</div>}</section>
      </div>
      {data.sucursales.length>0 && <section className="card p-4"><h3 className="font-semibold text-primario-700 mb-3">Comparación de sucursales · mes actual</h3><div className="space-y-3">{data.sucursales.map(s=>{const max=Math.max(1,...data.sucursales.map(x=>Number(x.ventas)));const pct=Number(s.ventas)/max*100;return <div key={s.id}><div className="flex justify-between gap-3 text-sm mb-1"><span>{s.nombre}</span><strong>{formatearMoneda(Number(s.ventas))}</strong></div><div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-primario-500" style={{width:`${pct}%`}}/></div></div>})}</div></section>}
      <p className="text-xs text-gray-400">Los importes de rentabilidad son gerenciales y parciales. La utilidad operativa usa gastos registrados por fecha del gasto; no reemplaza la contabilidad ni incluye depreciación, intereses o impuesto a la renta.</p>
    </>}
  </div>;
}
