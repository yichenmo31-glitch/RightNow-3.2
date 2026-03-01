import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
class TodosService {
  private readonly defaultTodos = [
    { title: 'Log meals', category: 'diet' },
    { title: 'Drink more water', category: 'water' },
    { title: 'Complete training plan', category: 'training' },
  ];

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, date?: string) {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    await this.ensureDefaults(userId, targetDate);

    const records = await this.prisma.todo.findMany({
      where: {
        userId,
        date: targetDate,
      },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((record) => this.mapRecord(record));
  }

  async create(userId: string, body: { title: string; category: string; date?: string }) {
    if (!body.title?.trim()) {
      throw new BadRequestException('title is required');
    }
    if (!body.category?.trim()) {
      throw new BadRequestException('category is required');
    }

    const record = await this.prisma.todo.create({
      data: {
        userId,
        title: body.title.trim(),
        category: body.category.trim(),
        date: body.date || new Date().toISOString().slice(0, 10),
      },
    });

    return this.mapRecord(record);
  }

  async update(
    userId: string,
    id: string,
    body: { title?: string; category?: string; completed?: boolean },
  ) {
    const existing = await this.prisma.todo.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('Todo not found');
    }

    const record = await this.prisma.todo.update({
      where: { id },
      data: {
        title: body.title?.trim() || undefined,
        category: body.category?.trim() || undefined,
        completed:
          typeof body.completed === 'boolean' ? body.completed : undefined,
      },
    });

    return this.mapRecord(record);
  }

  async toggle(userId: string, id: string) {
    const existing = await this.prisma.todo.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('Todo not found');
    }

    const record = await this.prisma.todo.update({
      where: { id },
      data: {
        completed: !existing.completed,
      },
    });

    return this.mapRecord(record);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.todo.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('Todo not found');
    }

    await this.prisma.todo.delete({
      where: { id },
    });

    return { deleted: true };
  }

  private async ensureDefaults(userId: string, date: string) {
    const count = await this.prisma.todo.count({
      where: { userId, date },
    });

    if (count > 0) {
      return;
    }

    await this.prisma.todo.createMany({
      data: this.defaultTodos.map((item) => ({
        userId,
        date,
        title: item.title,
        category: item.category,
      })),
    });
  }

  private mapRecord(record: {
    id: string;
    title: string;
    category: string;
    date: string;
    completed: boolean;
  }) {
    return {
      id: record.id,
      title: record.title,
      category: record.category,
      date: record.date,
      completed: record.completed,
    };
  }
}

@Controller('todos')
@UseGuards(JwtAuthGuard)
class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  list(@CurrentUser() user: { sub: string }, @Query('date') date?: string) {
    return this.todosService.list(user.sub, date);
  }

  @Post()
  create(
    @CurrentUser() user: { sub: string },
    @Body() body: { title: string; category: string; date?: string },
  ) {
    return this.todosService.create(user.sub, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() body: { title?: string; category?: string; completed?: boolean },
  ) {
    return this.todosService.update(user.sub, id, body);
  }

  @Patch(':id/toggle')
  toggle(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.todosService.toggle(user.sub, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.todosService.remove(user.sub, id);
  }
}

@Module({
  controllers: [TodosController],
  providers: [TodosService],
})
export class TodosModule {}
