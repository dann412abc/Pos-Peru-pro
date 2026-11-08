import Dexie, { type Table } from 'dexie';
import type { Producto, Cliente, Venta, PendingItem, Caja, ConfigEmpresa } from '../types';

// Base de datos local IndexedDB (offline-first) para Mi Carrito POS.
// Tablas: productos, clientes, ventas (caché), pending_sales, pending_docs, config, cash_register.
class MiCarritoDatabase extends Dexie {
  productos!: Table<Producto, number>;
  clientes!: Table<Cliente, number>;
  ventas!: Table<Venta, number>;
  pending_sales!: Table<PendingItem, number>;
  pending_docs!: Table<PendingItem, number>;
  config!: Table<ConfigEmpresa, string>;
  cash_register!: Table<Caja, number>;

  constructor() {
    super('mi_carrito_pos_db');
    this.version(1).stores({
      productos: '++id, codigo, nombre, categoria, activo',
      clientes: '++id, numero, nombre, tipoDoc',
      ventas: '++id, serie, correlativo, fecha, estadoFE, tipoComprobante',
      pending_sales: '++id, createdAt',
      pending_docs: '++id, createdAt',
      config: 'ruc',
      cash_register: '++id, estado, fechaApertura',
    });
    this.version(2).stores({
      productos: '++id, codigo, nombre, categoria, activo',
      clientes: '++id, numero, nombre, tipoDoc',
      ventas: '++id, serie, correlativo, fecha, estadoFE, tipoComprobante, idempotencyKey',
      pending_sales: '++id, createdAt, idempotencyKey',
      pending_docs: '++id, createdAt',
      config: 'ruc',
      cash_register: '++id, estado, fechaApertura',
    });
  }
}

export const db = new MiCarritoDatabase();

/** Datos semilla de productos demo (se cargan solo si la tabla está vacía). */
export async function seedSiVacio(): Promise<void> {
  const count = await db.productos.count();
  if (count > 0) return;

  const productosDemo: Producto[] = [
    { codigo: 'P001', nombre: 'Arroz Costeño 5kg', categoria: 'Abarrotes', unidad: 'UND', precio: 28.0, stock: 120, stockMinimo: 10, tipoIgv: '10', activo: true },
    { codigo: 'P002', nombre: 'Aceite Primor 1L', categoria: 'Abarrotes', unidad: 'UND', precio: 12.5, stock: 80, stockMinimo: 15, tipoIgv: '10', activo: true },
    { codigo: 'P003', nombre: 'Azúcar Rubia 1kg', categoria: 'Abarrotes', unidad: 'UND', precio: 5.8, stock: 200, stockMinimo: 20, tipoIgv: '10', activo: true },
    { codigo: 'P004', nombre: 'Leche Gloria 1L', categoria: 'Lácteos', unidad: 'UND', precio: 4.9, stock: 150, stockMinimo: 20, tipoIgv: '10', activo: true },
    { codigo: 'P005', nombre: 'Pan Francés (unidad)', categoria: 'Panadería', unidad: 'UND', precio: 0.8, stock: 300, stockMinimo: 50, tipoIgv: '10', activo: true },
    { codigo: 'P006', nombre: 'Pollo a la Brasa (1/4)', categoria: 'Restaurante', unidad: 'UND', precio: 18.0, stock: 50, stockMinimo: 5, tipoIgv: '10', activo: true },
    { codigo: 'P007', nombre: 'Inca Kola 1.5L', categoria: 'Bebidas', unidad: 'UND', precio: 8.5, stock: 90, stockMinimo: 12, tipoIgv: '10', activo: true },
    { codigo: 'P008', nombre: 'Coca Cola 1.5L', categoria: 'Bebidas', unidad: 'UND', precio: 8.0, stock: 95, stockMinimo: 12, tipoIgv: '10', activo: true },
    { codigo: 'P009', nombre: 'Medicina genérica (exonerada)', categoria: 'Farmacia', unidad: 'UND', precio: 15.0, stock: 40, stockMinimo: 5, tipoIgv: '20', activo: true },
    { codigo: 'P010', nombre: 'Servicio de delivery', categoria: 'Servicios', unidad: 'UND', precio: 5.0, stock: 9999, stockMinimo: 0, tipoIgv: '30', activo: true },
    { codigo: 'P011', nombre: 'Gaseosa personal 500ml', categoria: 'Bebidas', unidad: 'UND', precio: 3.5, stock: 200, stockMinimo: 30, tipoIgv: '10', activo: true },
    { codigo: 'P012', nombre: 'Galleta Casino', categoria: 'Snacks', unidad: 'UND', precio: 1.2, stock: 180, stockMinimo: 25, tipoIgv: '10', activo: true },
  ];
  await db.productos.bulkAdd(productosDemo);

  const clientesDemo: Cliente[] = [
    { tipoDoc: 'DNI', numero: '00000000', nombre: 'CONSUMIDOR FINAL', direccion: '-', telefono: '', limiteCredito: 0 },
    { tipoDoc: 'DNI', numero: '45678901', nombre: 'María García López', direccion: 'Av. Real 123, Huancayo', telefono: '987654321', limiteCredito: 200 },
    { tipoDoc: 'RUC', numero: '20481234566', nombre: 'COMERCIAL MI CARRITO S.A.C.', direccion: 'Jr. Junín 456, Huancayo', telefono: '064123456', limiteCredito: 5000 },
  ];
  await db.clientes.bulkAdd(clientesDemo);

  const configDemo: ConfigEmpresa = {
    ruc: '20123456786',
    razonSocial: 'COMERCIAL MI CARRITO E.I.R.L.',
    nombreComercial: 'Mi Carrito POS',
    direccion: 'Av. Mariscal Cáceres 789',
    distrito: 'Huancayo',
    provincia: 'Huancayo',
    departamento: 'Junín',
    serieFactura: 'F001',
    serieBoleta: 'B001',
    serieNC: 'NC01',
    ultCorrelativoFactura: 0,
    ultCorrelativoBoleta: 0,
  };
  await db.config.put(configDemo, configDemo.ruc);
}
