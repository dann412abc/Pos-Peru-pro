import axios from 'axios';

const EDGE = '/api/edge';
export interface SupabaseSession { access_token: string; refresh_token: string; expires_in?: number; token_type?: string; }
export interface SupabasePosProfile { id: string; username: string; nombre: string; rol: string; sucursales: Array<{ id: string; nombre: string }>; }

export async function supabaseAuthLogin(email: string, password: string): Promise<SupabaseSession> {
  const response = await axios.post(`${EDGE}/auth/login`, { email: email.trim().toLowerCase(), password }, { timeout: 15000 });
  if (!response.data?.access_token || !response.data?.refresh_token) throw new Error('Supabase no devolvió una sesión válida.');
  return response.data;
}
export async function supabaseAuthRefresh(refreshToken: string): Promise<SupabaseSession> {
  const response = await axios.post(`${EDGE}/auth/refresh`, { refresh_token: refreshToken }, { timeout: 15000 });
  if (!response.data?.access_token || !response.data?.refresh_token) throw new Error('No se pudo renovar la sesión.');
  return response.data;
}
export async function supabaseAuthProfile(accessToken: string): Promise<SupabasePosProfile> {
  const response = await axios.get(`${EDGE}/auth/profile`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 });
  const profile = response.data?.profile;
  if (!profile?.id || !profile?.username || !Array.isArray(profile.sucursales)) throw new Error('El perfil POS no está vinculado correctamente.');
  return profile;
}
export async function supabaseAuthLogout(accessToken: string): Promise<void> {
  await axios.post(`${EDGE}/auth/logout`, {}, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 });
}
export async function supabaseAuthRecover(email: string): Promise<void> {
  await axios.post(`${EDGE}/auth/recover`, { email: email.trim().toLowerCase(), redirect_to: `${window.location.origin}/reset-password` }, { timeout: 15000 });
}
export async function supabaseAuthVerifyRecovery(tokenHash: string): Promise<string> {
  const response = await axios.post(`${EDGE}/auth/recovery/verify`, { token_hash: tokenHash }, { timeout: 15000 });
  if (!response.data?.access_token) throw new Error('Supabase no devolvió una sesión de recuperación válida.');
  return response.data.access_token;
}
export async function supabaseAuthSetPassword(accessToken: string, password: string): Promise<void> {
  await axios.post(`${EDGE}/auth/password`, { password }, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 });
}
