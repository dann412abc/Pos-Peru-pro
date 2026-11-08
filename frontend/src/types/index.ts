// Tipos del dominio de Mi Carrito POS (facturación electrónica Perú)

export type Rol = 'ADMIN' | 'CAJERO';

export interface Usuario {
  id: string;
  username: string;
  nombre: string;
  rol: Rol;
  sucursalId: string;
  sucursalNombre: string;
  sucursales?: Array<{ id: string; nombre: string }>;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

// Tipo de IGV SUNAT: 10 gravado, 20 exonerado, 30 inafecto
export type TipoIgv = '10' | '20' | '30';

export interface Producto {
  id?: number;
  codigo: string;
  codigoBarras?: string | null;
  tieneVariantes?: boolean;
  nombre: string;
  categoria: string;
  unidad: string; // UND, KG, L, etc.
  precio: number; // precio unitario INCLUYE IGV
  precioMayoreo?: number;
  stock: number;
  stockMinimo: number;
  tipoIgv: TipoIgv;
  activo: boolean;
  createdAt?: string;
}

export type TipoDocCliente = 'DNI' | 'RUC';

export interface Cliente {
  id?: number;
  tipoDoc: TipoDocCliente;
  numero: string; // DNI 8 dígitos / RUC 11 dígitos
  nombre: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  limiteCredito?: number;
  saldoCredito?: number;
  createdAt?: string;
}

// Tipos de comprobante SUNAT: 01 factura, 03 boleta, 07 nota crédito, 08 nota débito
export type TipoComprobante = '01' | '03' | '07' | '08';

export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'YAPE' | 'PLIN' | 'CREDITO';

export type EstadoFE = 'Pendiente' | 'Enviando' | 'Aceptado' | 'Rechazado';

// Formatos de impresión de ticket: 58mm (térmica pequeña), 80mm (térmica estándar), A5 (láser)
export type FormatoTicket = '58mm' | '80mm' | 'A5';

export interface LineaVenta {
  comprobanteLineaId?: number;
  productoId?: number;
  varianteId?: number;
  varianteCodigo?: string;
  varianteNombre?: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number; // incluye IGV
  tipoIgv: TipoIgv;
  descuento: number; // monto de descuento en la línea (incluye IGV)
}

export interface PagoLinea {
  metodo: MetodoPago;
  monto: number;
  montoRecibido?: number; // solo EFECTIVO
  vuelto?: number;
}

export interface Venta {
  id?: number;
  serverId?: number;
  idempotencyKey?: string;
  serie: string; // F001 / B001 / NC01
  correlativo: number;
  tipoComprobante: TipoComprobante;
  cliente: Cliente;
  lineas: LineaVenta[];
  pagos: PagoLinea[];
  fecha: string; // ISO
  usuarioId: string;
  cajaId?: number;
  // Totales calculados
  opGravadas: number;
  opExoneradas: number;
  opInafectas: number;
  descuentoTotal: number;
  motivoDescuento?: string;
  referenciaComprobanteId?: number;
  referenciaComprobante?: { tipo: string; serie: string; correlativo: number };
  codigoMotivoNota?: string;
  descripcionMotivoNota?: string;
  igvTotal: number;
  total: number;
  estadoFE: EstadoFE;
  estadoComprobante?: string;
  cdrObservacion?: string;
  enCola?: boolean; // true si está pendiente de sincronización offline
}

export interface Caja {
  id?: number;
  fechaApertura: string;
  fechaCierre?: string;
  saldoInicial: number;
  estado: 'Abierta' | 'Cerrada';
  usuarioId: string;
  sucursalId: string;
  efectivoContado?: number;
  diferencia?: number;
}

export interface ConfigEmpresa {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  direccion: string;
  distrito: string;
  provincia: string;
  departamento: string;
  ubigeo?: string;
  serieFactura: string; // F001
  serieBoleta: string; // B001
  serieNC: string; // NC01
  ultCorrelativoFactura: number;
  ultCorrelativoBoleta: number;
  formatoTicket?: FormatoTicket; // formato de impresión por defecto
  envioAutoEmail?: boolean; // envío automático por correo al emitir
  envioAutoWhatsapp?: boolean; // envío automático por WhatsApp al emitir
}

// Item en cola de sincronización offline
export interface PendingItem {
  id?: number;
  tipo: 'venta' | 'comprobante';
  payload: unknown;
  idempotencyKey?: string;
  usuarioId?: string;
  intentos: number;
  needsReview?: boolean;
  ultimoError?: string;
  ultimoEstadoHttp?: number;
  createdAt: string;
}
