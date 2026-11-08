import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Categoria } from './entities/categoria.entity';

@Injectable()
export class CategoriasService {
  constructor(@InjectRepository(Categoria) private readonly repo: Repository<Categoria>) {}

  findAll(empresaId: number) {
    return this.repo.find({ where: { empresaId, activo: true }, order: { nombre: 'ASC' } });
  }

  async findOne(id: number, empresaId: number) {
    const categoria = await this.repo.findOne({ where: { id, empresaId, activo: true } });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');
    return categoria;
  }

  async create(empresaId: number, nombre: string) {
    const limpio = String(nombre || '').trim();
    if (!limpio || limpio.length > 100) throw new BadRequestException('Nombre de categoría obligatorio (máximo 100 caracteres)');
    const existente = await this.repo.findOne({ where: { empresaId, nombre: limpio } });
    if (existente) return existente;
    return this.repo.save(this.repo.create({ empresaId, nombre: limpio, activo: true }));
  }
}
