import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async history(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [total, descending] = await Promise.all([
      this.prisma.chatMessage.count({ where: { userId } }),
      this.prisma.chatMessage.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
    ]);

    const records = descending.reverse();

    return {
      data: records.map((record) => this.mapRecord(record)),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async send(userId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException('content is required');
    }

    await this.prisma.chatMessage.create({
      data: {
        userId,
        role: 'user',
        content: trimmed,
      },
    });

    const reply = await this.prisma.chatMessage.create({
      data: {
        userId,
        role: 'assistant',
        content: this.generateReply(trimmed),
      },
    });

    return this.mapRecord(reply);
  }

  private generateReply(content: string): string {
    const lower = content.toLowerCase();

    if (lower.includes('diet') || lower.includes('meal') || lower.includes('protein')) {
      return 'Keep protein high, keep meals simple, and aim for consistency over perfection today.';
    }

    if (lower.includes('cardio') || lower.includes('run') || lower.includes('fat')) {
      return 'Use a moderate effort pace first. Add 10 to 15 minutes only if recovery stays good.';
    }

    if (lower.includes('strength') || lower.includes('bench') || lower.includes('squat')) {
      return 'Stay one or two reps away from failure on the first working sets, then push the final set harder.';
    }

    return 'Focus on one clear win for today: complete the next workout, log the result, and adjust after that.';
  }

  private mapRecord(record: {
    id: string;
    role: string;
    content: string;
    createdAt: Date;
  }) {
    return {
      id: record.id,
      role: record.role as 'user' | 'assistant',
      content: record.content,
      createdAt: record.createdAt.toISOString(),
    };
  }
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  history(
    @CurrentUser() user: { sub: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.history(
      user.sub,
      Number.parseInt(page || '1', 10),
      Number.parseInt(limit || '20', 10),
    );
  }

  @Post()
  send(@CurrentUser() user: { sub: string }, @Body() body: { content: string }) {
    return this.chatService.send(user.sub, body.content);
  }
}

@Module({
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
