import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDietDto } from './dto/create-diet.dto';

@Injectable()
export class DietService {
  constructor(private prisma: PrismaService) {}

  async findByDate(userId: string, date?: string) {
    const where: any = { userId };
    if (date) {
      const d = new Date(date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.date = { gte: d, lt: next };
    }
    return this.prisma.foodEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateDietDto) {
    return this.prisma.foodEntry.create({
      data: { ...dto, date: new Date(dto.date), userId },
    });
  }

  async update(userId: string, id: string, dto: CreateDietDto) {
    await this.ensureOwnership(userId, id);
    return this.prisma.foodEntry.update({
      where: { id },
      data: { ...dto, date: new Date(dto.date) },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwnership(userId, id);
    return this.prisma.foodEntry.delete({ where: { id } });
  }

  async summary(userId: string, date: string) {
    const d = new Date(date);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const entries = await this.prisma.foodEntry.findMany({
      where: { userId, date: { gte: d, lt: next } },
    });
    return {
      totalCalories: entries.reduce((s, e) => s + e.calories, 0),
      totalFat: entries.reduce((s, e) => s + (e.fat || 0), 0),
      totalProtein: entries.reduce((s, e) => s + (e.protein || 0), 0),
      totalCarbs: entries.reduce((s, e) => s + (e.carbs || 0), 0),
      count: entries.length,
    };
  }

  private async ensureOwnership(userId: string, id: string) {
    const record = await this.prisma.foodEntry.findUnique({ where: { id } });
    if (!record || record.userId !== userId)
      throw new NotFoundException('Entry not found');
  }
}
