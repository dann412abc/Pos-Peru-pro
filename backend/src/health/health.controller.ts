import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('Health')
@Controller('api/health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Estado del servicio y disponibilidad de PostgreSQL (sin exponer errores internos)' })
  async check(@Res({ passthrough: true }) response: Response) {
    let baseDeDatos: 'ok' | 'error' = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      // No devolver mensajes del driver: pueden revelar host, base, usuario o detalles internos.
      baseDeDatos = 'error';
      response.status(503);
    }
    return {
      status: baseDeDatos === 'ok' ? 'up' : 'degraded',
      servicio: 'mi-carrito-pos-backend',
      baseDeDatos,
      hora: new Date().toISOString(),
    };
  }
}
