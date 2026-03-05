import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWeightDto } from './dto/create-weight.dto';

@Injectable()
export class WeightService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, from?: string, to?: string) {
    const where: any = { userId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    return this.prisma.weightRecord.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async create(userId: string, dto: CreateWeightDto) {
    return this.prisma.weightRecord.create({
      data: { ...dto, date: new Date(dto.date), userId },
    });
  }

  async update(userId: string, id: string, dto: CreateWeightDto) {
    await this.ensureOwnership(userId, id);
    return this.prisma.weightRecord.update({
      where: { id },
      data: { ...dto, date: new Date(dto.date) },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwnership(userId, id);
    return this.prisma.weightRecord.delete({ where: { id } });
  }

  private async ensureOwnership(userId: string, id: string) {
    const record = await this.prisma.weightRecord.findUnique({ where: { id } });
    if (!record || record.userId !== userId)
      throw new NotFoundException('Record not found');
  }
}
