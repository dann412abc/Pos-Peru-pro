import { useEffect, useMemo, useState } from 'react';
import { Search, Receipt, Printer, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../db';
import { api, ES_MODO_DEMO } from '../api/client';
import { mapComprobante } from '../utils/ventaMapper';
import { formatearMoneda, etiquetaComprobante } from '../utils/igv';
import Modal from '../components/ui/Modal';
import TicketModal from '../components/TicketModal';
import EnvioComprobante from '../components/EnvioComprobante';
import type { Venta, TipoComprobante, EstadoFE } from '../types';
import { useAuth } from '../context/AuthContext';

const ESTADO_COLOR: Record<EstadoFE, string> = {
  Pendiente: 'bg-gray-100 text-gray-600',
  Enviando: 'bg-yellow-100 text-yellow-700',
  Aceptado: 'bg-green-100 text-green-700',
  Rechazado: 'bg-red-100 text-red-600',
};

// Lista de ventas con filtros (fecha, tipo comprobante, estado, cliente), detalle e impresión de ticket.
export default function Ventas() {
  const { usuario } = useAuth();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [fFecha, setFFecha] = useState('');
  const [fTipo, setFTipo] = useState('TODOS');
  const [fEstado, setFEstado] = useState('TODOS');
  const [fCliente, setFCliente] = useState('');
  const [detalle, setDetalle] = useState<Venta | null>(null);
  const [ticket, setTicket] = useState<Venta | null>(null);
  const [notaDebitoAbierta, setNotaDebitoAbierta] = useState(false);
  const [montoNotaDebito, setMontoNotaDebito] = useState('');
  const [motivoNotaDebito, setMotivoNotaDebito] = useState('');
  const [lineaNotaDebitoId, setLineaNotaDebitoId] = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);

  useEffect(() => {
    let activo = true;
    async function cargar() {
      try {
        if (!ES_MODO_DEMO) {
          const sucursalId = Number(usuario?.sucursalId);
          const respuesta = await api.get('/ventas', { params: Number.isInteger(sucursalId) && sucursalId > 0 ? { sucursalId } : {} });
          const todas = (respuesta.data || []).map(mapComprobante);
          if (activo) setVentas(todas.sort((a: Venta, b: Venta) => (a.fecha < b.fecha ? 1 : -1)));
          await db.ventas.bulkPut(todas);
          return;
        }
        const todas = await db.ventas.toArray();
        if (activo) setVentas(todas.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)));
      } catch {
        const cache = await db.ventas.toArray();
        if (activo) setVentas(cache.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)));
      }
    }
    cargar();
    return () => { activo = false; };
  }, [usuario?.sucursalId]);

  const filtradas = useMemo(() => {
    return ventas.filter((v) => {
      if (fFecha && v.fecha.slice(0, 10) !== fFecha) return false;
      if (fTipo !== 'TODOS' && v.tipoComprobante !== fTipo) return false;
      if (fEstado !== 'TODOS' && v.estadoFE !== fEstado) return false;
      if (fCliente.trim() && !v.cliente.nombre.toLowerCase().includes(fCliente.trim().toLowerCase()) && !v.cliente.numero.includes(fCliente.trim())) return false;
      return true;
    });
  }, [ventas, fFecha, fTipo, fEstado, fCliente]);

  async function crearNotaDebito() {
    if (!detalle?.serverId) return;
    const monto = Number(montoNotaDebito);
    if (!Number.isFinite(monto) || monto <= 0 || motivoNotaDebito.trim().length < 5) {
      toast.error('Ingrese un importe y un motivo de al menos cinco caracteres'); return;
    }
    setGuardandoNota(true);
    try {
      const clave = `nd-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      const respuesta = await api.post(`/ventas/${detalle.serverId}/notas-debito`, {
        comprobanteLineaId: Number(lineaNotaDebitoId), monto: Number(monto.toFixed(2)), motivo: motivoNotaDebito.trim(), idempotencyKey: clave,
      });
      setVentas((actual) => [mapComprobante(respuesta.data), ...actual]);
      toast.success('Nota de débito registrada; el nuevo saldo está disponible en Cobranzas');
      setNotaDebitoAbierta(false); setMontoNotaDebito(''); setMotivoNotaDebito('');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo registrar la nota de débito');
    } finally { setGuardandoNota(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-primario-700 flex items-center gap-2">
          <Receipt size={22} /> Ventas
        </h2>
        <p className="text-sm text-gray-500">Historial de comprobantes emitidos ({ventas.length})</p>
      </div>

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="label">Fecha</label>
          <input type="date" className="input" value={fFecha} onChange={(e) => setFFecha(e.target.value)} />
        </div>
        <div>
          <label className="label">Tipo comprobante</label>
          <select className="input" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
            <option value="TODOS">Todos</option>
            <option value="01">Factura (01)</option>
            <option value="03">Boleta (03)</option>
            <option value="07">Nota Crédito (07)</option>
            <option value="08">Nota Débito (08)</option>
          </select>
        </div>
        <div>
          <label className="label">Estado FE</label>
          <select className="input" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            <option value="TODOS">Todos</option>
            <option>Pendiente</option>
            <option>Enviando</option>
            <option>Aceptado</option>
            <option>Rechazado</option>
          </select>
        </div>
        <div>
          <label className="label">Cliente</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-8" placeholder="Nombre o documento" value={fCliente} onChange={(e) => setFCliente(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Comprobante</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Estado FE</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.map((v) => (
                <tr key={`${v.serie}-${v.correlativo}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-600">{new Date(v.fecha).toLocaleString('es-PE')}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-primario-700">{v.serie}-{String(v.correlativo).padStart(8, '0')}</div>
                    <div className="text-xs text-gray-500">{etiquetaComprobante(v.tipoComprobante)}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{v.cliente.nombre}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800">{formatearMoneda(v.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge ${ESTADO_COLOR[v.estadoFE]}`}>{v.estadoFE}</span>
                    {v.enCola && <div className="text-[10px] text-amber-600 mt-0.5">Pendiente sincronizar</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <EnvioComprobante venta={v} nombreNegocio="Mi Carrito POS" variante="iconos" />
                      <button onClick={() => setDetalle(v)} className="p-1.5 rounded hover:bg-primario-50 text-primario-600" title="Ver detalle" aria-label="Ver detalle">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => setTicket(v)} className="p-1.5 rounded hover:bg-ambar-50 text-ambar-600" title="Imprimir ticket" aria-label="Imprimir ticket">
                        <Printer size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-400 py-8">No hay ventas registradas. Realice una venta en Venta Rápida.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal abierto={!!detalle} alCerrar={() => setDetalle(null)} titulo={`Detalle de venta ${detalle?.serie}-${String(detalle?.correlativo || 0).padStart(8, '0')}`}>
        {detalle && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-lg p-3">
              <div><span className="text-gray-500 text-xs">Cliente:</span><div className="font-medium">{detalle.cliente.nombre}</div></div>
              <div><span className="text-gray-500 text-xs">{detalle.cliente.tipoDoc}:</span><div className="font-mono">{detalle.cliente.numero}</div></div>
              <div><span className="text-gray-500 text-xs">Fecha:</span><div>{new Date(detalle.fecha).toLocaleString('es-PE')}</div></div>
              <div><span className="text-gray-500 text-xs">Estado FE:</span><div className={`badge ${ESTADO_COLOR[detalle.estadoFE]}`}>{detalle.estadoFE}</div></div>
            </div>
            {detalle.referenciaComprobante && <div className="rounded bg-blue-50 border border-blue-100 p-2 text-xs"><b>Comprobante de referencia:</b> {detalle.referenciaComprobante.serie}-{String(detalle.referenciaComprobante.correlativo).padStart(8, '0')} · {etiquetaComprobante(detalle.referenciaComprobante.tipo)}{detalle.descripcionMotivoNota && <div className="mt-1"><b>Motivo:</b> {detalle.descripcionMotivoNota}</div>}</div>}
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b"><tr><th className="text-left py-1">Producto</th><th className="text-center">Cant.</th><th className="text-right">P.Unit</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {detalle.lineas.map((l, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-1.5">{l.nombre}</td>
                    <td className="text-center">{l.cantidad}</td>
                    <td className="text-right">{l.precioUnitario.toFixed(2)}</td>
                    <td className="text-right">{(l.cantidad * l.precioUnitario - l.descuento).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span>Op. Gravadas</span><span>{formatearMoneda(detalle.opGravadas)}</span></div>
              <div className="flex justify-between"><span>Op. Exoneradas</span><span>{formatearMoneda(detalle.opExoneradas)}</span></div>
              <div className="flex justify-between"><span>Op. Inafectas</span><span>{formatearMoneda(detalle.opInafectas)}</span></div>
              <div className="flex justify-between"><span>IGV (18%)</span><span>{formatearMoneda(detalle.igvTotal)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-1"><span>TOTAL</span><span>{formatearMoneda(detalle.total)}</span></div>
            </div>
            {usuario?.rol==='ADMIN'&&detalle.motivoDescuento&&<div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs"><b>Descuento autorizado:</b> {detalle.motivoDescuento}</div>}
            <div className="text-xs text-gray-500">
              Pagos: {detalle.pagos.map((p) => `${p.metodo} ${formatearMoneda(p.monto)}`).join(' · ')}
            </div>
            {usuario?.rol === 'ADMIN' && !ES_MODO_DEMO && ['01','03'].includes(detalle.tipoComprobante) && detalle.estadoComprobante !== 'ANULADA' && <div className="border-t pt-3 space-y-2">
      {!notaDebitoAbierta ? <button className="btn-secundario text-xs" onClick={() => { setLineaNotaDebitoId(String(detalle.lineas[0]?.comprobanteLineaId || '')); setNotaDebitoAbierta(true); }}>Nota de débito · aumento de valor</button> : <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-xs text-amber-900">La nota abrirá una cuenta por cobrar adicional a 30 días. Podrá registrar abonos en Cobranzas.</p>
                <select className="input bg-white" value={lineaNotaDebitoId} onChange={(e) => setLineaNotaDebitoId(e.target.value)}><option value="">Seleccione el producto cuyo valor aumenta</option>{detalle.lineas.filter((linea) => linea.comprobanteLineaId).map((linea) => <option key={linea.comprobanteLineaId} value={linea.comprobanteLineaId}>{linea.nombre} · {linea.codigo}</option>)}</select>
                <input className="input bg-white" type="number" min="0.01" step="0.01" placeholder="Importe adicional" value={montoNotaDebito} onChange={(e) => setMontoNotaDebito(e.target.value)} />
                <input className="input bg-white" maxLength={250} placeholder="Motivo del aumento de valor" value={motivoNotaDebito} onChange={(e) => setMotivoNotaDebito(e.target.value)} />
                <div className="flex justify-end gap-2"><button className="btn-secundario text-xs" onClick={() => setNotaDebitoAbierta(false)}>Cancelar</button><button className="btn-ambar text-xs" disabled={guardandoNota} onClick={crearNotaDebito}>{guardandoNota ? 'Registrando…' : 'Emitir nota de débito'}</button></div>
              </div>}
            </div>}
          </div>
        )}
      </Modal>

      {ticket && <TicketModal venta={ticket} alCerrar={() => setTicket(null)} />}
    </div>
  );
}

export type { TipoComprobante };
