import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Comprobante } from './entities/comprobante.entity';
import { ComprobanteLinea } from './entities/comprobante-linea.entity';
import { ComprobantePago } from './entities/comprobante-pago.entity';
import { SerieCorrelativo } from './entities/serie-correlativo.entity';
import { Producto } from '../productos/entities/producto.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Caja } from '../caja/entities/caja.entity';
import { CajaMovimiento } from '../caja/entities/caja-movimiento.entity';
import { MovimientoInventario } from '../inventario/entities/movimiento-inventario.entity';
import { fechaHoyLima, seleccionarLotesFefo } from '../inventario/fefo';
import { CreateVentaDto } from './dto/create-venta.dto';
import { CrearNotaDebitoDto } from './dto/crear-nota-debito.dto';
import { calcularComprobante, LineaIgvInput } from '../common/utils/igv.engine';
import { redondear2 } from '../common/utils/round.util';
import { calcularDisponibleCredito } from '../clientes/credit-calculations';
import { validarDocumento } from '../common/utils/documento.validator';
import {
  EstadoCajaEnum, EstadoComprobanteEnum, MetodoPagoEnum, SERIE_POR_DEFECTO, TipoDocClienteEnum,
  RolUsuarioEnum,
} from '../common/enums';
import { FeService } from '../fe/fe.service';

type QueryExecutor = { query: (sql: string, parameters?: any[]) => Promise<any> };
type PagoNormalizado = { metodo: MetodoPagoEnum; monto: number; montoRecibido?: number };

@Injectable()
export class VentasService {
  constructor(
    @InjectRepository(Comprobante) private readonly comprobanteRepo: Repository<Comprobante>,
    @InjectRepository(SerieCorrelativo) private readonly serieRepo: Repository<SerieCorrelativo>,
    private readonly dataSource: DataSource,
    private readonly feService: FeService,
  ) {}

  /** Incremento atómico ejecutado dentro de la transacción que registra la venta. */
  async obtenerSiguienteCorrelativo(
    sucursalId: number,
    tipo: string,
    serie: string,
    executor: QueryExecutor = this.dataSource,
  ): Promise<{ serie: string; correlativo: number }> {
    const resultado = await executor.query(
      `UPDATE serie_correlativo
         SET ultimo_correlativo = ultimo_correlativo + 1
       WHERE sucursal_id = $1 AND tipo_comprobante = $2 AND serie = $3
       RETURNING serie, ultimo_correlativo`,
      [sucursalId, tipo, serie],
    );
    if (!resultado?.length) {
      throw new BadRequestException(`No existe serie ${serie} para tipo ${tipo} en la sucursal ${sucursalId}`);
    }
    return { serie: resultado[0].serie, correlativo: Number(resultado[0].ultimo_correlativo) };
  }

  private normalizarPagos(dto: CreateVentaDto, total: number): PagoNormalizado[] {
    const pagos: PagoNormalizado[] = dto.pagos?.length
      ? dto.pagos.map((p) => ({ metodo: p.metodo, monto: redondear2(Number(p.monto)), montoRecibido: p.montoRecibido }))
      : [{ metodo: dto.metodoPago || MetodoPagoEnum.EFECTIVO, monto: total, montoRecibido: dto.montoRecibido }];

    if (!pagos.length || pagos.some((p) => !Number.isFinite(p.monto) || p.monto <= 0)) {
      throw new BadRequestException('Registre al menos un medio de pago con importe mayor a cero');
    }
    const metodos = pagos.map((p) => p.metodo);
    if (new Set(metodos).size !== metodos.length) {
      throw new BadRequestException('No repita el mismo medio de pago; consolide sus importes');
    }
    const pagado = redondear2(pagos.reduce((sum, p) => sum + p.monto, 0));
    if (Math.abs(pagado - total) > 0.01) {
      throw new BadRequestException(`Los pagos suman S/ ${pagado.toFixed(2)} y la venta total es S/ ${total.toFixed(2)}`);
    }
    for (const pago of pagos) {
      if (pago.metodo === MetodoPagoEnum.EFECTIVO) {
        pago.montoRecibido = pago.montoRecibido ?? pago.monto;
        if (pago.montoRecibido < pago.monto) {
          throw new BadRequestException('El efectivo recibido no puede ser menor al importe asignado al efectivo');
        }
      } else if (pago.montoRecibido !== undefined) {
        throw new BadRequestException('El monto recibido solo corresponde al pago en efectivo');
      }
    }
    return pagos;
  }

  private async resolverCliente(manager: EntityManager, dto: CreateVentaDto, empresaId: number): Promise<Cliente> {
    if (dto.clienteId) {
      const existente = await manager.getRepository(Cliente).findOne({ where: { id: dto.clienteId, empresaId } });
      if (!existente) throw new NotFoundException('Cliente no encontrado en esta empresa');
      return existente;
    }
    if (!dto.cliente) throw new BadRequestException('Debe seleccionar un cliente o enviar sus datos');
    const { tipoDoc, numero, nombre, direccion } = dto.cliente;
    if (numero !== '00000000' && !validarDocumento(tipoDoc as TipoDocClienteEnum, numero)) {
      throw new BadRequestException(`Documento del cliente inválido: ${tipoDoc} ${numero}`);
    }
    const repo = manager.getRepository(Cliente);
    const existente = await repo.findOne({ where: { empresaId, tipoDoc, numero } });
    if (existente) return existente;
    const nuevoCliente = repo.create({
      empresaId, tipoDoc, numero, nombre: nombre.trim(), direccion: direccion || undefined,
      limiteCredito: 0, saldoCredito: 0,
    });
    return repo.save(nuevoCliente);
  }

  async create(
    dto: CreateVentaDto,
    usuarioId: number,
    empresaId: number,
    sucursalIds: number[],
    rol: string,
  ): Promise<Comprobante> {
    if (dto.tipo === '07' || dto.tipo === '08') {
      throw new BadRequestException('Las notas de crédito y débito requieren un flujo de referencia y no se registran como ventas nuevas');
    }
    if (Number(dto.descuentoGlobal || 0) > 0) {
      throw new BadRequestException('El descuento global aún no está habilitado para emisión electrónica; aplique el descuento en cada línea');
    }
    const tieneDescuento=(dto.lineas||[]).some((linea)=>Number(linea.descuento||0)>0);
    const motivoDescuento=dto.motivoDescuento?.trim()||'';
    if(tieneDescuento&&rol!==RolUsuarioEnum.ADMIN)throw new ForbiddenException('Solo un administrador puede autorizar descuentos en ventas');
    if(tieneDescuento&&motivoDescuento.length<5)throw new BadRequestException('Indique el motivo del descuento (mínimo 5 caracteres)');
    if(tieneDescuento&&motivoDescuento.length>250)throw new BadRequestException('El motivo del descuento no puede exceder 250 caracteres');
    if(!tieneDescuento&&motivoDescuento)throw new BadRequestException('No envíe un motivo de descuento si la venta no tiene descuentos');
    if (!sucursalIds?.includes(dto.sucursalId)) {
      throw new ForbiddenException('No tiene acceso a la sucursal seleccionada');
    }
    if (dto.fechaVencimiento) {
      const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date());
      const hoyPeru = `${partes.find((p) => p.type === 'year')?.value}-${partes.find((p) => p.type === 'month')?.value}-${partes.find((p) => p.type === 'day')?.value}`;
      const [anio, mes, dia] = dto.fechaVencimiento.split('-').map(Number);
      const fechaConstruida = new Date(Date.UTC(anio, mes - 1, dia));
      const fechaNormalizada = Number.isNaN(fechaConstruida.getTime()) ? '' : fechaConstruida.toISOString().slice(0, 10);
      const limite = new Date(`${hoyPeru}T00:00:00.000Z`);
      limite.setUTCDate(limite.getUTCDate() + 732);
      const maximoPeru = limite.toISOString().slice(0, 10);
      if (fechaNormalizada !== dto.fechaVencimiento || dto.fechaVencimiento < hoyPeru || dto.fechaVencimiento > maximoPeru) {
        throw new BadRequestException('La fecha de vencimiento debe ser una fecha válida entre hoy y los próximos 2 años');
      }
    }

    if (dto.idempotencyKey) {
      const previa = await this.comprobanteRepo.findOne({
        where: { empresaId, sucursalId: dto.sucursalId, idempotencyKey: dto.idempotencyKey },
        relations: ['lineas', 'cliente', 'pagos'],
      });
      if (previa) return previa;
    }

    let comprobante: Comprobante;
    try {
      comprobante = await this.dataSource.transaction(async (manager) => {
        const sucursal = await manager.query(
          'SELECT id FROM sucursal WHERE id = $1 AND empresa_id = $2', [dto.sucursalId, empresaId],
        );
        if (!sucursal.length) throw new ForbiddenException('La sucursal no pertenece a la empresa del usuario');

        // Bloquea la caja durante toda la operación para impedir ventas en una caja cerrada.
        const caja = await manager.getRepository(Caja).findOne({
          where: { sucursalId: dto.sucursalId, usuarioId, estado: EstadoCajaEnum.ABIERTA },
          lock: { mode: 'pessimistic_write' },
        });
        if (!caja) throw new BadRequestException('No hay una caja abierta para este usuario en la sucursal');

        const cliente = await this.resolverCliente(manager, dto, empresaId);
        // Bloqueo del cliente para que dos ventas concurrentes no excedan el límite de crédito.
        const clienteBloqueado = await manager.query(
          'SELECT limite_credito, saldo_credito FROM cliente WHERE id = $1 AND empresa_id = $2 FOR UPDATE',
          [cliente.id, empresaId],
        );
        if (!clienteBloqueado.length) throw new NotFoundException('Cliente no encontrado en esta empresa');
        const productoIds = [...new Set(dto.lineas.map((linea) => linea.productoId))].sort((a, b) => a - b);
        const productos = await manager.getRepository(Producto).find({
          where: { id: In(productoIds), empresaId, activo: true },
        });
        const productoMap = new Map<number, Producto>(productos.map((p) => [p.id, p] as [number, Producto]));
        if (productoMap.size !== productoIds.length) {
          throw new NotFoundException('Uno o más productos están inactivos o no pertenecen a la empresa');
        }

        const lineasBase = dto.lineas.filter((linea) => !linea.varianteId);
        const cantidadesBase = new Map<number, number>();
        for (const linea of lineasBase) {
          cantidadesBase.set(linea.productoId, (cantidadesBase.get(linea.productoId) || 0) + Number(linea.cantidad));
        }
        const stockBaseMap = new Map<number, number>();
        const costoBaseMap = new Map<number, number>();
        if (cantidadesBase.size) {
          const idsBase = [...cantidadesBase.keys()].sort((a, b) => a - b);
          const saldosBase = await manager.query(
            `SELECT p.id AS producto_id, ps.stock, ps.costo_promedio
             FROM producto p
             INNER JOIN producto_stock ps ON ps.producto_id=p.id AND ps.empresa_id=p.empresa_id
             WHERE p.id=ANY($1::int[]) AND p.empresa_id=$2 AND p.activo=TRUE AND ps.sucursal_id=$3
             ORDER BY p.id FOR UPDATE OF p, ps`,
            [idsBase, empresaId, dto.sucursalId],
          );
          if (saldosBase.length !== idsBase.length) {
            throw new NotFoundException('Uno o más productos no tienen saldo en esta sucursal');
          }
          for (const row of saldosBase) {
            stockBaseMap.set(Number(row.producto_id), Number(row.stock));
            costoBaseMap.set(Number(row.producto_id), Number(row.costo_promedio || 0));
          }
          for (const [productoId, cantidad] of cantidadesBase) {
            const disponible = stockBaseMap.get(productoId) || 0;
            if (disponible < cantidad) {
              throw new BadRequestException(`Stock insuficiente para ${productoMap.get(productoId)?.nombre || productoId} (disponible ${disponible}, solicitado ${cantidad})`);
            }
          }
        }

        const varianteIds = [...new Set(dto.lineas.filter((l) => l.varianteId).map((l) => Number(l.varianteId)))].sort((a, b) => a - b);
        const varianteMap = new Map<number, any>();
        const stockVarianteMap = new Map<number, number>();
        const costoVarianteMap = new Map<number, number>();
        if (varianteIds.length) {
          const variantes = await manager.query(
            `SELECT pv.id,pv.producto_id,pv.codigo,pv.nombre,pv.precio,pv.precio_mayoreo,
                    p.tipo_igv,p.tiene_variantes,p.nombre AS producto_nombre,pvs.stock,pvs.costo_promedio
             FROM producto_variante pv
             INNER JOIN producto p ON p.id=pv.producto_id AND p.empresa_id=pv.empresa_id
             INNER JOIN producto_variante_stock pvs ON pvs.variante_id=pv.id AND pvs.producto_id=pv.producto_id AND pvs.empresa_id=pv.empresa_id
             WHERE pv.id=ANY($1::int[]) AND pv.empresa_id=$2 AND pv.activo=TRUE AND p.activo=TRUE AND p.tiene_variantes=TRUE
               AND pvs.sucursal_id=$3
             ORDER BY pv.id FOR UPDATE OF pv,pvs,p`,
            [varianteIds, empresaId, dto.sucursalId],
          );
          if (variantes.length !== varianteIds.length) {
            throw new NotFoundException('Una o más variantes no existen, están inactivas o no tienen saldo en esta sucursal');
          }
          for (const row of variantes) {
            const id = Number(row.id);
            varianteMap.set(id, row);
            stockVarianteMap.set(id, Number(row.stock));
            costoVarianteMap.set(id, Number(row.costo_promedio || 0));
          }
        }

        const cantidades = new Map<string, { productoId: number; varianteId: number | null; cantidad: number }>();
        for (const linea of dto.lineas) {
          const varianteId = linea.varianteId ? Number(linea.varianteId) : null;
          const productoTieneVariantes = productoMap.get(Number(linea.productoId))?.tieneVariantes === true;
          if (productoTieneVariantes && !varianteId) {
            throw new BadRequestException(`Seleccione una presentación para ${productoMap.get(Number(linea.productoId))?.nombre || linea.productoId}`);
          }
          if (!productoTieneVariantes && varianteId) {
            throw new BadRequestException('No se puede vender una variante de un producto configurado como unidad única');
          }
          if (varianteId && Number(varianteMap.get(varianteId)?.producto_id) !== Number(linea.productoId)) {
            throw new BadRequestException('La variante seleccionada no pertenece al producto indicado');
          }
          const key = varianteId ? `v:${varianteId}` : `p:${linea.productoId}`;
          const actual = cantidades.get(key);
          cantidades.set(key, {
            productoId: linea.productoId, varianteId,
            cantidad: (actual?.cantidad || 0) + Number(linea.cantidad),
          });
        }
        for (const item of cantidades.values()) {
          const disponible = item.varianteId
            ? (stockVarianteMap.get(item.varianteId) || 0)
            : (stockBaseMap.get(item.productoId) || 0);
          if (disponible < item.cantidad) {
            const nombre = item.varianteId
              ? `${productoMap.get(item.productoId)?.nombre || 'Producto'} - ${varianteMap.get(item.varianteId)?.nombre || 'variante'}`
              : productoMap.get(item.productoId)?.nombre || `producto ${item.productoId}`;
            throw new BadRequestException(`Stock insuficiente para ${nombre} (disponible ${disponible}, solicitado ${item.cantidad})`);
          }
        }

        const lineasInput: LineaIgvInput[] = dto.lineas.map((linea) => {
          const producto = productoMap.get(linea.productoId)!;
          const variante = linea.varianteId ? varianteMap.get(Number(linea.varianteId)) : null;
          const precioLista = redondear2(Number(variante ? variante.precio : producto.precio));
          const nombreComercial = variante ? `${producto.nombre} - ${variante.nombre}` : producto.nombre;
          if (linea.precioUnitario !== undefined && redondear2(Number(linea.precioUnitario)) !== precioLista) {
            throw new BadRequestException(`El precio de ${nombreComercial} cambió o fue alterado. Actualice el catálogo y vuelva a cobrar.`);
          }
          const precioUnitario = precioLista;
          const descuento = linea.descuento ?? 0;
          if (descuento > redondear2(precioUnitario * linea.cantidad)) {
            throw new BadRequestException(`El descuento supera el importe de ${nombreComercial}`);
          }
          return {
            cantidad: linea.cantidad,
            precioUnitario,
            descuento,
            tipoIgv: producto.tipoIgv,
          };
        });
        const { lineas: lineasCalc, totales } = calcularComprobante(lineasInput, dto.descuentoGlobal || 0);
        const subtotalAntesDescuentoGlobal = redondear2(
          totales.opGravadas + totales.opExoneradas + totales.opInafectas + totales.totalIgv,
        );
        if (totales.descuentoGlobal > subtotalAntesDescuentoGlobal) {
          throw new BadRequestException('El descuento global no puede superar el importe de la venta');
        }
        if (totales.total <= 0) throw new BadRequestException('El total de la venta debe ser mayor a cero');

        const pagos = this.normalizarPagos(dto, totales.total);
        const montoCredito = redondear2(pagos
          .filter((p) => p.metodo === MetodoPagoEnum.CREDITO)
          .reduce((sum, p) => sum + p.monto, 0));
        if (montoCredito > 0) {
          const limite = Number(clienteBloqueado[0].limite_credito || 0);
          const saldo = Number(clienteBloqueado[0].saldo_credito || 0);
          const disponible = calcularDisponibleCredito(limite, saldo);
          if (cliente.numero === '00000000' || limite <= 0 || montoCredito > disponible + 0.001) {
            throw new BadRequestException(`Crédito no autorizado o insuficiente. Disponible: S/ ${disponible.toFixed(2)}`);
          }
        }

        const metodos = new Set(pagos.map((p) => p.metodo));
        const metodoPrincipal = pagos.length === 1 ? pagos[0].metodo : MetodoPagoEnum.MIXTO;
        const pagoEfectivo = pagos.find((p) => p.metodo === MetodoPagoEnum.EFECTIVO);
        const vuelto = pagoEfectivo
          ? redondear2(Number(pagoEfectivo.montoRecibido || pagoEfectivo.monto) - pagoEfectivo.monto)
          : null;
        const serie = SERIE_POR_DEFECTO[dto.tipo] || (dto.tipo === '01' ? 'F001' : 'B001');
        const { correlativo } = await this.obtenerSiguienteCorrelativo(dto.sucursalId, dto.tipo, serie, manager);

        const compRepo = manager.getRepository(Comprobante);
        const comp = compRepo.create({
          empresaId, sucursalId: dto.sucursalId, cajaId: caja.id, usuarioId, clienteId: cliente.id,
          cliente, tipo: dto.tipo, serie, correlativo,
          opGravadas: totales.opGravadas, opExoneradas: totales.opExoneradas,
          opInafectas: totales.opInafectas, descuentoGlobal: totales.descuentoGlobal,
          motivoDescuento: tieneDescuento?motivoDescuento:null,
          totalIgv: totales.totalIgv, total: totales.total, metodoPago: metodoPrincipal,
          montoRecibido: pagoEfectivo?.montoRecibido ?? null, vuelto,
          estado: metodos.has(MetodoPagoEnum.CREDITO) ? EstadoComprobanteEnum.PENDIENTE : EstadoComprobanteEnum.PAGADA,
          idempotencyKey: dto.idempotencyKey || null,
          lineas: lineasCalc.map((calculada, index) => {
            const original = dto.lineas[index];
            const producto = productoMap.get(original.productoId)!;
            return manager.getRepository(ComprobanteLinea).create({
              numeroLinea: index + 1, productoId: producto.id, producto,
              varianteId: original.varianteId ? Number(original.varianteId) : null,
              varianteNombre: original.varianteId ? String(varianteMap.get(Number(original.varianteId)).nombre) : null,
              varianteCodigo: original.varianteId ? String(varianteMap.get(Number(original.varianteId)).codigo) : null,
              cantidad: calculada.cantidad, precioUnitario: calculada.precioUnitario,
              descuento: calculada.descuento, tipoIgv: calculada.tipoIgv,
              costoUnitario: original.varianteId
                ? (costoVarianteMap.get(Number(original.varianteId)) || 0)
                : (costoBaseMap.get(producto.id) || 0),
              baseImponible: calculada.baseImponible, igv: calculada.igv, subtotal: calculada.subtotal,
            });
          }),
        } as any) as Comprobante;
        const guardado: Comprobante = await compRepo.save(comp);

        await manager.getRepository(ComprobantePago).save(pagos.map((pago) => ({
          comprobanteId: guardado.id,
          metodoPago: pago.metodo,
          monto: pago.monto,
          montoRecibido: pago.metodo === MetodoPagoEnum.EFECTIVO ? pago.montoRecibido : null,
          vuelto: pago.metodo === MetodoPagoEnum.EFECTIVO
            ? redondear2(Number(pago.montoRecibido || pago.monto) - pago.monto)
            : null,
        })));

        for (const item of [...cantidades.values()].sort((a, b) =>
          a.productoId - b.productoId || Number(a.varianteId || 0) - Number(b.varianteId || 0))) {
          const { productoId, varianteId, cantidad } = item;
          const stockAnterior = varianteId
            ? (stockVarianteMap.get(varianteId) || 0)
            : (stockBaseMap.get(productoId) || 0);
          const loteFiltro = varianteId ? 'AND variante_id=$4' : 'AND variante_id IS NULL';
          const loteParams = varianteId
            ? [empresaId, dto.sucursalId, productoId, varianteId]
            : [empresaId, dto.sucursalId, productoId];
          const lotes = await manager.query(
            `SELECT id,cantidad_disponible FROM inventario_lote
             WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 ${loteFiltro}
               AND cantidad_disponible>0
               AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= (NOW() AT TIME ZONE 'America/Lima')::date)
             ORDER BY fecha_vencimiento ASC NULLS LAST,created_at ASC,id ASC FOR UPDATE`,
            loteParams,
          );
          let asignaciones;
          try { asignaciones = seleccionarLotesFefo(lotes, cantidad, fechaHoyLima()); }
          catch {
            throw new BadRequestException(`Lotes insuficientes o vencidos para ${varianteId ? `la variante ${varianteId}` : `el producto ${productoId}`}. Actualice los lotes antes de vender.`);
          }
          for (const { lote, cantidad: tomar } of asignaciones) {
            const loteActualizado = await manager.query(
              `UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible-$1
               WHERE id=$2 AND cantidad_disponible >= $1 RETURNING id`,
              [tomar, lote.id],
            );
            if (!loteActualizado.length) throw new BadRequestException('El lote cambió durante la venta; vuelva a intentar');
            await manager.query(
              `INSERT INTO comprobante_lote_salida(empresa_id,comprobante_id,lote_id,producto_id,cantidad,variante_id)
               VALUES($1,$2,$3,$4,$5,$6)`,
              [empresaId, guardado.id, lote.id, productoId, tomar, varianteId],
            );
          }

          const actualizado = varianteId
            ? await manager.query(
                `UPDATE producto_variante_stock SET stock=stock-$1,updated_at=NOW()
                 WHERE variante_id=$2 AND producto_id=$3 AND sucursal_id=$4 AND empresa_id=$5 AND stock >= $1
                 RETURNING stock`,
                [cantidad, varianteId, productoId, dto.sucursalId, empresaId],
              )
            : await manager.query(
                `UPDATE producto_stock SET stock=stock-$1,updated_at=NOW()
                 WHERE producto_id=$2 AND sucursal_id=$3 AND empresa_id=$4 AND stock >= $1
                 RETURNING stock`,
                [cantidad, productoId, dto.sucursalId, empresaId],
              );
          if (!actualizado.length) throw new BadRequestException(`No hay stock suficiente para ${varianteId ? `la variante ${varianteId}` : `el producto ${productoId}`} en esta sucursal`);
          const stockPosterior = Number(actualizado[0].stock);
          await manager.getRepository(MovimientoInventario).save({
            empresaId, sucursalId: dto.sucursalId, productoId, varianteId: varianteId || null,
            comprobanteId: guardado.id, usuarioId, tipo: 'SALIDA', cantidad,
            stockAnterior, stockPosterior,
            motivo: `Venta ${serie}-${correlativo}`,
          });
        }

        if (montoCredito > 0) {
          await manager.query(
            `INSERT INTO cuenta_cobrar
              (empresa_id,sucursal_id,comprobante_id,cliente_id,total_credito,saldo_pendiente,fecha_vencimiento,estado)
             VALUES ($1,$2,$3,$4,$5,$5,COALESCE($6::date, ((NOW() AT TIME ZONE 'America/Lima')::date + 30)),'PENDIENTE')`,
            [empresaId, dto.sucursalId, guardado.id, cliente.id, montoCredito, dto.fechaVencimiento || null],
          );
          await manager.query(
            'UPDATE cliente SET saldo_credito = saldo_credito + $1 WHERE id = $2 AND empresa_id = $3',
            [montoCredito, cliente.id, empresaId],
          );
        }
        return compRepo.findOne({
          where: { id: guardado.id, empresaId }, relations: ['lineas', 'cliente', 'pagos'],
        }) as Promise<Comprobante>;
      });
    } catch (error: any) {
      // Una reejecución simultánea con la misma clave devuelve el comprobante ya creado.
      if (dto.idempotencyKey && (error?.code === '23505' || error?.driverError?.code === '23505')) {
        const previa = await this.comprobanteRepo.findOne({
          where: { empresaId, sucursalId: dto.sucursalId, idempotencyKey: dto.idempotencyKey },
          relations: ['lineas', 'cliente', 'pagos'],
        });
        if (previa) return previa;
      }
      throw error;
    }

    this.feService.crearDesdeComprobante(comprobante.id, empresaId, [dto.sucursalId]).catch((err) => {
      console.error('No se pudo encolar FE; el comprobante queda registrado para reintento:', (err as Error).message);
    });
    return comprobante;
  }

  /** Registra una nota de débito por aumento de valor y abre una cuenta por cobrar separada. */
  async crearNotaDebito(
    comprobanteId: number,
    dto: CrearNotaDebitoDto,
    usuarioId: number,
    empresaId: number,
    sucursalIds: number[],
  ): Promise<Comprobante> {
    const monto = redondear2(Number(dto.monto));
    const motivo = dto.motivo?.trim();
    const clave = dto.idempotencyKey?.trim();
    if (!Number.isFinite(monto) || monto <= 0) throw new BadRequestException('El importe debe ser mayor a cero');
    if (!motivo || motivo.length < 5 || motivo.length > 250) throw new BadRequestException('Indique el motivo (5 a 250 caracteres)');
    if (!clave || clave.length < 8 || clave.length > 100) throw new BadRequestException('La clave de operación es inválida');
    if (!sucursalIds?.length) throw new ForbiddenException('No tiene sucursales asignadas');
    const comprobanteLineaId = Number(dto.comprobanteLineaId);
    if (!Number.isInteger(comprobanteLineaId) || comprobanteLineaId <= 0) throw new BadRequestException('Seleccione una línea válida del comprobante original');
    const requestHash = createHash('sha256').update(JSON.stringify({ comprobanteId, comprobanteLineaId, monto, motivo })).digest('hex');

    const existente = await this.dataSource.query(
      `SELECT id,request_hash FROM comprobante WHERE empresa_id=$1 AND idempotency_key=$2`, [empresaId, clave],
    );
    if (existente.length) {
      if (existente[0].request_hash !== requestHash) throw new ConflictException('La clave ya se utilizó con otros datos');
      return this.comprobanteRepo.findOneOrFail({ where: { id: Number(existente[0].id), empresaId }, relations: ['lineas', 'cliente', 'referenciaComprobante'] });
    }

    let nuevoId: number;
    try {
      nuevoId = await this.dataSource.transaction(async (manager) => {
        const origenes = await manager.query(
          `SELECT id,empresa_id,sucursal_id,cliente_id,tipo,serie,correlativo,estado,total
           FROM comprobante WHERE id=$1 AND empresa_id=$2 AND sucursal_id=ANY($3::int[]) FOR UPDATE`,
          [comprobanteId, empresaId, sucursalIds],
        );
        if (!origenes.length) throw new NotFoundException('Comprobante no encontrado');
        const origen = origenes[0];
        if (!['01','03'].includes(origen.tipo) || origen.estado === 'ANULADA') {
          throw new BadRequestException('La nota de débito requiere una factura o boleta vigente');
        }
        const notasCredito = await manager.query(
          `SELECT COALESCE(SUM(total),0)::numeric AS total FROM comprobante
           WHERE referencia_comprobante_id=$1 AND empresa_id=$2 AND tipo='07'`, [comprobanteId,empresaId],
        );
        if (Number(notasCredito[0]?.total || 0) >= Number(origen.total) - 0.01) {
          throw new BadRequestException('No se puede aumentar el valor de un comprobante ya revertido totalmente mediante notas de crédito');
        }
        const repetida = await manager.query(
          `SELECT id,request_hash FROM comprobante WHERE empresa_id=$1 AND idempotency_key=$2`, [empresaId, clave],
        );
        if (repetida.length) {
          if (repetida[0].request_hash !== requestHash) throw new ConflictException('La clave ya se utilizó con otros datos');
          return Number(repetida[0].id);
        }
        const clienteRows = await manager.query(
          `SELECT id FROM cliente WHERE id=$1 AND empresa_id=$2 FOR UPDATE`, [origen.cliente_id, empresaId],
        );
        if (!clienteRows.length) throw new NotFoundException('Cliente no encontrado');
        const lineasOrigen = await manager.query(
          `SELECT cl.producto_id,cl.tipo_igv,p.nombre
           FROM comprobante_linea cl INNER JOIN producto p ON p.id=cl.producto_id AND p.empresa_id=$3
           WHERE cl.comprobante_id=$1 AND cl.id=$2 FOR UPDATE OF cl`, [comprobanteId, comprobanteLineaId, empresaId],
        );
        if (!lineasOrigen.length) throw new BadRequestException('La línea seleccionada no pertenece al comprobante original');
        const lineaOrigen = lineasOrigen[0];
        const tipoIgv = Number(lineaOrigen.tipo_igv);
        const base = tipoIgv === 10 ? redondear2(monto / 1.18) : monto;
        const montos = [{ tipoIgv, productoId: Number(lineaOrigen.producto_id), nombre: String(lineaOrigen.nombre), subtotal: monto, base, igv: redondear2(monto - base) }];
        const opGravadas = redondear2(montos.filter((x) => x.tipoIgv === 10).reduce((s, x) => s + x.base, 0));
        const opExoneradas = redondear2(montos.filter((x) => x.tipoIgv === 20).reduce((s, x) => s + x.base, 0));
        const opInafectas = redondear2(montos.filter((x) => x.tipoIgv === 30).reduce((s, x) => s + x.base, 0));
        const totalIgv = redondear2(montos.reduce((s, x) => s + x.igv, 0));
        const serie = SERIE_POR_DEFECTO['08'] || 'ND01';
        const secuencia = await this.obtenerSiguienteCorrelativo(Number(origen.sucursal_id), '08', serie, manager);
        const insertados = await manager.query(
          `INSERT INTO comprobante
            (empresa_id,sucursal_id,caja_id,usuario_id,cliente_id,tipo,serie,correlativo,op_gravadas,op_exoneradas,op_inafectas,
             descuento_global,total_igv,total,metodo_pago,estado,idempotency_key,referencia_comprobante_id,codigo_motivo_nota,descripcion_motivo_nota,request_hash)
           VALUES ($1,$2,NULL,$3,$4,'08',$5,$6,$7,$8,$9,0,$10,$11,'CREDITO','PENDIENTE',$12,$13,'02',$14,$15)
           RETURNING id`,
          [empresaId, origen.sucursal_id, usuarioId, origen.cliente_id, serie, secuencia.correlativo, opGravadas, opExoneradas,
            opInafectas, totalIgv, monto, clave, comprobanteId, motivo, requestHash],
        );
        const notaId = Number(insertados[0].id);
        for (const [index, linea] of montos.entries()) {
          await manager.query(
            `INSERT INTO comprobante_linea
              (comprobante_id,numero_linea,producto_id,cantidad,precio_unitario,descuento,tipo_igv,base_imponible,igv,subtotal)
             VALUES ($1,$2,$3,1,$4,0,$5,$6,$7,$8)`,
            [notaId,index+1,linea.productoId,linea.subtotal,linea.tipoIgv,linea.base,linea.igv,linea.subtotal],
          );
        }
        const cuenta = await manager.query(
          `INSERT INTO cuenta_cobrar
            (empresa_id,sucursal_id,comprobante_id,cliente_id,total_credito,saldo_pendiente,fecha_vencimiento,estado)
           VALUES ($1,$2,$3,$4,$5,$5,((NOW() AT TIME ZONE 'America/Lima')::date + 30),'PENDIENTE')`,
          [empresaId,origen.sucursal_id,notaId,origen.cliente_id,monto],
        );
      if (!cuenta) throw new BadRequestException('No se pudo crear la cuenta por cobrar de la nota');
        await manager.query('UPDATE cliente SET saldo_credito=saldo_credito+$1 WHERE id=$2 AND empresa_id=$3', [monto,origen.cliente_id,empresaId]);
        return notaId;
      });
    } catch (error: any) {
      if (error?.code === '23505' || error?.driverError?.code === '23505') {
        const reintento = await this.dataSource.query(
          `SELECT id,request_hash FROM comprobante WHERE empresa_id=$1 AND idempotency_key=$2`, [empresaId, clave],
        );
        if (reintento.length && reintento[0].request_hash === requestHash) {
          nuevoId = Number(reintento[0].id);
        } else if (reintento.length) {
          throw new ConflictException('La clave ya se utilizó con otros datos');
        } else throw error;
      } else throw error;
    }
    this.feService.crearDesdeComprobante(nuevoId, empresaId, sucursalIds).catch((err) => {
      console.error('No se pudo encolar FE de la nota de débito; queda registrada para reintento:', (err as Error).message);
    });
    return this.comprobanteRepo.findOneOrFail({ where: { id: nuevoId, empresaId }, relations: ['lineas', 'cliente', 'referenciaComprobante'] });
  }

  async reporteRentabilidad(empresaId: number, sucursalIds: number[], sucursalId?: number, desde?: string, hasta?: string): Promise<any[]> {
    if (sucursalId && !sucursalIds.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const ids = sucursalId ? [sucursalId] : sucursalIds;
    if (!ids.length) return [];
    if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new BadRequestException('Fecha desde inválida');
    if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) throw new BadRequestException('Fecha hasta inválida');
    if (desde && hasta && desde > hasta) throw new BadRequestException('La fecha desde no puede ser posterior a la fecha hasta');
    return this.dataSource.query(
      `SELECT p.id AS "productoId", p.codigo, p.nombre,
              SUM(GREATEST(0,cl.cantidad-COALESCE(dev.cantidad_devuelta,0)))::numeric AS "cantidadVendida",
              SUM(GREATEST(0,cl.base_imponible - CASE WHEN cl.subtotal > 0 THEN cl.base_imponible * COALESCE(dev.importe_devuelto,0) / cl.subtotal ELSE 0 END))::numeric AS "ventasNetas",
              SUM(GREATEST(0,cl.base_imponible - CASE WHEN cl.subtotal > 0 THEN cl.base_imponible * COALESCE(dev.importe_devuelto,0) / cl.subtotal ELSE 0 END)) FILTER (WHERE cl.costo_unitario > 0) AS "ventasConCosto",
              SUM(GREATEST(0,cl.base_imponible - CASE WHEN cl.subtotal > 0 THEN cl.base_imponible * COALESCE(dev.importe_devuelto,0) / cl.subtotal ELSE 0 END)) FILTER (WHERE cl.costo_unitario = 0) AS "ventasSinCosto",
              SUM(GREATEST(0,cl.cantidad-COALESCE(dev.cantidad_devuelta,0)) * cl.costo_unitario / CASE WHEN cl.tipo_igv=10 THEN 1.18 ELSE 1 END)
                FILTER (WHERE cl.costo_unitario > 0) AS "costoMercaderia",
              SUM(GREATEST(0,cl.base_imponible - CASE WHEN cl.subtotal > 0 THEN cl.base_imponible * COALESCE(dev.importe_devuelto,0) / cl.subtotal ELSE 0 END)
                - (GREATEST(0,cl.cantidad-COALESCE(dev.cantidad_devuelta,0)) * cl.costo_unitario / CASE WHEN cl.tipo_igv=10 THEN 1.18 ELSE 1 END))
                FILTER (WHERE cl.costo_unitario > 0) AS "utilidadBruta",
              CASE WHEN SUM(GREATEST(0,cl.base_imponible - CASE WHEN cl.subtotal > 0 THEN cl.base_imponible * COALESCE(dev.importe_devuelto,0) / cl.subtotal ELSE 0 END)) FILTER (WHERE cl.costo_unitario > 0) > 0
                THEN ROUND(100 * SUM(GREATEST(0,cl.base_imponible - CASE WHEN cl.subtotal > 0 THEN cl.base_imponible * COALESCE(dev.importe_devuelto,0) / cl.subtotal ELSE 0 END)
                  - (GREATEST(0,cl.cantidad-COALESCE(dev.cantidad_devuelta,0)) * cl.costo_unitario / CASE WHEN cl.tipo_igv=10 THEN 1.18 ELSE 1 END))
                  FILTER (WHERE cl.costo_unitario > 0) / SUM(GREATEST(0,cl.base_imponible - CASE WHEN cl.subtotal > 0 THEN cl.base_imponible * COALESCE(dev.importe_devuelto,0) / cl.subtotal ELSE 0 END)) FILTER (WHERE cl.costo_unitario > 0), 2)
                ELSE 0 END AS "margenPorcentaje",
              COUNT(*) FILTER (WHERE cl.costo_unitario = 0)::int AS "lineasSinCosto"
       FROM comprobante_linea cl
       INNER JOIN comprobante c ON c.id=cl.comprobante_id AND c.empresa_id=$1
       INNER JOIN producto p ON p.id=cl.producto_id AND p.empresa_id=$1
       LEFT JOIN LATERAL (
         SELECT SUM(dl.cantidad)::numeric AS cantidad_devuelta,SUM(dl.monto)::numeric AS importe_devuelto
         FROM devolucion_venta_linea dl INNER JOIN devolucion_venta dv ON dv.id=dl.devolucion_id
         WHERE dl.comprobante_linea_id=cl.id AND dv.empresa_id=$1 AND dv.estado='REGISTRADA'
       ) dev ON TRUE
       WHERE c.sucursal_id=ANY($2::int[]) AND c.estado <> 'ANULADA'
         -- Rentabilidad por producto parte de ventas; las devoluciones registradas
         -- ya se descuentan desde devolucion_venta_linea y las notas no son ventas.
         AND c.tipo IN ('01','03')
         AND ($3::date IS NULL OR (c.fecha_emision AT TIME ZONE 'America/Lima')::date >= $3::date)
         AND ($4::date IS NULL OR (c.fecha_emision AT TIME ZONE 'America/Lima')::date <= $4::date)
       GROUP BY p.id,p.codigo,p.nombre
       ORDER BY "utilidadBruta" DESC NULLS LAST,p.nombre ASC`,
      [empresaId, ids, desde || null, hasta || null],
    );
  }

  async findAll(empresaId: number, sucursalIds: number[], sucursalId?: number): Promise<Comprobante[]> {
    if (sucursalId && !sucursalIds.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a esta sucursal');
    const ids = sucursalId ? [sucursalId] : sucursalIds;
    if (!ids.length) return [];
    return this.comprobanteRepo.find({
      where: { empresaId, sucursalId: In(ids) },
      relations: ['lineas', 'lineas.producto', 'cliente', 'pagos', 'referenciaComprobante'],
      order: { id: 'DESC' }, take: 100,
    });
  }

  async findOne(id: number, empresaId: number, sucursalIds: number[]): Promise<Comprobante> {
    if (!sucursalIds.length) throw new NotFoundException('Comprobante no encontrado');
    const c = await this.comprobanteRepo.findOne({
      where: { id, empresaId, sucursalId: In(sucursalIds) },
      relations: ['lineas', 'lineas.producto', 'cliente', 'pagos', 'referenciaComprobante'],
    });
    if (!c) throw new NotFoundException('Comprobante no encontrado');
    return c;
  }

  async anular(id: number, usuarioId: number, empresaId: number, sucursalIds: number[], motivo: string): Promise<Comprobante> {
    const razon = motivo?.trim();
    if (!razon || razon.length < 5) throw new BadRequestException('Indique un motivo de anulación de al menos 5 caracteres');

    const anulada = await this.dataSource.transaction(async (manager) => {
      const c = await manager.getRepository(Comprobante).findOne({
        where: { id, empresaId, sucursalId: In(sucursalIds) },
        relations: ['lineas', 'pagos'], lock: { mode: 'pessimistic_write' },
      });
      if (!c) throw new NotFoundException('Comprobante no encontrado');
      if (c.estado === EstadoComprobanteEnum.ANULADA) throw new BadRequestException('El comprobante ya está anulado');
      const devolucionesPrevias = await manager.query(
        `SELECT id FROM devolucion_venta WHERE comprobante_id=$1 AND empresa_id=$2 AND estado='REGISTRADA' LIMIT 1`,
        [c.id, empresaId],
      );
      if (devolucionesPrevias.length) {
        throw new BadRequestException('Este comprobante tiene devoluciones registradas. No se puede anular por el flujo simple; requiere una regularización formal para evitar duplicar stock o reembolsos.');
      }

      // Mantener el mismo orden de bloqueo que una venta: caja antes de inventario.
      // Evita un deadlock entre una venta concurrente y la anulación de otro comprobante.
      const medios = c.pagos?.length
        ? c.pagos
        : [{ metodoPago: c.metodoPago, monto: c.total } as any];
      const pagosReembolsables = medios.filter((pago) => pago.metodoPago !== MetodoPagoEnum.CREDITO);
      let cajaReembolso: Caja | null = null;
      if (pagosReembolsables.length) {
        cajaReembolso = await manager.getRepository(Caja).findOne({
          where: { sucursalId: c.sucursalId, usuarioId, estado: EstadoCajaEnum.ABIERTA },
          lock: { mode: 'pessimistic_write' },
        });
        if (!cajaReembolso) {
          throw new BadRequestException('Para anular esta venta y devolver el dinero, abra primero una caja en la misma sucursal');
        }
      }

      const cantidadesDevueltas = new Map<string, { productoId: number; varianteId: number | null; cantidad: number }>();
      for (const linea of c.lineas) {
        const varianteId = linea.varianteId ? Number(linea.varianteId) : null;
        const key = varianteId ? `v:${varianteId}` : `p:${linea.productoId}`;
        const prev = cantidadesDevueltas.get(key);
        cantidadesDevueltas.set(key, {
          productoId: linea.productoId, varianteId,
          cantidad: (prev?.cantidad || 0) + Number(linea.cantidad),
        });
      }
      for (const item of [...cantidadesDevueltas.values()].sort((a, b) =>
        a.productoId - b.productoId || Number(a.varianteId || 0) - Number(b.varianteId || 0))) {
        const { productoId, varianteId, cantidad } = item;
        const saldo = varianteId
          ? await manager.query(
              `SELECT stock FROM producto_variante_stock
               WHERE variante_id=$1 AND producto_id=$2 AND sucursal_id=$3 AND empresa_id=$4 FOR UPDATE`,
              [varianteId, productoId, c.sucursalId, empresaId],
            )
          : await manager.query(
              `SELECT stock FROM producto_stock
               WHERE producto_id=$1 AND sucursal_id=$2 AND empresa_id=$3 FOR UPDATE`,
              [productoId, c.sucursalId, empresaId],
            );
        if (!saldo.length) throw new BadRequestException(`No existe saldo de inventario para ${varianteId ? `la variante ${varianteId}` : `el producto ${productoId}`} en la sucursal de la venta`);
        const stockAnterior = Number(saldo[0].stock);
        const actualizado = varianteId
          ? await manager.query(
              `UPDATE producto_variante_stock SET stock=stock+$1,updated_at=NOW()
               WHERE variante_id=$2 AND producto_id=$3 AND sucursal_id=$4 AND empresa_id=$5 RETURNING stock`,
              [cantidad, varianteId, productoId, c.sucursalId, empresaId],
            )
          : await manager.query(
              `UPDATE producto_stock SET stock=stock+$1,updated_at=NOW()
               WHERE producto_id=$2 AND sucursal_id=$3 AND empresa_id=$4 RETURNING stock`,
              [cantidad, productoId, c.sucursalId, empresaId],
            );
        const asignaciones = await manager.query(
          `SELECT lote_id,cantidad FROM comprobante_lote_salida
           WHERE empresa_id=$1 AND comprobante_id=$2 AND producto_id=$3
             AND variante_id IS NOT DISTINCT FROM $4::int FOR UPDATE`,
          [empresaId, c.id, productoId, varianteId],
        );
        if (asignaciones.length) {
          for (const a of asignaciones) {
            await manager.query('UPDATE inventario_lote SET cantidad_disponible=cantidad_disponible+$1 WHERE id=$2', [a.cantidad, a.lote_id]);
          }
        } else {
          await manager.query(
            `INSERT INTO inventario_lote
              (empresa_id,sucursal_id,producto_id,variante_id,codigo_lote,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario)
             VALUES($1,$2,$3,$4,$5,NULL,$6,$6,0)`,
            [empresaId, c.sucursalId, productoId, varianteId, `ANULACION-${c.id}-${varianteId || productoId}`, cantidad],
          );
        }
        await manager.getRepository(MovimientoInventario).save({
          empresaId, sucursalId: c.sucursalId, productoId, varianteId,
          comprobanteId: c.id, usuarioId, tipo: 'ENTRADA', cantidad,
          stockAnterior, stockPosterior: Number(actualizado[0].stock),
          motivo: `Anulación ${c.serie}-${c.correlativo}: ${razon.slice(0, 140)}`,
        });
      }

      const cuentaCredito = await manager.query(
        `SELECT id,total_credito,saldo_pendiente FROM cuenta_cobrar
         WHERE comprobante_id = $1 AND empresa_id = $2 FOR UPDATE`,
        [c.id, empresaId],
      );
      if (cuentaCredito.length) {
        const saldoCuenta = Number(cuentaCredito[0].saldo_pendiente || 0);
        const totalCuenta = Number(cuentaCredito[0].total_credito || 0);
        const cobrado = redondear2(totalCuenta - saldoCuenta);
        if (cobrado > 0) {
          throw new BadRequestException('Esta venta ya tiene cobranzas aplicadas. Registre primero una devolución o regularización de los importes cobrados.');
        }
        await manager.query(
          `UPDATE cuenta_cobrar SET estado='ANULADA',saldo_pendiente=0,updated_at=NOW() WHERE id=$1`,
          [cuentaCredito[0].id],
        );
        if (saldoCuenta > 0) {
          await manager.query(
            `UPDATE cliente SET saldo_credito=GREATEST(0,saldo_credito-$1) WHERE id=$2 AND empresa_id=$3`,
            [saldoCuenta, c.clienteId, empresaId],
          );
        }
      } else {
        // Compatibilidad de seguridad para comprobantes de crédito anteriores a la migración.
        const creditoHistorico = Number((c.pagos || [])
          .filter((p) => p.metodoPago === MetodoPagoEnum.CREDITO)
          .reduce((sum, p) => sum + Number(p.monto), 0));
        if (creditoHistorico > 0) {
          await manager.query(
            `UPDATE cliente SET saldo_credito=GREATEST(0,saldo_credito-$1) WHERE id=$2 AND empresa_id=$3`,
            [creditoHistorico, c.clienteId, empresaId],
          );
        }
      }

      // Registra el reembolso en la caja que ya quedó bloqueada al inicio de la operación.
      if (pagosReembolsables.length && cajaReembolso) {
        const reembolsoEfectivo = redondear2(pagosReembolsables
          .filter((pago) => pago.metodoPago === MetodoPagoEnum.EFECTIVO)
          .reduce((sum, pago) => sum + Number(pago.monto), 0));
        if (reembolsoEfectivo > 0) {
          const cobros = await manager.query(
            `SELECT COALESCE(SUM(monto), 0)::numeric AS total FROM (
               SELECT cp.monto FROM comprobante_pago cp INNER JOIN comprobante x ON x.id = cp.comprobante_id
               WHERE x.caja_id = $1 AND cp.metodo_pago = 'EFECTIVO'
               UNION ALL
               SELECT x.total AS monto FROM comprobante x
               WHERE x.caja_id = $1 AND x.metodo_pago = 'EFECTIVO'
                 AND NOT EXISTS (SELECT 1 FROM comprobante_pago cp WHERE cp.comprobante_id = x.id)
             ) efectivo`, [cajaReembolso.id],
          );
          const variacion = await manager.query(
            `SELECT COALESCE(SUM(CASE WHEN tipo = 'INGRESO' THEN monto ELSE -monto END), 0)::numeric AS total
             FROM caja_movimiento WHERE caja_id = $1 AND metodo_pago = 'EFECTIVO'`, [cajaReembolso.id],
          );
          const disponible = redondear2(
            Number(cajaReembolso.saldoInicial) + Number(cobros[0]?.total || 0) + Number(variacion[0]?.total || 0),
          );
          if (reembolsoEfectivo > disponible) {
            throw new BadRequestException(`No hay efectivo suficiente para devolver S/ ${reembolsoEfectivo.toFixed(2)}. Disponible en caja: S/ ${disponible.toFixed(2)}`);
          }
        }
        for (const pago of pagosReembolsables) {
          await manager.getRepository(CajaMovimiento).save({
            cajaId: cajaReembolso.id, usuarioId, tipo: 'SALIDA', metodoPago: pago.metodoPago,
            monto: Number(pago.monto), motivo: `Reembolso por anulación ${c.serie}-${c.correlativo}`,
            comprobanteId: c.id,
          });
        }
      }

      c.estado = EstadoComprobanteEnum.ANULADA;
      c.motivoAnulacion = razon;
      await manager.getRepository(Comprobante).save(c);
      return manager.getRepository(Comprobante).findOne({
        where: { id: c.id, empresaId }, relations: ['lineas', 'cliente', 'pagos'],
      }) as Promise<Comprobante>;
    });
    return anulada;
  }
}
