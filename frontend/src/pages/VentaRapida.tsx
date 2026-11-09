import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Minus, Trash2, ShoppingCart, User, Zap, Banknote, CreditCard, Smartphone, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../db';
import { api } from '../api/client';
import { guardarVentaOffline } from '../api/syncQueue';
import { ES_MODO_DEMO } from '../api/client';
import { fetchCurrentSupabaseCatalog, mapSupabaseProductRows, mapSupabaseCustomerRows, mapSupabasePurchaseVariants } from '../api/supabaseCatalog';
import { listarCajasAbiertasComprasSupabase } from '../api/supabasePurchases';
import { crearVentaSupabase, consultarEstadoVentaSupabase, consultarDetalleComprobanteSupabase, guardarIntentoVentaPendienteSupabase, limpiarClaveVentaSupabase, obtenerClaveVentaSupabase, obtenerIntentoVentaPendienteSupabase } from '../api/supabaseSales';
import { esProductoActivo } from '../utils/catalogo';
import { mapComprobante } from '../utils/ventaMapper';
import { calcularTotales, formatearMoneda, validarDNI, validarRUC, serieSegunTipo, etiquetaTipoIgv } from '../utils/igv';
import type { Producto, Cliente, LineaVenta, TipoComprobante, MetodoPago, PagoLinea, Venta, ConfigEmpresa, Caja } from '../types';
import { useAuth } from '../context/AuthContext';
import TicketModal from '../components/TicketModal';
import BarcodeScanner from '../components/BarcodeScanner';

const METODOS: { id: MetodoPago; label: string; icono: typeof Banknote }[] = [
  { id: 'EFECTIVO', label: 'Efectivo', icono: Banknote },
  { id: 'TARJETA', label: 'Tarjeta', icono: CreditCard },
  { id: 'YAPE', label: 'Yape', icono: Smartphone },
  { id: 'PLIN', label: 'Plin', icono: Smartphone },
  { id: 'CREDITO', label: 'Crédito', icono: Wallet },
];

const CONSUMIDOR_FINAL: Cliente = { tipoDoc: 'DNI', numero: '00000000', nombre: 'CONSUMIDOR FINAL', direccion: '-', limiteCredito: 0 };

function fechaLimaHoy(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value || '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

function mapCaja(caja: any): Caja {
  const estado = String(caja?.estado ?? caja?.status ?? 'Abierta').toLowerCase();
  return {
    id: Number(caja?.id),
    fechaApertura: String(caja?.fechaApertura ?? caja?.fecha_apertura ?? new Date().toISOString()),
    fechaCierre: caja?.fechaCierre ?? caja?.fecha_cierre ?? undefined,
    saldoInicial: Number(caja?.saldoInicial ?? caja?.saldo_inicial ?? 0),
    estado: estado === 'abierta' || estado === 'open' || estado === 'abi er ta'.replace(/ /g, '') ? 'Abierta' : 'Cerrada',
    usuarioId: String(caja?.usuarioId ?? caja?.usuario_id ?? ''),
    sucursalId: String(caja?.sucursalId ?? caja?.sucursal_id ?? ''),
  };
}

function sumarDiasFecha(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

function catalogoVariantes(catalog: Awaited<ReturnType<typeof fetchCurrentSupabaseCatalog>>): Array<Record<string, any>> {
  return catalog.variantes || [];
}

// PANTALLA PRINCIPAL: Venta Rápida (POS).
export default function VentaRapida() {
  const { usuario } = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('TODOS');
  const [lineas, setLineas] = useState<LineaVenta[]>([]);
  const [motivoDescuento,setMotivoDescuento]=useState('');
  const [cliente, setCliente] = useState<Cliente>(CONSUMIDOR_FINAL);
  const [buscarCliente, setBuscarCliente] = useState('');
  const [resultadosCliente, setResultadosCliente] = useState<Cliente[]>([]);
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>('03');
  const [pagos, setPagos] = useState<PagoLinea[]>([{ metodo: 'EFECTIVO', monto: 0, montoRecibido: 0, vuelto: 0 }]);
  const [fechaVencimiento, setFechaVencimiento] = useState(() => sumarDiasFecha(fechaLimaHoy(), 30));
  const [cajaAbierta, setCajaAbierta] = useState(false);
  const [config, setConfig] = useState<ConfigEmpresa | null>(null);
  const [ventaTicket, setVentaTicket] = useState<Venta | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [recuperacionPendiente, setRecuperacionPendiente] = useState<{ storageKey: string; mensaje: string; comprobanteId?: number } | null>(null);
  const [verificandoRecuperacion, setVerificandoRecuperacion] = useState(false);
  const recuperacionEnCurso = useRef(false);
  const [productoParaVariante, setProductoParaVariante] = useState<Producto | null>(null);
  const [variantesDisponibles, setVariantesDisponibles] = useState<any[]>([]);
  const [cargandoVariantes, setCargandoVariantes] = useState(false);
  const cobroEnCurso = useRef(false);

  // En producción, el servidor es la fuente de verdad. IndexedDB conserva una caché para lectura y cola offline.
  useEffect(() => {
    let activo = true;
    async function cargar() {
      try {
        const cfg = await db.config.toArray();
        if (activo) setConfig(cfg[0] || null);
        if (ES_MODO_DEMO) {
          // `activo` es booleano y Dexie/IndexedDB no indexa booleanos como la clave numérica 1.
          // Filtramos los registros para no dejar el POS vacío aunque existan productos demo.
          const prods = await db.productos.filter(esProductoActivo).toArray();
          const cajas = await db.cash_register.where('estado').equals('Abierta').toArray();
          if (activo) { setProductos(prods); setCajaAbierta(cajas.length > 0); }
          return;
        }
        const sucursalId = Number(usuario?.sucursalId);
        if (!Number.isInteger(sucursalId) || sucursalId <= 0) throw new Error('El usuario no tiene una sucursal configurada');
        const esSupabase = import.meta.env.VITE_AUTH_PROVIDER === 'supabase';
        const [catalogoSupabase, productosResp, clientesResp, cajaResp] = await Promise.all([
          esSupabase ? fetchCurrentSupabaseCatalog(sucursalId) : Promise.resolve(null),
          esSupabase ? Promise.resolve(null) : api.get('/productos', { params: { sucursalId } }),
          esSupabase ? Promise.resolve(null) : api.get('/clientes'),
          esSupabase ? listarCajasAbiertasComprasSupabase(sucursalId).then((cajas) => ({ data: cajas[0] || null })) : api.get('/caja/estado', { params: { sucursalId } }),
        ]);
        const prods: Producto[] = (catalogoSupabase
          ? mapSupabaseProductRows(catalogoSupabase).filter((p: any) => p.activo !== false)
          : (productosResp?.data || []).map((p: any) => ({
          ...p,
          id: Number(p.id),
          precio: Number(p.precio),
          precioMayoreo: p.precioMayoreo == null ? undefined : Number(p.precioMayoreo),
          stock: Number(p.stock),
          stockMinimo: Number(p.stockMinimo),
          tipoIgv: String(p.tipoIgv) as Producto['tipoIgv'],
          categoria: p.categoria?.nombre || (p.categoriaId ? `Categoría ${p.categoriaId}` : 'General'),
        })));
        if (!activo) return;
        setProductos(prods);
        await db.productos.bulkPut(prods);
        const clientesNormalizados = catalogoSupabase
          ? mapSupabaseCustomerRows(catalogoSupabase)
          : (clientesResp?.data || []).map((c: any) => ({
              ...c, id: Number(c.id), limiteCredito: Number(c.limiteCredito || 0), saldoCredito: Number(c.saldoCredito || 0),
            }));
        await db.clientes.bulkPut(clientesNormalizados);
        const consumidorFinalServidor = clientesNormalizados.find((c: any) => String(c.numero) === '00000000');
        if (consumidorFinalServidor) {
          setCliente((actual) => actual.numero === '00000000' && !actual.id
            ? { ...consumidorFinalServidor, id: Number(consumidorFinalServidor.id) } as Cliente
            : actual);
        }
        const cajaMapeada = cajaResp.data ? (esSupabase ? {
          id: Number(cajaResp.data.id), fechaApertura: String(cajaResp.data.fechaApertura || new Date().toISOString()),
          saldoInicial: Number(cajaResp.data.saldoInicial || 0), estado: 'Abierta' as const,
          usuarioId: String(usuario?.id || ''), sucursalId: String(sucursalId),
        } : mapCaja(cajaResp.data)) : null;
        if (cajaMapeada) await db.cash_register.put(cajaMapeada);
        setCajaAbierta(!!cajaMapeada && cajaMapeada.estado === 'Abierta');
      } catch (error) {
        if (activo) {
          const cache = await db.productos.filter(esProductoActivo).toArray();
          const cajasCache = await db.cash_register.where('estado').equals('Abierta').toArray();
          setProductos(cache);
          setCajaAbierta(cajasCache.length > 0);
          toast.error(error instanceof Error ? error.message : 'No se pudieron cargar los datos del POS');
        }
      }
    }
    cargar();
    return () => { activo = false; };
  }, [usuario?.sucursalId]);

  async function verificarCobroPendiente(storageKeyOverride?: string) {
    if (recuperacionEnCurso.current) return;
    const sucursalId = Number(usuario?.sucursalId);
    const storageKey = storageKeyOverride || `${usuario?.id || 'usuario'}:${sucursalId}`;
    const intento = obtenerIntentoVentaPendienteSupabase(storageKey);
    if (!intento) { setRecuperacionPendiente(null); return; }
    recuperacionEnCurso.current = true;
    setVerificandoRecuperacion(true);
    try {
      const estado = await consultarEstadoVentaSupabase(intento.payload);
      if (!estado.existente) {
        setRecuperacionPendiente({ storageKey, mensaje: 'Supabase todavía no confirma esta operación. Conservamos el intento original y no se permite iniciar otro cobro.' });
        return;
      }
      // La cabecera, cliente, líneas, variantes, pagos e IGV se recuperan desde
      // el comprobante oficial en Supabase; el snapshot local solo queda como respaldo.
      const detalleOficial = await consultarDetalleComprobanteSupabase(Number(estado.comprobanteId));
      const ventaRecuperada: Venta = {
        ...mapComprobante(detalleOficial),
        idempotencyKey: intento.idempotencyKey,
        serverId: Number(estado.comprobanteId),
        enCola: false,
      };
      const existente = await db.ventas.where('idempotencyKey').equals(intento.idempotencyKey).first();
      if (existente?.id) await db.ventas.put({ ...ventaRecuperada, id: existente.id });
      else await db.ventas.add(ventaRecuperada);
      limpiarClaveVentaSupabase(storageKey);
      setRecuperacionPendiente(null);
      setVentaTicket(ventaRecuperada);
      toast.success(`Venta recuperada: ${ventaRecuperada.serie}-${String(ventaRecuperada.correlativo).padStart(8, '0')}`);
    } catch (error) {
      setRecuperacionPendiente({ storageKey, mensaje: error instanceof Error ? error.message : 'No se pudo verificar el cobro pendiente. El intento permanece guardado.' });
    } finally {
      recuperacionEnCurso.current = false;
      setVerificandoRecuperacion(false);
    }
  }

  useEffect(() => {
    if (!usuario?.id || import.meta.env.VITE_AUTH_PROVIDER !== 'supabase' || ES_MODO_DEMO) return;
    const storageKey = `${usuario.id}:${Number(usuario.sucursalId)}`;
    if (obtenerIntentoVentaPendienteSupabase(storageKey)) {
      setRecuperacionPendiente({ storageKey, mensaje: 'Se detectó un cobro anterior sin confirmación. Verificando su estado en Supabase…' });
      void verificarCobroPendiente(storageKey);
    } else setRecuperacionPendiente(null);
    // La verificación se ejecuta al entrar al POS o cambiar de sucursal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id, usuario?.sucursalId]);

  const categorias = useMemo(() => ['TODOS', ...Array.from(new Set(productos.map((p) => p.categoria)))], [productos]);

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      const coincideCat = categoriaFiltro === 'TODOS' || String(p.categoria || 'General') === categoriaFiltro;
      const coincideQ = !q || String(p.nombre || '').toLowerCase().includes(q) || String(p.codigo || '').toLowerCase().includes(q);
      return coincideCat && coincideQ;
    });
  }, [productos, busqueda, categoriaFiltro]);

  const totales = useMemo(() => calcularTotales(lineas), [lineas]);
  const tieneDescuento=lineas.some((linea)=>Number(linea.descuento||0)>0);
  useEffect(()=>{if(!tieneDescuento)setMotivoDescuento('');},[tieneDescuento]);

  // Suma de pagos y vuelto (efectivo).
  const sumaPagos = pagos.reduce((s, p) => s + (p.monto || 0), 0);
  const pagoEfectivo = pagos.find((p) => p.metodo === 'EFECTIVO');
  const pagoCredito = pagos.find((p) => p.metodo === 'CREDITO');
  const creditoDisponible = Math.max(0, Number(cliente.limiteCredito || 0) - Number(cliente.saldoCredito || 0));
  const vuelto = pagoEfectivo && pagoEfectivo.montoRecibido != null ? Math.max(0, pagoEfectivo.montoRecibido - pagoEfectivo.monto) : 0;

  // --- Carrito y selección de presentaciones ---
  function agregarLineaBase(p: Producto) {
    setLineas((prev) => {
      const existente = prev.findIndex((l) => !l.varianteId && l.codigo === p.codigo);
      if (existente >= 0) {
        const copia = [...prev];
        copia[existente] = { ...copia[existente], cantidad: copia[existente].cantidad + 1 };
        return copia;
      }
      return [...prev, {
        productoId: p.id, codigo: p.codigo, nombre: p.nombre, cantidad: 1,
        precioUnitario: p.precio, tipoIgv: p.tipoIgv, descuento: 0,
      }];
    });
  }

  function agregarLineaVariante(p: Producto, v: any) {
    const varianteId = Number(v.id ?? v.varianteId);
    const codigo = String(v.codigo || v.codigoBarras || `VAR-${varianteId}`);
    const nombreVariante = String(v.nombre || v.varianteNombre || 'Variante');
    const lineaCodigo = `${p.codigo}::${varianteId}`;
    setLineas((prev) => {
      const existente = prev.findIndex((l) => l.varianteId === varianteId);
      if (existente >= 0) {
        const copia = [...prev];
        copia[existente] = { ...copia[existente], cantidad: copia[existente].cantidad + 1 };
        return copia;
      }
      return [...prev, {
        productoId: p.id, varianteId, varianteCodigo: codigo, varianteNombre: nombreVariante,
        codigo: lineaCodigo, nombre: `${p.nombre} - ${nombreVariante}`, cantidad: 1,
        precioUnitario: Number(v.precio), tipoIgv: p.tipoIgv, descuento: 0,
      }];
    });
    setProductoParaVariante(null);
    setVariantesDisponibles([]);
  }

  async function agregarProducto(p: Producto) {
    if (ES_MODO_DEMO || !p.id || !p.tieneVariantes) { agregarLineaBase(p); return; }
    try {
      setCargandoVariantes(true);
      const sucursalId = Number(usuario?.sucursalId);
      const esSupabase = import.meta.env.VITE_AUTH_PROVIDER === 'supabase';
      const variantes = esSupabase
        ? mapSupabasePurchaseVariants(await fetchCurrentSupabaseCatalog(sucursalId), Number(p.id))
        : (await api.get(`/productos/${p.id}/variantes`, { params: { sucursalId } })).data || [];
      const variantesActivas = variantes.filter((v: any) => v.activo !== false);
      if (!variantesActivas.length) {
        toast.error(`El producto ${p.nombre} está configurado con variantes, pero no tiene presentaciones activas`);
        return;
      }
      setProductoParaVariante(p);
      setVariantesDisponibles(variantesActivas);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudieron consultar las presentaciones del producto');
    } finally {
      setCargandoVariantes(false);
    }
  }

  async function escanearProducto(codigo: string) {
    const limpio = codigo.trim().toLowerCase();
    const encontrado = productos.find(p => (p.codigo.trim().toLowerCase() === limpio || (p.codigoBarras || '').trim().toLowerCase() === limpio));
    if (encontrado) {
      await agregarProducto(encontrado);
      setBusqueda('');
      return;
    }
    if (!ES_MODO_DEMO) {
      try {
        const sucursalId = Number(usuario?.sucursalId);
        let v: any;
        if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
          const catalog = await fetchCurrentSupabaseCatalog(sucursalId);
          const variante = (catalogoVariantes(catalog)).find((x: any) =>
            String(x.codigo ?? '').trim().toLowerCase() === limpio || String(x.codigo_barras ?? x.codigoBarras ?? '').trim().toLowerCase() === limpio
          );
          if (variante) {
            const producto = productos.find((x) => Number(x.id) === Number(variante.producto_id ?? variante.productoId));
            const stockRow = (catalog.stock_variantes || []).find((x: any) => Number(x.variante_id ?? x.varianteId) === Number(variante.id));
            v = producto ? { varianteId: variante.id, productoId: producto.id, productoCodigo: producto.codigo, productoNombre: producto.nombre, varianteNombre: variante.nombre, codigo: variante.codigo, codigoBarras: variante.codigo_barras ?? variante.codigoBarras, precio: variante.precio, stock: stockRow?.stock ?? 0, tipoIgv: producto.tipoIgv } : null;
          }
        } else {
          const response = await api.get('/productos/variantes/buscar', { params: { codigo: codigo.trim(), sucursalId } });
          v = response.data;
        }
        if (v?.varianteId) {
          if (Number(v.stock || 0) <= 0) {
            toast.error(`Sin existencias para ${v.productoNombre} - ${v.varianteNombre}`);
            setBusqueda(codigo);
            return;
          }
          const producto: Producto = {
            id: Number(v.productoId), codigo: String(v.productoCodigo), nombre: String(v.productoNombre),
            categoria: 'General', unidad: 'NIU', precio: Number(v.precio), stock: Number(v.stock),
            stockMinimo: 0, tipoIgv: String(v.tipoIgv) as Producto['tipoIgv'], activo: true,
          };
          agregarLineaVariante(producto, {
            id: v.varianteId, codigo: v.codigo, codigoBarras: v.codigoBarras,
            nombre: v.varianteNombre, precio: v.precio,
          });
          setBusqueda('');
          toast.success(`${producto.nombre} - ${v.varianteNombre} agregado`);
          return;
        }
      } catch (error: any) {
        toast.error(error?.response?.data?.message || 'No se encontró una variante con ese código');
        return;
      }
    }
    setBusqueda(codigo);
    toast.error('No se encontró un producto o variante con ese código');
  }

  function cambiarCantidad(idx: number, delta: number) {
    setLineas((prev) => {
      const copia = [...prev];
      const nueva = copia[idx].cantidad + delta;
      if (nueva <= 0) return prev.filter((_, i) => i !== idx);
      copia[idx] = { ...copia[idx], cantidad: nueva };
      return copia;
    });
  }

  function cambiarDescuento(idx: number, valor: string) {
    const n = parseFloat(valor) || 0;
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, descuento: n } : l)));
  }

  function eliminarLinea(idx: number) {
    setLineas((prev) => prev.filter((_, i) => i !== idx));
  }

  // --- Cliente ---
  async function buscarClientes(q: string) {
    setBuscarCliente(q);
    if (!q.trim()) {
      setResultadosCliente([]);
      return;
    }
    const todos = await db.clientes.toArray();
    const filtro = todos.filter(
      (c) => c.numero.includes(q.trim()) || c.nombre.toLowerCase().includes(q.trim().toLowerCase()),
    );
    setResultadosCliente(filtro.slice(0, 5));
  }

  function seleccionarCliente(c: Cliente) {
    setCliente(c);
    setResultadosCliente([]);
    setBuscarCliente('');
    // Sugerir comprobante: RUC → factura (01), DNI → boleta (03)
    setTipoComprobante(c.tipoDoc === 'RUC' ? '01' : '03');
    toast.success(`Cliente: ${c.nombre}`);
  }

  function usarConsumidorFinal() {
    setCliente(CONSUMIDOR_FINAL);
    setTipoComprobante('03');
    setBuscarCliente('');
    setResultadosCliente([]);
  }

  // --- Pagos ---
  function toggleMetodo(m: MetodoPago) {
    setPagos((prev) => {
      const existe = prev.find((p) => p.metodo === m);
      if (existe) {
        if (prev.length === 1) return prev; // no dejar sin métodos
        return prev.filter((p) => p.metodo !== m);
      }
      return [...prev, { metodo: m, monto: 0, montoRecibido: m === 'EFECTIVO' ? 0 : undefined, vuelto: 0 }];
    });
  }

  function setMontoPago(metodo: MetodoPago, monto: number) {
    setPagos((prev) => prev.map((p) => (p.metodo === metodo ? { ...p, monto } : p)));
  }

  function setMontoRecibido(monto: number) {
    setPagos((prev) => prev.map((p) => (p.metodo === 'EFECTIVO' ? { ...p, montoRecibido: monto } : p)));
  }

  function completarEfectivo() {
    // Rellena el monto de efectivo con el total pendiente.
    const otros = pagos.filter((p) => p.metodo !== 'EFECTIVO').reduce((s, p) => s + p.monto, 0);
    const falta = Math.max(0, totales.total - otros);
    setPagos((prev) =>
      prev.map((p) => (p.metodo === 'EFECTIVO' ? { ...p, monto: falta, montoRecibido: p.montoRecibido || falta } : p)),
    );
  }

  // --- Cobrar ---
  async function cobrar() {
    if (recuperacionPendiente) { toast.error('Primero verifique el cobro pendiente antes de iniciar otra venta.'); return; }
    if (!ES_MODO_DEMO && import.meta.env.VITE_AUTH_PROVIDER === 'supabase' && usuario?.id) {
      const storageKey = `${usuario.id}:${Number(usuario.sucursalId)}`;
      if (obtenerIntentoVentaPendienteSupabase(storageKey)) {
        setRecuperacionPendiente({ storageKey, mensaje: 'Existe un cobro anterior sin resolver. Verifique su estado antes de iniciar otra venta.' });
        void verificarCobroPendiente(storageKey);
        toast.error('Primero debe resolverse el cobro pendiente.');
        return;
      }
    }
    if (cobroEnCurso.current) return;
    if (!cajaAbierta) {
      toast.error('La caja está cerrada. Abra caja en Cierre de Caja.');
      return;
    }
    if (lineas.length === 0) {
      toast.error('Agregue productos al carrito');
      return;
    }
    if (cliente.tipoDoc === 'DNI' && cliente.numero !== '00000000' && !validarDNI(cliente.numero)) {
      toast.error('DNI inválido (debe tener 8 dígitos)');
      return;
    }
    if (cliente.tipoDoc === 'RUC' && !validarRUC(cliente.numero)) {
      toast.error('RUC inválido: verifica los 11 dígitos, prefijo y dígito verificador');
      return;
    }
    if (sumaPagos < totales.total - 0.01 || Math.abs(sumaPagos - totales.total) > 0.01) {
      toast.error(`Los medios de pago deben sumar exactamente ${formatearMoneda(totales.total)}`);
      return;
    }
    if (pagoEfectivo && pagoEfectivo.montoRecibido != null && pagoEfectivo.montoRecibido < pagoEfectivo.monto - 0.01) {
      toast.error('Monto recibido en efectivo insuficiente');
      return;
    }
    if (pagoCredito && pagoCredito.monto > 0 && (cliente.numero === '00000000' || creditoDisponible + 0.001 < pagoCredito.monto)) {
      toast.error(`El cliente no tiene crédito suficiente. Disponible: ${formatearMoneda(creditoDisponible)}`);
      return;
    }
    if (pagoCredito && !ES_MODO_DEMO && !navigator.onLine) {
      toast.error('Las ventas a crédito requieren conexión para verificar el límite y registrar la cuenta.');
      return;
    }
    if (pagoCredito && (!fechaVencimiento || fechaVencimiento < fechaLimaHoy())) {
      toast.error('Seleccione una fecha de vencimiento válida, desde hoy.');
      return;
    }
    if (!ES_MODO_DEMO && lineas.some((linea) => !linea.productoId)) {
      toast.error('Uno o más productos no tienen ID del servidor. Actualice el catálogo antes de cobrar.');
      return;
    }
    if(tieneDescuento&&usuario?.rol!=='ADMIN'){toast.error('Solo un administrador puede autorizar descuentos.');return;}
    if(tieneDescuento&&motivoDescuento.trim().length<5){toast.error('Indique el motivo del descuento (mínimo 5 caracteres).');return;}

    cobroEnCurso.current = true;
    setProcesando(true);
    try {
      const sucursalId = Number(usuario?.sucursalId);
      const esSupabase = !ES_MODO_DEMO && import.meta.env.VITE_AUTH_PROVIDER === 'supabase';
      if (esSupabase && import.meta.env.VITE_SUPABASE_SALES_ENABLED !== 'true') {
        throw new Error('El registro transaccional Supabase está preparado, pero sigue bloqueado hasta completar las pruebas de staging y habilitar VITE_SUPABASE_SALES_ENABLED.');
      }
      let clienteIdVenta = cliente.id ? Number(cliente.id) : 0;
      let clienteVenta = cliente;
      if (esSupabase && !clienteIdVenta) {
        const clienteServidor = await db.clientes.where('numero').equals(cliente.numero).first();
        if (!clienteServidor?.id) throw new Error('No se encontró el cliente en Supabase. Actualice el catálogo antes de cobrar.');
        clienteIdVenta = Number(clienteServidor.id);
        clienteVenta = clienteServidor;
        setCliente(clienteServidor);
      }
      const fingerprintVenta = JSON.stringify({
        sucursalId, clienteId: clienteIdVenta || null, numeroCliente: cliente.numero,
        tipoComprobante, lineas: lineas.map((l) => ({
          productoId: Number(l.productoId), varianteId: l.varianteId ? Number(l.varianteId) : null,
          cantidad: Number(l.cantidad), descuento: Number(l.descuento || 0),
        })),
        pagos: pagos.map((p) => ({ metodo: p.metodo, monto: Number(p.monto), montoRecibido: p.metodo === 'EFECTIVO' ? Number(p.montoRecibido ?? p.monto) : null })),
        fechaVencimiento: pagoCredito ? fechaVencimiento : null,
        motivoDescuento: tieneDescuento ? motivoDescuento.trim() : null,
      });
      const storageScope = `${usuario?.id || 'usuario'}:${sucursalId}`;
      const idempotencyKey = esSupabase
        ? obtenerClaveVentaSupabase(storageScope, fingerprintVenta)
        : (typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const serieLocal = serieSegunTipo(tipoComprobante, config ?? undefined);
      const correlativoLocal = (tipoComprobante === '01'
        ? config?.ultCorrelativoFactura ?? 0
        : config?.ultCorrelativoBoleta ?? 0) + 1;
      const pagosVenta = pagos.map((p) => ({
        metodo: p.metodo,
        monto: Number(p.monto),
        ...(p.metodo === 'EFECTIVO' ? { montoRecibido: Number(p.montoRecibido ?? p.monto) } : {}),
      }));
      const venta: Venta = {
        serie: serieLocal,
        correlativo: correlativoLocal,
        tipoComprobante,
        cliente: clienteVenta,
        lineas,
        pagos: pagos.map((p) => (p.metodo === 'EFECTIVO' ? { ...p, vuelto } : p)),
        fecha: new Date().toISOString(),
        usuarioId: usuario?.id || 'demo',
        ...totales,
        estadoFE: navigator.onLine ? 'Enviando' : 'Pendiente',
        idempotencyKey,
      };

      if (ES_MODO_DEMO) {
        await db.ventas.add(venta);
        toast('Venta registrada en modo demostración local.', { icon: '🧪' });
      } else {
        if (!Number.isInteger(sucursalId) || sucursalId <= 0) throw new Error('No se pudo identificar la sucursal del usuario');
        const payload = {
          sucursalId,
          ...(cliente.id ? { clienteId: Number(cliente.id) } : {
            cliente: { tipoDoc: cliente.tipoDoc, numero: cliente.numero, nombre: cliente.nombre, direccion: cliente.direccion || '-' },
          }),
          tipo: tipoComprobante,
          pagos: pagosVenta,
          ...(pagoCredito ? { fechaVencimiento } : {}),
          ...(tieneDescuento ? { motivoDescuento: motivoDescuento.trim() } : {}),
          lineas: lineas.map((l) => ({
            productoId: Number(l.productoId),
            ...(l.varianteId ? { varianteId: Number(l.varianteId) } : {}),
            cantidad: Number(l.cantidad),
            precioUnitario: Number(l.precioUnitario),
            descuento: Number(l.descuento || 0),
          })),
          idempotencyKey,
        };
        // En modo Supabase no se permite enviar ventas al backend NestJS ni
        // guardarlas en la cola antigua: eso mezclaría dos fuentes de verdad.
        // El cobro se habilitará cuando esté instalada y probada la RPC transaccional.
        if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
          const payloadSupabase = {
            sucursalId,
            clienteId: clienteIdVenta,
            tipo: tipoComprobante as '01' | '03',
            pagos: pagosVenta,
            ...(pagoCredito ? { fechaVencimiento } : {}),
            ...(tieneDescuento ? { motivoDescuento: motivoDescuento.trim() } : {}),
            descuentoGlobal: 0,
            lineas: lineas.map((l) => ({
              productoId: Number(l.productoId),
              ...(l.varianteId ? { varianteId: Number(l.varianteId) } : {}),
              cantidad: Number(l.cantidad),
              precioUnitario: Number(l.precioUnitario),
              descuento: Number(l.descuento || 0),
            })),
            idempotencyKey,
          };
          // Snapshot duradero antes de la llamada: permite repetir exactamente el mismo
          // payload y clave aunque se cierre la pestaña durante una respuesta ambigua.
          guardarIntentoVentaPendienteSupabase(storageScope, fingerprintVenta, payloadSupabase, venta);
          const resultado = await crearVentaSupabase(payloadSupabase);
          venta.serverId = resultado.comprobanteId;
          venta.serie = resultado.serie;
          venta.correlativo = resultado.correlativo;
          venta.total = resultado.total || venta.total;
          venta.estadoFE = 'Pendiente';
          const ventaLocalExistente = await db.ventas.where('idempotencyKey').equals(idempotencyKey).first();
          if (!ventaLocalExistente) await db.ventas.add(venta);
          limpiarClaveVentaSupabase(storageScope);
          if (resultado.idempotentReplay) {
            toast('Supabase confirmó una venta ya registrada previamente; no se duplicó el cobro.', { icon: '🔁' });
          }
        } else if (navigator.onLine) {
          try {
            const respuesta = await api.post('/ventas', payload);
            venta.serverId = Number(respuesta.data?.id);
            venta.serie = respuesta.data?.serie || venta.serie;
            venta.correlativo = Number(respuesta.data?.correlativo || venta.correlativo);
            venta.fecha = respuesta.data?.fechaEmision || venta.fecha;
            venta.estadoFE = 'Enviando';
            await db.ventas.add(venta);
          } catch (error: any) {
            const status = error?.response?.status;
            if (status && status >= 400 && status < 500) {
              throw new Error(error.response?.data?.message || 'El servidor rechazó la venta. Revise los datos y vuelva a intentar.');
            }
            venta.enCola = true;
            venta.estadoFE = 'Pendiente';
            await guardarVentaOffline(venta, payload);
            toast('No se confirmó la respuesta del servidor. La venta quedó en cola con protección contra duplicados.', { icon: '📡' });
          }
        } else {
          venta.enCola = true;
          venta.estadoFE = 'Pendiente';
          await guardarVentaOffline(venta, payload);
          toast('Venta guardada offline. Se sincronizará al recuperar conexión.', { icon: '📡' });
        }
      }

      // El caché local es auxiliar; el stock definitivo lo controla PostgreSQL.
      for (const linea of lineas) {
        if (linea.productoId && !linea.varianteId) {
          const producto = await db.productos.get(linea.productoId);
          if (producto) await db.productos.update(linea.productoId, { stock: Math.max(0, producto.stock - linea.cantidad) });
        }
      }
      setProductos((prev) => prev.map((p) => {
        const salida = lineas.filter((l) => l.productoId === p.id && !l.varianteId).reduce((sum, l) => sum + l.cantidad, 0);
        return salida ? { ...p, stock: Math.max(0, p.stock - salida) } : p;
      }));
      setVentaTicket(venta);
      toast.success(`Venta registrada: ${venta.serie}-${String(venta.correlativo).padStart(8, '0')}`);
      setLineas([]);
      setMotivoDescuento('');
      setPagos([{ metodo: 'EFECTIVO', monto: 0, montoRecibido: 0, vuelto: 0 }]);
      setFechaVencimiento(sumarDiasFecha(fechaLimaHoy(), 30));
      setCliente(CONSUMIDOR_FINAL);
      setTipoComprobante('03');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar la venta');
    } finally {
      cobroEnCurso.current = false;
      setProcesando(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {recuperacionPendiente && (
        <div className="lg:col-span-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950" role="alert">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-sm">Cobro pendiente de verificación</p>
              <p className="text-xs mt-1">{recuperacionPendiente.mensaje}</p>
              {recuperacionPendiente.comprobanteId && <p className="text-xs mt-1 font-semibold">Comprobante registrado ID: {recuperacionPendiente.comprobanteId}</p>}
            </div>
            <button type="button" onClick={() => void verificarCobroPendiente(recuperacionPendiente.storageKey)} disabled={verificandoRecuperacion} className="btn-secundario whitespace-nowrap disabled:opacity-50">
              {verificandoRecuperacion ? 'Verificando…' : 'Verificar nuevamente'}
            </button>
          </div>
        </div>
      )}
      {/* Columna izquierda: buscador + grid de productos */}
      <div className="lg:col-span-2 space-y-4">
        <div className="card p-4">
          <BarcodeScanner onScan={escanearProducto} />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="Buscar producto por nombre o código..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <select className="input sm:w-48" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
              {categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {productosFiltrados.map((p) => (
            <button
              key={p.codigo}
              onClick={() => agregarProducto(p)}
              className="card p-3 text-left hover:border-ambar-400 hover:shadow-md transition-all group"
            >
              <div className="text-xs text-gray-400 font-mono">{p.codigo}</div>
              <div className="font-semibold text-sm text-gray-800 line-clamp-2 min-h-[2.5rem]">{p.nombre}</div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-primario-700 font-bold">{formatearMoneda(p.precio)}</span>
                <span className={`text-[10px] badge ${p.stock <= p.stockMinimo ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                  Stock: {p.stock}
                </span>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">{etiquetaTipoIgv(p.tipoIgv)}</div>
              <div className="mt-2 text-center text-xs text-ambar-600 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                + Agregar
              </div>
            </button>
          ))}
          {productosFiltrados.length === 0 && (
            <div className="col-span-full text-center text-gray-400 py-10">{busqueda.trim() ? 'No se encontraron productos para esa búsqueda.' : productos.length ? 'No hay productos activos para vender.' : 'No hay productos en el catálogo. Revisa la sección Productos.'}</div>
          )}
        </div>
      </div>

      {/* Columna derecha: carrito */}
      <div className="card p-4 flex flex-col max-h-[calc(100vh-120px)] sticky top-20">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
          <ShoppingCart size={18} className="text-primario-600" />
          <h3 className="font-bold text-primario-700">Carrito</h3>
          <span className="ml-auto badge bg-ambar-100 text-ambar-700">{lineas.length} items</span>
        </div>

        {/* Selector de cliente */}
        <div className="mb-3">
          <label className="label"><User size={12} className="inline mr-1" />Cliente</label>
          <div className="relative">
            <input
              className="input text-sm"
              placeholder="Buscar por DNI/RUC o nombre..."
              value={buscarCliente}
              onChange={(e) => buscarClientes(e.target.value)}
            />
            {resultadosCliente.length > 0 && (
              <div className="absolute z-10 w-full mt-1 card p-1 max-h-48 overflow-y-auto">
                {resultadosCliente.map((c) => (
                  <button
                    key={c.numero}
                    onClick={() => seleccionarCliente(c)}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-primario-50 rounded"
                  >
                    <div className="font-medium">{c.nombre}</div>
                    <div className="text-xs text-gray-500">{c.tipoDoc}: {c.numero}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={usarConsumidorFinal} className="btn-secundario text-xs flex-1 py-1.5">
              Consumidor Final
            </button>
            <div className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5 flex items-center max-w-[55%] truncate">
              <span className="truncate">{cliente.nombre}</span>
            </div>
          </div>
          {cliente.id && Number(cliente.limiteCredito || 0) > 0 && (
            <div className="mt-1 text-[11px] text-gray-500 flex flex-wrap gap-x-3">
              <span>Límite: {formatearMoneda(Number(cliente.limiteCredito || 0))}</span>
              <span>Usado: {formatearMoneda(Number(cliente.saldoCredito || 0))}</span>
              <span className="font-semibold text-emerald-700">Disponible: {formatearMoneda(creditoDisponible)}</span>
            </div>
          )}
        </div>

        {/* Selector de comprobante */}
        <div className="mb-3">
          <label className="label">Comprobante (sugerido según cliente)</label>
          <select className="input text-sm" value={tipoComprobante} onChange={(e) => setTipoComprobante(e.target.value as TipoComprobante)}>
            <option value="03">Boleta (B001)</option>
            <option value="01">Factura (F001)</option>
          </select>
        </div>

        {/* Líneas del carrito */}
        <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[120px]">
          {lineas.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-8">Carrito vacío. Toque un producto para agregarlo.</div>
          )}
          {lineas.map((l, idx) => (
            <div key={idx} className="border border-gray-100 rounded-lg p-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 truncate">{l.nombre}</div>
                  <div className="text-xs text-gray-500">{formatearMoneda(l.precioUnitario)} c/u · {etiquetaTipoIgv(l.tipoIgv)}</div>
                </div>
                <button onClick={() => eliminarLinea(idx)} className="text-red-400 hover:text-red-600 p-1" aria-label="Eliminar línea">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center border border-gray-200 rounded-lg">
                  <button onClick={() => cambiarCantidad(idx, -1)} className="px-2 py-1 text-primario-600 hover:bg-gray-50"><Minus size={14} /></button>
                  <span className="px-2 font-semibold text-sm w-8 text-center">{l.cantidad}</span>
                  <button onClick={() => cambiarCantidad(idx, 1)} className="px-2 py-1 text-primario-600 hover:bg-gray-50"><Plus size={14} /></button>
                </div>
                {usuario?.rol==='ADMIN'&&<div className="flex-1">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="input text-xs py-1"
                    placeholder="Dscto S/"
                    value={l.descuento || ''}
                    onChange={(e) => cambiarDescuento(idx, e.target.value)}
                  />
                </div>}
                <div className="font-bold text-primario-700 text-sm whitespace-nowrap">
                  {formatearMoneda(l.cantidad * l.precioUnitario - l.descuento)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Totales */}
        <div className="border-t border-gray-100 pt-3 space-y-1 text-sm mb-3">
          <div className="flex justify-between text-gray-600"><span>Op. Gravadas</span><span>{formatearMoneda(totales.opGravadas)}</span></div>
          <div className="flex justify-between text-gray-600"><span>Op. Exoneradas</span><span>{formatearMoneda(totales.opExoneradas)}</span></div>
          <div className="flex justify-between text-gray-600"><span>Op. Inafectas</span><span>{formatearMoneda(totales.opInafectas)}</span></div>
          {totales.descuentoTotal > 0 && (
            <div className="flex justify-between text-red-500"><span>Descuento</span><span>-{formatearMoneda(totales.descuentoTotal)}</span></div>
          )}
          <div className="flex justify-between text-gray-600"><span>IGV (18%)</span><span>{formatearMoneda(totales.igvTotal)}</span></div>
          <div className="flex justify-between font-bold text-lg text-primario-700 border-t border-gray-200 pt-1">
            <span>Total a pagar</span><span>{formatearMoneda(totales.total)}</span>
          </div>
        </div>

        {tieneDescuento&&usuario?.rol==='ADMIN'&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><label className="label" htmlFor="motivo-descuento">Motivo del descuento (obligatorio)</label><input id="motivo-descuento" className="input bg-white" maxLength={250} value={motivoDescuento} onChange={e=>setMotivoDescuento(e.target.value)} placeholder="Ej. promoción autorizada por gerencia" /></div>}

        {/* Métodos de pago */}
        <div className="mb-3">
          <label className="label">Métodos de pago</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {METODOS.map((m) => {
              const Icono = m.icono;
              const activo = pagos.some((p) => p.metodo === m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMetodo(m.id)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    activo ? 'bg-primario-600 text-white border-primario-600' : 'bg-white text-gray-600 border-gray-200 hover:border-primario-400'
                  }`}
                >
                  <Icono size={12} /> {m.label}
                </button>
              );
            })}
          </div>
          {pagoCredito && (
            <div className="text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1.5 mb-2 space-y-2">
              <div>Crédito aplicado: {formatearMoneda(pagoCredito.monto)} · Los demás medios se cobran ahora; el saldo a crédito quedará en Cobranzas.</div>
              <div className="flex items-center gap-2">
                <label htmlFor="fecha-vencimiento-credito" className="font-semibold">Vence el:</label>
                <input id="fecha-vencimiento-credito" type="date" className="input bg-white text-xs py-1 max-w-44" min={fechaLimaHoy()} value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
                <span className="text-gray-600">Por defecto: 30 días</span>
              </div>
            </div>
          )}
          {pagos.map((p) => (
            <div key={p.metodo} className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-gray-600 w-20">{p.metodo}</span>
              <input
                type="number"
                min="0"
                step="0.1"
                className="input text-xs py-1.5 flex-1"
                placeholder="Monto S/"
                value={p.monto || ''}
                onChange={(e) => setMontoPago(p.metodo, parseFloat(e.target.value) || 0)}
              />
              {p.metodo === 'EFECTIVO' && (
                <>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className="input text-xs py-1.5 flex-1"
                    placeholder="Recibido S/"
                    value={p.montoRecibido ?? ''}
                    onChange={(e) => setMontoRecibido(parseFloat(e.target.value) || 0)}
                  />
                  <button onClick={completarEfectivo} className="btn-secundario text-[10px] px-2 py-1.5 whitespace-nowrap">
                    <Zap size={10} className="inline" /> Auto
                  </button>
                </>
              )}
            </div>
          ))}
          {pagoEfectivo && vuelto > 0 && (
            <div className="text-xs text-green-700 font-semibold bg-green-50 rounded px-2 py-1 mt-1">
              Vuelto a entregar: {formatearMoneda(vuelto)}
            </div>
          )}
          {sumaPagos > 0 && Math.abs(sumaPagos - totales.total) > 0.01 && (
            <div className={`text-xs font-semibold rounded px-2 py-1 mt-1 ${sumaPagos < totales.total ? 'text-red-600 bg-red-50' : 'text-green-700 bg-green-50'}`}>
              {sumaPagos < totales.total ? `Falta: ${formatearMoneda(totales.total - sumaPagos)}` : `Sobrante: ${formatearMoneda(sumaPagos - totales.total)}`}
            </div>
          )}
        </div>

        <button
          onClick={cobrar}
          disabled={procesando || lineas.length === 0 || !!recuperacionPendiente}
          className="w-full py-3 rounded-xl text-white font-bold text-lg bg-primario-600 hover:bg-primario-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          style={{ backgroundColor: '#1B4B6F' }}
        >
          {procesando ? 'Procesando...' : `COBRAR ${formatearMoneda(totales.total)}`}
        </button>
        {!cajaAbierta && (
          <div className="text-xs text-red-600 text-center mt-2 font-medium">Atención: la caja está cerrada</div>
        )}
      </div>

      {productoParaVariante && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-lg text-gray-800">Elegir presentación</h3>
                <p className="text-sm text-gray-500">{productoParaVariante.nombre}</p>
              </div>
              <button onClick={() => { setProductoParaVariante(null); setVariantesDisponibles([]); }} className="text-gray-500 px-3 py-1" aria-label="Cerrar">✕</button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {variantesDisponibles.map((v: any) => (
                <button key={v.id} onClick={() => agregarLineaVariante(productoParaVariante, v)}
                  disabled={Number(v.stock || 0) <= 0}
                  className="w-full border rounded-xl p-3 text-left flex items-center justify-between gap-3 hover:border-primario-500 disabled:opacity-40 disabled:cursor-not-allowed">
                  <span className="min-w-0">
                    <span className="block font-semibold text-gray-800">{v.nombre}</span>
                    <span className="block text-xs text-gray-500">{v.codigoBarras || v.codigo} · Stock: {Number(v.stock || 0)}</span>
                  </span>
                  <span className="font-bold text-primario-700 whitespace-nowrap">{formatearMoneda(Number(v.precio))}</span>
                </button>
              ))}
              {cargandoVariantes && <p className="text-sm text-gray-500">Cargando presentaciones...</p>}
              {!cargandoVariantes && variantesDisponibles.length === 0 && <p className="text-sm text-gray-500">No hay presentaciones disponibles.</p>}
            </div>
            <div className="p-4 border-t flex justify-end">
              <button onClick={() => { setProductoParaVariante(null); setVariantesDisponibles([]); }} className="btn-secundario">Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {ventaTicket && <TicketModal venta={ventaTicket} alCerrar={() => setVentaTicket(null)} />}
    </div>
  );
}
