import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from './data-source';
import { Empresa } from '../empresas/entities/empresa.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Categoria } from '../categorias/entities/categoria.entity';
import { Producto } from '../productos/entities/producto.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { MovimientoInventario } from '../inventario/entities/movimiento-inventario.entity';
import { SerieCorrelativo } from '../ventas/entities/serie-correlativo.entity';
import { TipoDocClienteEnum, TipoIgvEnum } from '../common/enums';
import { RolUsuarioEnum } from '../common/enums';

/**
 * Seed de datos demo (Huancayo, Peru).
 * Ejecutar: npm run seed   (despues de migration:run)
 */
async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed de demostración está bloqueado en producción. Cree la empresa, usuarios y credenciales iniciales mediante el proceso seguro de administración.');
  }
  await AppDataSource.initialize();
  console.log('=== Iniciando seed Mi Carrito POS (Huancayo demo) ===');

  // --- Empresa (tenant) ---
  const empresaRepo = AppDataSource.getRepository(Empresa);
  let empresa = await empresaRepo.findOne({ where: { ruc: '20601234565' } });
  if (!empresa) {
    empresa = empresaRepo.create({
      ruc: '20601234565',
      razonSocial: 'COMERCIAL HUANCAYO S.A.C.',
      nombreComercial: 'BODEGA HUANCAYO',
      direccion: 'Av. Mariscal Castilla 123, Huancayo',
      ubigeo: '120101',
      departamento: 'Junin',
      provincia: 'Huancayo',
      distrito: 'Huancayo',
    });
    empresa = await empresaRepo.save(empresa);
    console.log('Empresa creada:', empresa.ruc, empresa.razonSocial);
  }

  // --- Sucursal ---
  const sucursalRepo = AppDataSource.getRepository(Sucursal);
  let sucursal = await sucursalRepo.findOne({ where: { empresaId: empresa.id, nombre: 'BODEGA EL CENTRO' } });
  if (!sucursal) {
    sucursal = sucursalRepo.create({
      empresaId: empresa.id,
      nombre: 'BODEGA EL CENTRO',
      direccion: 'Jr. Lima 456, Huancayo',
      ubigeo: '120101',
      departamento: 'Junin',
      provincia: 'Huancayo',
      distrito: 'Huancayo',
    });
    sucursal = await sucursalRepo.save(sucursal);
    console.log('Sucursal creada:', sucursal.nombre);
  }

  // --- Usuarios (contrasenas hasheadas con bcrypt) ---
  const usuarioRepo = AppDataSource.getRepository(Usuario);
  const hash123 = await bcrypt.hash('123456', 10);
  for (const u of [
    { username: 'admin', nombre: 'Administrador', rol: RolUsuarioEnum.ADMIN },
    { username: 'cajero', nombre: 'Cajero Demo', rol: RolUsuarioEnum.CAJERO },
  ]) {
    let usuario = await usuarioRepo.findOne({ where: { username: u.username } });
    if (!usuario) {
      usuario = usuarioRepo.create({
        username: u.username,
        passwordHash: hash123,
        nombre: u.nombre,
        rol: u.rol,
        activo: true,
        empresaId: empresa.id,
        sucursales: [sucursal],
      });
      await usuarioRepo.save(usuario);
      console.log(`Usuario creado: ${u.username} / 123456 (rol ${u.rol})`);
    }
  }

  // --- Categorias ---
  const catRepo = AppDataSource.getRepository(Categoria);
  const categorias: Record<string, Categoria> = {};
  for (const nombre of ['Abarrotes', 'Bebidas', 'Farmacia', 'Limpieza']) {
    let cat = await catRepo.findOne({ where: { empresaId: empresa.id, nombre } });
    if (!cat) {
      cat = catRepo.create({ empresaId: empresa.id, nombre, activo: true });
      cat = await catRepo.save(cat);
    }
    categorias[nombre] = cat;
  }

  // --- Productos demo (~10, mezcla gravado/exonerado/inafecto). Precios INCLUYEN IGV. ---
  const prodRepo = AppDataSource.getRepository(Producto);
  const productos = [
    { codigo: 'P001', nombre: 'Gaseosa Cola 1.5L', cat: 'Bebidas', precio: 3.50, stock: 200, tipoIgv: TipoIgvEnum.GRAVADO },
    { codigo: 'P002', nombre: 'Arroz Superior 5kg', cat: 'Abarrotes', precio: 22.00, stock: 100, tipoIgv: TipoIgvEnum.EXONERADO },
    { codigo: 'P003', nombre: 'Azucar Rubia 1kg', cat: 'Abarrotes', precio: 4.80, stock: 150, tipoIgv: TipoIgvEnum.GRAVADO },
    { codigo: 'P004', nombre: 'Aceite Vegetal 1L', cat: 'Abarrotes', precio: 12.50, stock: 80, tipoIgv: TipoIgvEnum.GRAVADO },
    { codigo: 'P005', nombre: 'Pan Frances (unidad)', cat: 'Abarrotes', precio: 0.50, stock: 500, tipoIgv: TipoIgvEnum.EXONERADO },
    { codigo: 'P006', nombre: 'Detergente 900g', cat: 'Limpieza', precio: 8.90, stock: 60, tipoIgv: TipoIgvEnum.GRAVADO },
    { codigo: 'P007', nombre: 'Jabon de Tocador', cat: 'Limpieza', precio: 2.50, stock: 120, tipoIgv: TipoIgvEnum.GRAVADO },
    { codigo: 'P008', nombre: 'Paracetamol 500mg (tableta)', cat: 'Farmacia', precio: 0.30, stock: 1000, tipoIgv: TipoIgvEnum.INAFECTO },
    { codigo: 'P009', nombre: 'Agua Mineral 625ml', cat: 'Bebidas', precio: 1.00, stock: 300, tipoIgv: TipoIgvEnum.GRAVADO },
    { codigo: 'P010', nombre: 'Yogurt Bebible 1L', cat: 'Abarrotes', precio: 5.50, stock: 45, tipoIgv: TipoIgvEnum.EXONERADO },
  ];
  for (const p of productos) {
    const existe = await prodRepo.findOne({ where: { empresaId: empresa.id, codigo: p.codigo } });
    if (!existe) {
      const guardado = await prodRepo.save(prodRepo.create({
        empresaId: empresa.id,
        codigo: p.codigo,
        nombre: p.nombre,
        categoriaId: categorias[p.cat].id,
        unidad: 'NIU',
        precio: p.precio,
        precioMayoreo: +(p.precio * 0.9).toFixed(2),
        // El saldo real está en producto_stock por sucursal.
        stock: 0,
        stockMinimo: 10,
        tipoIgv: p.tipoIgv,
        activo: true,
      }));
      await AppDataSource.query(
        'UPDATE producto_stock SET stock = $1, updated_at = NOW() WHERE producto_id = $2 AND sucursal_id = $3 AND empresa_id = $4',
        [p.stock, guardado.id, sucursal.id, empresa.id],
      );
      await AppDataSource.query(
        `INSERT INTO inventario_lote(empresa_id,sucursal_id,producto_id,codigo_lote,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario)
         VALUES($1,$2,$3,$4,NULL,$5,$5,0)`,
        [empresa.id,sucursal.id,guardado.id,`SEED-${guardado.id}-${sucursal.id}`,p.stock],
      );
      const adminSeed = await usuarioRepo.findOne({ where: { empresaId: empresa.id, rol: RolUsuarioEnum.ADMIN } });
      if (!adminSeed) throw new Error('No se encontró el usuario administrador para auditar el stock demo');
      await AppDataSource.getRepository(MovimientoInventario).save({
        empresaId: empresa.id, sucursalId: sucursal.id, productoId: guardado.id,
        comprobanteId: null, usuarioId: adminSeed.id,
        tipo: 'ENTRADA', cantidad: p.stock, stockAnterior: 0, stockPosterior: p.stock,
        motivo: 'Stock inicial del catálogo demo',
      });
    }
  }
  console.log(`Productos demo asegurados: ${productos.length}`);

  // --- Clientes ---
  const clienteRepo = AppDataSource.getRepository(Cliente);
  const clientes = [
    { tipoDoc: TipoDocClienteEnum.DNI, numero: '00000000', nombre: 'CONSUMIDOR FINAL' },
    { tipoDoc: TipoDocClienteEnum.RUC, numero: '20481234566', nombre: 'DISTRIBUIDORA ANDINA E.I.R.L.', direccion: 'Av. Circunvalacion 789, Huancayo', telefono: '064212345', email: 'facturacion@andina.pe', limiteCredito: 5000 },
  ];
  for (const c of clientes) {
    const existe = await clienteRepo.findOne({ where: { empresaId: empresa.id, tipoDoc: c.tipoDoc, numero: c.numero } });
    if (!existe) {
      await clienteRepo.save(clienteRepo.create({ empresaId: empresa.id, ...c, saldoCredito: 0 } as any));
    }
  }
  console.log('Clientes demo asegurados: CONSUMIDOR FINAL + RUC demo');

  // --- Series / correlativos (F001 facturas, B001 boletas, NC01/ND01 notas) ---
  const serieRepo = AppDataSource.getRepository(SerieCorrelativo);
  const series = [
    { tipoComprobante: '01', serie: 'F001' },
    { tipoComprobante: '03', serie: 'B001' },
    { tipoComprobante: '07', serie: 'NC01' },
    { tipoComprobante: '08', serie: 'ND01' },
  ];
  for (const s of series) {
    const existe = await serieRepo.findOne({ where: { sucursalId: sucursal.id, ...s } });
    if (!existe) {
      await serieRepo.save(serieRepo.create({ sucursalId: sucursal.id, ...s, ultimoCorrelativo: 0 }));
    }
  }
  console.log('Series aseguradas: F001 / B001 / NC01 / ND01');

  await AppDataSource.destroy();
  console.log('=== Seed finalizado OK ===');
}

main().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
