import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Zap,
  Package,
  ShoppingCart,
  Users,
  Receipt,
  RotateCcw,
  FileCheck,
  BarChart3,
  Wallet,
  Settings,
  Store,
  Activity,
  CalendarClock,
  Trash2,
  ClipboardCheck,
  BellRing,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface MenuItem {
  ruta: string;
  etiqueta: string;
  icono: LucideIcon;
  soloAdmin?: boolean;
}

const MENU: MenuItem[] = [
  { ruta: '/dashboard', etiqueta: 'Dashboard', icono: LayoutDashboard },
  { ruta: '/alertas', etiqueta: 'Alertas operativas', icono: BellRing, soloAdmin: true },
  { ruta: '/venta-rapida', etiqueta: 'Venta Rápida', icono: Zap },
  { ruta: '/productos', etiqueta: 'Productos', icono: Package },
  { ruta: '/compras', etiqueta: 'Compras y proveedores', icono: ShoppingCart, soloAdmin: true },
  { ruta: '/clientes', etiqueta: 'Clientes', icono: Users },
  { ruta: '/cobranzas', etiqueta: 'Cobranzas', icono: Wallet },
  { ruta: '/devoluciones', etiqueta: 'Devoluciones', icono: RotateCcw, soloAdmin: true },
  { ruta: '/ventas', etiqueta: 'Ventas', icono: Receipt },
  { ruta: '/facturacion-electronica', etiqueta: 'Facturación Electrónica', icono: FileCheck },
  { ruta: '/reportes', etiqueta: 'Reportes', icono: BarChart3, soloAdmin: true },
  { ruta: '/gastos', etiqueta: 'Gastos operativos', icono: Receipt, soloAdmin: true },
  { ruta: '/inventario-inteligente', etiqueta: 'Inventario inteligente', icono: Activity, soloAdmin: true },
  { ruta: '/inventario/vencimientos', etiqueta: 'Lotes y vencimientos', icono: CalendarClock, soloAdmin: true },
  { ruta: '/inventario/mermas', etiqueta: 'Mermas y pérdidas', icono: Trash2, soloAdmin: true },
  { ruta: '/inventario/conteo-fisico', etiqueta: 'Inventario físico', icono: ClipboardCheck, soloAdmin: true },
  { ruta: '/cierre-caja', etiqueta: 'Cierre de Caja', icono: Wallet },
  { ruta: '/configuracion', etiqueta: 'Configuración', icono: Settings, soloAdmin: true },
];

export default function Sidebar({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const { usuario } = useAuth();
  const esCajero = usuario?.rol === 'CAJERO';
  const items = MENU.filter((m) => !m.soloAdmin || !esCajero);

  return (
    <>
      {/* Overlay para móvil/tablet */}
      {abierto && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={alCerrar} />}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-primario-700 text-white flex flex-col transition-transform duration-200 ${
          abierto ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-primario-600">
          <div className="w-10 h-10 rounded-lg bg-ambar-500 flex items-center justify-center font-bold text-xl text-white">
            M
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">Mi Carrito POS</div>
            <div className="text-xs text-primario-200">Facturación Electrónica</div>
          </div>
        </div>

        <div className="px-4 py-3 flex items-center gap-2 text-xs text-primario-100 border-b border-primario-600">
          <Store size={14} className="text-ambar-400" />
          <span className="truncate">{usuario?.sucursalNombre}</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {items.map((item) => {
            const Icono = item.icono;
            return (
              <NavLink
                key={item.ruta}
                to={item.ruta}
                onClick={alCerrar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-ambar-500 text-white' : 'text-primario-100 hover:bg-primario-600'
                  }`
                }
              >
                <Icono size={18} />
                <span>{item.etiqueta}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="px-4 py-3 text-[11px] text-primario-200 border-t border-primario-600">
          Tu punto de venta, siempre contigo · v1.35.0
        </div>
      </aside>
    </>
  );
}
