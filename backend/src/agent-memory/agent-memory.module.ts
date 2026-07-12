import { Module } from '@nestjs/common';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { AgentMemoryService } from './agent-memory.service';
import { MemoryCandidateService } from './memory-candidate.service';
import { MemoryConflictService } from './memory-conflict.service';
import { MemoryProfileService } from './memory-profile.service';
import { MemorySyncService } from './memory-sync.service';
import { AgentMemoryController } from './agent-memory.controller';
import { MemoryOrchestratorService } from './memory-orchestrator.service';

@Module({
  imports: [OpenClawModule],
  controllers: [AgentMemoryController],
  providers: [
    AgentMemoryService,
    MemoryCandidateService,
    MemoryConflictService,
    MemoryProfileService,
    MemorySyncService,
    MemoryOrchestratorService,
  ],
  exports: [
    AgentMemoryService,
    MemoryCandidateService,
    MemoryConflictService,
    MemoryProfileService,
    MemorySyncService,
    MemoryOrchestratorService,
  ],
})
export class AgentMemoryModule {}
