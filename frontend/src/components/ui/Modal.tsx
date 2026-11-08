import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  children: ReactNode;
  anchoMaximo?: string;
}

// Modal genérico reutilizable en toda la aplicación.
export default function Modal({ abierto, alCerrar, titulo, children, anchoMaximo = 'max-w-2xl' }: ModalProps) {
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={alCerrar} />
      <div className={`relative card w-full ${anchoMaximo} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 sticky top-0 bg-white rounded-t-xl">
          <h3 className="font-semibold text-primario-700">{titulo}</h3>
          <button onClick={alCerrar} className="p-1 rounded hover:bg-gray-100 text-gray-500" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
