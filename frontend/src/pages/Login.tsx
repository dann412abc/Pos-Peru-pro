import { useState, type FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Store, User, Lock, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { ES_MODO_DEMO } from '../api/client';
import { supabaseAuthRecover } from '../api/supabaseAuth';

export default function Login() {
  const { login, usuario } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [recuperando, setRecuperando] = useState(false);
  const [correoRecuperacion, setCorreoRecuperacion] = useState('');
  const usaSupabaseAuth = import.meta.env.VITE_AUTH_PROVIDER === 'supabase';

  if (usuario) return <Navigate to="/venta-rapida" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error('Ingrese usuario y contraseña');
      return;
    }
    setCargando(true);
    try {
      await login(username.trim(), password);
      toast.success('Bienvenido a Mi Carrito POS');
      navigate('/venta-rapida');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de autenticación');
    } finally {
      setCargando(false);
    }
  }

  async function recuperarClave() {
    if (!correoRecuperacion.trim() || !correoRecuperacion.includes('@')) { toast.error('Ingresa un correo válido'); return; }
    setRecuperando(true);
    try { await supabaseAuthRecover(correoRecuperacion); toast.success('Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.'); }
    catch (err: any) {
      const data = err?.response?.data;
      const detail = data?.providerMessage ? ` Detalle Supabase: ${data.providerMessage}` : '';
      toast.error(`${data?.message || err?.message || 'No se pudo solicitar la recuperación.'}${detail}`);
    }
    finally { setRecuperando(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primario-700 via-primario-600 to-primario-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ambar-500 text-white text-3xl font-bold shadow-lg mb-3">
            M
          </div>
          <h1 className="text-2xl font-bold text-white">Mi Carrito POS</h1>
          <p className="text-ambar-400 text-sm mt-1 font-medium italic">Tu punto de venta, siempre contigo</p>
          <p className="text-primario-100 text-xs mt-1">Sistema de facturación electrónica para Perú</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div className="flex items-center gap-2 text-primario-700 font-semibold">
            <Store size={18} />
            <span>Iniciar sesión</span>
          </div>

          <div>
            <label className="label">{usaSupabaseAuth ? 'Correo electrónico' : 'Usuario'}</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-9"
                placeholder={usaSupabaseAuth ? "correo@empresa.com" : "admin o cajero"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                type={usaSupabaseAuth ? "email" : "text"}
                autoComplete={usaSupabaseAuth ? "email" : "username"}
              />
            </div>
          </div>

          <div>
            <label className="label">Contraseña</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                className="input pl-9"
                placeholder="••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button type="submit" disabled={cargando} className="btn-primario w-full flex items-center justify-center gap-2">
            <LogIn size={18} />
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>

          {usaSupabaseAuth && (
            <div className="space-y-2 border-t pt-3">
              <label className="label">¿Olvidaste tu contraseña?</label>
              <input className="input" type="email" placeholder="Correo para recuperación" value={correoRecuperacion} onChange={(e) => setCorreoRecuperacion(e.target.value)} />
              <button type="button" disabled={recuperando} onClick={recuperarClave} className="text-sm text-primario-700 underline disabled:opacity-50">{recuperando ? 'Enviando solicitud...' : 'Enviar enlace de recuperación'}</button>
            </div>
          )}

          {ES_MODO_DEMO && (
            <div className="text-xs text-gray-500 bg-amber-50 rounded-lg p-3 border border-amber-100">
              <div className="font-semibold text-amber-800 mb-1">Modo demostración local</div>
              <div>admin / 123456 — Administrador</div>
              <div>cajero / 123456 — Cajero</div>
              <div className="mt-1">No usar estas cuentas para operar en producción.</div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
