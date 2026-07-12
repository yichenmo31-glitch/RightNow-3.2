import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushService } from '../common/push.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { AgentMemoryModule } from '../agent-memory/agent-memory.module';
import { AgentModule } from '../agent/agent.module';
import { DietModule } from '../diet/diet.module';
import { TodayPlanQueryService } from './today-plan-query.service';

@Module({
  imports: [PrismaModule, OpenClawModule, AgentMemoryModule, AgentModule, DietModule],
  controllers: [ChatController],
  providers: [ChatService, PushService, TodayPlanQueryService],
  exports: [ChatService],
})
export class ChatModule {}
