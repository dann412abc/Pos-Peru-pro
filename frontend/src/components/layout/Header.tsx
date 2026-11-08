import { useEffect, useState } from 'react';
import { Menu, LogOut, User, Clock, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../db';
import { api, ES_MODO_DEMO } from '../../api/client';
import type { Caja } from '../../types';

export default function Header({ alToggleSidebar }: { alToggleSidebar: () => void }) {
  const { usuario, logout, sucursalActiva, cambiarSucursal } = useAuth();
  const [ahora, setAhora] = useState(new Date());
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  const [estadoCaja, setEstadoCaja] = useState<'Abierta' | 'Cerrada' | 'Sin apertura'>('Sin apertura');

  // Estado de conectividad: evita cambiar de sucursal con caché offline de otra sucursal.
  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    return () => {
      window.removeEventListener('online', actualizar);
      window.removeEventListener('offline', actualizar);
    };
  }, []);

  // Reloj en vivo HH:MM:SS
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // En producción, el estado se consulta al servidor para la sucursal activa.
  useEffect(() => {
    let activo = true;
    async function consultar() {
      try {
        if (!ES_MODO_DEMO) {
          const sucursalId = Number(usuario?.sucursalId);
          if (!Number.isInteger(sucursalId) || sucursalId <= 0) {
            if (activo) setEstadoCaja('Sin apertura');
            return;
          }
          const respuesta = await api.get('/caja/estado', { params: { sucursalId } });
          if (activo) setEstadoCaja(respuesta.data?.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada');
          return;
        }
        const cajas = await db.cash_register.where('estado').equals('Abierta').toArray();
        if (activo) setEstadoCaja(cajas.some((caja) => String(caja.sucursalId) === String(usuario?.sucursalId)) ? 'Abierta' : 'Cerrada');
      } catch {
        if (activo) setEstadoCaja('Sin apertura');
      }
    }
    consultar();
    const t = setInterval(consultar, 10000);
    return () => {
      activo = false;
      clearInterval(t);
    };
  }, [usuario?.sucursalId]);

  const fecha = ahora.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const hora = ahora.toLocaleTimeString('es-PE', { hour12: false });

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
      <button onClick={alToggleSidebar} className="lg:hidden p-2 rounded hover:bg-gray-100 text-primario-700" aria-label="Menú">
        <Menu size={20} />
      </button>

      <div className="hidden lg:flex items-center gap-2 mr-3">
        <div className="w-8 h-8 rounded-lg bg-ambar-500 flex items-center justify-center font-bold text-white text-sm">M</div>
        <span className="font-bold text-primario-700 text-sm whitespace-nowrap">Mi Carrito POS</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 capitalize truncate">{fecha}</div>
        {usuario?.sucursales && usuario.sucursales.length > 1 ? (
          <select
            aria-label="Cambiar sucursal activa"
            className="mt-0.5 max-w-full bg-transparent text-sm font-semibold text-primario-700 border-0 p-0 pr-6 focus:ring-0 cursor-pointer"
            value={usuario.sucursalId}
            disabled={!enLinea}
            title={!enLinea ? 'Conéctese a Internet para cambiar de sucursal' : 'Cambiar sucursal activa'}
            onChange={(e) => cambiarSucursal(e.target.value)}
          >
            {usuario.sucursales.map((sucursal) => (
              <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>
            ))}
          </select>
        ) : (
          <div className="text-sm font-semibold text-primario-700 truncate">{sucursalActiva}</div>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
        <Clock size={16} className="text-ambar-500" />
        <span className="font-mono font-semibold tabular-nums">{hora}</span>
      </div>

      <div
        className={`hidden md:flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg ${
          estadoCaja === 'Abierta' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}
      >
        <Wallet size={14} />
        Caja: {estadoCaja}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <div className="w-8 h-8 rounded-full bg-primario-100 text-primario-700 flex items-center justify-center">
          <User size={16} />
        </div>
        <div className="hidden sm:block leading-tight">
          <div className="font-semibold text-gray-800 text-sm">{usuario?.nombre}</div>
          <div className="text-[11px] text-gray-500">{usuario?.rol}</div>
        </div>
      </div>

      <button
        onClick={logout}
        className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
      >
        <LogOut size={18} />
      </button>
    </header>
  );
}

export type { Caja };
