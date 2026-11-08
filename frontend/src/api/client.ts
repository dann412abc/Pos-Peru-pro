import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

// Cliente Axios centralizado con interceptor JWT y refresh automático de token.
// La URL base se lee de VITE_API_URL (ver .env.example).

// En Cloudflare Pages la API se consume por el proxy same-origin /api.
const BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000/api' : '/api');
// La demo debe habilitarse de forma explícita; producción nunca cae a datos demo por defecto.
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const SUPABASE_AUTH = import.meta.env.VITE_AUTH_PROVIDER === 'supabase';

const TOKEN_KEY = 'micarrito_access_token';
const REFRESH_KEY = 'micarrito_refresh_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}
export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// Interceptor de solicitud: adjunta el access token en el header Authorization.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Bandera para evitar múltiples refreshes concurrentes.
let refrescando: Promise<string> | null = null;

async function refrescarToken(): Promise<string> {
  const refresh = getRefreshToken();
  if (!refresh) throw new Error('Sin refresh token');
  if (SUPABASE_AUTH) {
    const resp = await axios.post('/api/edge/auth/refresh', { refresh_token: refresh });
    const { access_token, refresh_token } = resp.data;
    if (!access_token || !refresh_token) throw new Error('Respuesta de renovación Supabase incompleta');
    setTokens(access_token, refresh_token);
    return access_token;
  }
  const resp = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken: refresh });
  const { accessToken, refreshToken: nuevoRefreshToken } = resp.data;
  setTokens(accessToken, nuevoRefreshToken || refresh);
  return accessToken;
}

// Interceptor de respuesta: si recibe 401, intenta refresh y reintenta la petición.
api.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._reintentado && getRefreshToken()) {
      original._reintentado = true;
      try {
        if (!refrescando) refrescando = refrescarToken();
        const nuevoToken = await refrescando;
        refrescando = null;
        original.headers.Authorization = `Bearer ${nuevoToken}`;
        return api(original);
      } catch {
        refrescando = null;
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export const ES_MODO_DEMO = DEMO_MODE;
export const ES_SUPABASE_AUTH = SUPABASE_AUTH;
export const API_BASE_URL = BASE_URL;
