import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTodoDto, UpdateTodoDto } from './dto/create-todo.dto';

@Injectable()
export class TodoService {
  constructor(private prisma: PrismaService) {}

  async findByDate(userId: string, date?: string) {
    const where: any = { userId };
    if (date) {
      const d = new Date(date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.date = { gte: d, lt: next };
    }
    return this.prisma.todoItem.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, dto: CreateTodoDto) {
    return this.prisma.todoItem.create({
      data: {
        title: dto.title,
        category: dto.category,
        date: new Date(dto.date),
        userId,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateTodoDto) {
    await this.ensureOwnership(userId, id);
    return this.prisma.todoItem.update({
      where: { id },
      data: dto,
    });
  }

  async toggle(userId: string, id: string) {
    const item = await this.ensureOwnership(userId, id);
    return this.prisma.todoItem.update({
      where: { id },
      data: { completed: !item.completed },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwnership(userId, id);
    return this.prisma.todoItem.delete({ where: { id } });
  }

  private async ensureOwnership(userId: string, id: string) {
    const item = await this.prisma.todoItem.findUnique({ where: { id } });
    if (!item || item.userId !== userId)
      throw new NotFoundException('Todo not found');
    return item;
  }
}
