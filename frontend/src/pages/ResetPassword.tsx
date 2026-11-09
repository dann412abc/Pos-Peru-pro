import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabaseAuthSetPassword, supabaseAuthVerifyRecovery } from '../api/supabaseAuth';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useState('');
  const [validando, setValidando] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let activo = true;
    async function validarEnlace() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const query = new URLSearchParams(window.location.search);
      const token = hash.get('access_token') || query.get('access_token');
      const type = hash.get('type') || query.get('type');
      const tokenHash = query.get('token_hash') || hash.get('token_hash');
      const error = hash.get('error_description') || query.get('error_description');
      if (error) toast.error(error.replace(/\+/g, ' '));
      if (token && type === 'recovery') {
        if (activo) setAccessToken(token);
      } else if (tokenHash && (query.get('type') === 'recovery' || hash.get('type') === 'recovery')) {
        try {
          const sessionToken = await supabaseAuthVerifyRecovery(tokenHash);
          if (activo) setAccessToken(sessionToken);
        } catch (err: any) {
          toast.error(err?.response?.data?.message || err?.message || 'El enlace venció o ya fue utilizado. Solicita uno nuevo.');
        }
      } else {
        toast.error('El enlace no contiene un token de recuperación válido.');
      }
      window.history.replaceState({}, document.title, window.location.pathname);
      if (activo) setValidando(false);
    }
    void validarEnlace();
    return () => { activo = false; };
  }, []);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) { toast.error('El enlace no es válido o ya venció. Solicita uno nuevo.'); return; }
    if (password.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== confirmacion) { toast.error('Las contraseñas no coinciden.'); return; }
    setGuardando(true);
    try {
      await supabaseAuthSetPassword(accessToken, password);
      toast.success('Contraseña actualizada. Ya puedes iniciar sesión.');
      navigate('/login', { replace: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo actualizar la contraseña. Solicita un enlace nuevo.');
    } finally { setGuardando(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primario-700 via-primario-600 to-primario-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ambar-500 text-white text-3xl font-bold shadow-lg mb-3">M</div>
          <h1 className="text-2xl font-bold text-white">Mi Carrito POS</h1>
          <p className="text-primario-100 text-sm mt-1">Restablecer contraseña</p>
        </div>
        <form onSubmit={guardar} className="card p-6 space-y-4">
          <div className="flex items-center gap-2 text-primario-700 font-semibold"><Store size={18} /><span>Nueva contraseña</span></div>
          {validando ? <p className="text-sm text-gray-600">Validando enlace...</p> : !accessToken ? (
            <div className="space-y-3 text-sm text-gray-700">
              <p>El enlace no es válido, ya fue utilizado o ha vencido.</p>
              <Link className="text-primario-700 underline" to="/login">Volver al inicio de sesión y solicitar otro enlace</Link>
            </div>
          ) : (
            <>
              <label className="block"><span className="label">Nueva contraseña</span><span className="relative block"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" /></span></label>
              <label className="block"><span className="label">Confirmar contraseña</span><input className="input" type="password" autoComplete="new-password" minLength={8} required value={confirmacion} onChange={e => setConfirmacion(e.target.value)} placeholder="Repite la contraseña" /></label>
              <button className="btn-primario w-full" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar nueva contraseña'}</button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
