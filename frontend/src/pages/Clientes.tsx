import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Pencil, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../db';
import { api, ES_MODO_DEMO } from '../api/client';
import { validarDNI, validarRUC, formatearMoneda } from '../utils/igv';
import Modal from '../components/ui/Modal';
import type { Cliente, TipoDocCliente } from '../types';
import { fetchCurrentSupabaseCatalog, mapSupabaseCustomerRows } from '../api/supabaseCatalog';
import { mutateSupabaseParty } from '../api/supabaseParties';

const VACIO: Cliente = {
  tipoDoc: 'DNI',
  numero: '',
  nombre: '',
  direccion: '',
  telefono: '',
  email: '',
  limiteCredito: 0,
};

// CRUD completo de clientes con validación DNI (8 dígitos) / RUC (11 dígitos, prefijo permitido y dígito verificador).
export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState<Cliente>(VACIO);

  async function recargar() {
    if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
      const catalog = await fetchCurrentSupabaseCatalog();
      const datos = mapSupabaseCustomerRows(catalog) as Cliente[];
      setClientes(datos);
      await db.clientes.bulkPut(datos.filter(c => Number.isSafeInteger(c.id) && Number(c.id) > 0));
      return;
    }
    if (!ES_MODO_DEMO) {
      const respuesta = await api.get('/clientes');
      const datos: Cliente[] = (respuesta.data || []).map((c: any) => ({ ...c, id: Number(c.id), limiteCredito: Number(c.limiteCredito || 0), saldoCredito: Number(c.saldoCredito || 0) }));
      setClientes(datos);
      await db.clientes.bulkPut(datos);
      return;
    }
    setClientes(await db.clientes.toArray());
  }

  useEffect(() => {
    recargar();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q) || c.numero.includes(q.trim()));
  }, [clientes, busqueda]);

  function abrirNuevo() {
    setEditando(null);
    setForm({ ...VACIO });
    setModalAbierto(true);
  }

  function abrirEditar(c: Cliente) {
    setEditando(c);
    setForm({ ...c });
    setModalAbierto(true);
  }

  async function guardar() {
    if (!form.numero.trim() || !form.nombre.trim()) {
      toast.error('Número de documento y nombre son obligatorios');
      return;
    }
    if (form.tipoDoc === 'DNI' && !validarDNI(form.numero.trim())) {
      toast.error('DNI inválido: debe tener exactamente 8 dígitos');
      return;
    }
    if (form.tipoDoc === 'RUC' && !validarRUC(form.numero.trim())) {
      toast.error('RUC inválido: verifica los 11 dígitos, prefijo y dígito verificador');
      return;
    }
    try {
      const datos = {
        tipoDoc: form.tipoDoc, numero: form.numero.trim(), nombre: form.nombre.trim(),
        direccion: form.direccion || undefined, telefono: form.telefono || undefined,
        limiteCredito: Number(form.limiteCredito || 0),
      };
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
        await mutateSupabaseParty(editando?.id ? 'customer_update' : 'customer_create', { ...datos, ...(editando?.id ? { id: editando.id } : {}) });
        toast.success(editando?.id ? 'Cliente actualizado' : 'Cliente creado');
      } else if (!ES_MODO_DEMO) {
        if (editando?.id) {
          await api.put(`/clientes/${editando.id}`, datos);
          toast.success('Cliente actualizado');
        } else {
          await api.post('/clientes', datos);
          toast.success('Cliente creado');
        }
      } else if (editando?.id) {
        await db.clientes.update(editando.id, form);
        toast.success('Cliente actualizado');
      } else {
        const existe = await db.clientes.where('numero').equals(form.numero.trim()).first();
        if (existe) { toast.error('Ya existe un cliente con ese número de documento'); return; }
        await db.clientes.add(form);
        toast.success('Cliente creado');
      }
      setModalAbierto(false);
      await recargar();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'No se pudo guardar el cliente');
    }
  }

  async function eliminar(c: Cliente) {
    if (!c.id) return;
    if (c.numero === '00000000') {
      toast.error('No se puede eliminar el cliente Consumidor Final');
      return;
    }
    if (!confirm(`¿Eliminar al cliente "${c.nombre}"?`)) return;
    try {
      if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {
        await mutateSupabaseParty('customer_deactivate', { id: c.id });
      } else if (ES_MODO_DEMO) {
        await db.clientes.delete(c.id);
      } else {
        await api.delete(`/clientes/${c.id}`);
      }
      toast.success('Cliente desactivado');
      await recargar();
    } catch (error: any) { toast.error(error?.response?.data?.message || error?.message || 'No se pudo desactivar el cliente'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold text-primario-700 flex items-center gap-2">
            <Users size={22} /> Clientes
          </h2>
          <p className="text-sm text-gray-500">Gestión de clientes ({clientes.length} registrados)</p>
        </div>
        <button onClick={abrirNuevo} className="btn-ambar flex items-center gap-2">
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      <div className="card p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar por nombre o número de documento..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Tipo Doc.</th>
                <th className="px-4 py-3 text-left">Número</th>
                <th className="px-4 py-3 text-left">Nombre / Razón Social</th>
                <th className="px-4 py-3 text-left">Dirección</th>
                <th className="px-4 py-3 text-left">Teléfono</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-right">Límite crédito</th>
                <th className="px-4 py-3 text-right">Crédito utilizado</th>
                <th className="px-4 py-3 text-right">Disponible</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="badge bg-primario-100 text-primario-700">{c.tipoDoc}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{c.numero}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{c.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.direccion || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.telefono || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-[160px]">{c.email || '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatearMoneda(c.limiteCredito || 0)}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{formatearMoneda(c.saldoCredito || 0)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{formatearMoneda(Math.max(0, Number(c.limiteCredito || 0) - Number(c.saldoCredito || 0)))}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => abrirEditar(c)} className="p-1.5 rounded hover:bg-primario-50 text-primario-600" aria-label="Editar">
                        <Pencil size={14} />
                      </button>
                      {(ES_MODO_DEMO || import.meta.env.VITE_AUTH_PROVIDER === 'supabase') && (
                        <button onClick={() => eliminar(c)} className="p-1.5 rounded hover:bg-red-50 text-red-500" aria-label="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={10} className="text-center text-gray-400 py-8">Sin clientes que coincidan</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal abierto={modalAbierto} alCerrar={() => setModalAbierto(false)} titulo={editando ? 'Editar cliente' : 'Nuevo cliente'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Tipo de documento *</label>
            <select className="input" value={form.tipoDoc} onChange={(e) => setForm({ ...form, tipoDoc: e.target.value as TipoDocCliente, numero: '' })}>
              <option value="DNI">DNI (8 dígitos)</option>
              <option value="RUC">RUC (11 dígitos)</option>
            </select>
          </div>
          <div>
            <label className="label">Número de documento *</label>
            <input
              className="input font-mono"
              maxLength={form.tipoDoc === 'DNI' ? 8 : 11}
              placeholder={form.tipoDoc === 'DNI' ? 'Ej: 45678901' : 'Ej: 20481234566'}
              value={form.numero}
              onChange={(e) => setForm({ ...form, numero: e.target.value.replace(/\D/g, '') })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{form.tipoDoc === 'RUC' ? 'Razón Social *' : 'Nombres y apellidos *'}</label>
            <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value.toUpperCase() })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Dirección</label>
            <input className="input" value={form.direccion || ''} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={form.telefono || ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </div>
          {import.meta.env.VITE_AUTH_PROVIDER !== 'supabase' && <div>
            <label className="label">Email</label>
            <input type="email" className="input" placeholder="cliente@example.com" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>}
          <div>
            <label className="label">Límite de crédito (S/)</label>
            <input type="number" min="0" step="0.1" className="input" value={form.limiteCredito || ''} onChange={(e) => setForm({ ...form, limiteCredito: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModalAbierto(false)} className="btn-secundario">Cancelar</button>
          <button onClick={guardar} className="btn-primario">Guardar</button>
        </div>
      </Modal>
    </div>
  );
}
