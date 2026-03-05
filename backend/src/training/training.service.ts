import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTrainingDto } from './dto/create-training.dto';

@Injectable()
export class TrainingService {
  constructor(private prisma: PrismaService) {}

  async findByDate(userId: string, date?: string) {
    const where: any = { userId };
    if (date) {
      const d = new Date(date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.date = { gte: d, lt: next };
    }
    return this.prisma.trainingLog.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async create(userId: string, dto: CreateTrainingDto) {
    return this.prisma.trainingLog.create({
      data: { ...dto, date: new Date(dto.date), userId },
    });
  }

  async update(userId: string, id: string, dto: CreateTrainingDto) {
    await this.ensureOwnership(userId, id);
    return this.prisma.trainingLog.update({
      where: { id },
      data: { ...dto, date: new Date(dto.date) },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwnership(userId, id);
    return this.prisma.trainingLog.delete({ where: { id } });
  }

  private async ensureOwnership(userId: string, id: string) {
    const record = await this.prisma.trainingLog.findUnique({ where: { id } });
    if (!record || record.userId !== userId)
      throw new NotFoundException('Training log not found');
  }
}
