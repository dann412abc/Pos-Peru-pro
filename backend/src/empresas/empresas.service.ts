import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from './entities/empresa.entity';
import { esRucValido } from '../common/utils/documento.validator';

@Injectable()
export class EmpresasService {
  constructor(@InjectRepository(Empresa) private readonly repo: Repository<Empresa>) {}

  async create(data: Partial<Empresa>): Promise<Empresa> {
    if (!esRucValido(data.ruc || '')) throw new BadRequestException('RUC inválido: verifica los 11 dígitos, prefijo y dígito verificador');
    return this.repo.save(this.repo.create(data));
  }

  async actualizar(empresaId: number, data: Partial<Empresa>): Promise<Empresa> {
    if (data.ruc && !esRucValido(data.ruc)) throw new BadRequestException('RUC inválido: verifica los 11 dígitos, prefijo y dígito verificador');
    const empresa = await this.repo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    Object.assign(empresa, data);
    return this.repo.save(empresa);
  }

  findAll(empresaId: number): Promise<Empresa[]> {
    return this.repo.find({ where: { id: empresaId } });
  }

  async findOne(id: number, empresaId: number): Promise<Empresa> {
    if (id !== empresaId) throw new NotFoundException('Empresa no encontrada');
    const e = await this.repo.findOne({ where: { id: empresaId }, relations: ['sucursales'] });
    if (!e) throw new NotFoundException('Empresa no encontrada');
    return e;
  }
}
