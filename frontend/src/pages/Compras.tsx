import { useEffect, useMemo, useState } from 'react';
import {
  Building2, CalendarDays, CheckCircle2, ClipboardList, CreditCard, Plus,
  RefreshCw, Search, ShoppingCart, Truck, Wallet, X, Pencil, Ban,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, ES_MODO_DEMO } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatearMoneda } from '../utils/igv';
import { fetchSupabaseSuppliers, mutateSupabaseParty } from '../api/supabaseParties';
import { recibirCompraSupabase, fetchSupabasePurchases, fetchSupabasePurchaseDetail, registrarPagoCompraSupabase, registrarDevolucionProveedorSupabase, anularCompraSupabase, listarOrdenesCompraSupabase, obtenerOrdenCompraSupabase, crearOrdenCompraSupabase, cambiarEstadoOrdenCompraSupabase, recepcionarOrdenCompraSupabase, listarCajasAbiertasComprasSupabase, fetchSupabaseSupplierAnalytics, fetchSupabasePurchaseReplenishment, fetchSupabasePurchaseProducts, fetchSupabasePurchaseVariants, fetchSupabaseInventoryExpiries } from '../api/supabasePurchases';

type Proveedor = {
  id: number; tipoDoc: 'RUC' | 'DNI' | 'OTRO'; numero: string; nombre: string;
  direccion?: string; telefono?: string; email?: string; contacto?: string; activo: boolean;
};
type Producto = { id: number; codigo: string; nombre: string; unidad: string; stock: number; costoPromedio?: number; tipoIgv: number; tieneVariantes?: boolean };
type VarianteCompra = { id: number; codigo: string; nombre: string; stock: number; costoPromedio?: number; precio: number; activo: boolean };
type Compra = {
  id: number; tipoDocumento: string; serie: string; numero: string; fechaDocumento: string;
  condicionPago: string; estado: string; total: number; pagado: number; saldoPendiente: number; fechaVencimiento?: string;
  proveedorNombre: string; proveedorNumero: string; responsable: string; sucursalId: number;
};
type LineaForm = { productoId: number; varianteId?: number; cantidad: string; unidadCompra: string; unidadesPorEmpaque: string; costoEmpaque: string; costoUnitario: string; codigoLote:string; fechaVencimiento:string };
type Caja = { id: number; saldoInicial: number };

const METODOS = ['EFECTIVO', 'YAPE', 'PLIN', 'TARJETA', 'TRANSFERENCIA'] as const;
const money = (value: number | string | null | undefined) => formatearMoneda(Number(value || 0));
const fechaHoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function Compras() {
  const { usuario } = useAuth();
  const sucursalId = Number(usuario?.sucursalId || 0);
  const [tab, setTab] = useState<'compras' | 'proveedores' | 'analisis' | 'por-pagar' | 'reposicion' | 'ordenes'>('compras');
  const [compras, setCompras] = useState<Compra[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [variantesPorProducto, setVariantesPorProducto] = useState<Record<number, VarianteCompra[]>>({});
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [alertasVencimiento,setAlertasVencimiento]=useState<any[]>([]);
  const [sugerenciasReposicion,setSugerenciasReposicion]=useState<any[]>([]);
  const [ordenesCompra,setOrdenesCompra]=useState<any[]>([]);
  const [analisisProveedores,setAnalisisProveedores]=useState<{proveedores:any[];preciosRecientes:any[];comparacionCostos:any[]}>({proveedores:[],preciosRecientes:[],comparacionCostos:[]});
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardandoCompra, setGuardandoCompra] = useState(false);
  // Se conserva ante fallos de red para que el reintento use la misma clave idempotente.
  const [claveCompra, setClaveCompra] = useState(() => `purchase-${crypto.randomUUID()}`);
  const [modalCompra, setModalCompra] = useState(false);
  const [modalProveedor, setModalProveedor] = useState(false);
  const [editandoProveedorId, setEditandoProveedorId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<any | null>(null);
  const [pagoCuenta, setPagoCuenta] = useState<any | null>(null);
  const [clavePago, setClavePago] = useState('');

  const [proveedorForm, setProveedorForm] = useState({ tipoDoc: 'RUC', numero: '', nombre: '', direccion: '', telefono: '', email: '', contacto: '' });
  const [compraForm, setCompraForm] = useState({ proveedorId: '', tipoDocumento: '01', serie: 'F001', numero: '', fechaDocumento: fechaHoy(), condicionPago: 'CONTADO', fechaVencimiento: '', metodoPago: 'EFECTIVO' });
  const [pagosCompra, setPagosCompra] = useState<Array<{ metodoPago: typeof METODOS[number]; monto: string }>>([{ metodoPago: 'EFECTIVO', monto: '' }]);
  const [lineas, setLineas] = useState<LineaForm[]>([{ productoId: 0, cantidad: '1', unidadCompra: 'UNIDAD', unidadesPorEmpaque: '1', costoEmpaque: '0.00', costoUnitario: '0.00', codigoLote:'', fechaVencimiento:'' }]);
  const [pagoForm, setPagoForm] = useState({ metodoPago: 'EFECTIVO', monto: '', cajaId: '', referencia: '' });

  async function recargar() {
    if (ES_MODO_DEMO) return;
    if (!sucursalId) return;
    setCargando(true);
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase' && tab === 'proveedores') {
        const rows = await fetchSupabaseSuppliers();
        setProveedores(rows.map((p: any) => ({ id: Number(p.id), tipoDoc: String(p.tipo_doc || 'RUC').toUpperCase(), numero: String(p.numero || ''), nombre: String(p.nombre || ''), direccion: p.direccion || undefined, telefono: p.telefono || undefined, email: p.email || undefined, contacto: p.contacto || undefined, activo: Boolean(p.activo) })) as Proveedor[]);
        return;
      }
      const comprasSupabase = import.meta.env.VITE_AUTH_PROVIDER === 'supabase' ? await fetchSupabasePurchases(sucursalId) : null;
      const modoSupabase = import.meta.env.VITE_AUTH_PROVIDER === 'supabase';
      const productosSupabase = modoSupabase ? await fetchSupabasePurchaseProducts(sucursalId) : null;
      const [rCompras, rProveedores, rProductos, rCuentas, rCajas] = await Promise.all([
        modoSupabase ? Promise.resolve({ data: comprasSupabase }) : api.get('/compras', { params: { sucursalId } }),
        modoSupabase ? Promise.resolve({ data: [] }) : api.get('/compras/proveedores'),
        modoSupabase ? Promise.resolve({ data: productosSupabase }) : api.get('/productos', { params: { sucursalId } }),
        modoSupabase ? Promise.resolve({ data: (comprasSupabase || []).filter((c: any) => Number(c.saldoPendiente || 0) > 0) }) : api.get('/compras/cuentas-por-pagar', { params: { sucursalId } }),
        modoSupabase ? listarCajasAbiertasComprasSupabase(sucursalId).then(data => ({ data })).catch((error:any) => { toast.error(error?.response?.data?.message || error?.message || 'No se pudieron consultar las cajas abiertas en Supabase'); return { data: [] }; }) : api.get('/compras/cajas-abiertas', { params: { sucursalId } }),
      ]);
      setCompras(rCompras.data || []);
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
        const rows = await fetchSupabaseSuppliers();
        setProveedores(rows.map((p: any) => ({ id: Number(p.id), tipoDoc: String(p.tipo_doc || 'RUC').toUpperCase(), numero: String(p.numero || ''), nombre: String(p.nombre || ''), direccion: p.direccion || undefined, telefono: p.telefono || undefined, email: p.email || undefined, contacto: p.contacto || undefined, activo: Boolean(p.activo) })) as Proveedor[]);
      } else { setProveedores(rProveedores.data || []); }
      setProductos((rProductos.data || []).filter((p: Producto) => p.id).map((p: Producto) => ({ ...p, tieneVariantes: Boolean(p.tieneVariantes) })));
      setCuentas(rCuentas.data || []);
      setCajas(rCajas.data || []);
      try { const rows = import.meta.env.VITE_AUTH_PROVIDER === 'supabase' ? await fetchSupabasePurchaseReplenishment(sucursalId) : (await api.get('/compras/sugerencias-reposicion', { params: { sucursalId } })).data; setSugerenciasReposicion(rows || []); } catch (error:any) { setSugerenciasReposicion([]); if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') toast.error(error?.response?.data?.message || error?.message || 'No se pudo cargar la reposición sugerida'); }
      try { const rows = import.meta.env.VITE_AUTH_PROVIDER === 'supabase' ? await listarOrdenesCompraSupabase(sucursalId) : (await api.get('/compras/ordenes', { params: { sucursalId } })).data; setOrdenesCompra(rows || []); } catch { setOrdenesCompra([]); }
      try { const rAnalisis = import.meta.env.VITE_AUTH_PROVIDER === 'supabase' ? await fetchSupabaseSupplierAnalytics(sucursalId) : (await api.get('/compras/proveedores/analisis', { params: { sucursalId } })).data; setAnalisisProveedores(rAnalisis || {proveedores:[],preciosRecientes:[],comparacionCostos:[]}); } catch (error:any) { setAnalisisProveedores({proveedores:[],preciosRecientes:[],comparacionCostos:[]}); if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') toast.error(error?.response?.data?.message || error?.message || 'No se pudo cargar el análisis de proveedores'); }
      try { const venc = modoSupabase ? await fetchSupabaseInventoryExpiries(sucursalId, 30) : (await api.get('/inventario/vencimientos', { params: { dias: 30 } })).data; setAlertasVencimiento(venc || []); } catch (error: any) { setAlertasVencimiento([]); if (modoSupabase) toast.error(error?.response?.data?.message || error?.message || 'No se pudieron cargar las alertas de vencimiento'); }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudieron cargar compras y proveedores');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { recargar(); }, [sucursalId, tab]);

  const totalCompra = useMemo(() => lineas.reduce((sum, linea) => {
    const producto = productos.find((p) => p.id === Number(linea.productoId));
    if (!producto) return sum;
    const empaques = Number(linea.cantidad || 0);
    const unidades = Number(linea.unidadesPorEmpaque || 1);
    const cantidadUnidades = empaques * unidades;
    const costoUnitario = Number((Number(linea.costoEmpaque || 0) / Math.max(unidades, 0.001)).toFixed(4));
    return sum + Math.round((cantidadUnidades * costoUnitario + Number.EPSILON) * 100) / 100;
  }, 0), [lineas, productos]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return compras;
    return compras.filter((c) => `${c.proveedorNombre} ${c.numero} ${c.serie} ${c.id}`.toLowerCase().includes(q));
  }, [compras, busqueda]);

  function cambiarTipoDocumento(tipo: string) {
    const serie = tipo === '01' ? 'F001' : tipo === '03' ? 'B001' : tipo === 'NV' ? 'NV01' : '';
    setCompraForm((f) => ({ ...f, tipoDocumento: tipo, serie }));
  }

  async function cambiarProducto(index: number, productoId: number) {
    const producto = productos.find((p) => p.id === productoId);
    setLineas((actuales) => actuales.map((linea, i) => i === index
      ? { ...linea, productoId, varianteId: undefined,
          costoUnitario: Number(producto?.costoPromedio || 0).toFixed(4),
          costoEmpaque: (Number(producto?.costoPromedio || 0) * Number(linea.unidadesPorEmpaque || 1)).toFixed(4) }
      : linea));
    if (producto?.tieneVariantes) {
      try {
        const variantesRows = import.meta.env.VITE_AUTH_PROVIDER === 'supabase'
          ? await fetchSupabasePurchaseVariants(sucursalId, productoId)
          : (await api.get(`/productos/${productoId}/variantes`, { params: { sucursalId } })).data;
        const variantes = (variantesRows || []).filter((v: VarianteCompra) => v.activo !== false);
        setVariantesPorProducto((prev) => ({ ...prev, [productoId]: variantes }));
        if (!variantes.length) toast.error(`La familia ${producto.nombre} no tiene presentaciones activas`);
      } catch (error: any) {
        toast.error(error?.response?.data?.message || 'No se pudieron cargar las presentaciones para la compra');
      }
    }
  }

  function cambiarVariante(index: number, varianteId: number) {
    const linea = lineas[index];
    const variante = (variantesPorProducto[linea.productoId] || []).find((v) => v.id === varianteId);
    setLineas((actuales) => actuales.map((l, i) => i === index
      ? { ...l, varianteId: variante?.id,
          costoUnitario: Number(variante?.costoPromedio || 0).toFixed(4),
          costoEmpaque: (Number(variante?.costoPromedio || 0) * Number(l.unidadesPorEmpaque || 1)).toFixed(4) }
      : l));
  }

  function abrirProveedorNuevo() {
    setEditandoProveedorId(null);
    setProveedorForm({ tipoDoc: 'RUC', numero: '', nombre: '', direccion: '', telefono: '', email: '', contacto: '' });
    setModalProveedor(true);
  }

  function abrirProveedorEditar(p: Proveedor) {
    setEditandoProveedorId(p.id);
    setProveedorForm({ tipoDoc: p.tipoDoc, numero: p.numero, nombre: p.nombre, direccion: p.direccion || '', telefono: p.telefono || '', email: p.email || '', contacto: p.contacto || '' });
    setModalProveedor(true);
  }

  async function guardarProveedor() {
    try {
      const payload = { ...proveedorForm, numero: proveedorForm.numero.trim(), nombre: proveedorForm.nombre.trim(), direccion: proveedorForm.direccion || undefined, telefono: proveedorForm.telefono || undefined, email: proveedorForm.email || undefined, contacto: proveedorForm.contacto || undefined };
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
        await mutateSupabaseParty(editandoProveedorId ? 'supplier_update' : 'supplier_create', { ...payload, ...(editandoProveedorId ? { id: editandoProveedorId } : {}) });
        toast.success(editandoProveedorId ? 'Proveedor actualizado' : 'Proveedor registrado');
      } else if (editandoProveedorId) { await api.put(`/compras/proveedores/${editandoProveedorId}`, payload); toast.success('Proveedor actualizado'); }
      else { await api.post('/compras/proveedores', payload); toast.success('Proveedor registrado'); }
      setModalProveedor(false);
      setProveedorForm({ tipoDoc: 'RUC', numero: '', nombre: '', direccion: '', telefono: '', email: '', contacto: '' });
      setEditandoProveedorId(null);
      await recargar();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo registrar el proveedor');
    }
  }

  async function desactivarProveedor(p: Proveedor) {
    if (!window.confirm(`¿Desactivar al proveedor ${p.nombre}? Sus compras históricas se conservarán.`)) return;
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') await mutateSupabaseParty('supplier_deactivate', { id: p.id });
      else await api.delete(`/compras/proveedores/${p.id}`);
      toast.success('Proveedor desactivado'); await recargar();
    }
    catch (error: any) { toast.error(error?.response?.data?.message || 'No se pudo desactivar el proveedor'); }
  }

  async function crearOrdenDesdeReposicion() {
    if (!sugerenciasReposicion.length) { toast.error('No hay sugerencias de reposición'); return; }
    const proveedorId = Number(window.prompt(`Ingrese el ID del proveedor. Proveedores: ${proveedores.map(p=>`${p.id}: ${p.nombre}`).join(' | ')}`, String(proveedores[0]?.id || '')));
    if (!Number.isInteger(proveedorId) || !proveedores.some(p=>p.id===proveedorId)) { toast.error('Seleccione un ID de proveedor válido'); return; }
    const proveedor = proveedores.find(p=>p.id===proveedorId)!;
    const lineasOrden = sugerenciasReposicion.filter(x=>Number(x.cantidadSugerida)>0).map(x=>({
      productoId:Number(x.productoId), ...(x.varianteId?{varianteId:Number(x.varianteId)}:{}),
      descripcion:`${x.productoNombre}${x.varianteNombre?` · ${x.varianteNombre}`:''}`,
      codigo:x.codigo||undefined,cantidad:Number(x.cantidadSugerida),
      costoUnitarioEstimado:Number(x.costoPromedio||0),unidadCompra:x.unidad||'UNIDAD'
    }));
    if (!lineasOrden.length) { toast.error('No hay cantidades para ordenar'); return; }
    try {
      const payload={sucursalId,proveedorId,lineas:lineasOrden,observaciones:'Generada desde sugerencias de reposición'};
      const r=import.meta.env.VITE_AUTH_PROVIDER === 'supabase' ? await crearOrdenCompraSupabase(payload) : (await api.post('/compras/ordenes',payload)).data;
      toast.success(`Orden ${r.numeroOrden} creada para ${proveedor.nombre}`);
      setTab('ordenes'); await recargar();
    } catch(e:any) { toast.error(e?.response?.data?.message||'No se pudo crear la orden'); }
  }

  async function recepcionarOrden(id:number) {
    try {
      const actual=import.meta.env.VITE_AUTH_PROVIDER === 'supabase' ? await obtenerOrdenCompraSupabase(id) : (await api.get(`/compras/ordenes/${id}`)).data;
      const lineas:any[]=[];
      for (const l of actual.lineas||[]) {
        const pendiente=Number(l.pendiente||0);
        if(pendiente<=0.0005) continue;
        const raw=window.prompt(`Recepción de ${l.descripcion}. Pendiente: ${pendiente}. ¿Cuántas unidades recibió? (0 para omitir)`,String(pendiente));
        if(raw===null)return;
        const cantidad=Number(raw);
        if(!Number.isFinite(cantidad)||cantidad<0||cantidad-pendiente>0.0005){toast.error(`Cantidad inválida para ${l.descripcion}`);return;}
        if(cantidad===0)continue;
        const costoRaw=window.prompt(`Costo unitario real con IGV de ${l.descripcion} (S/)`,String(l.costoUnitarioEstimado||0));
        if(costoRaw===null)return;
        const costoUnitario=Number(costoRaw);
        if(!Number.isFinite(costoUnitario)||costoUnitario<=0){toast.error('El costo unitario debe ser mayor a cero');return;}
        const codigoLote=window.prompt(`Código de lote de ${l.descripcion} (opcional):`,'')||undefined;
        const fechaVencimiento=window.prompt(`Vencimiento de ${l.descripcion} en formato AAAA-MM-DD (opcional):`,'')||undefined;
        lineas.push({ordenLineaId:Number(l.id),cantidad,costoUnitario,codigoLote,fechaVencimiento});
      }
      if(!lineas.length){toast.error('No ingresó cantidades para recibir');return;}
      const tipoDocumento=window.prompt('Tipo de documento del proveedor: 01 factura, 03 boleta, NV nota o OT otro','01')||'01';
      if(!['01','03','NV','OT'].includes(tipoDocumento)){toast.error('Tipo de documento inválido');return;}
      const serie=window.prompt('Serie del documento del proveedor (ej. F001)','F001')||'';
      const numero=window.prompt('Número del documento del proveedor','')||'';
      if(['01','03'].includes(tipoDocumento)&&(!serie.trim()||!numero.trim())){toast.error('Factura/boleta requiere serie y número');return;}
      const fechaDocumento=fechaHoy();
      const fechaVencimiento=window.prompt('Fecha de vencimiento de la deuda (AAAA-MM-DD)','')||fechaDocumento;
      const payload={tipoDocumento,serie,numero,fechaDocumento,fechaVencimiento,lineas};
      const keyName=`micarrito_orden_recepcion_${id}_${btoa(unescape(encodeURIComponent(JSON.stringify(payload))))}`;
      const idempotencyKey=sessionStorage.getItem(keyName)||`order-receipt-${crypto.randomUUID()}`;
      sessionStorage.setItem(keyName,idempotencyKey);
      const r=import.meta.env.VITE_AUTH_PROVIDER === 'supabase' ? await recepcionarOrdenCompraSupabase({ordenId:id,...payload,idempotencyKey}) : (await api.post(`/compras/ordenes/${id}/recepciones`,{...payload,idempotencyKey})).data;
      toast.success(`Recepción registrada. Compra #${r.compraId||''}. Estado: ${r.estado||'actualizado'}`);
      sessionStorage.removeItem(keyName);
      await recargar();
    } catch(e:any) { toast.error(e?.response?.data?.message||'No se pudo registrar la recepción'); }
  }

  async function cambiarEstadoOrden(id:number,accion:'enviar'|'cancelar') {
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') await cambiarEstadoOrdenCompraSupabase(id, accion==='enviar'?'send':'cancel');
      else await api.post(`/compras/ordenes/${id}/${accion}`);
      toast.success(accion==='enviar'?'Orden marcada como enviada':'Orden cancelada');
      await recargar();
    } catch(e:any) { toast.error(e?.response?.data?.message||'No se pudo actualizar la orden'); }
  }

  async function guardarCompra() {
    if (guardandoCompra) return;
    if (!compraForm.proveedorId) { toast.error('Seleccione un proveedor'); return; }
    const lineasValidas = lineas;
    if (!lineasValidas.length || lineasValidas.some((l) => {
      const producto = productos.find((p) => p.id === l.productoId);
      return !l.productoId || (producto?.tieneVariantes && !l.varianteId) ||
        (!producto?.tieneVariantes && !!l.varianteId) || Number(l.cantidad) <= 0 ||
        Number(l.unidadesPorEmpaque) <= 0 || Number(l.costoEmpaque) <= 0;
    })) { toast.error('Complete producto, presentación (cuando corresponda), cantidad y costo unitario válidos'); return; }
    if (compraForm.condicionPago === 'CREDITO' && (!compraForm.fechaVencimiento || compraForm.fechaVencimiento < compraForm.fechaDocumento)) { toast.error('Indique un vencimiento igual o posterior a la fecha del documento'); return; }
    const pagos = compraForm.condicionPago === 'CONTADO'
      ? pagosCompra.map((pago) => ({
          metodoPago: pago.metodoPago,
          monto: Number(Number(pago.monto).toFixed(2)),
          ...(pago.metodoPago !== 'TRANSFERENCIA' ? { cajaId: cajas[0]?.id } : {}),
        })).filter((pago) => pago.monto > 0)
      : [];
    if (compraForm.condicionPago === 'CONTADO' &&
        (!pagos.length || pagosCompra.some((pago) => !Number.isFinite(Number(pago.monto)) || Number(pago.monto) <= 0) ||
         Math.abs(pagos.reduce((sum, pago) => sum + pago.monto, 0) - totalCompra) > 0.01)) {
      toast.error('Distribuya el total exacto entre los medios de pago.');
      return;
    }
    if (compraForm.condicionPago === 'CONTADO' && pagos.some((pago) => pago.metodoPago !== 'TRANSFERENCIA') && !cajas.length) {
      toast.error('Abra una caja para registrar los pagos que salen de efectivo, Yape, Plin o tarjeta.');
      return;
    }
    const payload = {
      sucursalId, proveedorId: Number(compraForm.proveedorId), tipoDocumento: compraForm.tipoDocumento,
      serie: compraForm.serie, numero: compraForm.numero.trim(), fechaDocumento: compraForm.fechaDocumento,
      condicionPago: compraForm.condicionPago, ...(compraForm.condicionPago === 'CREDITO' ? { fechaVencimiento: compraForm.fechaVencimiento } : {}), idempotencyKey: claveCompra,
      lineas: lineasValidas.map((l) => {
        const p = productos.find((x) => x.id === l.productoId)!;
        return { productoId: l.productoId, ...(l.varianteId ? { varianteId: l.varianteId } : {}),
          cantidad: Number(l.cantidad), unidadCompra: l.unidadCompra,
          unidadesPorEmpaque: Number(l.unidadesPorEmpaque), costoEmpaque: Number(l.costoEmpaque),
          costoUnitario: Number((Number(l.costoEmpaque) / Number(l.unidadesPorEmpaque)).toFixed(4)),
          tipoIgv: Number(p.tipoIgv), codigoLote:l.codigoLote.trim()||undefined,
          fechaVencimiento:l.fechaVencimiento||undefined };
      }), pagos,
    };
    try {
      setGuardandoCompra(true);
      const respuesta = import.meta.env.VITE_AUTH_PROVIDER === 'supabase'
        ? await recibirCompraSupabase(payload as any)
        : (await api.post('/compras', payload)).data;
      const compraId = Number((respuesta as any)?.compraId || (respuesta as any)?.id || 0);
      if ((respuesta as any)?.ok === false || !compraId) throw new Error('El servidor no confirmó el registro de la compra. Verifica el historial antes de volver a intentarlo.');
      toast.success(`Compra #${compraId} registrada y mercadería recibida`);
      setModalCompra(false);
      setCompraForm({ proveedorId: '', tipoDocumento: '01', serie: 'F001', numero: '', fechaDocumento: fechaHoy(), condicionPago: 'CONTADO', fechaVencimiento: '', metodoPago: 'EFECTIVO' });
      setPagosCompra([{ metodoPago: 'EFECTIVO', monto: '' }]);
      setLineas([{ productoId: 0, cantidad: '1', unidadCompra: 'UNIDAD', unidadesPorEmpaque: '1', costoEmpaque: '0.00', costoUnitario: '0.00', codigoLote:'', fechaVencimiento:'' }]);
      setClaveCompra(`purchase-${crypto.randomUUID()}`);
      await recargar();
      if (import.meta.env.VITE_AUTH_PROVIDER !== 'supabase' && respuesta) setDetalle(respuesta);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'No se pudo registrar la compra. Puedes reintentar sin duplicar la solicitud.');
    } finally {
      setGuardandoCompra(false);
    }
  }

  async function verDetalle(id: number) {
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') { setDetalle(await fetchSupabasePurchaseDetail(sucursalId, id)); return; }
      const r = await api.get(`/compras/${id}`); setDetalle(r.data);
    } catch (error: any) { toast.error(error?.response?.data?.message || error?.message || 'No se pudo abrir la compra'); }
  }

  async function devolverAlProveedor(linea:any) {
    const cantidad=window.prompt(`Cantidad a devolver de ${linea.varianteNombre ? `${linea.productoNombre} · ${linea.varianteNombre}` : linea.productoNombre} (lote ${linea.codigoLote||'sin código'}):`, '1');
    if(cantidad===null)return;
    const motivo=window.prompt('Motivo de la devolución (mínimo 5 caracteres):','Producto vencido o defectuoso');
    if(motivo===null)return;
    try {
      const payload={motivo,lineas:[{compraLineaId:Number(linea.id),cantidad:Number(cantidad)}]};
      const requestKey=`micarrito_supplier_return_${detalle.id}_${btoa(unescape(encodeURIComponent(JSON.stringify(payload))))}`;
      const idempotencyKey=sessionStorage.getItem(requestKey)||`supplier-return-${crypto.randomUUID()}`;
      sessionStorage.setItem(requestKey,idempotencyKey);
      const r = import.meta.env.VITE_AUTH_PROVIDER === 'supabase'
        ? { data: await registrarDevolucionProveedorSupabase({ compraId: Number(detalle.id), ...payload, idempotencyKey }) }
        : await api.post(`/compras/${detalle.id}/devoluciones`,{...payload,idempotencyKey});
      sessionStorage.removeItem(requestKey);
      toast.success(`Devolución ${money(r.data.total)}; aplicada a cuenta ${money(r.data.aplicadoCuenta)}; saldo a favor ${money(r.data.saldoAFavor)}.`);
      await recargar(); await verDetalle(detalle.id);
    } catch(e:any){toast.error(e?.response?.data?.message||'No se pudo registrar la devolución al proveedor');}
  }

  async function registrarPago() {
    if (!pagoCuenta) return;
    const metodo = pagoForm.metodoPago;
    if (['EFECTIVO', 'YAPE', 'PLIN', 'TARJETA'].includes(metodo) && !pagoForm.cajaId) { toast.error('Abra una caja para registrar este medio de pago'); return; }
    try {
      const payload = {
        compraId: Number(pagoCuenta.id), metodoPago: metodo as any, monto: Number(pagoForm.monto),
        ...(pagoForm.cajaId ? { cajaId: Number(pagoForm.cajaId) } : {}),
        referencia: pagoForm.referencia || undefined,
        idempotencyKey: clavePago || `purchase-payment-${crypto.randomUUID()}`,
      };
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') await registrarPagoCompraSupabase(payload);
      else await api.post(`/compras/${pagoCuenta.id}/pagos`, { ...payload });
      toast.success('Pago aplicado a la cuenta del proveedor');
      setPagoCuenta(null); setClavePago('');
      setPagoForm({ metodoPago: 'EFECTIVO', monto: '', cajaId: '', referencia: '' });
      await recargar();
    } catch (error: any) { toast.error(error?.response?.data?.message || error?.message || 'No se pudo registrar el pago'); }
  }

  async function anularCompra(compra: any) {
    const motivo = window.prompt(`Motivo para anular la compra #${compra.id} (mínimo 5 caracteres):`);
    if (!motivo) return;
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') await anularCompraSupabase({ compraId: Number(compra.id), motivo });
      else await api.post(`/compras/${compra.id}/anular`, { motivo });
      toast.success('Compra anulada y existencias revertidas');
      setDetalle(null);
      await recargar();
    } catch (error: any) { toast.error(error?.response?.data?.message || 'No se pudo anular la compra'); }
  }

  if (usuario?.rol !== 'ADMIN') return <div className="card p-6 text-sm text-gray-600">El módulo de compras y proveedores está disponible para administradores.</div>;
  if (ES_MODO_DEMO) return <div className="card p-6 text-sm text-gray-600">El módulo de compras requiere conexión con el backend y la migración de compras/proveedores. El modo demo local no registra compras contables.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-primario-700 flex items-center gap-2"><ShoppingCart size={22} /> Compras y proveedores</h2>
          <p className="text-sm text-gray-500">Recepción de mercadería, costos de inventario y obligaciones con proveedores.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secundario flex items-center gap-2" onClick={recargar} disabled={cargando}><RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /> Actualizar</button>
          {tab === 'compras' && <button className="btn-ambar flex items-center gap-2" onClick={() => { setClaveCompra(`purchase-${crypto.randomUUID()}`); setModalCompra(true); }}><Plus size={16} /> Nueva compra</button>}
          {tab === 'proveedores' && <button className="btn-ambar flex items-center gap-2" onClick={abrirProveedorNuevo}><Plus size={16} /> Nuevo proveedor</button>}
        </div>
      </div>
      {alertasVencimiento.length>0&&<div className="rounded-lg border border-amber-300 bg-amber-50 p-3"><div className="font-semibold text-amber-900">{alertasVencimiento.filter(a=>a.estado==='VENCIDO').length} lote(s) vencido(s) · {alertasVencimiento.filter(a=>a.estado==='POR_VENCER').length} próximo(s) a vencer (30 días)</div><div className="mt-2 max-h-28 overflow-auto space-y-1 text-xs text-amber-900">{alertasVencimiento.slice(0,20).map(a=><div key={a.id}>{a.productoNombre} · lote {a.codigoLote} · vence {String(a.fechaVencimiento).slice(0,10)} · disponible {Number(a.cantidadDisponible).toFixed(3)} ({a.estado})</div>)}</div></div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-xs text-gray-500">Compras registradas</div><div className="text-2xl font-bold text-primario-700">{compras.length}</div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Proveedores activos</div><div className="text-2xl font-bold text-primario-700">{proveedores.length}</div></div>
        <div className="card p-4"><div className="text-xs text-gray-500">Total por pagar</div><div className="text-2xl font-bold text-amber-700">{money(cuentas.reduce((s, x) => s + Number(x.saldoPendiente || 0), 0))}</div></div>
      </div>

      <div className="card p-2 flex flex-wrap gap-2">
        {([
          ['compras', 'Compras', ClipboardList], ['ordenes', 'Órdenes de compra', ClipboardList], ['reposicion', 'Reposición sugerida', Truck], ['proveedores', 'Proveedores', Building2], ['analisis', 'Análisis de proveedores', Building2], ['por-pagar', 'Cuentas por pagar', CreditCard],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-2 ${tab === key ? 'bg-primario-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}><Icon size={16} />{label}</button>
        ))}
      </div>

      {tab !== 'proveedores' && tab !== 'analisis' && tab !== 'reposicion' && tab !== 'ordenes' && <div className="card p-3"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9" placeholder="Buscar proveedor, documento o número de compra..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></div></div>}

      {tab === 'compras' && <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-4 py-3 text-left">Compra</th><th className="px-4 py-3 text-left">Fecha</th><th className="px-4 py-3 text-left">Proveedor</th><th className="px-4 py-3 text-left">Condición</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3 text-center">Estado</th></tr></thead><tbody className="divide-y divide-gray-100">{filtradas.map((c) => <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => verDetalle(c.id)}><td className="px-4 py-3 font-mono">#{c.id} {c.serie}-{c.numero}</td><td className="px-4 py-3">{String(c.fechaDocumento || '').slice(0, 10)}</td><td className="px-4 py-3"><div className="font-medium">{c.proveedorNombre}</div><div className="text-xs text-gray-400">{c.proveedorNumero}</div></td><td className="px-4 py-3">{c.condicionPago}</td><td className="px-4 py-3 text-right font-semibold">{money(c.total)}</td><td className="px-4 py-3 text-right">{money(c.saldoPendiente)}</td><td className="px-4 py-3 text-center"><span className={`badge ${c.estado === 'RECIBIDA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{c.estado}</span></td></tr>)}{!filtradas.length && <tr><td colSpan={7} className="py-10 text-center text-gray-400">Aún no hay compras registradas en esta sucursal.</td></tr>}</tbody></table></div></div>}

      {tab === 'ordenes' && <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Órdenes de compra</h3><p className="text-xs text-gray-500">Pedidos a proveedores antes de registrar la recepción de mercadería.</p></div><button onClick={crearOrdenDesdeReposicion} disabled={!sugerenciasReposicion.length} className="btn-primary"><Plus size={16}/> Crear desde reposición</button></div>
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th className="px-3 py-3 text-left">Orden</th><th className="px-3 py-3 text-left">Proveedor</th><th className="px-3 py-3 text-left">Fecha</th><th className="px-3 py-3 text-right">Líneas</th><th className="px-3 py-3 text-right">Pendiente</th><th className="px-3 py-3 text-right">Estimado</th><th className="px-3 py-3 text-center">Estado</th><th className="px-3 py-3 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-gray-100">
          {ordenesCompra.map((o:any)=><tr key={o.id}><td className="px-3 py-3 font-medium">{o.numeroOrden}</td><td className="px-3 py-3">{o.proveedorNombre}</td><td className="px-3 py-3">{String(o.fechaOrden).slice(0,10)}</td><td className="px-3 py-3 text-right">{o.totalLineas}</td><td className="px-3 py-3 text-right">{Number(o.unidadesPendientes).toFixed(3)}</td><td className="px-3 py-3 text-right">{money(o.totalEstimado)}</td><td className="px-3 py-3 text-center"><span className={`badge ${o.estado==='RECIBIDA'?'bg-green-100 text-green-700':o.estado==='RECIBIDA_PARCIAL'?'bg-amber-100 text-amber-800':'bg-blue-100 text-blue-700'}`}>{o.estado.replaceAll('_',' ')}</span></td><td className="px-3 py-3 text-right whitespace-nowrap">{['ENVIADA','RECIBIDA_PARCIAL'].includes(o.estado)&&<button onClick={()=>recepcionarOrden(o.id)} className="text-emerald-700 mr-3">Recibir</button>}{o.estado==='BORRADOR'&&<button onClick={()=>cambiarEstadoOrden(o.id,'enviar')} className="text-blue-700 mr-3">Enviar</button>}{['BORRADOR','ENVIADA'].includes(o.estado)&&<button onClick={()=>cambiarEstadoOrden(o.id,'cancelar')} className="text-red-600">Cancelar</button>}</td></tr>)}
          {!ordenesCompra.length&&<tr><td colSpan={8} className="py-10 text-center text-gray-400">Todavía no hay órdenes de compra.</td></tr>}
        </tbody></table></div></div>
      </div>}

      {tab === 'reposicion' && <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card p-4"><div className="text-xs text-gray-500">Productos que requieren atención</div><div className="text-2xl font-bold text-primario-700">{sugerenciasReposicion.length}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">Agotados / bajo mínimo</div><div className="text-2xl font-bold text-red-700">{sugerenciasReposicion.filter((x:any)=>x.prioridad==='AGOTADO'||x.prioridad==='STOCK_BAJO').length}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">Inversión estimada de reposición</div><div className="text-2xl font-bold text-primario-700">{money(sugerenciasReposicion.reduce((n:number,x:any)=>n+Number(x.inversionEstimada||0),0))}</div></div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          Cálculo orientativo con las salidas de venta de los últimos 30 días. La cantidad sugerida busca cubrir 14 días de demanda; no constituye una orden de compra y debe revisarse con el proveedor y los plazos reales.
        </div>
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-3 py-3 text-left">Producto</th><th className="px-3 py-3 text-right">Stock</th><th className="px-3 py-3 text-right">Vendidos 30d</th><th className="px-3 py-3 text-right">Cobertura</th><th className="px-3 py-3 text-right">Reponer</th><th className="px-3 py-3 text-left">Último proveedor</th><th className="px-3 py-3 text-right">Inversión</th><th className="px-3 py-3 text-center">Prioridad</th></tr></thead><tbody className="divide-y divide-gray-100">
          {sugerenciasReposicion.map((x:any)=><tr key={`${x.productoId}-${x.varianteId||'base'}`} className="hover:bg-gray-50"><td className="px-3 py-3"><div className="font-medium">{x.productoNombre}{x.varianteNombre?` · ${x.varianteNombre}`:''}</div><div className="text-xs text-gray-400">{x.codigo||'Sin código'} · {x.sucursalNombre}</div></td><td className="px-3 py-3 text-right">{Number(x.stock).toFixed(3)}</td><td className="px-3 py-3 text-right">{Number(x.unidadesVendidas30d).toFixed(3)}</td><td className="px-3 py-3 text-right">{x.diasCobertura===null?'—':`${Number(x.diasCobertura).toFixed(1)} días`}</td><td className="px-3 py-3 text-right font-bold">{Number(x.cantidadSugerida).toFixed(0)}</td><td className="px-3 py-3">{x.ultimoProveedorNombre||'Sin historial'}</td><td className="px-3 py-3 text-right">{money(x.inversionEstimada)}</td><td className="px-3 py-3 text-center"><span className={`badge ${x.prioridad==='AGOTADO'?'bg-red-100 text-red-700':x.prioridad==='STOCK_BAJO'?'bg-amber-100 text-amber-800':'bg-blue-100 text-blue-700'}`}>{x.prioridad.replaceAll('_',' ')}</span></td></tr>)}
          {!sugerenciasReposicion.length&&<tr><td colSpan={8} className="py-10 text-center text-gray-400">No hay productos que requieran reposición según el stock y las ventas recientes.</td></tr>}
        </tbody></table></div></div>
      </div>}

      {tab === 'proveedores' && <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-4 py-3 text-left">Documento</th><th className="px-4 py-3 text-left">Proveedor / Razón social</th><th className="px-4 py-3 text-left">Contacto</th><th className="px-4 py-3 text-left">Teléfono</th><th className="px-4 py-3 text-left">Email</th><th className="px-4 py-3 text-center">Estado</th><th className="px-4 py-3 text-center">Acciones</th></tr></thead><tbody className="divide-y divide-gray-100">{proveedores.map((p) => <tr key={p.id}><td className="px-4 py-3 font-mono text-xs">{p.tipoDoc} · {p.numero}</td><td className="px-4 py-3 font-medium">{p.nombre}</td><td className="px-4 py-3">{p.contacto || '-'}</td><td className="px-4 py-3">{p.telefono || '-'}</td><td className="px-4 py-3">{p.email || '-'}</td><td className="px-4 py-3 text-center">{p.activo ? <span className="badge bg-green-100 text-green-700">Activo</span> : <span className="badge bg-gray-100 text-gray-500">Inactivo</span>}</td><td className="px-4 py-3 text-center"><div className="flex justify-center gap-1"><button className="p-2 rounded hover:bg-gray-100 text-primario-700" onClick={() => abrirProveedorEditar(p)} title="Editar"><Pencil size={14} /></button>{p.activo && <button className="p-2 rounded hover:bg-red-50 text-red-600" onClick={() => desactivarProveedor(p)} title="Desactivar"><Ban size={14} /></button>}</div></td></tr>)}{!proveedores.length && <tr><td colSpan={7} className="py-10 text-center text-gray-400">Registre sus proveedores para comenzar.</td></tr>}</tbody></table></div></div>}

      {tab === 'analisis' && <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card p-4"><div className="text-xs text-gray-500">Proveedores con compras</div><div className="text-2xl font-bold text-primario-700">{analisisProveedores.proveedores.filter(p=>Number(p.cantidadCompras)>0).length}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">Compras acumuladas</div><div className="text-2xl font-bold text-primario-700">{money(analisisProveedores.proveedores.reduce((n,p)=>n+Number(p.totalComprado||0),0))}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">Devoluciones a proveedores</div><div className="text-2xl font-bold text-amber-700">{money(analisisProveedores.proveedores.reduce((n,p)=>n+Number(p.totalDevuelto||0),0))}</div></div>
        </div>
        <section className="card overflow-hidden"><div className="p-4 border-b"><h3 className="font-semibold">Desempeño por proveedor</h3><p className="text-xs text-gray-500">Importes y cumplimiento calculados con compras y órdenes registradas en esta sucursal.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th className="p-3 text-left">Proveedor</th><th className="p-3 text-right">Compras</th><th className="p-3 text-right">Total comprado</th><th className="p-3 text-right">Saldo</th><th className="p-3 text-right">Devoluciones</th><th className="p-3 text-right">Órdenes a tiempo</th><th className="p-3 text-left">Última compra</th></tr></thead><tbody className="divide-y">{analisisProveedores.proveedores.map(p=><tr key={p.proveedorId}><td className="p-3"><div className="font-medium">{p.proveedorNombre}</div><div className="text-xs text-gray-400">{p.tipoDoc} · {p.numero}</div></td><td className="p-3 text-right">{p.cantidadCompras}</td><td className="p-3 text-right font-semibold">{money(p.totalComprado)}</td><td className="p-3 text-right">{money(p.saldoPendiente)}</td><td className="p-3 text-right">{money(p.totalDevuelto)} <span className="text-xs text-gray-400">({p.cantidadDevoluciones})</span></td><td className="p-3 text-right">{p.ordenesConRecepcion ? `${p.ordenesATiempo}/${p.ordenesConRecepcion}` : 'Sin datos'}</td><td className="p-3">{p.ultimaCompra ? String(p.ultimaCompra).slice(0,10) : '—'}</td></tr>)}{!analisisProveedores.proveedores.length&&<tr><td colSpan={7} className="p-8 text-center text-gray-400">No hay información de proveedores para esta sucursal.</td></tr>}</tbody></table></div></section>
        <section className="card overflow-hidden"><div className="p-4 border-b"><h3 className="font-semibold">Comparación de costos por producto o presentación</h3><p className="text-xs text-gray-500">Compara el último costo unitario registrado por cada proveedor. El menor costo aparece señalado; no implica equivalencia de calidad, flete o condiciones comerciales.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th className="p-3 text-left">Producto / presentación</th><th className="p-3 text-left">Proveedor</th><th className="p-3 text-right">Último costo unitario</th><th className="p-3 text-left">Fecha</th><th className="p-3 text-center">Comparación</th></tr></thead><tbody className="divide-y">{analisisProveedores.comparacionCostos.map((x:any)=><tr key={`${x.productoId}-${x.varianteId||0}-${x.proveedorId}`}><td className="p-3"><div className="font-medium">{x.productoNombre}</div>{x.varianteNombre&&<div className="text-xs text-gray-500">{x.varianteNombre}</div>}</td><td className="p-3">{x.proveedorNombre}</td><td className="p-3 text-right">{money(x.costoUnitario)}</td><td className="p-3">{String(x.fechaDocumento).slice(0,10)}</td><td className="p-3 text-center">{x.esMasEconomico?<span className="badge bg-green-100 text-green-700">Menor costo</span>:<span className="text-xs text-gray-400">—</span>}</td></tr>)}{!analisisProveedores.comparacionCostos.length&&<tr><td colSpan={5} className="p-8 text-center text-gray-400">Se necesita historial de compras recibidas para comparar precios.</td></tr>}</tbody></table></div></section>
        <section className="card overflow-hidden"><div className="p-4 border-b"><h3 className="font-semibold">Historial reciente de precios</h3><p className="text-xs text-gray-500">Últimos cinco registros por proveedor y producto/presentación.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th className="p-3 text-left">Producto</th><th className="p-3 text-left">Proveedor</th><th className="p-3 text-right">Costo unitario</th><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Compra</th></tr></thead><tbody className="divide-y">{analisisProveedores.preciosRecientes.map((x:any,i:number)=><tr key={`${x.compraId}-${x.productoId}-${x.varianteId||0}`}><td className="p-3">{x.productoNombre}{x.varianteNombre?` · ${x.varianteNombre}`:''}</td><td className="p-3">{x.proveedorNombre}</td><td className="p-3 text-right">{money(x.costoUnitario)}</td><td className="p-3">{String(x.fechaDocumento).slice(0,10)}</td><td className="p-3">#{x.compraId}</td></tr>)}{!analisisProveedores.preciosRecientes.length&&<tr><td colSpan={5} className="p-8 text-center text-gray-400">No hay historial de precios.</td></tr>}</tbody></table></div></section>
      </div>}

      {tab === 'por-pagar' && <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-4 py-3 text-left">Proveedor</th><th className="px-4 py-3 text-left">Compra</th><th className="px-4 py-3 text-left">Fecha</th><th className="px-4 py-3 text-left">Vencimiento</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Pagado</th><th className="px-4 py-3 text-right">Pendiente</th><th className="px-4 py-3 text-center">Acción</th></tr></thead><tbody className="divide-y divide-gray-100">{cuentas.filter((c) => `${c.proveedorNombre} ${c.numero} ${c.serie}`.toLowerCase().includes(busqueda.toLowerCase())).map((c) => <tr key={c.id}><td className="px-4 py-3 font-medium">{c.proveedorNombre}</td><td className="px-4 py-3 font-mono">#{c.id} {c.serie}-{c.numero}</td><td className="px-4 py-3">{String(c.fechaDocumento || '').slice(0, 10)}</td><td className="px-4 py-3"><div>{String(c.fechaVencimiento || 'Sin fecha').slice(0, 10)}</div><span className={`badge ${c.estadoVencimiento === 'VENCIDO' ? 'bg-red-100 text-red-700' : c.estadoVencimiento === 'POR_VENCER' || c.estadoVencimiento === 'VENCE_HOY' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{c.estadoVencimiento === 'VENCIDO' ? `Vencido · ${c.diasVencido} días` : c.estadoVencimiento === 'VENCE_HOY' ? 'Vence hoy' : c.estadoVencimiento === 'POR_VENCER' ? 'Por vencer' : 'Vigente'}</span></td><td className="px-4 py-3 text-right">{money(c.total)}</td><td className="px-4 py-3 text-right">{money(c.pagado)}</td><td className="px-4 py-3 text-right font-bold text-amber-700">{money(c.saldoPendiente)}</td><td className="px-4 py-3 text-center"><button onClick={() => { setPagoCuenta(c); setClavePago(`purchase-payment-${crypto.randomUUID()}`); setPagoForm({ metodoPago: 'EFECTIVO', monto: Number(c.saldoPendiente).toFixed(2), cajaId: String(cajas[0]?.id || ''), referencia: '' }); }} className="btn-primario text-xs px-3 py-2"><Wallet size={13} className="inline mr-1" /> Pagar</button></td></tr>)}{!cuentas.length && <tr><td colSpan={8} className="py-10 text-center text-gray-400">No hay cuentas pendientes por pagar.</td></tr>}</tbody></table></div></div>}

      {modalProveedor && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={() => setModalProveedor(false)}><div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}><div className="flex justify-between items-center"><h3 className="font-bold text-lg">{editandoProveedorId ? 'Editar proveedor' : 'Nuevo proveedor'}</h3><button onClick={() => setModalProveedor(false)}><X size={20} /></button></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="label">Tipo de documento</label><select className="input" value={proveedorForm.tipoDoc} onChange={(e) => setProveedorForm({ ...proveedorForm, tipoDoc: e.target.value })}><option value="RUC">RUC</option><option value="DNI">DNI</option><option value="OTRO">Otro</option></select></div><div><label className="label">Número *</label><input className="input" value={proveedorForm.numero} maxLength={15} onChange={(e) => setProveedorForm({ ...proveedorForm, numero: e.target.value.replace(/[^0-9A-Za-z-]/g, '') })} /></div><div className="sm:col-span-2"><label className="label">Razón social / Nombre *</label><input className="input" value={proveedorForm.nombre} onChange={(e) => setProveedorForm({ ...proveedorForm, nombre: e.target.value.toUpperCase() })} /></div><div><label className="label">Teléfono</label><input className="input" value={proveedorForm.telefono} onChange={(e) => setProveedorForm({ ...proveedorForm, telefono: e.target.value })} /></div><div><label className="label">Email</label><input type="email" className="input" value={proveedorForm.email} onChange={(e) => setProveedorForm({ ...proveedorForm, email: e.target.value })} /></div><div><label className="label">Contacto</label><input className="input" value={proveedorForm.contacto} onChange={(e) => setProveedorForm({ ...proveedorForm, contacto: e.target.value })} /></div><div><label className="label">Dirección</label><input className="input" value={proveedorForm.direccion} onChange={(e) => setProveedorForm({ ...proveedorForm, direccion: e.target.value })} /></div></div><div className="flex justify-end gap-2"><button className="btn-secundario" onClick={() => setModalProveedor(false)}>Cancelar</button><button className="btn-ambar" onClick={guardarProveedor} disabled={!proveedorForm.numero.trim() || !proveedorForm.nombre.trim()}>{editandoProveedorId ? 'Guardar cambios' : 'Guardar proveedor'}</button></div></div></div>}

      {modalCompra && <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-3 overflow-y-auto" onClick={() => setModalCompra(false)}><div className="bg-white rounded-xl shadow-xl w-full max-w-4xl p-5 my-4 space-y-4" onClick={(e) => e.stopPropagation()}><div className="flex justify-between items-center"><h3 className="font-bold text-lg flex gap-2 items-center"><Truck size={20} /> Registrar compra y recibir mercadería</h3><button onClick={() => setModalCompra(false)}><X size={20} /></button></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="sm:col-span-2"><label className="label">Proveedor *</label><select className="input" value={compraForm.proveedorId} onChange={(e) => setCompraForm({ ...compraForm, proveedorId: e.target.value })}><option value="">Seleccione proveedor...</option>{proveedores.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.numero}</option>)}</select></div><div><label className="label">Documento</label><select className="input" value={compraForm.tipoDocumento} onChange={(e) => cambiarTipoDocumento(e.target.value)}><option value="01">Factura proveedor</option><option value="03">Boleta proveedor</option><option value="NV">Nota de venta</option><option value="OT">Otro</option></select></div><div><label className="label">Serie</label><input className="input" value={compraForm.serie} onChange={(e) => setCompraForm({ ...compraForm, serie: e.target.value.toUpperCase() })} /></div><div><label className="label">Número</label><input className="input" value={compraForm.numero} onChange={(e) => setCompraForm({ ...compraForm, numero: e.target.value })} /></div><div><label className="label">Fecha documento</label><input type="date" className="input" value={compraForm.fechaDocumento} onChange={(e) => setCompraForm({ ...compraForm, fechaDocumento: e.target.value })} /></div></div>
        <div className="border rounded-lg overflow-hidden"><div className="bg-gray-50 p-3 font-semibold text-sm">Productos recibidos · lote y vencimiento</div><div className="p-3 space-y-3">{lineas.map((linea, index) => <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end border-b pb-3"><div className="sm:col-span-3"><label className="label">Producto</label><select className="input" value={linea.productoId || ''} onChange={(e) => cambiarProducto(index, Number(e.target.value))}><option value="">Seleccione...</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}{p.tieneVariantes ? ' (familia de presentaciones)' : ` (stock ${Number(p.stock).toFixed(3)})`}</option>)}</select>
          {productos.find((p) => p.id === linea.productoId)?.tieneVariantes && <div className="mt-2">
            <label className="label">Presentación recibida *</label>
            <select className="input" value={linea.varianteId || ''} onChange={(e) => cambiarVariante(index, Number(e.target.value))}>
              <option value="">Seleccione presentación...</option>
              {(variantesPorProducto[linea.productoId] || []).map((v) => <option key={v.id} value={v.id}>{v.codigo} · {v.nombre} (stock {Number(v.stock).toFixed(3)})</option>)}
            </select>
          </div>}
        </div><div className="sm:col-span-1"><label className="label">Cantidad</label><input type="number" min="0.001" step="0.001" className="input" value={linea.cantidad} onChange={(e) => setLineas((ls) => ls.map((l, i) => i === index ? { ...l, cantidad: e.target.value } : l))} /></div><div className="sm:col-span-1"><label className="label">Empaque</label><select className="input" value={linea.unidadCompra} onChange={(e) => setLineas((ls) => ls.map((l, i) => { if (i !== index) return l; const unidades = e.target.value === 'DOCENA' ? 12 : e.target.value === 'UNIDAD' ? 1 : Number(l.unidadesPorEmpaque || 1); const costoUnidad = Number(l.costoEmpaque || 0) / Math.max(Number(l.unidadesPorEmpaque || 1), 0.001); return { ...l, unidadCompra: e.target.value, unidadesPorEmpaque: String(unidades), costoEmpaque: (costoUnidad * unidades).toFixed(4) }; }))}><option>UNIDAD</option><option>CAJA</option><option>PAQUETE</option><option>DOCENA</option><option>FARDO</option><option>BOLSA</option></select></div><div className="sm:col-span-1"><label className="label">Unid./empaque</label><input type="number" min="0.001" step="0.001" className="input" value={linea.unidadesPorEmpaque} onChange={(e) => setLineas((ls) => ls.map((l, i) => { if (i !== index) return l; const unidades = Number(e.target.value); const costoUnidad = Number(l.costoEmpaque || 0) / Math.max(Number(l.unidadesPorEmpaque || 1), 0.001); return { ...l, unidadesPorEmpaque: e.target.value, costoEmpaque: (costoUnidad * unidades).toFixed(4) }; }))} /></div><div className="sm:col-span-2"><label className="label">Costo por empaque (S/)</label><input type="number" min="0.0001" step="0.0001" className="input" value={linea.costoEmpaque} onChange={(e) => setLineas((ls) => ls.map((l, i) => i === index ? { ...l, costoEmpaque: e.target.value } : l))} /><p className="text-[10px] text-gray-500">Costo/unidad: S/ {(Number(linea.costoEmpaque || 0) / Math.max(Number(linea.unidadesPorEmpaque || 1), 1)).toFixed(4)}</p></div><div className="sm:col-span-2"><label className="label">Código de lote</label><input className="input" maxLength={80} value={linea.codigoLote} onChange={(e)=>setLineas(ls=>ls.map((l,i)=>i===index?{...l,codigoLote:e.target.value}:l))} placeholder="Opcional" /></div><div className="sm:col-span-1"><label className="label">Vence</label><input type="date" className="input" value={linea.fechaVencimiento} onChange={(e)=>setLineas(ls=>ls.map((l,i)=>i===index?{...l,fechaVencimiento:e.target.value}:l))} /></div><div className="sm:col-span-1 flex gap-1"><button className="btn-secundario w-full" title="Quitar línea" onClick={() => setLineas((ls) => ls.length === 1 ? ls : ls.filter((_, i) => i !== index))}><X size={16} /></button></div></div>)}<button className="text-sm text-primario-700 font-semibold flex items-center gap-1" onClick={() => setLineas((ls) => [...ls, { productoId: 0, cantidad: '1', unidadCompra: 'UNIDAD', unidadesPorEmpaque: '1', costoEmpaque: '0.00', costoUnitario: '0.00',codigoLote:'',fechaVencimiento:'' }])}><Plus size={15} /> Agregar producto</button></div></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"><div><label className="label">Condición de pago</label><select className="input" value={compraForm.condicionPago} onChange={(e) => setCompraForm({ ...compraForm, condicionPago: e.target.value })}><option value="CONTADO">Contado</option><option value="CREDITO">Crédito proveedor</option></select></div>{compraForm.condicionPago === 'CREDITO' && <div><label className="label">Fecha de vencimiento *</label><input type="date" className="input" min={compraForm.fechaDocumento} value={compraForm.fechaVencimiento} onChange={(e) => setCompraForm({ ...compraForm, fechaVencimiento: e.target.value })} /></div>}{compraForm.condicionPago === 'CONTADO' && <div className="sm:col-span-2"><label className="label">Distribución de pagos (puede combinar medios)</label><div className="space-y-2">{pagosCompra.map((pago, index) => <div key={index} className="flex flex-wrap gap-2"><select className="input flex-1 min-w-32" value={pago.metodoPago} onChange={(e) => setPagosCompra((items) => items.map((item, i) => i === index ? { ...item, metodoPago: e.target.value as typeof METODOS[number] } : item))}>{METODOS.map((m) => <option key={m} value={m}>{m}</option>)}</select><input type="number" min="0.01" step="0.01" className="input w-32" placeholder="Monto S/" value={pago.monto} onChange={(e) => setPagosCompra((items) => items.map((item, i) => i === index ? { ...item, monto: e.target.value } : item))} /><button type="button" className="btn-secundario text-xs" disabled={pagosCompra.length === 1} onClick={() => setPagosCompra((items) => items.filter((_, i) => i !== index))}>Quitar</button></div>)}<div className="flex flex-wrap items-center gap-2"><button type="button" className="btn-secundario text-xs" disabled={pagosCompra.length >= 5} onClick={() => setPagosCompra((items) => [...items, { metodoPago: 'YAPE', monto: '' }])}>+ Añadir medio</button><button type="button" className="text-xs text-primario-700 underline" onClick={() => { const restante = Math.max(0, totalCompra - pagosCompra.slice(0, -1).reduce((sum, p) => sum + Math.max(0, Number(p.monto) || 0), 0)); setPagosCompra((items) => items.map((p, i) => i === items.length - 1 ? { ...p, monto: restante.toFixed(2) } : p)); }}>Completar saldo en último medio</button><span className="text-xs text-gray-500">Asignado: {money(pagosCompra.reduce((sum, p) => sum + Math.max(0, Number(p.monto) || 0), 0))} / {money(totalCompra)}</span></div></div></div>}<div className="bg-primario-50 rounded-lg px-4 py-3 sm:col-span-1"><div className="text-xs text-primario-600">Total estimado</div><div className="font-bold text-xl text-primario-800">{money(totalCompra)}</div></div></div>
        {compraForm.condicionPago === 'CONTADO' && pagosCompra.some((p) => p.metodoPago !== 'TRANSFERENCIA' && Number(p.monto) > 0) && <p className="text-xs text-amber-700">Los medios distintos de transferencia registrarán salidas en la caja abierta del usuario. Cajas disponibles: {cajas.length}.</p>}
        <div className="flex justify-end gap-2"><button className="btn-secundario" onClick={() => setModalCompra(false)}>Cancelar</button><button className="btn-ambar flex items-center gap-2" onClick={guardarCompra} disabled={guardandoCompra || !proveedores.some((p) => p.id === Number(compraForm.proveedorId) && p.activo) || totalCompra <= 0}><CheckCircle2 size={16} /> {guardandoCompra ? 'Registrando compra…' : 'Guardar y recibir compra'}</button></div>
      </div></div>}

      {pagoCuenta && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={() => setPagoCuenta(null)}><div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}><div className="flex justify-between"><h3 className="font-bold">Registrar pago a proveedor</h3><button onClick={() => setPagoCuenta(null)}><X size={18} /></button></div><p className="text-sm text-gray-600">Compra #{pagoCuenta.id} · Saldo: <b>{money(pagoCuenta.saldoPendiente)}</b></p><div><label className="label">Importe a pagar (S/)</label><input type="number" min="0.01" max={pagoCuenta.saldoPendiente} step="0.01" className="input" value={pagoForm.monto} onChange={(e) => setPagoForm({ ...pagoForm, monto: e.target.value })} /></div><div><label className="label">Medio de pago</label><select className="input" value={pagoForm.metodoPago} onChange={(e) => setPagoForm({ ...pagoForm, metodoPago: e.target.value })}>{METODOS.map((m) => <option key={m}>{m}</option>)}</select></div>{pagoForm.metodoPago !== 'TRANSFERENCIA' && <div><label className="label">Caja abierta</label><select className="input" value={pagoForm.cajaId} onChange={(e) => setPagoForm({ ...pagoForm, cajaId: e.target.value })}><option value="">Seleccione caja...</option>{cajas.map((c) => <option key={c.id} value={c.id}>Caja #{c.id} · Fondo {money(c.saldoInicial)}</option>)}</select></div>}<div><label className="label">Referencia (opcional)</label><input className="input" value={pagoForm.referencia} onChange={(e) => setPagoForm({ ...pagoForm, referencia: e.target.value })} placeholder="N.º de operación" /></div><div className="flex justify-end gap-2"><button className="btn-secundario" onClick={() => setPagoCuenta(null)}>Cancelar</button><button className="btn-ambar" onClick={registrarPago} disabled={Number(pagoForm.monto) <= 0 || Number(pagoForm.monto) - Number(pagoCuenta.saldoPendiente) > 0.01}>Registrar pago</button></div></div></div>}

      {detalle && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={() => setDetalle(null)}><div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between"><div><h3 className="font-bold text-lg">Compra #{detalle.id} · {detalle.serie}-{detalle.numero}</h3><p className="text-sm text-gray-500">{detalle.proveedorNombre} · {String(detalle.fechaDocumento || '').slice(0, 10)}</p></div><button onClick={() => setDetalle(null)}><X size={20} /></button></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-2 text-left">Producto y lote</th><th className="p-2 text-right">Cantidad</th><th className="p-2 text-right">Costo unitario</th><th className="p-2 text-right">Subtotal</th></tr></thead><tbody>{(detalle.lineas || []).map((l: any) => <tr key={l.id} className="border-b"><td className="p-2">{l.codigo} · {l.productoNombre}{l.varianteNombre && <span className="font-semibold text-indigo-700"> · {l.varianteNombre}</span>}<div className="text-xs text-gray-500">Lote {l.codigoLote||'—'} · vence {String(l.fechaVencimiento||'—').slice(0,10)}</div></td><td className="p-2 text-right">{Number(l.cantidad).toFixed(3)}<div className="text-[10px] text-gray-500">{Number(l.cantidadEmpaques || l.cantidad).toFixed(3)} {l.unidadCompra || 'UNIDAD'} × {Number(l.unidadesPorEmpaque || 1).toFixed(3)}</div></td><td className="p-2 text-right">{money(l.costoUnitario)}<div className="text-[10px] text-gray-500">/ unidad · empaque {money(l.costoEmpaque)}</div></td><td className="p-2 text-right">{money(l.subtotal)}</td><td>{detalle.estado==='RECIBIDA'&&<button className="text-xs text-red-700 underline" onClick={()=>devolverAlProveedor(l)}>Devolver</button>}</td></tr>)}</tbody></table></div><div className="flex justify-end gap-8 text-sm"><div>Total <b>{money(detalle.total)}</b></div><div>Pagado <b>{money(detalle.pagado)}</b></div><div>Pendiente <b className="text-amber-700">{money(detalle.saldoPendiente)}</b></div></div><div className="border-t pt-3"><h4 className="font-semibold text-sm mb-2">Pagos registrados</h4>{(detalle.pagos || []).length ? detalle.pagos.map((p: any) => <div key={p.id} className="flex justify-between text-sm py-1"><span>{p.metodoPago} {p.referencia ? `· ${p.referencia}` : ''}</span><b>{money(p.monto)}</b></div>) : <p className="text-xs text-gray-400">Compra pendiente de pago.</p>}</div>{(detalle.devoluciones||[]).length>0&&<div className="border-t pt-3"><h4 className="font-semibold text-sm mb-2">Devoluciones al proveedor</h4>{detalle.devoluciones.map((d:any)=><div key={d.id} className="flex flex-wrap justify-between text-sm py-1"><span>#{d.id} · {d.motivo}</span><span>{money(d.total)} · aplicado {money(d.aplicadoCuenta)} · a favor {money(d.saldoAFavor)}</span></div>)}</div>}<div className="flex flex-wrap justify-end gap-2"><button className="btn-secundario" onClick={() => setDetalle(null)}>Cerrar</button>{detalle.estado === 'RECIBIDA' && Number(detalle.pagado) === 0 && <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm" onClick={() => anularCompra(detalle)}>Anular compra</button>}</div></div></div>}
    </div>
  );
}
