import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setTokens, clearTokens, getAccessToken, ES_MODO_DEMO } from '../api/client';
import { db, seedSiVacio } from '../db';
import type { Usuario, Rol } from '../types';
import { supabaseAuthLogin, supabaseAuthProfile, supabaseAuthLogout } from '../api/supabaseAuth';

interface AuthContextValue {
  usuario: Usuario | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  tieneRol: (rol: Rol) => boolean;
  sucursalActiva: string;
  cambiarSucursal: (sucursalId: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Usuarios demo para modo offline (sin backend).
const USUARIOS_DEMO: Record<string, { password: string; usuario: Usuario }> = {
  admin: {
    password: '123456',
    usuario: {
      id: 'u-admin',
      username: 'admin',
      nombre: 'Administrador',
      rol: 'ADMIN',
      sucursalId: 'suc-01',
      sucursalNombre: 'Sucursal Huancayo Centro',
    },
  },
  cajero: {
    password: '123456',
    usuario: {
      id: 'u-cajero',
      username: 'cajero',
      nombre: 'Cajero Demo',
      rol: 'CAJERO',
      sucursalId: 'suc-01',
      sucursalNombre: 'Sucursal Huancayo Centro',
    },
  },
};

const USUARIO_KEY = 'micarrito_usuario';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const AUTH_SUPABASE = import.meta.env.VITE_AUTH_PROVIDER === 'supabase';

  useEffect(() => {
    // Restaurar sesión desde localStorage
    const raw = localStorage.getItem(USUARIO_KEY);
    const token = getAccessToken();
    // Nunca restaura una sesión de demostración cuando la compilación opera contra el backend real.
    if (!ES_MODO_DEMO && (!token || token.startsWith('demo-'))) {
      clearTokens();
      localStorage.removeItem(USUARIO_KEY);
    } else if (raw) {
      try {
        setUsuario(JSON.parse(raw));
      } catch {
        clearTokens();
        localStorage.removeItem(USUARIO_KEY);
      }
    }
    (async () => {
      if (AUTH_SUPABASE && token && !token.startsWith('demo-')) {
        try {
          const profile = await supabaseAuthProfile(token);
          const sucursales = profile.sucursales.map((s: any) => ({ id: String(s.id), nombre: String(s.nombre || `Sucursal ${s.id}`) }));
          const inicial = sucursales[0];
          const restored: Usuario = { id: String(profile.id), username: String(profile.username), nombre: String(profile.nombre), rol: profile.rol as Rol, sucursalId: inicial.id, sucursalNombre: inicial.nombre, sucursales };
          setUsuario(restored); localStorage.setItem(USUARIO_KEY, JSON.stringify(restored));
        } catch { clearTokens(); localStorage.removeItem(USUARIO_KEY); }
      }
      setLoading(false);
    })();
  }, []);

  async function login(username: string, password: string): Promise<void> {
    if (AUTH_SUPABASE) {
      const session = await supabaseAuthLogin(username, password);
      setTokens(session.access_token, session.refresh_token);
      try {
        const profile = await supabaseAuthProfile(session.access_token);
        const sucursales = profile.sucursales.map((s: any) => ({ id: String(s.id), nombre: String(s.nombre || `Sucursal ${s.id}`) }));
        if (!sucursales.length) throw new Error('El usuario no tiene sucursales asignadas');
        const inicial = sucursales[0];
        const normalizado: Usuario = { id: String(profile.id), username: String(profile.username), nombre: String(profile.nombre), rol: profile.rol as Rol, sucursalId: inicial.id, sucursalNombre: inicial.nombre, sucursales };
        setUsuario(normalizado); localStorage.setItem(USUARIO_KEY, JSON.stringify(normalizado));
        return;
      } catch (error) { clearTokens(); throw error; }
    }
    if (!ES_MODO_DEMO) {
      try {
        const resp = await api.post('/auth/login', { username, password });
        const { accessToken, refreshToken, usuario: user } = resp.data;
        if (!accessToken || !refreshToken || !user) throw new Error('Respuesta de autenticación incompleta');
        const sucursales = Array.isArray(user.sucursales) && user.sucursales.length
          ? user.sucursales.map((s: any) => ({ id: String(s.id), nombre: String(s.nombre || `Sucursal ${s.id}`) }))
          : (Array.isArray(user.sucursalIds) ? user.sucursalIds : []).map((id: number) => ({ id: String(id), nombre: `Sucursal ${id}` }));
        if (!sucursales.length) throw new Error('El usuario no tiene sucursales asignadas');
        const sucursalInicial = sucursales.find((s: any) => s.id === String(user.sucursalId)) || sucursales[0];
        const normalizado: Usuario = {
          id: String(user.id),
          username: user.username,
          nombre: user.nombre,
          rol: user.rol,
          sucursalId: sucursalInicial.id,
          sucursalNombre: sucursalInicial.nombre,
          sucursales,
        };
        setTokens(accessToken, refreshToken);
        setUsuario(normalizado);
        localStorage.setItem(USUARIO_KEY, JSON.stringify(normalizado));
        return;
      } catch (error) {
        clearTokens();
        const mensaje = error instanceof Error ? error.message : 'No se pudo conectar con el servidor';
        throw new Error(mensaje === 'Network Error' ? 'No se pudo conectar con el servidor. Verifique la URL y el estado del backend.' : mensaje);
      }
    }

    const demo = USUARIOS_DEMO[username.toLowerCase()];
    if (demo && demo.password === password) {
      setTokens('demo-access', 'demo-refresh');
      setUsuario(demo.usuario);
      localStorage.setItem(USUARIO_KEY, JSON.stringify(demo.usuario));
      await seedSiVacio();
      return;
    }
    throw new Error('Usuario o contraseña incorrectos');
  }

  function cambiarSucursal(sucursalId: string) {
    if (!usuario || !usuario.sucursales?.some((s) => s.id === sucursalId)) return;
    const sucursal = usuario.sucursales.find((s) => s.id === sucursalId)!;
    const actualizado = { ...usuario, sucursalId: sucursal.id, sucursalNombre: sucursal.nombre };
    setUsuario(actualizado);
    localStorage.setItem(USUARIO_KEY, JSON.stringify(actualizado));
  }

  function logout() {
    const token = getAccessToken();
    if (AUTH_SUPABASE && token) void supabaseAuthLogout(token).catch(() => undefined);
    clearTokens();
    localStorage.removeItem(USUARIO_KEY);
    setUsuario(null);
  }

  function tieneRol(rol: Rol): boolean {
    return usuario?.rol === rol;
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        loading,
        login,
        logout,
        tieneRol,
        sucursalActiva: usuario?.sucursalNombre || 'Sucursal Huancayo Centro',
        cambiarSucursal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

export { db };
