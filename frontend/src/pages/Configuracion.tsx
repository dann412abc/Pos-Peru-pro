import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Settings, Save, Building2, FileText, Wifi, Printer, Send, Users, UserPlus, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../db';
import { validarRUC } from '../utils/igv';
import type { ConfigEmpresa, FormatoTicket } from '../types';
import { API_BASE_URL, api, ES_MODO_DEMO } from '../api/client';

export const FORMATO_TICKET_KEY = 'formato_ticket_default';
type UsuarioAdmin = { id: number; username: string; nombre: string; rol: 'ADMIN'|'CAJERO'; activo: boolean; sucursales: Array<{id:number;nombre:string}> };
type SucursalAdmin = { id: number; nombre: string };
type EdicionUsuarioAdmin = { id: number; nombre: string; rol: 'ADMIN'|'CAJERO'; sucursalIds: number[] };

async function guardarConfiguracionLocal(config: ConfigEmpresa): Promise<void> {
  await db.transaction('rw', db.config, async () => {
    await db.config.clear();
    await db.config.put(config, config.ruc);
  });
}

const FORMATOS: { valor: FormatoTicket; etiqueta: string; descripcion: string }[] = [
  { valor: '58mm', etiqueta: '58 mm', descripcion: 'Impresora térmica pequeña (ticketera portátil)' },
  { valor: '80mm', etiqueta: '80 mm', descripcion: 'Impresora térmica estándar (POS)' },
  { valor: 'A5', etiqueta: 'A5', descripcion: 'Impresora láser / inkjet (media hoja carta)' },
];

// Configuración: datos de la empresa, series de comprobantes, conexión al backend. Solo ADMIN.
export default function Configuracion() {
  const [config, setConfig] = useState<ConfigEmpresa | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [estadoCanales, setEstadoCanales] = useState<any>(null);
  const [destinoEmail, setDestinoEmail] = useState('');
  const [destinoWhatsapp, setDestinoWhatsapp] = useState('');
  const [probando, setProbando] = useState<'email'|'whatsapp'|null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [sucursalesAdmin, setSucursalesAdmin] = useState<SucursalAdmin[]>([]);
  const [cargandoAdmin, setCargandoAdmin] = useState(false);
  const [creandoUsuario, setCreandoUsuario] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState({ username: '', nombre: '', password: '', rol: 'CAJERO' as 'ADMIN'|'CAJERO', sucursalIds: [] as number[] });
  const [edicionUsuario, setEdicionUsuario] = useState<EdicionUsuarioAdmin|null>(null);
  const [passwordsReset, setPasswordsReset] = useState<Record<number,string>>({});
  const [usuarioPasswordEnProceso, setUsuarioPasswordEnProceso] = useState<number|null>(null);

  async function cargarAdministracion() {
    setCargandoAdmin(true);
    try {
      const [u, s] = await Promise.all([api.get('/usuarios'), api.get('/sucursales')]);
      setUsuarios(Array.isArray(u.data) ? u.data : []);
      setSucursalesAdmin(Array.isArray(s.data) ? s.data : []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo cargar la administración de usuarios.');
    } finally { setCargandoAdmin(false); }
  }

  async function crearUsuario(e: FormEvent) {
    e.preventDefault();
    if (nuevoUsuario.sucursalIds.length === 0) { toast.error('Asigna al usuario al menos una sucursal.'); return; }
    setCreandoUsuario(true);
    try {
      await api.post('/usuarios', nuevoUsuario);
      toast.success('Usuario creado correctamente.');
      setNuevoUsuario({ username: '', nombre: '', password: '', rol: 'CAJERO', sucursalIds: [] });
      await cargarAdministracion();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo crear el usuario.');
    } finally { setCreandoUsuario(false); }
  }

  async function cambiarEstadoUsuario(usuario: UsuarioAdmin) {
    try {
      await api.patch(`/usuarios/${usuario.id}/estado`, { activo: !usuario.activo });
      toast.success(usuario.activo ? 'Usuario desactivado.' : 'Usuario activado.');
      await cargarAdministracion();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo cambiar el estado del usuario.');
    }
  }

  function editarUsuario(usuario: UsuarioAdmin) {
    setEdicionUsuario({ id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, sucursalIds: usuario.sucursales.map(s=>s.id) });
  }

  async function guardarEdicionUsuario(e: FormEvent) {
    e.preventDefault();
    if (!edicionUsuario) return;
    try {
      await api.patch(`/usuarios/${edicionUsuario.id}`, {
        nombre: edicionUsuario.nombre, rol: edicionUsuario.rol, sucursalIds: edicionUsuario.sucursalIds,
      });
      toast.success('Permisos del usuario actualizados.');
      setEdicionUsuario(null);
      await cargarAdministracion();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudieron actualizar los permisos.');
    }
  }

  async function restablecerPasswordUsuario(usuarioId: number) {
    const password = (passwordsReset[usuarioId] || '').trim();
    if (password.length < 8 || password.length > 72) { toast.error('La contraseña debe tener entre 8 y 72 caracteres.'); return; }
    setUsuarioPasswordEnProceso(usuarioId);
    try {
      await api.patch(`/usuarios/${usuarioId}/password`, { password });
      toast.success('Contraseña restablecida. Comunica la nueva clave al usuario por un canal seguro.');
      setPasswordsReset(prev=>({...prev,[usuarioId]:''}));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo restablecer la contraseña.');
    } finally { setUsuarioPasswordEnProceso(null); }
  }

  useEffect(() => {
    let activo = true;
    (async () => {
      const local = (await db.config.toArray())[0] || null;
      if (local && activo) setConfig(local);
      if (!ES_MODO_DEMO) {
        const [empresas, canales] = await Promise.allSettled([
          api.get('/empresas'), api.get('/notificaciones/configuracion'),
        ]);
        const empresa = empresas.status === 'fulfilled' && Array.isArray(empresas.value.data) ? empresas.value.data[0] : null;
        if (empresa && activo) {
          const sincronizada = {
            ...(local || {}), ruc: empresa.ruc, razonSocial: empresa.razonSocial,
            nombreComercial: empresa.nombreComercial || '', direccion: empresa.direccion || '',
            distrito: empresa.distrito || '', provincia: empresa.provincia || '',
            departamento: empresa.departamento || '', ubigeo: empresa.ubigeo || '',
          } as ConfigEmpresa;
          setConfig(sincronizada);
          // Mantener una sola empresa activa en el dispositivo y evitar RUC antiguos.
          await guardarConfiguracionLocal(sincronizada);
        }
        if (canales.status === 'fulfilled' && activo) setEstadoCanales(canales.value.data);
        if (activo) void cargarAdministracion();
      }
    })();
    return () => { activo = false; };
  }, []);

  if (!config) {
    return <div className="text-gray-500">Cargando configuración...</div>;
  }

  function actualizar<K extends keyof ConfigEmpresa>(campo: K, valor: ConfigEmpresa[K]) {
    setConfig((prev) => (prev ? { ...prev, [campo]: valor } : prev));
  }

  async function guardar() {
    if (!config) return;
    if (!validarRUC(config.ruc)) {
      toast.error('RUC inválido: verifica los 11 dígitos, el prefijo y el dígito verificador');
      return;
    }
    if (!config.razonSocial.trim()) {
      toast.error('La razón social es obligatoria');
      return;
    }
    setGuardando(true);
    try {
      if (!ES_MODO_DEMO) {
        await api.patch('/empresas/actual', {
          ruc: config.ruc, razonSocial: config.razonSocial, nombreComercial: config.nombreComercial,
          direccion: config.direccion, distrito: config.distrito, provincia: config.provincia,
          departamento: config.departamento, ubigeo: config.ubigeo || undefined,
        });
      }
      await guardarConfiguracionLocal(config);
      if (config.formatoTicket) localStorage.setItem(FORMATO_TICKET_KEY, config.formatoTicket);
      else localStorage.removeItem(FORMATO_TICKET_KEY);
      toast.success('Datos de empresa sincronizados y configuración local guardada.');
    } catch (error: any) {
      await guardarConfiguracionLocal(config);
      toast.error(`Se guardó en este dispositivo, pero no se sincronizó con el servidor: ${error?.response?.data?.message || 'sin conexión'}`);
    } finally { setGuardando(false); }
  }

  async function probarCanal(canal: 'email'|'whatsapp') {
    const destino = canal === 'email' ? destinoEmail.trim() : destinoWhatsapp.trim();
    if (!destino) { toast.error(canal === 'email' ? 'Ingresa un correo de prueba.' : 'Ingresa un número de WhatsApp con código de país.'); return; }
    setProbando(canal);
    try {
      await api.post(`/notificaciones/prueba/${canal}`, { destino });
      toast.success(canal === 'email' ? 'Correo de prueba enviado.' : 'WhatsApp de prueba enviado.');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'No se pudo enviar la prueba. Revisa la configuración del backend.');
    } finally { setProbando(null); }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-primario-700 flex items-center gap-2">
          <Settings size={22} /> Configuración
        </h2>
        <p className="text-sm text-gray-500">Parámetros de la empresa, series y conexión</p>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-primario-700 flex items-center gap-2 mb-4">
          <Building2 size={18} /> Datos de la empresa (emisor FE)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">RUC *</label>
            <input className="input font-mono" maxLength={11} value={config.ruc} onChange={(e) => actualizar('ruc', e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <label className="label">Razón Social *</label>
            <input className="input" value={config.razonSocial} onChange={(e) => actualizar('razonSocial', e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">Nombre comercial</label>
            <input className="input" value={config.nombreComercial} onChange={(e) => actualizar('nombreComercial', e.target.value)} />
          </div>
          <div>
            <label className="label">Dirección fiscal</label>
            <input className="input" value={config.direccion} onChange={(e) => actualizar('direccion', e.target.value)} />
          </div>
          <div>
            <label className="label">Distrito</label>
            <input className="input" value={config.distrito} onChange={(e) => actualizar('distrito', e.target.value)} />
          </div>
          <div>
            <label className="label">Ubigeo (6 dígitos)</label>
            <input className="input font-mono" maxLength={6} value={config.ubigeo || ''} onChange={(e) => actualizar('ubigeo', e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </div>
          <div>
            <label className="label">Provincia</label>
            <input className="input" value={config.provincia} onChange={(e) => actualizar('provincia', e.target.value)} />
          </div>
          <div>
            <label className="label">Departamento</label>
            <input className="input" value={config.departamento} onChange={(e) => actualizar('departamento', e.target.value)} />
          </div>
        </div>
      </div>

      {!ES_MODO_DEMO && <div className="card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-primario-700 flex items-center gap-2"><Users size={18} /> Usuarios y permisos por sucursal</h3>
          <p className="text-xs text-gray-500 mt-1">Solo ADMIN. Cada usuario queda limitado a las sucursales de esta empresa. Las cuentas se desactivan, no se eliminan, para conservar su historial.</p>
        </div>
        <form onSubmit={crearUsuario} className="rounded-lg border p-4 space-y-3">
          <h4 className="font-medium flex items-center gap-2"><UserPlus size={16}/> Crear usuario</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Usuario de acceso</label><input className="input" autoComplete="off" minLength={3} maxLength={50} value={nuevoUsuario.username} onChange={e=>setNuevoUsuario(v=>({...v,username:e.target.value}))} placeholder="cajero01" required /></div>
            <div><label className="label">Nombre completo</label><input className="input" maxLength={200} value={nuevoUsuario.nombre} onChange={e=>setNuevoUsuario(v=>({...v,nombre:e.target.value}))} required /></div>
            <div><label className="label">Contraseña inicial (8 a 72 caracteres)</label><input className="input" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={nuevoUsuario.password} onChange={e=>setNuevoUsuario(v=>({...v,password:e.target.value}))} required /></div>
            <div><label className="label">Rol</label><select className="input" value={nuevoUsuario.rol} onChange={e=>setNuevoUsuario(v=>({...v,rol:e.target.value as 'ADMIN'|'CAJERO'}))}><option value="CAJERO">Cajero</option><option value="ADMIN">Administrador</option></select></div>
          </div>
          <div>
            <label className="label">Sucursales autorizadas</label>
            {sucursalesAdmin.length ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">{sucursalesAdmin.map(s=><label key={s.id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={nuevoUsuario.sucursalIds.includes(s.id)} onChange={e=>setNuevoUsuario(v=>({...v,sucursalIds:e.target.checked?[...v.sucursalIds,s.id]:v.sucursalIds.filter(id=>id!==s.id)}))}/>{s.nombre}</label>)}</div> : <p className="text-xs text-amber-700 mt-1">No hay sucursales disponibles para asignar.</p>}
          </div>
          <button type="submit" disabled={creandoUsuario||!sucursalesAdmin.length} className="btn-primario">{creandoUsuario?'Creando…':'Crear usuario'}</button>
        </form>
        <div className="flex items-center justify-between gap-3"><h4 className="font-medium flex items-center gap-2"><ShieldCheck size={16}/> Usuarios registrados</h4><button type="button" className="btn-secundario" onClick={()=>void cargarAdministracion()} disabled={cargandoAdmin}>{cargandoAdmin?'Actualizando…':'Actualizar lista'}</button></div>
        {usuarios.length ? <div className="space-y-2">{usuarios.map(u=><div key={u.id} className="border rounded-lg p-3 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="min-w-0"><div className="font-medium">{u.nombre} <span className="text-xs text-gray-500">({u.username})</span></div><div className="text-xs text-gray-500 mt-1">{u.rol==='ADMIN'?'Administrador':'Cajero'} · {(u.sucursales||[]).map(s=>s.nombre).join(', ')||'Sin sucursales'}</div></div>
            <div className="flex flex-wrap items-center gap-2"><span className={`text-xs rounded-full px-2 py-1 ${u.activo?'bg-green-50 text-green-700':'bg-gray-100 text-gray-600'}`}>{u.activo?'Activo':'Inactivo'}</span><button type="button" className="btn-secundario" onClick={()=>editarUsuario(u)}>Editar permisos</button><button type="button" className="btn-secundario" onClick={()=>void cambiarEstadoUsuario(u)}>{u.activo?'Desactivar':'Activar'}</button></div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end"><div className="flex-1"><label className="label">Nueva contraseña temporal (8 a 72 caracteres)</label><input type="password" autoComplete="new-password" className="input" value={passwordsReset[u.id]||''} onChange={e=>setPasswordsReset(prev=>({...prev,[u.id]:e.target.value}))} /></div><button type="button" className="btn-secundario" disabled={usuarioPasswordEnProceso===u.id||!(passwordsReset[u.id]||'').length} onClick={()=>void restablecerPasswordUsuario(u.id)}>{usuarioPasswordEnProceso===u.id?'Guardando…':'Restablecer contraseña'}</button></div>
        </div>)}</div> : <p className="text-sm text-gray-500">{cargandoAdmin?'Cargando usuarios…':'Todavía no hay usuarios adicionales registrados.'}</p>}
        {edicionUsuario && <form onSubmit={guardarEdicionUsuario} className="rounded-lg border border-primario-200 p-4 space-y-3"><div className="font-medium">Editar usuario #{edicionUsuario.id}</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="label">Nombre</label><input className="input" value={edicionUsuario.nombre} onChange={e=>setEdicionUsuario(v=>v?{...v,nombre:e.target.value}:v)} minLength={2} maxLength={200} required/></div><div><label className="label">Rol</label><select className="input" value={edicionUsuario.rol} onChange={e=>setEdicionUsuario(v=>v?{...v,rol:e.target.value as 'ADMIN'|'CAJERO'}:v)}><option value="CAJERO">Cajero</option><option value="ADMIN">Administrador</option></select></div></div><div><label className="label">Sucursales autorizadas</label><div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">{sucursalesAdmin.map(s=><label key={s.id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={edicionUsuario.sucursalIds.includes(s.id)} onChange={e=>setEdicionUsuario(v=>v?{...v,sucursalIds:e.target.checked?[...v.sucursalIds,s.id]:v.sucursalIds.filter(id=>id!==s.id)}:v)}/>{s.nombre}</label>)}</div></div><div className="flex gap-2"><button type="submit" className="btn-primario" disabled={!edicionUsuario.sucursalIds.length}>Guardar permisos</button><button type="button" className="btn-secundario" onClick={()=>setEdicionUsuario(null)}>Cancelar</button></div></form>}
      </div>}

      <div className="card p-5">
        <h3 className="font-semibold text-primario-700 flex items-center gap-2 mb-4">
          <FileText size={18} /> Series de comprobantes
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Serie Factura (F001)</label>
            <input className="input font-mono uppercase" maxLength={4} value={config.serieFactura} onChange={(e) => actualizar('serieFactura', e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">Serie Boleta (B001)</label>
            <input className="input font-mono uppercase" maxLength={4} value={config.serieBoleta} onChange={(e) => actualizar('serieBoleta', e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">Serie Nota Crédito (NC01)</label>
            <input className="input font-mono uppercase" maxLength={4} value={config.serieNC} onChange={(e) => actualizar('serieNC', e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">Últ. correlativo factura</label>
            <input type="number" min="0" className="input" value={config.ultCorrelativoFactura} onChange={(e) => actualizar('ultCorrelativoFactura', parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <label className="label">Últ. correlativo boleta</label>
            <input type="number" min="0" className="input" value={config.ultCorrelativoBoleta} onChange={(e) => actualizar('ultCorrelativoBoleta', parseInt(e.target.value) || 0)} />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-primario-700 flex items-center gap-2 mb-4">
          <Printer size={18} /> Formato de ticket por defecto
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {FORMATOS.map((f) => {
            const activo = (config.formatoTicket || '80mm') === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                onClick={() => actualizar('formatoTicket', f.valor)}
                className={`text-left p-3 rounded-lg border-2 transition-colors ${
                  activo ? 'border-primario-600 bg-primario-50' : 'border-gray-200 hover:border-primario-300'
                }`}
              >
                <div className="font-bold text-primario-700">{f.etiqueta}</div>
                <div className="text-xs text-gray-500 mt-1">{f.descripcion}</div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          El formato seleccionado se usa al abrir el ticket. Puede cambiarse temporalmente en el modal de impresión.
        </p>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-primario-700 flex items-center gap-2 mb-2"><Send size={18} /> Canales de notificación</h3>
        <p className="text-xs text-gray-500 mb-4">Las credenciales permanecen en el servidor. Aquí solo se muestra su estado y se permite probar los canales; no se guardan tokens en el navegador.</p>
        {estadoCanales ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg border p-3"><div className="font-medium">Correo SMTP</div><div className="text-sm mt-1">{estadoCanales.email?.configurado ? 'Credenciales detectadas' : 'No configurado'}</div><div className="text-xs text-gray-500 mt-1">Automático: {estadoCanales.email?.envioAutomatico ? 'activado' : 'desactivado'}</div></div>
          <div className="rounded-lg border p-3"><div className="font-medium">WhatsApp Business</div><div className="text-sm mt-1">{estadoCanales.whatsapp?.configurado ? 'Credenciales detectadas' : 'No configurado'}</div><div className="text-xs text-gray-500 mt-1">Plantilla aprobada: {estadoCanales.whatsapp?.plantillaConfigurada ? 'configurada' : 'pendiente'}</div><div className="text-xs text-gray-500 mt-1">Automático: {estadoCanales.whatsapp?.envioAutomatico ? 'activado' : 'desactivado'}</div></div>
        </div> : <p className="text-sm text-gray-500 mb-4">Estado de canales disponible al conectar el backend.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2"><label className="label">Correo para prueba</label><input className="input" type="email" value={destinoEmail} onChange={e=>setDestinoEmail(e.target.value)} placeholder="correo@dominio.com"/><button type="button" onClick={()=>void probarCanal('email')} disabled={!!probando||!estadoCanales?.email?.configurado} className="btn-secundario w-full">{probando==='email'?'Enviando…':'Enviar prueba de correo'}</button></div>
          <div className="space-y-2"><label className="label">WhatsApp para prueba</label><input className="input" value={destinoWhatsapp} onChange={e=>setDestinoWhatsapp(e.target.value)} placeholder="51987654321"/><button type="button" onClick={()=>void probarCanal('whatsapp')} disabled={!!probando||!estadoCanales?.whatsapp?.configurado||!estadoCanales?.whatsapp?.plantillaConfigurada} className="btn-secundario w-full">{probando==='whatsapp'?'Enviando…':'Enviar prueba de WhatsApp'}</button></div>
        </div>
        <p className="text-xs text-gray-500 mt-3">Activación automática en servidor: <code>ENVIO_AUTOMATICO_EMAIL=true</code> y/o <code>ENVIO_AUTOMATICO_WHATSAPP=true</code>. Requiere configuración SMTP o Meta WhatsApp Business Cloud API.</p>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-primario-700 flex items-center gap-2 mb-4">
          <Wifi size={18} /> Conexión al backend
        </h3>
        <div className="bg-gray-50 rounded-lg p-3 text-sm font-mono text-gray-600 break-all">
          VITE_API_URL = {API_BASE_URL}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Para cambiar la URL del backend, edite el archivo <code className="bg-gray-100 px-1 rounded">.env</code> con la variable <code className="bg-gray-100 px-1 rounded">VITE_API_URL</code> y reinicie el servidor de desarrollo. El modo offline funciona sin backend (IndexedDB).
        </p>
      </div>

      <button onClick={guardar} disabled={guardando} className="btn-primario flex items-center gap-2">
        <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar configuración'}
      </button>
    </div>
  );
}
