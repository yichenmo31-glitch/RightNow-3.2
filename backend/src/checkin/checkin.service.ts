import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckInDto } from './dto/create-checkin.dto';

@Injectable()
export class CheckInService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, from?: string, to?: string) {
    const where: any = { userId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    return this.prisma.checkIn.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async create(userId: string, dto: CreateCheckInDto) {
    return this.prisma.checkIn.create({
      data: { ...dto, userId },
    });
  }

  async latest(userId: string) {
    return this.prisma.checkIn.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });
  }
}
