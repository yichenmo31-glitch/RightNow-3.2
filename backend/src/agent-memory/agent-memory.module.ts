import { Module } from '@nestjs/common';
import { AgentMemoryService } from './agent-memory.service';
import { MemoryCandidateService } from './memory-candidate.service';
import { MemoryConflictService } from './memory-conflict.service';
import { MemoryProfileService } from './memory-profile.service';
import { MemorySyncService } from './memory-sync.service';

@Module({
  providers: [
    AgentMemoryService,
    MemoryCandidateService,
    MemoryConflictService,
    MemoryProfileService,
    MemorySyncService,
  ],
  exports: [
    AgentMemoryService,
    MemoryCandidateService,
    MemoryConflictService,
    MemoryProfileService,
    MemorySyncService,
  ],
})
export class AgentMemoryModule {}
