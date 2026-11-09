import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Pencil, Trash2, Package, ArrowLeftRight, Send, History, Layers, Barcode } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../db';
import { api, ES_MODO_DEMO } from '../api/client';
import { formatearMoneda, etiquetaTipoIgv } from '../utils/igv';
import Modal from '../components/ui/Modal';
import type { Producto, TipoIgv } from '../types';
import { useAuth } from '../context/AuthContext';
import { fetchCurrentSupabaseCatalog, mapSupabaseProductRows, mutateSupabaseCatalog, mutateSupabaseVariant } from '../api/supabaseCatalog';
import { registrarAjusteInventarioSupabase, transferirInventarioSupabase } from '../api/supabaseInventory';

type Variante = {
  id?: number; productoId?: number; codigo: string; codigoBarras?: string | null;
  nombre: string; precio: number; precioMayoreo?: number | null; activo: boolean;
  stock?: number; stockMinimo?: number;
};
const VARIANTE_VACIA: Variante = { codigo: '', codigoBarras: '', nombre: '', precio: 0, precioMayoreo: undefined, activo: true, stock: 0, stockMinimo: 0 };

const VACIO: Producto = {
  codigo: '',
  codigoBarras: '',
  tieneVariantes: false,
  nombre: '',
  categoria: 'General',
  unidad: 'UND',
  precio: 0,
  precioMayoreo: 0,
  stock: 0,
  stockMinimo: 0,
  tipoIgv: '10',
  activo: true,
};

// CRUD completo de productos (persistencia en IndexedDB, sincronizable con backend).
export default function Productos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('TODOS');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [form, setForm] = useState<Producto>(VACIO);
  const [productoAjuste, setProductoAjuste] = useState<Producto | null>(null);
  const [tipoAjuste, setTipoAjuste] = useState<'ENTRADA' | 'SALIDA'>('ENTRADA');
  const [cantidadAjuste, setCantidadAjuste] = useState('');
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [productoTransferencia, setProductoTransferencia] = useState<Producto | null>(null);
  const [sucursalDestino, setSucursalDestino] = useState('');
  const [cantidadTransferencia, setCantidadTransferencia] = useState('');
  const [motivoTransferencia, setMotivoTransferencia] = useState('');
  const [claveTransferencia, setClaveTransferencia] = useState('');
  const [transferencias, setTransferencias] = useState<any[]>([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [productoVariantes, setProductoVariantes] = useState<Producto | null>(null);
  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [cargandoVariantes, setCargandoVariantes] = useState(false);
  const [varianteEditando, setVarianteEditando] = useState<Variante | null>(null);
  const [formVariante, setFormVariante] = useState<Variante>({ ...VARIANTE_VACIA });
  const [modalVarianteForm, setModalVarianteForm] = useState(false);
  const [varianteAjuste, setVarianteAjuste] = useState<Variante | null>(null);
  const [tipoAjusteVariante, setTipoAjusteVariante] = useState<'ENTRADA' | 'SALIDA'>('ENTRADA');
  const [cantidadAjusteVariante, setCantidadAjusteVariante] = useState('');
  const [motivoAjusteVariante, setMotivoAjusteVariante] = useState('');
  const [claveAjusteVariante, setClaveAjusteVariante] = useState('');
  const [varianteTransferencia, setVarianteTransferencia] = useState<Variante | null>(null);
  const [destinoVariante, setDestinoVariante] = useState('');
  const [cantidadVarianteTransferencia, setCantidadVarianteTransferencia] = useState('');
  const [motivoVarianteTransferencia, setMotivoVarianteTransferencia] = useState('');
  const [claveVarianteTransferencia, setClaveVarianteTransferencia] = useState('');
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const { usuario, tieneRol } = useAuth();
  const esAdmin = tieneRol('ADMIN');

  async function recargar() {
    if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
      const catalog = await fetchCurrentSupabaseCatalog(Number(usuario?.sucursalId));
      const datos = mapSupabaseProductRows(catalog) as Producto[];
      setProductos(datos);
      await db.productos.bulkPut(datos.filter(p => Number.isSafeInteger(p.id) && Number(p.id) > 0));
      return;
    }
    if (!ES_MODO_DEMO) {
      const respuesta = await api.get('/productos', { params: { sucursalId: Number(usuario?.sucursalId) } });
      const datos: Producto[] = (respuesta.data || []).map((p: any) => ({
        ...p, id: Number(p.id), tieneVariantes: Boolean(p.tieneVariantes), precio: Number(p.precio), precioMayoreo: p.precioMayoreo == null ? undefined : Number(p.precioMayoreo),
        stock: Number(p.stock), stockMinimo: Number(p.stockMinimo), tipoIgv: String(p.tipoIgv) as TipoIgv,
        categoria: p.categoria?.nombre || (p.categoriaId ? `Categoría ${p.categoriaId}` : 'General'),
      }));
      setProductos(datos);
      await db.productos.bulkPut(datos);
      return;
    }
    setProductos(await db.productos.toArray());
  }

  async function recargarTransferencias() {
    // El historial Supabase se habilitará cuando exista su RPC de lectura autenticada.
    // Evita consultar el endpoint REST heredado con sesiones Supabase.
    if (ES_MODO_DEMO || import.meta.env.VITE_AUTH_PROVIDER === 'supabase' || (usuario?.sucursales?.length || 0) < 2) {
      setTransferencias([]);
      return;
    }
    setCargandoHistorial(true);
    try {
      const respuesta = await api.get('/inventario/transferencias');
      setTransferencias(Array.isArray(respuesta.data) ? respuesta.data : []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo cargar el historial de transferencias');
    } finally {
      setCargandoHistorial(false);
    }
  }

  useEffect(() => {
    recargar();
    recargarTransferencias();
  }, [usuario?.sucursalId]);

  const categorias = useMemo(() => ['TODOS', ...Array.from(new Set(productos.map((p) => p.categoria)))], [productos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      const cat = categoria === 'TODOS' || p.categoria === categoria;
      const txt = !q || p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q) || (p.codigoBarras || '').toLowerCase().includes(q);
      return cat && txt;
    });
  }, [productos, busqueda, categoria]);

  function abrirNuevo() {
    setEditando(null);
    setForm({ ...VACIO });
    setModalAbierto(true);
  }

  function abrirEditar(p: Producto) {
    setEditando(p);
    setForm({ ...p });
    setModalAbierto(true);
  }

  async function guardar() {
    if (!form.codigo.trim() || !form.nombre.trim()) {
      toast.error('Código y nombre son obligatorios');
      return;
    }
    if (!form.tieneVariantes && form.precio <= 0) {
      toast.error('El precio debe ser mayor a 0');
      return;
    }
    if (form.tieneVariantes && Number(form.stock || 0) > 0) {
      toast.error('Las familias con variantes no llevan stock propio; registre el stock por presentación');
      return;
    }
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
        // El CRUD remoto se ejecuta con JWT de Supabase; la empresa se deriva en SQL desde auth.uid().
        const catalog = await fetchCurrentSupabaseCatalog(Number(usuario?.sucursalId));
        const categoryName = form.categoria.trim() || 'General';
        let category = catalog.categorias.find((c) => c.nombre.trim().toLocaleLowerCase() === categoryName.toLocaleLowerCase());
        if (!category) {
          const created = await mutateSupabaseCatalog('category_create', { nombre: categoryName });
          const categoryId = Number((created as any).id);
          if (!Number.isSafeInteger(categoryId) || categoryId <= 0) throw new Error('No se pudo confirmar la categoría creada.');
          category = { id: categoryId, nombre: categoryName, activo: true };
        }
        const payload = {
          id: editando?.id,
          codigo: form.codigo.trim(),
          codigo_barras: form.tieneVariantes ? null : (form.codigoBarras?.trim() || null),
          tiene_variantes: Boolean(form.tieneVariantes),
          nombre: form.nombre.trim(), categoria_id: category.id,
          unidad: form.unidad || 'UND',
          precio: form.tieneVariantes ? 0 : Number(form.precio),
          precio_mayoreo: form.tieneVariantes || !form.precioMayoreo ? null : Number(form.precioMayoreo),
          stock_minimo: Number(form.stockMinimo || 0), tipo_igv: Number(form.tipoIgv),
        };
        await mutateSupabaseCatalog(editando?.id ? 'product_update' : 'product_create', payload);
        toast.success(editando?.id ? 'Producto actualizado en Supabase' : 'Producto creado en Supabase');
      } else if (!ES_MODO_DEMO) {
        const payload = {
          codigo: form.codigo.trim(), codigoBarras: form.tieneVariantes ? undefined : (form.codigoBarras?.trim() || undefined),
          tieneVariantes: Boolean(form.tieneVariantes), nombre: form.nombre.trim(), unidad: form.unidad,
          precio: form.tieneVariantes ? 0 : Number(form.precio), precioMayoreo: form.tieneVariantes ? undefined : (form.precioMayoreo ? Number(form.precioMayoreo) : undefined),
          stock: form.tieneVariantes ? 0 : Number(form.stock), stockMinimo: Number(form.stockMinimo), tipoIgv: Number(form.tipoIgv),
        };
        if (editando?.id) {
          await api.put(`/productos/${editando.id}`, {
            codigo: payload.codigo, codigoBarras: payload.codigoBarras, tieneVariantes: payload.tieneVariantes,
            nombre: payload.nombre, unidad: payload.unidad,
            precio: payload.precio, precioMayoreo: payload.precioMayoreo,
            stockMinimo: payload.stockMinimo, tipoIgv: payload.tipoIgv,
          }, { params: { sucursalId: Number(usuario?.sucursalId) } });
          toast.success('Producto actualizado. El stock se modifica mediante un movimiento de inventario.');
        } else {
          await api.post('/productos', payload, { params: { sucursalId: Number(usuario?.sucursalId) } });
          toast.success('Producto creado');
        }
      } else if (editando?.id) {
        await db.productos.update(editando.id, form);
        toast.success('Producto actualizado');
      } else {
        await db.productos.add(form);
        toast.success('Producto creado');
      }
      setModalAbierto(false);
      await recargar();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'No se pudo guardar el producto');
    }
  }

  function abrirAjuste(p: Producto) {
    setProductoAjuste(p);
    setTipoAjuste('ENTRADA');
    setCantidadAjuste('');
    setMotivoAjuste('');
  }

  async function guardarAjuste() {
    if (!productoAjuste?.id) return;
    const cantidad = Number(cantidadAjuste);
    if (!Number.isFinite(cantidad) || cantidad <= 0 || Math.round(cantidad * 1000) !== cantidad * 1000) {
      toast.error('Ingrese una cantidad mayor a cero con máximo 3 decimales');
      return;
    }
    if (motivoAjuste.trim().length < 5) {
      toast.error('Explique el motivo con al menos 5 caracteres');
      return;
    }
    if (tipoAjuste === 'SALIDA' && cantidad > productoAjuste.stock) {
      toast.error(`Stock insuficiente. Disponible: ${productoAjuste.stock}`);
      return;
    }
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
        const sucursalId = Number(usuario?.sucursalId);
        if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0) throw new Error('No hay una sucursal activa válida');
        await registrarAjusteInventarioSupabase({
          sucursalId, productoId: productoAjuste.id, tipo: tipoAjuste, cantidad,
          motivo: motivoAjuste.trim(), idempotencyKey: nuevaClaveTransferencia(),
        });
      } else if (!ES_MODO_DEMO) {
        const sucursalId = Number(usuario?.sucursalId);
        if (!Number.isInteger(sucursalId) || sucursalId <= 0) throw new Error('No hay una sucursal activa válida');
        await api.post('/inventario/movimientos', {
          sucursalId, productoId: productoAjuste.id, tipo: tipoAjuste, cantidad, motivo: motivoAjuste.trim(),
        });
      } else {
        const stock = productoAjuste.stock + (tipoAjuste === 'ENTRADA' ? cantidad : -cantidad);
        await db.productos.update(productoAjuste.id, { stock });
      }
      toast.success(tipoAjuste === 'ENTRADA' ? 'Entrada de inventario registrada' : 'Salida de inventario registrada');
      setProductoAjuste(null);
      await recargar();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'No se pudo registrar el movimiento');
    }
  }

  function nuevaClaveTransferencia() {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function abrirTransferencia(p: Producto) {
    const destinos = (usuario?.sucursales || []).filter((s) => s.id !== usuario?.sucursalId);
    setProductoTransferencia(p);
    setSucursalDestino(destinos[0]?.id || '');
    setCantidadTransferencia('');
    setMotivoTransferencia('');
    setClaveTransferencia(nuevaClaveTransferencia());
  }

  async function guardarTransferencia() {
    if (!productoTransferencia?.id || !usuario?.sucursalId) return;
    if (!navigator.onLine) {
      toast.error('Conéctese a Internet para transferir inventario entre sucursales');
      return;
    }
    const cantidad = Number(cantidadTransferencia);
    if (!sucursalDestino || sucursalDestino === usuario.sucursalId) {
      toast.error('Seleccione una sucursal de destino diferente');
      return;
    }
    if (!Number.isFinite(cantidad) || cantidad <= 0 || Math.round(cantidad * 1000) !== cantidad * 1000) {
      toast.error('Ingrese una cantidad positiva con máximo 3 decimales');
      return;
    }
    if (cantidad > productoTransferencia.stock) {
      toast.error(`Stock insuficiente. Disponible en esta sucursal: ${productoTransferencia.stock}`);
      return;
    }
    if (motivoTransferencia.trim().length < 5) {
      toast.error('Explique el motivo con al menos 5 caracteres');
      return;
    }
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
        await transferirInventarioSupabase({
          sucursalOrigenId: Number(usuario.sucursalId),
          sucursalDestinoId: Number(sucursalDestino),
          lineas: [{ productoId: Number(productoTransferencia.id), cantidad }],
          motivo: motivoTransferencia.trim(),
          idempotencyKey: claveTransferencia,
        });
      } else {
        await api.post('/inventario/transferencias', {
          sucursalOrigenId: Number(usuario.sucursalId),
          sucursalDestinoId: Number(sucursalDestino),
          lineas: [{ productoId: productoTransferencia.id, cantidad }],
          motivo: motivoTransferencia.trim(),
          idempotencyKey: claveTransferencia,
        });
      }
      toast.success('Transferencia registrada. Se descontó el origen y se abonó el destino.');
      setProductoTransferencia(null);
      await recargar();
      await recargarTransferencias();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'No se pudo transferir el inventario');
    }
  }


  function abrirTransferenciaVariante(v: Variante) {
    const destinos=(usuario?.sucursales||[]).filter((s)=>s.id!==usuario?.sucursalId);
    setVarianteTransferencia(v); setDestinoVariante(destinos[0]?.id || '');
    setCantidadVarianteTransferencia(''); setMotivoVarianteTransferencia(''); setClaveVarianteTransferencia(nuevaClaveTransferencia());
  }

  async function guardarTransferenciaVariante() {
    if(!varianteTransferencia?.id || !usuario?.sucursalId) return;
    const cantidad=Number(cantidadVarianteTransferencia);
    if(!destinoVariante || !Number.isFinite(cantidad) || cantidad<=0 || Math.round(cantidad*1000)!==cantidad*1000 || cantidad>Number(varianteTransferencia.stock||0)) { toast.error('Revise destino y cantidad disponible de la presentación'); return; }
    if(motivoVarianteTransferencia.trim().length<5){toast.error('Indique un motivo de al menos 5 caracteres');return;}
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
        if (!varianteTransferencia.productoId) throw new Error('No se pudo identificar el producto de la presentación.');
        await transferirInventarioSupabase({
          sucursalOrigenId: Number(usuario.sucursalId),
          sucursalDestinoId: Number(destinoVariante),
          lineas: [{ productoId: Number(varianteTransferencia.productoId), varianteId: Number(varianteTransferencia.id), cantidad }],
          motivo: motivoVarianteTransferencia.trim(),
          idempotencyKey: claveVarianteTransferencia,
        });
      } else {
        await api.post('/inventario/transferencias/variantes',{sucursalOrigenId:Number(usuario.sucursalId),sucursalDestinoId:Number(destinoVariante),varianteId:varianteTransferencia.id,cantidad,motivo:motivoVarianteTransferencia.trim(),idempotencyKey:claveVarianteTransferencia});
      }
      toast.success('Presentación transferida. Se conservaron sus lotes y costo.'); setVarianteTransferencia(null);
      if(productoVariantes) await abrirVariantes(productoVariantes); await recargarTransferencias();
    } catch(error:any){toast.error(error?.response?.data?.message||error?.message||'No se pudo transferir la presentación');}
  }

  async function abrirVariantes(producto: Producto) {
    if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase' && producto.id) {
      setProductoVariantes(producto); setCargandoVariantes(true);
      try {
        const catalog = await fetchCurrentSupabaseCatalog(Number(usuario?.sucursalId));
        const stockRows = new Map<number, number>();
        for (const row of catalog.stock_variantes || []) { const id = Number((row as any).variante_id ?? (row as any).varianteId); if (id) stockRows.set(id, Number((row as any).stock ?? 0)); }
        const rows = (catalog.variantes || []).filter((v: any) => Number(v.producto_id ?? v.productoId) === Number(producto.id));
        setVariantes(rows.map((v: any) => ({ id:Number(v.id), productoId:Number(producto.id), codigo:String(v.codigo || ''), codigoBarras:v.codigo_barras ?? v.codigoBarras ?? null, nombre:String(v.nombre || ''), precio:Number(v.precio || 0), precioMayoreo:v.precio_mayoreo == null ? null : Number(v.precio_mayoreo), activo:Boolean(v.activo), stock:stockRows.get(Number(v.id)) || 0 })));
      } catch (error: any) { setProductoVariantes(null); toast.error(error?.message || 'No se pudieron cargar las presentaciones'); }
      finally { setCargandoVariantes(false); }
      return;
    }
    if (ES_MODO_DEMO || !producto.id) {
      toast.error('La gestión de variantes requiere conexión con el backend');
      return;
    }
    setProductoVariantes(producto);
    setCargandoVariantes(true);
    try {
      const sucursalId = Number(usuario?.sucursalId);
      const respuesta = await api.get(`/productos/${producto.id}/variantes`, { params: { sucursalId } });
      setVariantes(Array.isArray(respuesta.data) ? respuesta.data : []);
    } catch (error: any) {
      setProductoVariantes(null);
      toast.error(error?.response?.data?.message || 'No se pudieron cargar las variantes');
    } finally {
      setCargandoVariantes(false);
    }
  }

  function nuevaVariante() {
    setVarianteEditando(null);
    setFormVariante({ ...VARIANTE_VACIA });
    setModalVarianteForm(true);
  }

  function editarVariante(v: Variante) {
    setVarianteEditando(v);
    setFormVariante({ ...v });
    setModalVarianteForm(true);
  }

  async function guardarVariante() {
    if (!productoVariantes?.id) return;
    if (!formVariante.codigo.trim() || !formVariante.nombre.trim()) {
      toast.error('Código y nombre de presentación son obligatorios'); return;
    }
    if (!Number.isFinite(Number(formVariante.precio)) || Number(formVariante.precio) <= 0) {
      toast.error('El precio debe ser mayor a cero'); return;
    }
    try {
      const payload = {
        producto_id: productoVariantes.id,
        codigo: formVariante.codigo.trim(),
        codigoBarras: formVariante.codigoBarras?.trim() || undefined,
        nombre: formVariante.nombre.trim(),
        precio: Number(formVariante.precio),
        precioMayoreo: formVariante.precioMayoreo ? Number(formVariante.precioMayoreo) : undefined,
      };
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
        await mutateSupabaseVariant(varianteEditando?.id ? 'variant_update' : 'variant_create', {
          ...payload, id: varianteEditando?.id, activo: formVariante.activo,
        });
        toast.success(varianteEditando?.id ? 'Presentación actualizada en Supabase' : 'Presentación creada en Supabase');
      } else if (varianteEditando?.id) {
        await api.put(`/productos/${productoVariantes.id}/variantes/${varianteEditando.id}`, { ...payload, activo: formVariante.activo });
        toast.success('Variante actualizada');
      } else {
        await api.post(`/productos/${productoVariantes.id}/variantes`, payload);
        toast.success('Variante creada');
      }
      setModalVarianteForm(false);
      await abrirVariantes(productoVariantes);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo guardar la variante');
    }
  }

  async function cambiarEstadoVariante(v: Variante) {
    if (!productoVariantes?.id || !v.id) return;
    const accion = v.activo ? 'desactivar' : 'activar';
    if (!confirm(`¿Desea ${accion} la presentación "${v.nombre}"?`)) return;
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
        if (v.activo) await mutateSupabaseVariant('variant_deactivate', { id: v.id, producto_id: productoVariantes.id });
        else throw new Error('La reactivación de presentaciones requiere una operación administrativa aún no habilitada.');
      } else {
        await api.put(`/productos/${productoVariantes.id}/variantes/${v.id}`, { activo: !v.activo });
      }
      toast.success(v.activo ? 'Variante desactivada' : 'Variante activada');
      await abrirVariantes(productoVariantes);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || `No se pudo ${accion} la variante`);
    }
  }

  function abrirAjusteVariante(v: Variante) {
    setVarianteAjuste(v);
    setTipoAjusteVariante('ENTRADA');
    setCantidadAjusteVariante('');
    setMotivoAjusteVariante('');
    setClaveAjusteVariante(nuevaClaveTransferencia());
  }

  async function guardarAjusteVariante() {
    if (!varianteAjuste?.id || !usuario?.sucursalId) return;
    const cantidad = Number(cantidadAjusteVariante);
    if (!Number.isFinite(cantidad) || cantidad <= 0 || Math.round(cantidad * 1000) !== cantidad * 1000) {
      toast.error('Ingrese una cantidad mayor a cero con máximo 3 decimales'); return;
    }
    if (tipoAjusteVariante === 'SALIDA' && cantidad > Number(varianteAjuste.stock || 0)) {
      toast.error(`Stock insuficiente. Disponible: ${varianteAjuste.stock || 0}`); return;
    }
    if (motivoAjusteVariante.trim().length < 5) {
      toast.error('Explique el motivo con al menos 5 caracteres'); return;
    }
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
        if (!varianteAjuste.productoId) throw new Error('No se pudo identificar el producto de la presentación.');
        await registrarAjusteInventarioSupabase({
          varianteId: varianteAjuste.id, productoId: varianteAjuste.productoId,
          sucursalId: Number(usuario.sucursalId), tipo: tipoAjusteVariante, cantidad,
          motivo: motivoAjusteVariante.trim(), idempotencyKey: claveAjusteVariante,
        });
      } else {
        await api.post('/inventario/variantes/ajustes', {
          varianteId: varianteAjuste.id, sucursalId: Number(usuario.sucursalId),
          tipo: tipoAjusteVariante, cantidad, motivo: motivoAjusteVariante.trim(), idempotencyKey: claveAjusteVariante,
        });
      }
      toast.success('Movimiento de variante registrado');
      setVarianteAjuste(null);
      if (productoVariantes) await abrirVariantes(productoVariantes);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo registrar el movimiento');
    }
  }

  async function eliminar(p: Producto) {
    if (!p.id) return;
    if (!confirm(`¿Eliminar el producto "${p.nombre}"?`)) return;
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
        await mutateSupabaseCatalog('product_deactivate', { id: p.id });
        toast.success('Producto desactivado en Supabase; se conserva su historial.');
      } else if (!ES_MODO_DEMO) {
        await api.delete(`/productos/${p.id}`);
        toast.success('Producto eliminado');
      } else {
        await db.productos.delete(p.id);
        toast.success('Producto eliminado');
      }
      await recargar();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo eliminar el producto');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-primario-700 flex items-center gap-2">
            <Package size={22} /> Productos
          </h2>
          <p className="text-sm text-gray-500">Gestión de catálogo ({productos.length} registrados)</p>
        </div>
        {esAdmin && <button onClick={abrirNuevo} className="btn-ambar flex items-center gap-2">
          <Plus size={16} /> Nuevo producto
        </button>}
      </div>

      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar por nombre o código..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <select className="input sm:w-48" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-left">Categoría</th>
                <th className="px-4 py-3 text-right">Precio (incl. IGV)</th>
                <th className="px-4 py-3 text-center">Tipo IGV</th>
                <th className="px-4 py-3 text-center">Stock</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500"><div className="font-mono">{p.codigo}</div>{p.codigoBarras && <div className="text-[10px] text-gray-400">Barras: {p.codigoBarras}</div>}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{p.nombre}{p.tieneVariantes && <span className="ml-2 badge bg-indigo-100 text-indigo-700">Con variantes</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{p.categoria}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primario-700">{p.tieneVariantes ? <span className="text-xs text-gray-500">Por presentación</span> : formatearMoneda(p.precio)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge ${p.tipoIgv === '10' ? 'bg-primario-100 text-primario-700' : p.tipoIgv === '20' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {etiquetaTipoIgv(p.tipoIgv)}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-center font-semibold ${!p.tieneVariantes && p.stock <= p.stockMinimo ? 'text-red-600' : 'text-gray-700'}`}>
                    {p.tieneVariantes ? '—' : p.stock}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge ${p.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {esAdmin && !p.tieneVariantes && <button onClick={() => abrirAjuste(p)} className="p-1.5 rounded hover:bg-amber-50 text-amber-700" aria-label="Ajustar stock" title="Registrar entrada o salida">
                        <ArrowLeftRight size={14} />
                      </button>}
                      {!ES_MODO_DEMO && esAdmin && !p.tieneVariantes && (usuario?.sucursales?.length || 0) > 1 && <button onClick={() => abrirTransferencia(p)} className="p-1.5 rounded hover:bg-blue-50 text-blue-700" aria-label="Transferir stock" title="Transferir a otra sucursal">
                        <Send size={14} />
                      </button>}
                      {!ES_MODO_DEMO && p.tieneVariantes && <button onClick={() => abrirVariantes(p)} className="p-1.5 rounded hover:bg-indigo-50 text-indigo-700" aria-label="Gestionar variantes" title={p.tieneVariantes ? "Presentaciones y variantes" : "Activar y gestionar variantes"}>
                        <Layers size={14} />
                      </button>}
                      {esAdmin && <button onClick={() => abrirEditar(p)} className="p-1.5 rounded hover:bg-primario-50 text-primario-600" aria-label="Editar">
                        <Pencil size={14} />
                      </button>}
                      {esAdmin && <button onClick={() => eliminar(p)} className="p-1.5 rounded hover:bg-red-50 text-red-500" aria-label="Eliminar">
                        <Trash2 size={14} />
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={8} className="text-center text-gray-400 py-8">Sin productos que coincidan con la búsqueda</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!ES_MODO_DEMO && (usuario?.sucursales?.length || 0) > 1 && <section className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setMostrarHistorial((actual) => !actual)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
          aria-expanded={mostrarHistorial}
        >
          <span className="flex items-center gap-2 font-semibold text-primario-700"><History size={18} /> Historial de transferencias</span>
          <span className="text-xs text-gray-500">{transferencias.length} recientes · {mostrarHistorial ? 'Ocultar' : 'Ver'}</span>
        </button>
        {mostrarHistorial && <div className="border-t border-gray-100">
          {cargandoHistorial ? <p className="px-4 py-6 text-sm text-center text-gray-500">Cargando transferencias…</p>
            : transferencias.length === 0 ? <p className="px-4 py-6 text-sm text-center text-gray-500">Todavía no hay transferencias entre las sucursales que tienes asignadas.</p>
            : <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr><th className="px-4 py-3 text-left">Fecha</th><th className="px-4 py-3 text-left">Origen → destino</th><th className="px-4 py-3 text-left">Productos</th><th className="px-4 py-3 text-left">Responsable / motivo</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transferencias.map((t) => <tr key={t.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{new Date(t.fecha).toLocaleString('es-PE')}</td>
                    <td className="px-4 py-3 min-w-48"><div className="font-medium">{t.sucursalOrigen}</div><div className="text-xs text-gray-500">↓ {t.sucursalDestino}</div></td>
                    <td className="px-4 py-3 min-w-56"><div className="space-y-1">{(t.lineas || []).map((linea: any) => <div key={`${t.id}-${linea.productoId}-${linea.varianteId || 0}`}><span className="font-medium">{linea.nombre}</span>{linea.varianteNombre && <span className="text-indigo-700"> · {linea.varianteNombre}</span>}<span className="text-gray-500"> · {linea.cantidad}</span></div>)}</div></td>
                    <td className="px-4 py-3 min-w-48"><div>{t.responsable}</div><div className="text-xs text-gray-500">{t.motivo}</div></td>
                  </tr>)}
                </tbody>
              </table>
            </div>}
        </div>}
      </section>}

      <Modal abierto={!!productoAjuste} alCerrar={() => setProductoAjuste(null)} titulo={`Movimiento de inventario${productoAjuste ? ` · ${productoAjuste.nombre}` : ''}`}>
        {productoAjuste && <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <span className="text-gray-500">Stock actual</span>
            <div className="text-xl font-bold text-primario-700">{productoAjuste.stock} {productoAjuste.unidad}</div>
          </div>
          <div>
            <label className="label">Tipo de movimiento</label>
            <select className="input" value={tipoAjuste} onChange={(e) => setTipoAjuste(e.target.value as 'ENTRADA' | 'SALIDA')}>
              <option value="ENTRADA">Entrada · compra o reposición</option>
              <option value="SALIDA">Salida · merma, consumo o ajuste</option>
            </select>
          </div>
          <div>
            <label className="label">Cantidad</label>
            <input type="number" min="0.001" step="0.001" className="input" value={cantidadAjuste} onChange={(e) => setCantidadAjuste(e.target.value)} placeholder="Ej. 12" />
          </div>
          <div>
            <label className="label">Motivo *</label>
            <textarea className="input min-h-20" value={motivoAjuste} onChange={(e) => setMotivoAjuste(e.target.value)} placeholder="Ej. Reposición por compra a proveedor" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setProductoAjuste(null)} className="btn-secundario">Cancelar</button>
            <button onClick={guardarAjuste} className="btn-primario">Registrar movimiento</button>
          </div>
        </div>}
      </Modal>

      <Modal abierto={!!productoTransferencia} alCerrar={() => setProductoTransferencia(null)} titulo={`Transferir inventario${productoTransferencia ? ` · ${productoTransferencia.nombre}` : ''}`}>
        {productoTransferencia && <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <div className="text-gray-500">Origen: {usuario?.sucursalNombre}</div>
            <div className="text-xl font-bold text-primario-700">Disponible: {productoTransferencia.stock} {productoTransferencia.unidad}</div>
          </div>
          <div>
            <label className="label">Sucursal destino</label>
            <select className="input" value={sucursalDestino} onChange={(e) => { setSucursalDestino(e.target.value); setClaveTransferencia(nuevaClaveTransferencia()); }}>
              {(usuario?.sucursales || []).filter((s) => s.id !== usuario?.sucursalId).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Cantidad a transferir</label>
            <input type="number" min="0.001" step="0.001" max={productoTransferencia.stock} className="input" value={cantidadTransferencia} onChange={(e) => { setCantidadTransferencia(e.target.value); setClaveTransferencia(nuevaClaveTransferencia()); }} placeholder="Ej. 12" />
          </div>
          <div>
            <label className="label">Motivo *</label>
            <textarea className="input min-h-20" value={motivoTransferencia} onChange={(e) => { setMotivoTransferencia(e.target.value); setClaveTransferencia(nuevaClaveTransferencia()); }} placeholder="Ej. Reposición de mercadería para el otro local" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setProductoTransferencia(null)} className="btn-secundario">Cancelar</button>
            <button onClick={guardarTransferencia} className="btn-primario">Confirmar transferencia</button>
          </div>
        </div>}
      </Modal>

      <Modal abierto={!!productoVariantes} alCerrar={() => setProductoVariantes(null)} titulo={`Presentaciones${productoVariantes ? ` · ${productoVariantes.nombre}` : ''}`}>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-sm text-gray-500">Administre presentaciones, códigos de barras, precios y existencias por sucursal.</p>
            {esAdmin && <button onClick={nuevaVariante} className="btn-ambar flex items-center gap-2"><Plus size={15} /> Nueva variante</button>}
          </div>
          {cargandoVariantes ? <p className="py-6 text-center text-sm text-gray-500">Cargando presentaciones…</p>
            : variantes.length === 0 ? <div className="rounded-lg bg-gray-50 p-5 text-center text-sm text-gray-500">Este producto aún no tiene variantes. Cree presentaciones como unidad, six-pack, caja o tamaño.</div>
            : <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>
                <th className="p-2 text-left">Código</th><th className="p-2 text-left">Presentación</th><th className="p-2 text-left">Barras</th>
                <th className="p-2 text-right">Precio</th><th className="p-2 text-right">Stock</th><th className="p-2 text-center">Estado</th><th className="p-2 text-center">Acciones</th>
              </tr></thead>
              <tbody className="divide-y">{variantes.map((v) => <tr key={v.id}>
                <td className="p-2 font-mono text-xs">{v.codigo}</td><td className="p-2 font-medium">{v.nombre}</td>
                <td className="p-2 text-xs text-gray-500">{v.codigoBarras || '—'}</td>
                <td className="p-2 text-right">{formatearMoneda(Number(v.precio))}</td>
                <td className={`p-2 text-right font-semibold ${Number(v.stock || 0) <= Number(v.stockMinimo || 0) ? 'text-red-600' : ''}`}>{Number(v.stock || 0)}</td>
                <td className="p-2 text-center"><span className={`badge ${v.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{v.activo ? 'Activa' : 'Inactiva'}</span></td>
                <td className="p-2"><div className="flex justify-center gap-1">
                  {esAdmin && (usuario?.sucursales?.length||0)>1 && <button onClick={() => abrirTransferenciaVariante(v)} className="p-1.5 rounded hover:bg-blue-50 text-blue-700" title="Transferir presentación"><Send size={14}/></button>}
                  {esAdmin && <button onClick={() => abrirAjusteVariante(v)} className="p-1.5 rounded hover:bg-amber-50 text-amber-700" title="Entrada o salida de stock"><ArrowLeftRight size={14}/></button>}
                  {esAdmin && <button onClick={() => editarVariante(v)} className="p-1.5 rounded hover:bg-blue-50 text-blue-700" title="Editar variante"><Pencil size={14}/></button>}
                  {esAdmin && <button onClick={() => cambiarEstadoVariante(v)} className="p-1.5 rounded hover:bg-red-50 text-red-600" title={v.activo ? 'Desactivar' : 'Activar'}><Trash2 size={14}/></button>}
                </div></td>
              </tr>)}</tbody>
            </table></div>}
          <div className="flex justify-end"><button onClick={() => setProductoVariantes(null)} className="btn-secundario">Cerrar</button></div>
        </div>
      </Modal>

      <Modal abierto={!!varianteTransferencia} alCerrar={() => setVarianteTransferencia(null)} titulo={`Transferir presentación${varianteTransferencia ? ` · ${varianteTransferencia.nombre}` : ''}`}>
        {varianteTransferencia && <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm"><div className="text-gray-500">Origen: {usuario?.sucursalNombre}</div><div className="text-xl font-bold text-primario-700">Disponible: {Number(varianteTransferencia.stock||0)}</div></div>
          <div><label className="label">Sucursal destino</label><select className="input" value={destinoVariante} onChange={(e)=>{setDestinoVariante(e.target.value);setClaveVarianteTransferencia(nuevaClaveTransferencia());}}>{(usuario?.sucursales||[]).filter((s)=>s.id!==usuario?.sucursalId).map((s)=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
          <div><label className="label">Cantidad</label><input className="input" type="number" min="0.001" step="0.001" max={Number(varianteTransferencia.stock||0)} value={cantidadVarianteTransferencia} onChange={(e)=>{setCantidadVarianteTransferencia(e.target.value);setClaveVarianteTransferencia(nuevaClaveTransferencia());}} /></div>
          <div><label className="label">Motivo *</label><textarea className="input min-h-20" value={motivoVarianteTransferencia} onChange={(e)=>{setMotivoVarianteTransferencia(e.target.value);setClaveVarianteTransferencia(nuevaClaveTransferencia());}} placeholder="Reposición de presentación para otro local" /></div>
          <div className="flex justify-end gap-2"><button onClick={()=>setVarianteTransferencia(null)} className="btn-secundario">Cancelar</button><button onClick={guardarTransferenciaVariante} className="btn-primario">Confirmar transferencia</button></div>
        </div>}
      </Modal>

      <Modal abierto={modalVarianteForm} alCerrar={() => setModalVarianteForm(false)} titulo={varianteEditando ? 'Editar presentación' : 'Nueva presentación'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="label">Código interno *</label><input className="input" maxLength={60} value={formVariante.codigo} onChange={(e) => setFormVariante({ ...formVariante, codigo: e.target.value })}/></div>
          <div><label className="label">Nombre / presentación *</label><input className="input" maxLength={120} placeholder="Ej. Pack x 6 unidades" value={formVariante.nombre} onChange={(e) => setFormVariante({ ...formVariante, nombre: e.target.value })}/></div>
          <div className="sm:col-span-2"><label className="label flex items-center gap-1"><Barcode size={14}/> Código de barras (opcional)</label><input className="input" maxLength={80} value={formVariante.codigoBarras || ''} onChange={(e) => setFormVariante({ ...formVariante, codigoBarras: e.target.value })}/></div>
          <div><label className="label">Precio de venta (S/) *</label><input className="input" type="number" min="0.01" step="0.01" value={formVariante.precio || ''} onChange={(e) => setFormVariante({ ...formVariante, precio: Number(e.target.value) || 0 })}/></div>
          <div><label className="label">Precio mayoreo (S/)</label><input className="input" type="number" min="0.01" step="0.01" value={formVariante.precioMayoreo || ''} onChange={(e) => setFormVariante({ ...formVariante, precioMayoreo: e.target.value ? Number(e.target.value) : undefined })}/></div>
          {varianteEditando && <div className="sm:col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formVariante.activo} onChange={(e) => setFormVariante({ ...formVariante, activo: e.target.checked })}/> Presentación activa</label></div>}
        </div>
        <div className="flex justify-end gap-2 mt-5"><button onClick={() => setModalVarianteForm(false)} className="btn-secundario">Cancelar</button><button onClick={guardarVariante} className="btn-primario">Guardar presentación</button></div>
      </Modal>

      <Modal abierto={!!varianteAjuste} alCerrar={() => setVarianteAjuste(null)} titulo={`Movimiento de stock${varianteAjuste ? ` · ${varianteAjuste.nombre}` : ''}`}>
        {varianteAjuste && <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3"><div className="text-sm text-gray-500">Stock actual en {usuario?.sucursalNombre}</div><div className="text-xl font-bold">{Number(varianteAjuste.stock || 0)}</div></div>
          <div><label className="label">Tipo de movimiento</label><select className="input" value={tipoAjusteVariante} onChange={(e) => setTipoAjusteVariante(e.target.value as 'ENTRADA' | 'SALIDA')}><option value="ENTRADA">Entrada / reposición</option><option value="SALIDA">Salida / merma / ajuste</option></select></div>
          <div><label className="label">Cantidad</label><input className="input" type="number" min="0.001" step="0.001" value={cantidadAjusteVariante} onChange={(e) => setCantidadAjusteVariante(e.target.value)}/></div>
          <div><label className="label">Motivo *</label><textarea className="input min-h-20" value={motivoAjusteVariante} onChange={(e) => setMotivoAjusteVariante(e.target.value)} placeholder="Ej. Compra de 10 packs al proveedor"/></div>
          <div className="flex justify-end gap-2"><button onClick={() => setVarianteAjuste(null)} className="btn-secundario">Cancelar</button><button onClick={guardarAjusteVariante} className="btn-primario">Registrar movimiento</button></div>
        </div>}
      </Modal>

      <Modal abierto={modalAbierto} alCerrar={() => setModalAbierto(false)} titulo={editando ? 'Editar producto' : 'Nuevo producto'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Código *</label>
            <input className="input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
          </div>
          <div>
            <label className="label">Nombre *</label>
            <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div className="sm:col-span-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-indigo-600"
                checked={Boolean(form.tieneVariantes)}
                onChange={(e) => setForm({ ...form, tieneVariantes: e.target.checked, precio: e.target.checked ? 0 : form.precio, precioMayoreo: e.target.checked ? 0 : form.precioMayoreo, stock: e.target.checked ? 0 : form.stock, codigoBarras: e.target.checked ? '' : form.codigoBarras })}
              />
              <span>
                <span className="block text-sm font-semibold text-gray-800">Este producto tiene variantes / presentaciones</span>
                <span className="block text-xs text-gray-600 mt-1">Ejemplo: Coca-Cola con presentaciones de 3 L, 2.5 L, 1 L y 600 ml. Cada presentación tendrá su propio código de barras, precio y stock.</span>
              </span>
            </label>
          </div>
          {!form.tieneVariantes && <div>
            <label className="label">Código de barras</label>
            <input className="input" value={form.codigoBarras || ''} onChange={(e) => setForm({ ...form, codigoBarras: e.target.value })} placeholder="Escanee o escriba el código de barras" />
          </div>}
          <div>
            <label className="label">Categoría</label>
            <input className="input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} list="cats" />
            <datalist id="cats">{categorias.filter((c) => c !== 'TODOS').map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="label">Unidad</label>
            <select className="input" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}>
              <option value="UND">UND (unidad)</option>
              <option value="KG">KG (kilogramo)</option>
              <option value="L">L (litro)</option>
              <option value="DOC">DOC (docena)</option>
              <option value="SERV">SERV (servicio)</option>
            </select>
          </div>
          {!form.tieneVariantes && (
          <div>
            <label className="label">Precio unitario (incluye IGV) *</label>
            <input type="number" min="0" step="0.1" className="input" value={form.precio || ''} onChange={(e) => setForm({ ...form, precio: parseFloat(e.target.value) || 0 })} />
          </div>
          )}
          {!form.tieneVariantes && (
          <div>
            <label className="label">Precio mayoreo</label>
            <input type="number" min="0" step="0.1" className="input" value={form.precioMayoreo || ''} onChange={(e) => setForm({ ...form, precioMayoreo: parseFloat(e.target.value) || 0 })} />
          </div>
          )}
          {!form.tieneVariantes && (
          <div>
            <label className="label">Stock</label>
            <input type="number" min="0" className="input" value={form.stock} disabled={!ES_MODO_DEMO && !!editando} onChange={(e) => setForm({ ...form, stock: parseFloat(e.target.value) || 0 })} />
            {!ES_MODO_DEMO && !!editando && <p className="text-[11px] text-gray-500 mt-1">Para cambiar existencias se debe registrar un ajuste de inventario.</p>}
          </div>
          )}
          {!form.tieneVariantes && (
          <div>
            <label className="label">Stock mínimo</label>
            <input type="number" min="0" className="input" value={form.stockMinimo} onChange={(e) => setForm({ ...form, stockMinimo: parseFloat(e.target.value) || 0 })} />
          </div>
          )}
          <div>
            <label className="label">Tipo de IGV (SUNAT)</label>
            <select className="input" value={form.tipoIgv} onChange={(e) => setForm({ ...form, tipoIgv: e.target.value as TipoIgv })}>
              <option value="10">10 - Gravado (IGV 18%)</option>
              <option value="20">20 - Exonerado</option>
              <option value="30">30 - Inafecto</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} className="w-4 h-4 accent-primario-600" />
              Producto activo
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModalAbierto(false)} className="btn-secundario">Cancelar</button>
          <button onClick={guardar} className="btn-primario">Guardar</button>
        </div>
      </Modal>
    </div>
  );
}
