import { useState } from 'react';
import { Mail, X, Send, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { encolar } from '../api/syncQueue';
import { formatearWhatsApp, construirUrlWhatsApp } from '../utils/notificaciones';
import type { Venta } from '../types';

// Icono WhatsApp (SVG inline, ya que lucide no incluye iconos de marca).
function WhatsAppIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

type Canal = 'whatsapp' | 'email' | null;

interface Props {
  venta: Venta;
  nombreNegocio: string;
  variante?: 'iconos' | 'botones';
}

// Botones de envío de comprobante por WhatsApp y correo, con diálogo de confirmación.
// Reutilizable en TicketModal y en la lista de Ventas.
export default function EnvioComprobante({ venta, nombreNegocio, variante = 'botones' }: Props) {
  const [canal, setCanal] = useState<Canal>(null);
  const [telefono, setTelefono] = useState(venta.cliente.telefono || '');
  const [email, setEmail] = useState(venta.cliente.email || '');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<'abierto'|'enviado'|'simulado'|'encolado'|null>(null);

  function abrir(c: Canal) {
    setCanal(c);
    setTelefono(venta.cliente.telefono || '');
    setEmail(venta.cliente.email || '');
    setEnviado(null);
  }

  function confirmarWhatsApp() {
    const numero = formatearWhatsApp(telefono);
    if (!numero) {
      toast.error('Número de celular inválido. Use formato 9XX XXX XXX (Perú).');
      return;
    }
    const url = construirUrlWhatsApp(telefono, venta, nombreNegocio);
    window.open(url, '_blank', 'noopener,noreferrer');
    setEnviado('abierto');
    toast.success('WhatsApp se abrió. Confirma el envío desde WhatsApp.');
    setTimeout(() => setCanal(null), 1200);
  }

  async function confirmarEmail() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Ingrese un correo electrónico válido');
      return;
    }
    if (!venta.serverId) {
      toast.error('Esta venta aún no está sincronizada. Sincronízala antes de enviar el correo.');
      return;
    }
    setEnviando(true);
    let finalizado = false;
    try {
      if (!navigator.onLine) {
        await encolar('comprobante', {
          accion: 'enviar-email', serverId: venta.serverId, email,
          ventaId: `${venta.serie}-${venta.correlativo}`,
        });
        setEnviado('encolado');
        finalizado = true;
        toast('Envío de correo en cola. Se procesará al recuperar conexión.', { icon: '📡' });
      } else {
        const response = await api.post(`/fe/comprobantes/${venta.serverId}/enviar-email`, { email });
        if (response.data?.simulado) {
          setEnviado('simulado');
          finalizado = true;
          toast('El correo quedó registrado como simulado; no se envió al destinatario.', { icon: '⚠️' });
        } else if (response.data?.estado === 'ENVIADO') {
          setEnviado('enviado');
          finalizado = true;
          toast.success('Correo enviado correctamente.');
        } else {
          throw new Error(response.data?.mensajeError || 'El servidor no confirmó el envío del correo.');
        }
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'No se pudo enviar el correo. No se añadió a la cola para evitar reintentos duplicados.');
    } finally {
      setEnviando(false);
      if (finalizado) setTimeout(() => setCanal(null), 1200);
    }
  }

  const claseBoton =
    variante === 'iconos'
      ? 'p-1.5 rounded hover:bg-gray-100'
      : 'p-2 rounded hover:bg-gray-100';

  return (
    <>
      <button
        onClick={() => abrir('whatsapp')}
        className={`${claseBoton} text-green-600`}
        title="Enviar por WhatsApp"
        aria-label="Enviar por WhatsApp"
      >
        <WhatsAppIcon size={variante === 'iconos' ? 14 : 16} />
      </button>
      <button
        onClick={() => abrir('email')}
        className={`${claseBoton} text-primario-600`}
        title="Enviar por correo"
        aria-label="Enviar por correo"
      >
        <Mail size={variante === 'iconos' ? 14 : 16} />
      </button>

      {canal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCanal(null)} />
          <div className="relative card w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-primario-700 flex items-center gap-2">
                {canal === 'whatsapp' ? (
                  <><WhatsAppIcon size={18} className="text-green-600" /> Enviar por WhatsApp</>
                ) : (
                  <><Mail size={18} className="text-primario-600" /> Enviar por correo</>
                )}
              </h3>
              <button onClick={() => setCanal(null)} className="p-1 rounded hover:bg-gray-100 text-gray-500" aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-gray-500 mb-3 bg-gray-50 rounded p-2">
              Comprobante: <span className="font-semibold">{venta.serie}-{String(venta.correlativo).padStart(8, '0')}</span> · Cliente: {venta.cliente.nombre}
            </div>

            {canal === 'whatsapp' ? (
              <div>
                <label className="label">Número de celular (Perú, 9 dígitos)</label>
                <input
                  className="input font-mono"
                  placeholder="987654321"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
                />
                {telefono && (
                  <div className="text-xs text-gray-500 mt-1">
                    Se enviará a: <span className="font-mono font-semibold">+{formatearWhatsApp(telefono) || '(inválido)'}</span>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="label">Correo electrónico</label>
                <input
                  className="input"
                  type="email"
                  placeholder="cliente@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setCanal(null)} className="btn-secundario text-sm">Cancelar</button>
              <button
                onClick={canal === 'whatsapp' ? confirmarWhatsApp : confirmarEmail}
                disabled={enviando || enviado !== null}
                className="btn-primario text-sm flex items-center gap-2"
              >
                {enviado ? <><CheckCircle2 size={14} /> {enviado === 'encolado' ? 'En cola' : enviado === 'simulado' ? 'Simulado' : enviado === 'abierto' ? 'Abierto' : 'Enviado'}</> : <><Send size={14} /> {enviando ? 'Enviando...' : 'Enviar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
