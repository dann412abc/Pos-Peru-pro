import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { SnakeNamingStrategy } from './common/database/snake-naming.strategy';
import { AppConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { EmpresasModule } from './empresas/empresas.module';
import { SucursalesModule } from './sucursales/sucursales.module';
import { CategoriasModule } from './categorias/categorias.module';
import { ProductosModule } from './productos/productos.module';
import { ClientesModule } from './clientes/clientes.module';
import { VentasModule } from './ventas/ventas.module';
import { CajaModule } from './caja/caja.module';
import { FeModule } from './fe/fe.module';
import { HealthModule } from './health/health.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { InventarioModule } from './inventario/inventario.module';
import { ComprasModule } from './compras/compras.module';
import { DevolucionesModule } from './devoluciones/devoluciones.module';
import { GastosModule } from './gastos/gastos.module';

@Module({
  imports: [
    AppConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.database'),
        ssl: config.get('database.ssl'),
        autoLoadEntities: true,
        synchronize: false,
        namingStrategy: new SnakeNamingStrategy(),
        retryAttempts: 3,
        retryDelay: 3000,
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
          retryStrategy: (times: number) => Math.min(times * 2000, 15000),
        },
      }),
    }),
    AuthModule,
    UsuariosModule,
    EmpresasModule,
    SucursalesModule,
    CategoriasModule,
    ProductosModule,
    ClientesModule,
    VentasModule,
    CajaModule,
    FeModule,
    HealthModule,
    NotificacionesModule,
    InventarioModule,
    ComprasModule,
    DevolucionesModule,
    GastosModule,
  ],
})
export class AppModule {}
