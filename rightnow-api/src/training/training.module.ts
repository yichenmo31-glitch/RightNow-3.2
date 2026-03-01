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
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
class TrainingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, date?: string) {
    const records = await this.prisma.trainingRecord.findMany({
      where: {
        userId,
        ...(date ? { date } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return records.map((record) => this.mapRecord(record));
  }

  async create(
    userId: string,
    body: { description?: string; duration?: number; photoUrl?: string; date?: string },
  ) {
    const description = body.description?.trim() || 'Workout completed';
    const duration = this.parseOptionalInteger(body.duration);

    const record = await this.prisma.trainingRecord.create({
      data: {
        userId,
        description,
        duration,
        photoUrl: body.photoUrl?.trim() || null,
        date: body.date || new Date().toISOString().slice(0, 10),
      },
    });

    return this.mapRecord(record);
  }

  async update(
    userId: string,
    id: string,
    body: { description?: string; duration?: number; photoUrl?: string; date?: string },
  ) {
    const existing = await this.prisma.trainingRecord.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('Training record not found');
    }

    const record = await this.prisma.trainingRecord.update({
      where: { id },
      data: {
        description: body.description?.trim() || undefined,
        duration:
          body.duration === undefined
            ? undefined
            : this.parseOptionalInteger(body.duration),
        photoUrl:
          body.photoUrl === undefined ? undefined : body.photoUrl?.trim() || null,
        date: body.date || undefined,
      },
    });

    return this.mapRecord(record);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.trainingRecord.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('Training record not found');
    }

    await this.prisma.trainingRecord.delete({
      where: { id },
    });

    return { deleted: true };
  }

  private parseOptionalInteger(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException('duration must be a non-negative integer');
    }
    return parsed;
  }

  private mapRecord(record: {
    id: string;
    description: string;
    duration: number | null;
    photoUrl: string | null;
    date: string;
  }) {
    return {
      id: record.id,
      description: record.description,
      duration: record.duration ?? undefined,
      photoUrl: record.photoUrl ?? undefined,
      date: record.date,
    };
  }
}

@Controller('training')
@UseGuards(JwtAuthGuard)
class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Get()
  list(@CurrentUser() user: { sub: string }, @Query('date') date?: string) {
    return this.trainingService.list(user.sub, date);
  }

  @Post()
  create(
    @CurrentUser() user: { sub: string },
    @Body()
    body: { description?: string; duration?: number; photoUrl?: string; date?: string },
  ) {
    return this.trainingService.create(user.sub, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body()
    body: { description?: string; duration?: number; photoUrl?: string; date?: string },
  ) {
    return this.trainingService.update(user.sub, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.trainingService.remove(user.sub, id);
  }
}

@Module({
  controllers: [TrainingController],
  providers: [TrainingService],
})
export class TrainingModule {}
