import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MemoryCategory } from './dto/memory.dto';
import { MemoryOrchestratorService } from './memory-orchestrator.service';

@Controller('agent-memory')
@UseGuards(JwtAuthGuard)
export class AgentMemoryController {
  constructor(private readonly memory: MemoryOrchestratorService) {}

  @Get('candidates')
  listCandidates(@CurrentUser('id') userId: string) {
    return this.memory.listCandidates(userId);
  }

  @Post(':factId/confirm')
  confirm(@CurrentUser('id') userId: string, @Param('factId') factId: string) {
    return this.memory.confirm(userId, factId);
  }

  @Post(':factId/reject')
  reject(@CurrentUser('id') userId: string, @Param('factId') factId: string) {
    return this.memory.reject(userId, factId);
  }

  @Post(':factId/expire')
  expire(@CurrentUser('id') userId: string, @Param('factId') factId: string) {
    return this.memory.expire(userId, factId);
  }

  @Post('correct')
  correct(
    @CurrentUser('id') userId: string,
    @Body() body: { category: MemoryCategory; content: string; confidence?: number },
  ) {
    return this.memory.correct(userId, {
      category: body.category,
      content: body.content,
      confidence: body.confidence,
    });
  }
}
