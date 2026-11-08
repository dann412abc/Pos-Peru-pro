import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Calendar, TrendingUp } from 'lucide-react';
import { db } from '../db';
import { formatearMoneda } from '../utils/igv';
import type { Venta } from '../types';
import { api, ES_MODO_DEMO } from '../api/client';
import { useAuth } from '../context/AuthContext';

// Reportes: ventas por día/método/producto, con exportación CSV. Solo visible para ADMIN.
export default function Reportes() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [rentabilidad, setRentabilidad] = useState<any[]>([]);
  const [stockValorizado, setStockValorizado] = useState<any[]>([]);
  const [kardex, setKardex] = useState<any[]>([]);
  const [flujoCaja, setFlujoCaja] = useState<any[]>([]);
  const [estadoResultados, setEstadoResultados] = useState<any | null>(null);
  const [cargandoResultados, setCargandoResultados] = useState(false);
  const [errorResultados, setErrorResultados] = useState('');
  const [cargandoFlujo, setCargandoFlujo] = useState(false);
  const [productoKardex, setProductoKardex] = useState('');
  const [varianteKardex, setVarianteKardex] = useState('');
  const [cargandoInventario, setCargandoInventario] = useState(false);
  const { usuario } = useAuth();
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  useEffect(() => {
    db.ventas.toArray().then(setVentas);
  }, []);

  useEffect(() => {
    if (ES_MODO_DEMO || !usuario?.sucursalId) return;
    api.get('/ventas/rentabilidad', { params: { sucursalId: Number(usuario.sucursalId), desde: fechaDesde || undefined, hasta: fechaHasta || undefined } })
      .then((r) => setRentabilidad(r.data || []))
      .catch(() => setRentabilidad([]));
  }, [usuario?.sucursalId, fechaDesde, fechaHasta]);

  useEffect(() => {
    if (ES_MODO_DEMO || !usuario?.sucursalId) return;
    setCargandoInventario(true);
    api.get('/inventario/reportes/stock-valorizado', { params: { sucursalId: Number(usuario.sucursalId) } })
      .then((r) => setStockValorizado(Array.isArray(r.data) ? r.data : []))
      .catch(() => setStockValorizado([]))
      .finally(() => setCargandoInventario(false));
  }, [usuario?.sucursalId]);

  useEffect(() => {
    if (ES_MODO_DEMO || !usuario?.sucursalId) return;
    setCargandoFlujo(true);
    api.get('/caja/reportes/flujo', { params: {
      sucursalId: Number(usuario.sucursalId),
      desde: fechaDesde || undefined,
      hasta: fechaHasta || undefined,
    } })
      .then((r) => setFlujoCaja(Array.isArray(r.data) ? r.data : []))
      .catch(() => setFlujoCaja([]))
      .finally(() => setCargandoFlujo(false));
  }, [usuario?.sucursalId, fechaDesde, fechaHasta]);

  useEffect(() => {
    if (ES_MODO_DEMO || !usuario?.sucursalId) return;
    setCargandoResultados(true);
    setErrorResultados('');
    api.get('/gastos/reportes/estado-resultados', { params: {
      sucursalId: Number(usuario.sucursalId),
      desde: fechaDesde || undefined,
      hasta: fechaHasta || undefined,
    } })
      .then((r) => setEstadoResultados(r.data || null))
      .catch((err) => {
        setEstadoResultados(null);
        setErrorResultados(err?.response?.data?.message || 'No se pudo consultar el estado de resultados. Verifica que esté aplicada la migración de gastos.');
      })
      .finally(() => setCargandoResultados(false));
  }, [usuario?.sucursalId, fechaDesde, fechaHasta]);

  async function consultarKardex() {
    const id = Number(productoKardex);
    if (!Number.isInteger(id) || id <= 0) return;
    try {
      const r = await api.get(`/inventario/reportes/kardex/${id}`, { params: { varianteId: varianteKardex || undefined, desde: fechaDesde || undefined, hasta: fechaHasta || undefined } });
      setKardex(Array.isArray(r.data) ? r.data : []);
    } catch { setKardex([]); }
  }

  const filtradas = useMemo(() => {
    return ventas.filter((v) => {
      const f = v.fecha.slice(0, 10);
      if (fechaDesde && f < fechaDesde) return false;
      if (fechaHasta && f > fechaHasta) return false;
      return true;
    });
  }, [ventas, fechaDesde, fechaHasta]);

  const total = filtradas.reduce((s, v) => s + v.total, 0);
  const porDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of filtradas) {
      const d = v.fecha.slice(0, 10);
      m.set(d, (m.get(d) || 0) + v.total);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [filtradas]);

  const maxDia = Math.max(1, ...porDia.map(([, v]) => v));
  const totalVentasRentabilidad = rentabilidad.reduce((s, r) => s + Number(r.ventasNetas || 0), 0);
  const ventasConCosto = rentabilidad.reduce((s, r) => s + Number(r.ventasConCosto || 0), 0);
  const ventasSinCosto = rentabilidad.reduce((s, r) => s + Number(r.ventasSinCosto || 0), 0);
  const totalCosto = rentabilidad.reduce((s, r) => s + Number(r.costoMercaderia || 0), 0);
  const totalUtilidad = rentabilidad.reduce((s, r) => s + Number(r.utilidadBruta || 0), 0);
  const lineasSinCosto = rentabilidad.reduce((s, r) => s + Number(r.lineasSinCosto || 0), 0);

  const flujoIngresos = flujoCaja.reduce((a, r) => a + Number(r.ingresosVentas || 0) + Number(r.otrosIngresos || 0), 0);
  const flujoEgresos = flujoCaja.reduce((a, r) => a + Number(r.egresosCaja || 0) + Number(r.gastosPagados || 0), 0);
  const flujoNeto = flujoIngresos - flujoEgresos;

  function exportarCSV() {
    const cabeceras = ['Fecha', 'Comprobante', 'Cliente', 'TipoDoc', 'NumDoc', 'Total', 'IGV', 'EstadoFE'];
    const filas = filtradas.map((v) => [
      v.fecha,
      `${v.serie}-${String(v.correlativo).padStart(8, '0')}`,
      v.cliente.nombre,
      v.cliente.tipoDoc,
      v.cliente.numero,
      v.total.toFixed(2),
      v.igvTotal.toFixed(2),
      v.estadoFE,
    ]);
    const csv = [cabeceras.join(','), ...filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\
');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_ventas_micarrito_${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportarEstadoResultadosCSV() {
    if (!estadoResultados?.diario?.length) return;
    const cabeceras = ['Fecha','Ventas netas','Ventas sin costo','Costo mercadería','Utilidad bruta parcial','Gastos operativos','Utilidad operativa parcial'];
    const filas = estadoResultados.diario.map((r: any) => [
      String(r.fecha).slice(0,10), r.ventasNetas, r.ventasSinCosto, r.costoMercaderia,
      r.utilidadBruta, r.gastosOperativos, r.utilidadOperativa,
    ]);
    const csv = [cabeceras.join(','), ...filas.map((f: any[]) => f.map((v) => `"${String(v ?? '').replace(/"/g,'""')}"`).join(','))].join('\\n');
    const blob = new Blob(['\\uFEFF',csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='estado_resultados_mi_carrito.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-primario-700 flex items-center gap-2">
            <BarChart3 size={22} /> Reportes
          </h2>
          <p className="text-sm text-gray-500">Ventas, inventario, flujo de caja y resultados</p>
        </div>
        <button onClick={exportarCSV} className="btn-primario flex items-center gap-2">
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      <div className="card p-4 flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1">
          <label className="label flex items-center gap-1"><Calendar size={12} /> Desde</label>
          <input type="date" className="input" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="label">Hasta</label>
          <input type="date" className="input" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
        </div>
        <div className="bg-primario-50 rounded-lg px-4 py-2 text-center">
          <div className="text-[11px] text-primario-600 uppercase font-semibold">Total periodo</div>
          <div className="text-lg font-bold text-primario-700">{formatearMoneda(total)}</div>
        </div>
      </div>


      <div className="card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-primario-700">Flujo de caja y movimientos financieros</h3>
          <p className="text-xs text-gray-500">Ingresos registrados por ventas y otros ingresos de caja, menos salidas de caja y gastos pagados registrados. No equivale a utilidad contable: no incluye gastos que no se registraron en caja ni ajustes contables.</p>
        </div>
        {ES_MODO_DEMO ? <p className="text-sm text-gray-400">Disponible al conectar el backend.</p> : cargandoFlujo ? <p className="text-sm text-gray-400">Calculando flujo…</p> : <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Ingresos</div><div className="font-bold text-lg">{formatearMoneda(flujoIngresos)}</div></div>
            <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Salidas registradas</div><div className="font-bold text-lg">{formatearMoneda(flujoEgresos)}</div></div>
            <div className="rounded-lg bg-primario-50 p-3"><div className="text-xs text-primario-600">Flujo neto</div><div className="font-bold text-lg text-primario-700">{formatearMoneda(flujoNeto)}</div></div>
          </div>
          {flujoCaja.length === 0 ? <p className="text-sm text-gray-400">No hay movimientos en el periodo seleccionado.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-right">Ventas</th><th className="px-3 py-2 text-right">Otros ingresos</th><th className="px-3 py-2 text-right">Salidas caja</th><th className="px-3 py-2 text-right">Gastos pagados</th><th className="px-3 py-2 text-right">Neto</th></tr></thead><tbody className="divide-y divide-gray-100">{flujoCaja.map((r)=><tr key={String(r.fecha)}><td className="px-3 py-2">{String(r.fecha).slice(0,10)}</td><td className="px-3 py-2 text-right">{formatearMoneda(Number(r.ingresosVentas||0))}</td><td className="px-3 py-2 text-right">{formatearMoneda(Number(r.otrosIngresos||0))}</td><td className="px-3 py-2 text-right">{formatearMoneda(Number(r.egresosCaja||0))}</td><td className="px-3 py-2 text-right">{formatearMoneda(Number(r.gastosPagados||0))}</td><td className="px-3 py-2 text-right font-semibold">{formatearMoneda(Number(r.flujoNeto||0))}</td></tr>)}</tbody></table></div>}
        </>}
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-primario-700">Estado de resultados operativo</h3>
            <button onClick={exportarEstadoResultadosCSV} disabled={!estadoResultados?.diario?.length} className="btn-secundario disabled:opacity-50">Exportar CSV para Excel</button>
          </div>
          <p className="text-xs text-gray-500">Ventas netas sin IGV, menos costo de las líneas que tienen costo registrado y gastos operativos por fecha del gasto. Las líneas sin costo se muestran aparte para no inflar la utilidad. No es un estado financiero auditado.</p>
        </div>
        {ES_MODO_DEMO ? <p className="text-sm text-gray-400">Disponible al conectar el backend.</p> : cargandoResultados ? <p className="text-sm text-gray-400">Calculando resultados…</p> : errorResultados ? <p className="text-sm text-red-600">{errorResultados}</p> : estadoResultados ? <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Ventas netas</div><div className="font-bold text-lg">{formatearMoneda(Number(estadoResultados.resumen?.ventasNetas||0))}</div></div>
            <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Costo mercadería</div><div className="font-bold text-lg">{formatearMoneda(Number(estadoResultados.resumen?.costoMercaderia||0))}</div></div>
            <div className="rounded-lg bg-amber-50 p-3"><div className="text-xs text-amber-700">Ventas sin costo</div><div className="font-bold text-lg text-amber-800">{formatearMoneda(Number(estadoResultados.resumen?.ventasSinCosto||0))}</div></div>
            <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Utilidad bruta (con costo)</div><div className="font-bold text-lg">{formatearMoneda(Number(estadoResultados.resumen?.utilidadBruta||0))}</div></div>
            <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Gastos operativos</div><div className="font-bold text-lg">{formatearMoneda(Number(estadoResultados.resumen?.gastosOperativos||0))}</div></div>
            <div className="rounded-lg bg-primario-50 p-3"><div className="text-xs text-primario-600">Utilidad operativa parcial estimada</div><div className="font-bold text-lg text-primario-700">{formatearMoneda(Number(estadoResultados.resumen?.utilidadOperativa||0))}</div></div>
          </div>
          {Number(estadoResultados.resumen?.lineasSinCosto||0)>0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Atención: {estadoResultados.resumen.lineasSinCosto} línea(s), equivalentes a {formatearMoneda(Number(estadoResultados.resumen.ventasSinCosto||0))}, no tienen costo registrado y quedan excluidas de la utilidad bruta y operativa.</p>}
          <div>
            <h4 className="font-semibold text-sm mb-2">Gastos por categoría</h4>
            {(estadoResultados.gastosPorCategoria||[]).length===0 ? <p className="text-sm text-gray-400">No hay gastos en el periodo.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-2 text-left">Categoría</th><th className="p-2 text-right">Registros</th><th className="p-2 text-right">Total</th></tr></thead><tbody className="divide-y">{estadoResultados.gastosPorCategoria.map((g:any)=><tr key={g.categoria}><td className="p-2">{String(g.categoria).replace(/_/g,' ')}</td><td className="p-2 text-right">{g.cantidad}</td><td className="p-2 text-right font-medium">{formatearMoneda(Number(g.total||0))}</td></tr>)}</tbody></table></div>}
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-2">Resultado por día</h4>
            {(estadoResultados.diario||[]).length===0 ? <p className="text-sm text-gray-400">No hay ventas ni gastos en el periodo.</p> : <div className="overflow-x-auto"><table className="w-full text-sm min-w-[680px]"><thead className="bg-gray-50 text-xs text-gray-600"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-right">Ventas netas</th><th className="p-2 text-right">Ventas sin costo</th><th className="p-2 text-right">Costo</th><th className="p-2 text-right">Utilidad bruta</th><th className="p-2 text-right">Gastos</th><th className="p-2 text-right">Utilidad operativa</th></tr></thead><tbody className="divide-y">{estadoResultados.diario.map((r:any)=><tr key={String(r.fecha)}><td className="p-2">{String(r.fecha).slice(0,10)}</td><td className="p-2 text-right">{formatearMoneda(Number(r.ventasNetas||0))}</td><td className="p-2 text-right">{formatearMoneda(Number(r.ventasSinCosto||0))}</td><td className="p-2 text-right">{formatearMoneda(Number(r.costoMercaderia||0))}</td><td className="p-2 text-right">{formatearMoneda(Number(r.utilidadBruta||0))}</td><td className="p-2 text-right">{formatearMoneda(Number(r.gastosOperativos||0))}</td><td className="p-2 text-right font-semibold">{formatearMoneda(Number(r.utilidadOperativa||0))}</td></tr>)}</tbody></table></div>}
          </div>
        </> : <p className="text-sm text-gray-400">No hay información para mostrar.</p>}
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-primario-700">Inventario valorizado por presentación</h3>
          <p className="text-xs text-gray-500">Stock × costo promedio registrado en cada sucursal. No incluye IGV en el costo; el IGV referencial se muestra solo como dato informativo.</p>
        </div>
        {ES_MODO_DEMO ? <p className="text-sm text-gray-400">Disponible al conectar el backend.</p> : cargandoInventario ? <p className="text-sm text-gray-400">Cargando inventario…</p> : stockValorizado.length === 0 ? <p className="text-sm text-gray-400">No hay saldos de inventario para esta sucursal.</p> : <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Presentaciones/productos</div><div className="font-bold text-lg">{stockValorizado.length}</div></div>
            <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Unidades en stock</div><div className="font-bold text-lg">{stockValorizado.reduce((a,r)=>a+Number(r.stock||0),0).toLocaleString('es-PE')}</div></div>
            <div className="rounded-lg bg-primario-50 p-3"><div className="text-xs text-primario-600">Valor del inventario</div><div className="font-bold text-lg text-primario-700">{formatearMoneda(stockValorizado.reduce((a,r)=>a+Number(r.valorInventario||0),0))}</div></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-3 py-2 text-left">Producto / presentación</th><th className="px-3 py-2 text-right">Stock</th><th className="px-3 py-2 text-right">Mínimo</th><th className="px-3 py-2 text-right">Costo promedio</th><th className="px-3 py-2 text-right">Valorizado</th><th className="px-3 py-2 text-right">Estado</th></tr></thead><tbody className="divide-y divide-gray-100">{stockValorizado.map((r)=><tr key={`${r.sucursalId}-${r.productoId}-${r.varianteId||'base'}`}><td className="px-3 py-2"><div className="font-medium">{r.productoNombre}</div><div className="text-xs text-gray-500">{r.varianteNombre || 'Producto único'} · {r.codigo || ''}</div></td><td className="px-3 py-2 text-right">{Number(r.stock).toFixed(3)}</td><td className="px-3 py-2 text-right">{Number(r.stockMinimo).toFixed(3)}</td><td className="px-3 py-2 text-right">{formatearMoneda(Number(r.costoPromedio||0))}</td><td className="px-3 py-2 text-right font-semibold">{formatearMoneda(Number(r.valorInventario||0))}</td><td className="px-3 py-2 text-right">{Number(r.stock)<=Number(r.stockMinimo)?<span className="text-red-600 font-semibold">Bajo mínimo</span>:<span className="text-green-700">Normal</span>}</td></tr>)}</tbody></table></div>
        </>}
      </div>

      <div className="card p-5 space-y-3">
        <div><h3 className="font-semibold text-primario-700">Kardex de movimientos</h3><p className="text-xs text-gray-500">Consulta por ID de producto. Para familias, ingresa también el ID de la variante.</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><input className="input" type="number" min="1" placeholder="ID del producto" value={productoKardex} onChange={e=>setProductoKardex(e.target.value)}/><input className="input" type="number" min="1" placeholder="ID variante (opcional)" value={varianteKardex} onChange={e=>setVarianteKardex(e.target.value)}/><button className="btn-primario" onClick={consultarKardex}>Consultar Kardex</button></div>
        {kardex.length>0 && <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-2 py-2 text-left">Fecha</th><th className="px-2 py-2 text-left">Sucursal</th><th className="px-2 py-2 text-left">Movimiento</th><th className="px-2 py-2 text-right">Cantidad</th><th className="px-2 py-2 text-right">Saldo posterior</th><th className="px-2 py-2 text-left">Motivo</th></tr></thead><tbody className="divide-y">{kardex.map(r=><tr key={r.id}><td className="px-2 py-2">{new Date(r.fecha).toLocaleString('es-PE')}</td><td className="px-2 py-2">{r.sucursalNombre}</td><td className="px-2 py-2">{r.tipo}</td><td className="px-2 py-2 text-right">{Number(r.cantidad).toFixed(3)}</td><td className="px-2 py-2 text-right">{r.stockPosterior===null?'—':Number(r.stockPosterior).toFixed(3)}</td><td className="px-2 py-2">{r.motivo}</td></tr>)}</tbody></table></div>}
        {!ES_MODO_DEMO && kardex.length===0 && <p className="text-xs text-gray-400">Ingresa un ID y consulta para ver movimientos del periodo seleccionado.</p>}
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-primario-700 flex items-center gap-2"><TrendingUp size={18} /> Rentabilidad bruta por producto</h3>
            <p className="text-xs text-gray-500">Calculada con el costo promedio guardado al momento de cada venta.</p>
          </div>
          {!ES_MODO_DEMO && <span className="text-xs text-gray-500">Sucursal: {usuario?.sucursalNombre}</span>}
        </div>
        {ES_MODO_DEMO ? (
          <p className="text-sm text-gray-400">La rentabilidad requiere ventas registradas en el backend y costos históricos de compra.</p>
        ) : rentabilidad.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No hay ventas con datos de rentabilidad en el periodo. Las ventas anteriores a la captura del costo pueden no tener costo histórico.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Ventas netas</div><div className="font-bold text-lg">{formatearMoneda(totalVentasRentabilidad)}</div></div>
              <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Costo de mercadería (con costo)</div><div className="font-bold text-lg">{formatearMoneda(totalCosto)}</div></div>
              <div className="rounded-lg bg-primario-50 p-3"><div className="text-xs text-primario-600">Utilidad bruta (con costo)</div><div className="font-bold text-lg text-primario-700">{formatearMoneda(totalUtilidad)}</div></div>
            </div>
            {lineasSinCosto > 0 && <p className="text-xs text-amber-700">Hay {lineasSinCosto} líneas sin costo histórico (ventas por {formatearMoneda(ventasSinCosto)}). La utilidad y el margen se calculan solo sobre ventas con costo registrado ({formatearMoneda(ventasConCosto)}), para no sobreestimar la ganancia.</p>}
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Unidades</th><th className="px-3 py-2 text-right">Ventas</th><th className="px-3 py-2 text-right">Ventas con costo</th><th className="px-3 py-2 text-right">Costo</th><th className="px-3 py-2 text-right">Utilidad bruta</th><th className="px-3 py-2 text-right">Margen</th></tr></thead><tbody className="divide-y divide-gray-100">{rentabilidad.map((r) => <tr key={r.productoId}><td className="px-3 py-2"><div className="font-medium">{r.nombre}</div><div className="text-[11px] text-gray-400">{r.codigo}</div></td><td className="px-3 py-2 text-right">{Number(r.cantidadVendida).toFixed(3)}</td><td className="px-3 py-2 text-right">{formatearMoneda(Number(r.ventasNetas))}</td><td className="px-3 py-2 text-right">{formatearMoneda(Number(r.ventasConCosto))}</td><td className="px-3 py-2 text-right">{formatearMoneda(Number(r.costoMercaderia))}</td><td className="px-3 py-2 text-right font-semibold">{formatearMoneda(Number(r.utilidadBruta))}</td><td className="px-3 py-2 text-right">{Number(r.margenPorcentaje).toFixed(1)}%</td></tr>)}</tbody></table></div>
          </>
        )}
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-primario-700 mb-4">Ventas por día</h3>
        {porDia.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Sin datos en el periodo seleccionado</p>
        ) : (
          <div className="space-y-2">
            {porDia.map(([dia, monto]) => (
              <div key={dia} className="flex items-center gap-3 text-sm">
                <span className="w-28 text-xs text-gray-600 font-mono">{dia}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-primario-600 rounded flex items-center justify-end pr-2" style={{ width: `${(monto / maxDia) * 100}%`, minWidth: monto > 0 ? '40px' : 0 }}>
                    <span className="text-[10px] text-white font-semibold">{(monto / maxDia) * 100 > 15 ? formatearMoneda(monto) : ''}</span>
                  </div>
                </div>
                <span className="w-24 text-right font-semibold text-gray-700 text-xs">{formatearMoneda(monto)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5 text-sm text-gray-600">
        <h3 className="font-semibold text-primario-700 mb-2">Reportes disponibles (próximas versiones)</h3>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Libro de ventas electrónico (PLE SUNAT) — exportación TXT</li>
          <li>Reporte de productos más vendidos por periodo</li>
          <li>Reporte de clientes con crédito y saldos pendientes</li>
          <li>Reporte de cajas por usuario y sucursal</li>
          <li>Análisis de margen por categoría</li>
        </ul>
      </div>
    </div>
  );
}
