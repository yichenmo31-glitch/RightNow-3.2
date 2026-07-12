import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OpenClawProvisioningService } from '../openclaw/openclaw-provisioning.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentMemoryService } from './agent-memory.service';
import { MemoryCategory, MemorySource } from './dto/memory.dto';
import { MemoryConflictService } from './memory-conflict.service';
import { MemoryCandidateService } from './memory-candidate.service';
import { MemoryProfileService } from './memory-profile.service';
import { MemorySyncService } from './memory-sync.service';

export interface MemoryMutationResult {
  fact: unknown;
  profileUpdated: boolean;
  workspaceSynced: boolean;
}

@Injectable()
export class MemoryOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly facts: AgentMemoryService,
    private readonly conflicts: MemoryConflictService,
    private readonly profiles: MemoryProfileService,
    private readonly provisioning: OpenClawProvisioningService,
    private readonly memorySync: MemorySyncService,
    private readonly candidates: MemoryCandidateService,
  ) {}

  async captureCandidates(userId: string, message: string): Promise<number> {
    const candidates = this.candidates.extract(message);
    for (const candidate of candidates) {
      await this.facts.createCandidate(userId, candidate);
    }
    return candidates.length;
  }

  listCandidates(userId: string): Promise<unknown> {
    return this.facts.listCandidates(userId);
  }

  async confirm(userId: string, factId: string): Promise<MemoryMutationResult> {
    const fact = await this.facts.confirm({
      userId,
      factId,
      source: MemorySource.UserConfirmed,
      confirmationSource: this.confirmationSource('confirm'),
    });
    return this.finish(userId, fact);
  }

  async reject(userId: string, factId: string): Promise<MemoryMutationResult> {
    return this.finish(userId, await this.facts.reject(userId, factId));
  }

  async expire(userId: string, factId: string): Promise<MemoryMutationResult> {
    return this.finish(userId, await this.facts.expire(userId, factId));
  }

  async correct(
    userId: string,
    input: { category: MemoryCategory; content: string; confidence?: number },
  ): Promise<MemoryMutationResult> {
    if (!Object.values(MemoryCategory).includes(input.category)) {
      throw new BadRequestException('Invalid memory category.');
    }
    const fact = await this.conflicts.replaceConfirmed({
      userId,
      category: input.category,
      content: input.content,
      confidence: input.confidence,
      confirmationSource: this.confirmationSource('correct'),
    });
    return this.finish(userId, fact);
  }

  private async finish(userId: string, fact: unknown): Promise<MemoryMutationResult> {
    const before = await this.prisma.agentMemoryProfile.findUnique({
      where: { userId },
      select: { memoryVersion: true },
    });
    const profile = await this.profiles.synchronize(userId) as { memoryVersion?: number };
    const profileUpdated = before?.memoryVersion !== profile?.memoryVersion;
    let workspaceSynced = false;
    try {
      await this.provisioning.ensureAgent(userId);
      await this.memorySync.synchronize(userId);
      workspaceSynced = true;
    } catch {
      // PostgreSQL remains authoritative; callers receive the explicit sync state.
    }
    return { fact, profileUpdated, workspaceSynced };
  }

  private confirmationSource(action: 'confirm' | 'correct'): string {
    return `memory-${action}:${randomUUID()}`;
  }
}
