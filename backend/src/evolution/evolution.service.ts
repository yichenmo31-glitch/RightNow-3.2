import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEvolutionDto } from './dto/create-evolution.dto';

@Injectable()
export class EvolutionService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.evolutionPhoto.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, photoUrl: string, dto: CreateEvolutionDto) {
    return this.prisma.evolutionPhoto.create({
      data: { ...dto, photoUrl, userId },
    });
  }

  async update(userId: string, id: string, dto: CreateEvolutionDto) {
    await this.ensureOwnership(userId, id);
    return this.prisma.evolutionPhoto.update({
      where: { id },
      data: dto,
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwnership(userId, id);
    return this.prisma.evolutionPhoto.delete({ where: { id } });
  }

  private async ensureOwnership(userId: string, id: string) {
    const record = await this.prisma.evolutionPhoto.findUnique({ where: { id } });
    if (!record || record.userId !== userId)
      throw new NotFoundException('Photo not found');
  }
}
