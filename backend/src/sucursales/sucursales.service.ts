import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sucursal } from './entities/sucursal.entity';

@Injectable()
export class SucursalesService {
  constructor(@InjectRepository(Sucursal) private readonly repo: Repository<Sucursal>) {}

  findAll(empresaId: number): Promise<Sucursal[]> {
    return this.repo.find({ where: { empresaId }, order: { id: 'ASC' } });
  }

  async findOne(id: number, empresaId: number): Promise<Sucursal> {
    const sucursal = await this.repo.findOne({ where: { id, empresaId } });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    return sucursal;
  }

  async create(empresaId: number, data: Partial<Sucursal>): Promise<Sucursal> {
    const nombre = String(data.nombre || '').trim();
    const direccion = String(data.direccion || '').trim();
    const ubigeo = String(data.ubigeo || '').trim();
    const departamento = String(data.departamento || '').trim();
    const provincia = String(data.provincia || '').trim();
    const distrito = String(data.distrito || '').trim();
    if (!nombre || !direccion || !/^\d{6}$/.test(ubigeo) || !departamento || !provincia || !distrito) {
      throw new BadRequestException('Complete nombre, dirección, ubigeo de 6 dígitos, departamento, provincia y distrito');
    }
    return this.repo.save(this.repo.create({ empresaId, nombre, direccion, ubigeo, departamento, provincia, distrito }));
  }
}
