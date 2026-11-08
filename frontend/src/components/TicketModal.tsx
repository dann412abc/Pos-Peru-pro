import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, X } from 'lucide-react';
import type { Venta, FormatoTicket } from '../types';
import { formatearMoneda, etiquetaComprobante } from '../utils/igv';
import { db } from '../db';
import type { ConfigEmpresa } from '../types';
import EnvioComprobante from './EnvioComprobante';
import { FORMATO_TICKET_KEY } from '../pages/Configuracion';

const FORMATOS_TICKET: FormatoTicket[] = ['58mm', '80mm', 'A5'];

interface Props {
  venta: Venta | null;
  alCerrar: () => void;
}

// Modal de ticket imprimible: datos del emisor, comprobante, líneas, totales y QR.
export default function TicketModal({ venta, alCerrar }: Props) {
  const [qrUrl, setQrUrl] = useState('');
  const [config, setConfig] = useState<ConfigEmpresa | null>(null);
  const [formato, setFormato] = useState<FormatoTicket>(
    () => (localStorage.getItem(FORMATO_TICKET_KEY) as FormatoTicket) || '80mm',
  );
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    db.config.toArray().then((c) => setConfig(c[0] || null));
  }, []);

  useEffect(() => {
    if (!venta) return;
    // Texto del QR: datos resumidos de la venta (RUC|tipo|serie|correlativo|IGV|total|fecha|docCliente)
    const textoQR = [
      config?.ruc || '20123456786',
      venta.tipoComprobante,
      venta.serie,
      String(venta.correlativo).padStart(8, '0'),
      venta.igvTotal.toFixed(2),
      venta.total.toFixed(2),
      venta.fecha.slice(0, 10),
      venta.cliente.tipoDoc,
      venta.cliente.numero,
    ].join('|');
    QRCode.toDataURL(textoQR, { width: 180, margin: 1 })
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [venta, config]);

  if (!venta) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={alCerrar} />
      <div className="relative card w-full max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 sticky top-0 bg-white z-10 no-print">
          <span className="text-sm font-semibold text-primario-700">Comprobante emitido</span>
          <div className="flex items-center gap-1">
            {/* Selector de formato de impresión */}
            <div className="flex items-center gap-0.5 mr-2 border border-gray-200 rounded-lg p-0.5">
              {FORMATOS_TICKET.map((f) => (
                <button
                  key={f}
                  onClick={() => setFormato(f)}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                    formato === f ? 'bg-primario-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                  title={`Formato ${f}`}
                >
                  {f}
                </button>
              ))}
            </div>
            {venta && (
              <EnvioComprobante venta={venta} nombreNegocio={config?.nombreComercial || 'Mi Carrito POS'} />
            )}
            <button onClick={() => window.print()} className="p-2 rounded hover:bg-gray-100 text-primario-600" title="Imprimir" aria-label="Imprimir">
              <Printer size={16} />
            </button>
            <button onClick={alCerrar} className="p-2 rounded hover:bg-gray-100 text-gray-500" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>
        </div>

        <div id="ticket-imprimible" className={`p-4 text-[12px] text-gray-800 font-mono ticket-${formato}`}>
          <div className="text-center mb-3">
            <div className="font-bold text-base">{config?.razonSocial || 'COMERCIAL MI CARRITO E.I.R.L.'}</div>
            <div>RUC: {config?.ruc || '20123456786'}</div>
            <div>{config?.direccion || 'Av. Mariscal Cáceres 789'}</div>
            <div>
              {config?.distrito || 'Huancayo'}, {config?.provincia || 'Huancayo'}, {config?.departamento || 'Junín'}
            </div>
          </div>

          <div className="text-center border-y border-dashed border-gray-400 py-2 my-2">
            <div className="font-bold text-sm">
              {etiquetaComprobante(venta.tipoComprobante)} ELECTRÓNICA
            </div>
            <div className="font-bold">
              {venta.serie}-{String(venta.correlativo).padStart(8, '0')}
            </div>
            <div className="text-[10px] text-gray-600 mt-1">
              Estado FE: <span className="font-bold">{venta.estadoFE}</span>
            </div>
          </div>

          <div className="my-2 space-y-0.5">
            <div>Fecha: {new Date(venta.fecha).toLocaleString('es-PE')}</div>
            <div>
              Cliente: {venta.cliente.nombre}
            </div>
            <div>
              {venta.cliente.tipoDoc}: {venta.cliente.numero}
            </div>
            {venta.cliente.direccion && <div>Dir: {venta.cliente.direccion}</div>}
          </div>

          <table className="w-full mt-2 border-t border-dashed border-gray-400 pt-2">
            <thead>
              <tr className="text-left text-[10px] text-gray-600">
                <th>Descripción</th>
                <th className="text-right">Cant.</th>
                <th className="text-right">P.Unit</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {venta.lineas.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-1">
                    {l.nombre}
                    {l.descuento > 0 && <div className="text-[10px] text-red-600">Dscto: -{formatearMoneda(l.descuento)}</div>}
                  </td>
                  <td className="text-right py-1">{l.cantidad}</td>
                  <td className="text-right py-1">{l.precioUnitario.toFixed(2)}</td>
                  <td className="text-right py-1">{(l.cantidad * l.precioUnitario - l.descuento).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-dashed border-gray-400 mt-2 pt-2 space-y-0.5">
            <div className="flex justify-between"><span>Op. Gravadas:</span><span>{formatearMoneda(venta.opGravadas)}</span></div>
            <div className="flex justify-between"><span>Op. Exoneradas:</span><span>{formatearMoneda(venta.opExoneradas)}</span></div>
            <div className="flex justify-between"><span>Op. Inafectas:</span><span>{formatearMoneda(venta.opInafectas)}</span></div>
            {venta.descuentoTotal > 0 && (
              <div className="flex justify-between text-red-600"><span>Descuento total:</span><span>-{formatearMoneda(venta.descuentoTotal)}</span></div>
            )}
            <div className="flex justify-between"><span>IGV (18%):</span><span>{formatearMoneda(venta.igvTotal)}</span></div>
            <div className="flex justify-between font-bold text-base border-t border-gray-400 pt-1 mt-1">
              <span>TOTAL:</span><span>{formatearMoneda(venta.total)}</span>
            </div>
          </div>

          <div className="mt-2 space-y-0.5 text-[11px]">
            {venta.pagos.map((p, i) => (
              <div key={i} className="flex justify-between">
                <span>{p.metodo}:</span>
                <span>{formatearMoneda(p.monto)}</span>
                {p.montoRecibido != null && (
                  <span className="text-gray-500 ml-2">Recibido {formatearMoneda(p.montoRecibido)} · Vuelto {formatearMoneda(p.vuelto || 0)}</span>
                )}
              </div>
            ))}
          </div>

          {qrUrl && (
            <div className="flex flex-col items-center mt-3">
              <img src={qrUrl} alt="Código QR del comprobante" className={`qr-ticket qr-${formato}`} />
              <div className="text-[10px] text-gray-500 mt-1 text-center">
                Consulte su comprobante con el código QR
              </div>
            </div>
          )}
          <canvas ref={qrRef} className="hidden" />

          <div className="text-center mt-3 text-[10px] text-gray-600 border-t border-dashed border-gray-400 pt-2">
            Mi Carrito POS - Sistema de facturación electrónica para Perú
          </div>
        </div>
      </div>
    </div>
  );
}
