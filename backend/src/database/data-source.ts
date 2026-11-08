import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from '../common/database/snake-naming.strategy';

dotenv.config();

if ((process.env.NODE_ENV || 'development') === 'production') {
  const required = ['DB_HOST', 'DB_USERNAME', 'DB_DATABASE', 'DB_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CORS_ORIGIN'];
  const missing = required.filter((key) => !process.env[key] || process.env[key]!.trim().length < (key.startsWith('JWT_') ? 32 : 1));
  if (missing.length) throw new Error(`Faltan variables obligatorias para producción: ${missing.join(', ')}`);
  const dbHost = (process.env.DB_HOST || '').toLowerCase();
  const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
  if (!(dbHost.endsWith('.supabase.co') || dbHost.endsWith('.pooler.supabase.com'))) {
    throw new Error('Producción debe conectarse a un host PostgreSQL de Supabase (DB_HOST).');
  }
  if (dbPort === 6543) {
    throw new Error('No uses el pooler en modo transacción (puerto 6543) con NestJS/TypeORM; usa conexión directa o Session pooler en 5432.');
  }
  if (process.env.DB_SSL !== 'true') {
    throw new Error('DB_SSL=true es obligatorio para conectar con Supabase en producción.');
  }
  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) throw new Error('Los secretos JWT deben ser diferentes');
}

/**
 * DataSource de TypeORM (usado por CLI de migraciones y seed).
 * Las entidades se referencian por ruta para que el CLI las cargue.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'micarrito',
  password: process.env.DB_PASSWORD || 'micarrito_secret',
  database: process.env.DB_DATABASE || 'mi_carrito_pos',
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
  namingStrategy: new SnakeNamingStrategy(),
  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: false,
});
