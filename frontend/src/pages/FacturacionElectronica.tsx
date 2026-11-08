import { useEffect, useState } from 'react';
import { FileCheck, RefreshCw, Eye, AlertCircle, CheckCircle2, Clock, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../db';
import { formatearMoneda, etiquetaComprobante } from '../utils/igv';
import { sincronizarPendientes } from '../api/syncQueue';
import Modal from '../components/ui/Modal';
import type { Venta, EstadoFE } from '../types';

const ESTADO_META: Record<EstadoFE, { color: string; icono: typeof Clock }> = {
  Pendiente: { color: 'bg-gray-100 text-gray-600', icono: Clock },
  Enviando: { color: 'bg-yellow-100 text-yellow-700', icono: Send },
  Aceptado: { color: 'bg-green-100 text-green-700', icono: CheckCircle2 },
  Rechazado: { color: 'bg-red-100 text-red-600', icono: AlertCircle },
};

// Seguimiento de comprobantes electrónicos ante la SUNAT: estados, reenvío y CDR.
export default function FacturacionElectronica() {
  const [comprobantes, setComprobantes] = useState<Venta[]>([]);
  const [seleccionado, setSeleccionado] = useState<Venta | null>(null);
  const [reintentando, setReintentando] = useState(false);

  useEffect(() => {
    async function cargar() {
      const todas = await db.ventas.toArray();
      setComprobantes(todas.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)));
    }
    cargar();
  }, []);

  async function reenviar(v: Venta) {
    setReintentando(true);
    try {
      // Reintenta la sincronización de la cola offline.
      const res = await sincronizarPendientes(true);
      toast.success(`Reenvío ejecutado. Elementos sincronizados: ${res.ventas + res.docs}`);
      if (res.requierenRevision > 0) {
        toast.error(`${res.requierenRevision} elemento(s) siguen rechazados; revise el motivo antes de volver a emitir.`);
      }
      const todas = await db.ventas.toArray();
      setComprobantes(todas.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)));
    } catch {
      toast.error('No se pudo reenviar. Revise su conexión.');
    } finally {
      setReintentando(false);
    }
  }

  const conteos = {
    Pendiente: comprobantes.filter((c) => c.estadoFE === 'Pendiente').length,
    Enviando: comprobantes.filter((c) => c.estadoFE === 'Enviando').length,
    Aceptado: comprobantes.filter((c) => c.estadoFE === 'Aceptado').length,
    Rechazado: comprobantes.filter((c) => c.estadoFE === 'Rechazado').length,
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Entorno de pruebas:</strong> la versión incluida usa un adaptador OSE simulado. Los estados «Aceptado» y los CDR de este modo no acreditan recepción de SUNAT ni tienen validez tributaria.
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-primario-700 flex items-center gap-2">
            <FileCheck size={22} /> Facturación Electrónica
          </h2>
          <p className="text-sm text-gray-500">Seguimiento de comprobantes ante SUNAT</p>
        </div>
        <button onClick={() => reenviar(comprobantes[0] || ({} as Venta))} disabled={reintentando} className="btn-ambar flex items-center gap-2">
          <RefreshCw size={16} className={reintentando ? 'animate-spin' : ''} /> Reintentar pendientes
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(ESTADO_META) as EstadoFE[]).map((estado) => {
          const meta = ESTADO_META[estado];
          const Icono = meta.icono;
          return (
            <div key={estado} className="card p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${meta.color}`}>
                <Icono size={20} />
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">{estado}</div>
                <div className="text-xl font-bold text-gray-800">{conteos[estado]}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Comprobante</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Estado FE</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {comprobantes.map((c) => {
                const meta = ESTADO_META[c.estadoFE];
                return (
                  <tr key={`${c.serie}-${c.correlativo}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-primario-700">{c.serie}-{String(c.correlativo).padStart(8, '0')}</div>
                      <div className="text-xs text-gray-500">{etiquetaComprobante(c.tipoComprobante)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">{c.cliente.nombre}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatearMoneda(c.total)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge ${meta.color}`}>{c.estadoFE}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setSeleccionado(c)} className="p-1.5 rounded hover:bg-primario-50 text-primario-600" title="Ver CDR / observaciones" aria-label="Ver detalle">
                          <Eye size={14} />
                        </button>
                        {(c.estadoFE === 'Pendiente' || c.estadoFE === 'Rechazado') && (
                          <button onClick={() => reenviar(c)} className="p-1.5 rounded hover:bg-ambar-50 text-ambar-600" title="Reenviar a SUNAT" aria-label="Reenviar">
                            <RefreshCw size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {comprobantes.length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 py-8">Sin comprobantes emitidos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal abierto={!!seleccionado} alCerrar={() => setSeleccionado(null)} titulo="CDR y observaciones del comprobante">
        {seleccionado && (
          <div className="space-y-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="font-semibold text-primario-700">
                {seleccionado.serie}-{String(seleccionado.correlativo).padStart(8, '0')}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {etiquetaComprobante(seleccionado.tipoComprobante)} · {seleccionado.cliente.nombre}
              </div>
            </div>
            <div>
              <span className="label">Estado actual</span>
              <span className={`badge ${ESTADO_META[seleccionado.estadoFE].color}`}>{seleccionado.estadoFE}</span>
            </div>
            <div>
              <span className="label">CDR (Constancia de Recepción)</span>
              {seleccionado.estadoFE === 'Aceptado' ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-800 text-xs">
                  Comprobante aceptado por la SUNAT. CDR generado correctamente.
                  <div className="mt-1 font-mono text-[10px] text-green-600">CDR-{seleccionado.serie}-{String(seleccionado.correlativo).padStart(8, '0')}.zip</div>
                </div>
              ) : seleccionado.estadoFE === 'Rechazado' ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-xs">
                  <AlertCircle size={14} className="inline mr-1" />
                  {seleccionado.cdrObservacion || 'El comprobante fue rechazado. Verifique los datos del RUC y reenvíe.'}
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-xs">
                  <Clock size={14} className="inline mr-1" />
                  Comprobante pendiente de envío o en proceso. El CDR estará disponible cuando sea aceptado.
                </div>
              )}
            </div>
            {(seleccionado.estadoFE === 'Pendiente' || seleccionado.estadoFE === 'Rechazado') && (
              <button onClick={() => { reenviar(seleccionado); setSeleccionado(null); }} className="btn-ambar w-full flex items-center justify-center gap-2">
                <RefreshCw size={16} /> Reenviar comprobante
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
