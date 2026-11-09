import { useEffect, useMemo, useState } from 'react';
import { Wallet, PlayCircle, Lock, Banknote, CreditCard, Smartphone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../db';
import { api, ES_MODO_DEMO, ES_SUPABASE_AUTH } from '../api/client';
import { closeSupabaseCash, fetchSupabaseCashMovements, fetchSupabaseCashSummary, openSupabaseCash, registerSupabaseCashMovement } from '../api/supabaseCash';
import { listarCajasAbiertasComprasSupabase } from '../api/supabasePurchases';
import { mapCaja } from '../utils/ventaMapper';
import { formatearMoneda } from '../utils/igv';
import { useAuth } from '../context/AuthContext';
import type { Caja, Venta, MetodoPago } from '../types';

type MovimientoCajaUi = { id: number; tipo: 'INGRESO' | 'SALIDA'; metodoPago: Exclude<MetodoPago, 'CREDITO'>; monto: number; motivo: string; createdAt: string };

// Cierre de caja: saldo inicial, ventas del día por método, arqueo esperado vs contado, diferencia.
export default function CierreCaja() {
  const { usuario } = useAuth();
  const [caja, setCaja] = useState<Caja | null>(null);
  const [ventasHoy, setVentasHoy] = useState<Venta[]>([]);
  const [resumenServidor, setResumenServidor] = useState<{ cantidadVentas: number; totalVentas: number; totalDevoluciones?: number; porMetodo: Record<string, number>; efectivoEsperado: number } | null>(null);
  const [movimientosCaja, setMovimientosCaja] = useState<MovimientoCajaUi[]>([]);
  const [tipoMovimiento, setTipoMovimiento] = useState<'INGRESO' | 'SALIDA'>('SALIDA');
  const [metodoMovimiento, setMetodoMovimiento] = useState<Exclude<MetodoPago, 'CREDITO'>>('EFECTIVO');
  const [montoMovimiento, setMontoMovimiento] = useState<number | ''>('');
  const [motivoMovimiento, setMotivoMovimiento] = useState('');
  const [saldoInicial, setSaldoInicial] = useState(100);
  const [efectivoContado, setEfectivoContado] = useState<number | ''>('');
  const [cargando, setCargando] = useState(false);

  async function recargar() {
    if (!ES_MODO_DEMO) {
      const sucursalId = Number(usuario?.sucursalId);
      if (!Number.isInteger(sucursalId) || sucursalId <= 0) throw new Error('El usuario no tiene una sucursal configurada');
      let cajaData: any = null;
      if (ES_SUPABASE_AUTH) {
        const abiertas = await listarCajasAbiertasComprasSupabase(sucursalId);
        cajaData = abiertas[0] ? { ...abiertas[0], estado: 'ABIERTA', usuarioId: usuario?.id, sucursalId } : null;
      } else {
        const cajaResp = await api.get('/caja/estado', { params: { sucursalId } });
        cajaData = cajaResp.data;
      }
      const cajaActual = cajaData ? mapCaja(cajaData) : null;
      setCaja(cajaActual);
      if (cajaActual) await db.cash_register.put(cajaActual);
      else {
        const cacheAbierta = await db.cash_register.where('estado').equals('Abierta').toArray();
        for (const item of cacheAbierta) if (item.id) await db.cash_register.update(item.id, { estado: 'Cerrada' });
      }
      // El servidor calcula el resumen del turno completo sin límite de paginación.
      setVentasHoy([]);
      if (cajaActual?.id) {
        if (ES_SUPABASE_AUTH) {
          const resumen = await fetchSupabaseCashSummary(cajaActual.id);
          setResumenServidor(resumen);
          const historial = await fetchSupabaseCashMovements(cajaActual.id);
          setMovimientosCaja(historial);
        } else {
          const [resumenResp, movimientosResp] = await Promise.all([api.get(`/caja/${cajaActual.id}/resumen`), api.get(`/caja/${cajaActual.id}/movimientos`)]);
          setResumenServidor(resumenResp.data);
          setMovimientosCaja(movimientosResp.data || []);
        }
      } else {
        setResumenServidor(null);
        setMovimientosCaja([]);
      }
      return;
    }
    setResumenServidor(null);
    setMovimientosCaja([]);
    const abiertas = await db.cash_register.where('estado').equals('Abierta').toArray();
    setCaja(abiertas[0] || null);
    const todas = await db.ventas.toArray();
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    setVentasHoy(todas.filter((v) => v.fecha.slice(0, 10) === hoy && !v.enCola));
  }

  useEffect(() => {
    recargar().catch((error) => toast.error(error instanceof Error ? error.message : 'No se pudo cargar caja'));
  }, [usuario?.sucursalId]);

  const porMetodo = useMemo(() => {
    const m: Record<MetodoPago, number> = { EFECTIVO: 0, TARJETA: 0, YAPE: 0, PLIN: 0, CREDITO: 0 };
    if (!ES_MODO_DEMO && resumenServidor) {
      for (const metodo of Object.keys(m) as MetodoPago[]) m[metodo] = Number(resumenServidor.porMetodo?.[metodo] || 0);
      return m;
    }
    for (const v of ventasHoy) for (const p of v.pagos) m[p.metodo] += p.monto;
    return m;
  }, [ventasHoy, resumenServidor]);

  const totalVentas = !ES_MODO_DEMO && resumenServidor
    ? Number(resumenServidor.totalVentas || 0)
    : ventasHoy.reduce((s, v) => s + v.total, 0);
  const cantidadVentas = !ES_MODO_DEMO && resumenServidor
    ? Number(resumenServidor.cantidadVentas || 0)
    : ventasHoy.length;
  const arqueoEsperado = !ES_MODO_DEMO && resumenServidor
    ? Number(resumenServidor.efectivoEsperado || 0)
    : (caja?.saldoInicial || 0) + porMetodo.EFECTIVO;
  const diferencia = efectivoContado === '' ? 0 : Number(efectivoContado) - arqueoEsperado;

  async function abrirCaja() {
    if (saldoInicial < 0) {
      toast.error('El saldo inicial no puede ser negativo');
      return;
    }
    try {
      if (!ES_MODO_DEMO) {
        if (ES_SUPABASE_AUTH) {
          const data = await openSupabaseCash(Number(usuario?.sucursalId), saldoInicial);
          setCaja(mapCaja(data));
        } else {
          const respuesta = await api.post('/caja/apertura', { sucursalId: Number(usuario?.sucursalId), saldoInicial });
          setCaja(mapCaja(respuesta.data));
        }
      } else {
        const nueva: Caja = {
          fechaApertura: new Date().toISOString(),
          saldoInicial,
          estado: 'Abierta',
          usuarioId: usuario?.id || 'demo',
          sucursalId: usuario?.sucursalId || 'suc-01',
        };
        await db.cash_register.add(nueva);
      }
      toast.success('Caja abierta correctamente');
      await recargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo abrir la caja');
    }
  }

  async function registrarMovimientoCaja() {
    if (!caja?.id || ES_MODO_DEMO) return;
    if (montoMovimiento === '' || !Number.isFinite(Number(montoMovimiento)) || Number(montoMovimiento) <= 0) {
      toast.error('Ingrese un importe mayor a cero');
      return;
    }
    if (motivoMovimiento.trim().length < 5) {
      toast.error('Describa el motivo del movimiento (mínimo 5 caracteres)');
      return;
    }
    try {
      const payload = { cajaId: caja.id, tipo: tipoMovimiento, metodoPago: metodoMovimiento, monto: Number(montoMovimiento), motivo: motivoMovimiento.trim() } as const;
      if (ES_SUPABASE_AUTH) {
        const movimiento = await registerSupabaseCashMovement(payload);
        setMovimientosCaja((actuales) => [{ id: Number(movimiento.id), tipo: movimiento.tipo, metodoPago: movimiento.metodoPago, monto: Number(movimiento.monto), motivo: movimiento.motivo, createdAt: new Date().toISOString() }, ...actuales]);
      } else {
        await api.post(`/caja/${caja.id}/movimientos`, { tipo: tipoMovimiento, metodoPago: metodoMovimiento, monto: Number(montoMovimiento), motivo: motivoMovimiento.trim() });
      }
      toast.success(tipoMovimiento === 'INGRESO' ? 'Ingreso registrado' : 'Egreso registrado');
      setMontoMovimiento('');
      setMotivoMovimiento('');
      await recargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el movimiento');
    }
  }

  async function cerrarCaja() {
    if (!caja?.id) return;
    if (efectivoContado === '') {
      toast.error('Ingrese el efectivo contado para el arqueo');
      return;
    }
    setCargando(true);
    try {
      if (!ES_MODO_DEMO) {
        if (ES_SUPABASE_AUTH) {
          const resultado = await closeSupabaseCash({ cajaId: caja.id, efectivoContado: Number(efectivoContado), arqueo: [] });
          toast.success(`Caja cerrada. Diferencia: ${formatearMoneda(Number(resultado.diferencia || 0))}`);
        } else {
          const respuesta = await api.post(`/caja/${caja.id}/cierre`, { efectivoContado: Number(efectivoContado), arqueo: [] });
          const cerrada = mapCaja(respuesta.data);
          toast.success(`Caja cerrada. Diferencia: ${formatearMoneda(cerrada.diferencia || 0)}`);
        }
      } else {
        await db.cash_register.update(caja.id, {
          estado: 'Cerrada',
          fechaCierre: new Date().toISOString(),
          efectivoContado: Number(efectivoContado),
          diferencia,
        });
        toast.success(`Caja cerrada. Diferencia: ${formatearMoneda(diferencia)}`);
      }
      setEfectivoContado('');
      await recargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cerrar la caja');
    } finally {
      setCargando(false);
    }
  }

  const metodoIcono: Record<MetodoPago, typeof Banknote> = {
    EFECTIVO: Banknote, TARJETA: CreditCard, YAPE: Smartphone, PLIN: Smartphone, CREDITO: Wallet,
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-primario-700 flex items-center gap-2">
          <Wallet size={22} /> Cierre de Caja
        </h2>
        <p className="text-sm text-gray-500">Gestión de apertura, arqueo y cierre de caja</p>
      </div>

      {!caja ? (
        <div className="card p-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-3">
            <Lock size={28} />
          </div>
          <h3 className="font-bold text-gray-800 mb-1">La caja está cerrada</h3>
          <p className="text-sm text-gray-500 mb-4">Abra la caja para comenzar a registrar ventas</p>
          <div className="flex items-center justify-center gap-3 max-w-sm mx-auto">
            <div className="flex-1 text-left">
              <label className="label">Saldo inicial (S/)</label>
              <input type="number" min="0" step="0.1" className="input" value={saldoInicial} onChange={(e) => setSaldoInicial(parseFloat(e.target.value) || 0)} />
            </div>
            <button onClick={abrirCaja} className="btn-primario flex items-center gap-2 mt-5">
              <PlayCircle size={16} /> Abrir caja
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-xs text-gray-500 uppercase font-semibold">Saldo inicial</div>
              <div className="text-2xl font-bold text-primario-700 mt-1">{formatearMoneda(caja.saldoInicial)}</div>
              <div className="text-[11px] text-gray-400 mt-1">Apertura: {new Date(caja.fechaApertura).toLocaleString('es-PE')}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-gray-500 uppercase font-semibold">Ventas netas del turno</div>
              <div className="text-2xl font-bold text-ambar-600 mt-1">{formatearMoneda(totalVentas)}</div>
              <div className="text-[11px] text-gray-400 mt-1">{cantidadVentas} comprobantes · devoluciones: {formatearMoneda(resumenServidor?.totalDevoluciones || 0)}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-gray-500 uppercase font-semibold">Efectivo esperado en caja</div>
              <div className="text-2xl font-bold text-green-700 mt-1">{formatearMoneda(arqueoEsperado)}</div>
              <div className="text-[11px] text-gray-400 mt-1">Saldo inicial + cobros en efectivo + ingresos/egresos − reembolsos</div>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-primario-700 mb-3">Saldo neto del turno por medio de pago</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {(Object.keys(porMetodo) as MetodoPago[]).map((m) => {
                const Icono = metodoIcono[m];
                return (
                  <div key={m} className="bg-gray-50 rounded-lg p-3 text-center">
                    <Icono size={18} className="mx-auto text-primario-500 mb-1" />
                    <div className="text-[11px] text-gray-500 uppercase font-semibold">{m}</div>
                    <div className="font-bold text-sm text-gray-800 mt-0.5">{formatearMoneda(porMetodo[m])}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {!ES_MODO_DEMO && (
            <div className="card p-5 space-y-3">
              <div>
                <h3 className="font-semibold text-primario-700">Ingresos y egresos de caja</h3>
                <p className="text-xs text-gray-500">Registre retiros y entradas no asociados a una venta. Los egresos en efectivo no pueden superar el saldo disponible.</p>
              </div>
              {usuario?.rol==='ADMIN'?<>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="label">Movimiento</label>
                  <select className="input" value={tipoMovimiento} onChange={(e) => setTipoMovimiento(e.target.value as 'INGRESO' | 'SALIDA')}>
                    <option value="SALIDA">Egreso</option>
                    <option value="INGRESO">Ingreso</option>
                  </select>
                </div>
                <div>
                  <label className="label">Medio</label>
                  <select className="input" value={metodoMovimiento} onChange={(e) => setMetodoMovimiento(e.target.value as Exclude<MetodoPago, 'CREDITO'>)}>
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TARJETA">Tarjeta</option>
                    <option value="YAPE">Yape</option>
                    <option value="PLIN">Plin</option>
                  </select>
                </div>
                <div>
                  <label className="label">Importe (S/)</label>
                  <input className="input" type="number" min="0.01" step="0.01" value={montoMovimiento} onChange={(e) => setMontoMovimiento(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <button onClick={registrarMovimientoCaja} className="btn-primario py-2.5">Registrar movimiento</button>
              </div>
              <div>
                <label className="label">Motivo</label>
                <input className="input" maxLength={200} placeholder="Ej. compra de bolsas, sencillo para caja..." value={motivoMovimiento} onChange={(e) => setMotivoMovimiento(e.target.value)} />
              </div>
              </>:<p className="text-sm text-gray-500">Solo un administrador puede registrar ingresos o egresos manuales. Puedes consultar el historial de movimientos abajo.</p>}
              {movimientosCaja.length > 0 && (
                <div className="divide-y divide-gray-100 border-t border-gray-100">
                  {movimientosCaja.slice(0, 8).map((mov) => (
                    <div key={mov.id} className="py-2 flex flex-wrap gap-2 items-center text-sm">
                      <span className={`font-semibold ${mov.tipo === 'INGRESO' ? 'text-green-700' : 'text-red-600'}`}>{mov.tipo === 'INGRESO' ? '+' : '−'} {formatearMoneda(Number(mov.monto))}</span>
                      <span className="text-gray-500">{mov.metodoPago}</span>
                      <span className="text-gray-700 flex-1">{mov.motivo}</span>
                      <span className="text-xs text-gray-400">{new Date(mov.createdAt).toLocaleString('es-PE')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="card p-5">
            <h3 className="font-semibold text-primario-700 mb-3">Arqueo de caja</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="label">Efectivo esperado (S/)</label>
                <input className="input bg-gray-50" readOnly value={arqueoEsperado.toFixed(2)} />
              </div>
              <div>
                <label className="label">Efectivo contado (S/)</label>
                <input type="number" min="0" step="0.1" className="input" placeholder="Ingrese el efectivo contado" value={efectivoContado} onChange={(e) => setEfectivoContado(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label className="label">Diferencia</label>
                <div className={`input flex items-center font-bold ${efectivoContado === '' ? 'text-gray-400' : diferencia >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {efectivoContado === '' ? '—' : (
                    <>
                      {diferencia >= 0 ? <CheckCircle2 size={16} className="mr-1" /> : <AlertTriangle size={16} className="mr-1" />}
                      {formatearMoneda(diferencia)}
                    </>
                  )}
                </div>
              </div>
            </div>
            <button onClick={cerrarCaja} disabled={cargando || efectivoContado === ''} className="btn-ambar w-full mt-5 flex items-center justify-center gap-2 py-3 text-base">
              <Lock size={18} /> {cargando ? 'Cerrando...' : 'Cerrar caja'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
