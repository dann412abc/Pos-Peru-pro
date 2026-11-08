import { AlertaOperativaDto } from './dto/sincronizar-alertas.dto';

export interface PanelAlertasOperativas {
  stockBajo?: Array<{ id: number; codigo: string; nombre: string; stock: number; stockMinimo: number; sucursalNombre: string; sucursalId?: number }>;
  stockBajoVariantes?: Array<{ id: number; codigo: string; nombre: string; varianteId: number; varianteCodigo: string; varianteNombre: string; stock: number; stockMinimo: number; sucursalNombre: string; sucursalId?: number }>;
  porVencer?: Array<{ id: number; codigoLote: string; fechaVencimiento: string; cantidadDisponible: number; productoNombre: string; sucursalNombre: string; sucursalId?: number }>;
  finanzas?: {
    cuentasPorCobrar?: { vencidas: number; vencido: number };
    cuentasPorPagar?: { vencidas: number; vencido: number };
    gastosPendientes?: { cantidad: number; total: number; vencido: number };
  };
  cajas?: { abiertas: number; saldoInicial: number };
  rentabilidad?: { lineasSinCosto: number };
  mermas?: { cantidad: number; unidades: number; costo: number };
}

const soles = (value: number) => new Intl.NumberFormat('es-PE', {
  style: 'currency', currency: 'PEN', minimumFractionDigits: 2,
}).format(Number(value || 0));

function diasHasta(fecha: string): number {
  const targetText = String(fecha).slice(0, 10);
  const hoyText = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  const target = Date.parse(`${targetText}T12:00:00Z`);
  const hoy = Date.parse(`${hoyText}T12:00:00Z`);
  return Number.isFinite(target) && Number.isFinite(hoy) ? Math.round((target - hoy) / 86400000) : 9999;
}

function fechaCorta(fecha: string): string {
  const value = String(fecha).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** Construye las mismas alertas desde el servidor, para que el cron no dependa del navegador. */
export function construirAlertasOperativas(panel: PanelAlertasOperativas): AlertaOperativaDto[] {
  const result: AlertaOperativaDto[] = [];
  for (const p of panel.stockBajo || []) result.push({
    clave: `stock-${p.id}-s${p.sucursalId ?? p.sucursalNombre}`.replace(/[^a-zA-Z0-9:_-]/g, '-').slice(0, 160),
    sucursalId: p.sucursalId,
    nivel: Number(p.stock) <= 0 ? 'critica' : 'advertencia', categoria: 'Inventario',
    titulo: Number(p.stock) <= 0 ? `Sin existencias: ${p.nombre}` : `Stock bajo: ${p.nombre}`,
    detalle: `${p.codigo} · ${p.sucursalNombre} · disponible ${p.stock} / mínimo ${p.stockMinimo}`,
    destino: '/productos',
  });
  for (const v of panel.stockBajoVariantes || []) result.push({
    clave: `variante-${v.varianteId}-s${v.sucursalId ?? v.sucursalNombre}`.replace(/[^a-zA-Z0-9:_-]/g, '-').slice(0, 160),
    sucursalId: v.sucursalId,
    nivel: Number(v.stock) <= 0 ? 'critica' : 'advertencia', categoria: 'Inventario',
    titulo: Number(v.stock) <= 0 ? `Variante agotada: ${v.nombre}` : `Variante bajo mínimo: ${v.nombre}`,
    detalle: `${v.varianteNombre} (${v.varianteCodigo}) · ${v.sucursalNombre} · ${v.stock} / mínimo ${v.stockMinimo}`,
    destino: '/productos',
  });
  for (const lote of panel.porVencer || []) {
    const days = diasHasta(lote.fechaVencimiento);
    result.push({
      clave: `lote-${lote.id}`, sucursalId: lote.sucursalId, nivel: days <= 7 ? 'critica' : 'advertencia', categoria: 'Vencimientos',
      titulo: days === 0 ? `Vence hoy: ${lote.productoNombre}` : days < 0 ? `Vencimiento pasado: ${lote.productoNombre}` : `Próximo a vencer: ${lote.productoNombre}`,
      detalle: `Lote ${lote.codigoLote} · ${lote.sucursalNombre} · ${lote.cantidadDisponible} unidades · fecha ${fechaCorta(lote.fechaVencimiento)}`,
      destino: '/inventario/vencimientos',
    });
  }
  const cobrar = panel.finanzas?.cuentasPorCobrar;
  if (Number(cobrar?.vencidas || 0) > 0) result.push({
    clave: 'cxc-vencidas', nivel: 'critica', categoria: 'Cobranza',
    titulo: `${cobrar!.vencidas} cuentas por cobrar vencidas`,
    detalle: `Saldo vencido: ${soles(Number(cobrar!.vencido || 0))}. Realiza seguimiento a los clientes.`, destino: '/cobranzas',
  });
  const pagar = panel.finanzas?.cuentasPorPagar;
  if (Number(pagar?.vencidas || 0) > 0) result.push({
    clave: 'cxp-vencidas', nivel: 'critica', categoria: 'Proveedores',
    titulo: `${pagar!.vencidas} obligaciones con proveedores vencidas`,
    detalle: `Saldo vencido: ${soles(Number(pagar!.vencido || 0))}. Revisa la programación de pagos.`, destino: '/compras',
  });
  const gastos = panel.finanzas?.gastosPendientes;
  if (Number(gastos?.cantidad || 0) > 0) result.push({
    clave: 'gastos-pendientes', nivel: Number(gastos!.vencido || 0) > 0 ? 'advertencia' : 'info', categoria: 'Gastos',
    titulo: `${gastos!.cantidad} gastos pendientes de pago`,
    detalle: `Importe pendiente ${soles(Number(gastos!.total || 0))}${Number(gastos!.vencido || 0) > 0 ? ` · vencido ${soles(Number(gastos!.vencido || 0))}` : ''}.`,
    destino: '/gastos',
  });
  if (Number(panel.cajas?.abiertas || 0) > 0) result.push({
    clave: 'cajas-abiertas', nivel: 'advertencia', categoria: 'Caja',
    titulo: `${panel.cajas!.abiertas} caja(s) permanecen abiertas`,
    detalle: `Saldo inicial acumulado ${soles(Number(panel.cajas!.saldoInicial || 0))}. Verifica los turnos y realiza el cierre correspondiente.`,
    destino: '/cierre-caja',
  });
  if (Number(panel.rentabilidad?.lineasSinCosto || 0) > 0) result.push({
    clave: 'costos-faltantes', nivel: 'advertencia', categoria: 'Costos',
    titulo: `${panel.rentabilidad!.lineasSinCosto} líneas vendidas sin costo registrado`,
    detalle: 'Estas líneas no se incluyen en el cálculo de utilidad bruta para evitar sobreestimarla.',
    destino: '/inventario-inteligente',
  });
  if (Number(panel.mermas?.cantidad || 0) > 0) result.push({
    clave: 'mermas-recientes', nivel: 'info', categoria: 'Pérdidas',
    titulo: `${panel.mermas!.cantidad} mermas registradas en los últimos 30 días`,
    detalle: `${Number(panel.mermas!.unidades || 0).toLocaleString('es-PE')} unidades · costo registrado ${soles(Number(panel.mermas!.costo || 0))}.`,
    destino: '/inventario/mermas',
  });
  const order = { critica: 0, advertencia: 1, info: 2 };
  return result.sort((a, b) => order[a.nivel] - order[b.nivel] || a.categoria.localeCompare(b.categoria) || a.titulo.localeCompare(b.titulo));
}
