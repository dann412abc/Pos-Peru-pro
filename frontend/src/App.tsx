import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import VentaRapida from './pages/VentaRapida';
import Productos from './pages/Productos';
import Clientes from './pages/Clientes';
import Ventas from './pages/Ventas';
import FacturacionElectronica from './pages/FacturacionElectronica';
import CierreCaja from './pages/CierreCaja';
import Reportes from './pages/Reportes';
import Configuracion from './pages/Configuracion';
import Compras from './pages/Compras';
import Cobranzas from './pages/Cobranzas';
import Devoluciones from './pages/Devoluciones';
import Gastos from './pages/Gastos';
import InventarioInteligente from './pages/InventarioInteligente';
import Vencimientos from './pages/Vencimientos';
import Mermas from './pages/Mermas';
import ConteoFisico from './pages/ConteoFisico';
import AlertasOperativas from './pages/AlertasOperativas';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/venta-rapida" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/alertas" element={<AlertasOperativas />} />
        <Route path="/venta-rapida" element={<VentaRapida />} />
        <Route path="/productos" element={<Productos />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/cobranzas" element={<Cobranzas />} />
        <Route path="/devoluciones" element={<Devoluciones />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/facturacion-electronica" element={<FacturacionElectronica />} />
        <Route path="/cierre-caja" element={<CierreCaja />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/gastos" element={<Gastos />} />
        <Route path="/inventario-inteligente" element={<InventarioInteligente />} />
        <Route path="/inventario/vencimientos" element={<Vencimientos />} />
        <Route path="/inventario/mermas" element={<Mermas />} />
        <Route path="/inventario/conteo-fisico" element={<ConteoFisico />} />
        <Route path="/configuracion" element={<Configuracion />} />
      </Route>
      <Route path="*" element={<Navigate to="/venta-rapida" replace />} />
    </Routes>
  );
}
