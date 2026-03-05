import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
class ImageGenService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, data: {
    sourceImageUrl?: string;
    targetStyle?: string;
    prompt?: string;
  }) {
    return this.prisma.imageGenTask.create({
      data: { userId, ...data, status: 'pending' },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.imageGenTask.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async findOne(id: string, userId: string) {
    return this.prisma.imageGenTask.findFirst({
      where: { id, userId },
    });
  }

  async updateStatus(id: string, data: {
    status: string;
    resultImageUrl?: string;
    errorMessage?: string;
  }) {
    return this.prisma.imageGenTask.update({
      where: { id },
      data,
    });
  }
}

@Controller('image-gen')
@UseGuards(JwtAuthGuard)
class ImageGenController {
  constructor(private readonly service: ImageGenService) {}

  @Post()
  create(
    @CurrentUser() user: { sub: string },
    @Body() body: { sourceImageUrl?: string; targetStyle?: string; prompt?: string },
  ) {
    return this.service.create(user.sub, body);
  }

  @Get()
  list(@CurrentUser() user: { sub: string }) {
    return this.service.findByUser(user.sub);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.service.findOne(id, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { status: string; resultImageUrl?: string; errorMessage?: string },
  ) {
    return this.service.updateStatus(id, body);
  }
}

@Module({
  controllers: [ImageGenController],
  providers: [ImageGenService],
})
export class ImageGenModule {}
