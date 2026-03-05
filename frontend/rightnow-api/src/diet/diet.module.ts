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
class DietService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, date?: string) {
    const records = await this.prisma.dietRecord.findMany({
      where: {
        userId,
        ...(date ? { date } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return records.map((record) => this.mapRecord(record));
  }

  async summary(userId: string, date?: string) {
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const records = await this.prisma.dietRecord.findMany({
      where: {
        userId,
        date: targetDate,
      },
    });

    return records.reduce(
      (accumulator, record) => ({
        totalCalories: accumulator.totalCalories + record.calories,
        totalFat: accumulator.totalFat + (record.fat || 0),
        totalProtein: accumulator.totalProtein + (record.protein || 0),
        totalCarbs: accumulator.totalCarbs + (record.carbs || 0),
      }),
      {
        totalCalories: 0,
        totalFat: 0,
        totalProtein: 0,
        totalCarbs: 0,
      },
    );
  }

  async create(
    userId: string,
    body: {
      name: string;
      calories?: number;
      fat?: number;
      protein?: number;
      carbs?: number;
      date?: string;
      mealType?: string;
    },
  ) {
    if (!body.name?.trim()) {
      throw new BadRequestException('name is required');
    }

    const record = await this.prisma.dietRecord.create({
      data: {
        userId,
        name: body.name.trim(),
        calories: this.parseInteger(body.calories, 0),
        fat: this.parseOptionalNumber(body.fat),
        protein: this.parseOptionalNumber(body.protein),
        carbs: this.parseOptionalNumber(body.carbs),
        date: body.date || new Date().toISOString().slice(0, 10),
        mealType: body.mealType?.trim() || null,
      },
    });

    return this.mapRecord(record);
  }

  async update(
    userId: string,
    id: string,
    body: {
      name?: string;
      calories?: number;
      fat?: number;
      protein?: number;
      carbs?: number;
      date?: string;
      mealType?: string;
    },
  ) {
    const existing = await this.prisma.dietRecord.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('Diet record not found');
    }

    const record = await this.prisma.dietRecord.update({
      where: { id },
      data: {
        name: body.name?.trim() || undefined,
        calories:
          body.calories === undefined
            ? undefined
            : this.parseInteger(body.calories, existing.calories),
        fat:
          body.fat === undefined ? undefined : this.parseOptionalNumber(body.fat),
        protein:
          body.protein === undefined
            ? undefined
            : this.parseOptionalNumber(body.protein),
        carbs:
          body.carbs === undefined
            ? undefined
            : this.parseOptionalNumber(body.carbs),
        date: body.date || undefined,
        mealType: body.mealType === undefined ? undefined : body.mealType || null,
      },
    });

    return this.mapRecord(record);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.dietRecord.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('Diet record not found');
    }

    await this.prisma.dietRecord.delete({
      where: { id },
    });

    return { deleted: true };
  }

  private parseInteger(value: unknown, fallback: number): number {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException('calories must be a non-negative integer');
    }
    return parsed;
  }

  private parseOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('nutrition values must be numeric');
    }
    return parsed;
  }

  private mapRecord(record: {
    id: string;
    name: string;
    calories: number;
    fat: number | null;
    protein: number | null;
    carbs: number | null;
    date: string;
    mealType: string | null;
  }) {
    return {
      id: record.id,
      name: record.name,
      calories: record.calories,
      fat: record.fat ?? undefined,
      protein: record.protein ?? undefined,
      carbs: record.carbs ?? undefined,
      date: record.date,
      mealType: record.mealType ?? undefined,
    };
  }
}

@Controller('diet')
@UseGuards(JwtAuthGuard)
class DietController {
  constructor(private readonly dietService: DietService) {}

  @Get()
  list(@CurrentUser() user: { sub: string }, @Query('date') date?: string) {
    return this.dietService.list(user.sub, date);
  }

  @Get('summary')
  summary(@CurrentUser() user: { sub: string }, @Query('date') date?: string) {
    return this.dietService.summary(user.sub, date);
  }

  @Post()
  create(
    @CurrentUser() user: { sub: string },
    @Body()
    body: {
      name: string;
      calories?: number;
      fat?: number;
      protein?: number;
      carbs?: number;
      date?: string;
      mealType?: string;
    },
  ) {
    return this.dietService.create(user.sub, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      calories?: number;
      fat?: number;
      protein?: number;
      carbs?: number;
      date?: string;
      mealType?: string;
    },
  ) {
    return this.dietService.update(user.sub, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.dietService.remove(user.sub, id);
  }
}

@Module({
  controllers: [DietController],
  providers: [DietService],
})
export class DietModule {}
