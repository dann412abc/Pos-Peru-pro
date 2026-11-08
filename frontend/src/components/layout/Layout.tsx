import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useAuth } from '../../context/AuthContext';
import { iniciarSyncListener } from '../../api/syncQueue';
import { useEffect } from 'react';
import toast from 'react-hot-toast';

// Layout principal: sidebar + header + contenido.
// Si no hay usuario autenticado, redirige a /login.
export default function Layout() {
  const { usuario, loading } = useAuth();
  const [sidebarAbierto, setSidebarAbierto] = useState(false);

  useEffect(() => {
    iniciarSyncListener((res) => {
      if (res.ventas > 0 || res.docs > 0) {
        toast.success(`Sincronizados: ${res.ventas} ventas, ${res.docs} comprobantes`);
      }
      if (res.requierenRevision > 0) {
        toast.error(`${res.requierenRevision} elemento(s) offline fueron rechazados por el servidor y requieren revisión antes de reenviar.`);
      }
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-primario-600 font-semibold">Cargando Mi Carrito POS...</div>
      </div>
    );
  }

  if (!usuario) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar abierto={sidebarAbierto} alCerrar={() => setSidebarAbierto(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header alToggleSidebar={() => setSidebarAbierto((v) => !v)} />
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
