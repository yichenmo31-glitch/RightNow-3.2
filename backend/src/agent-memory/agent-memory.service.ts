import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentMemoryFact } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmMemoryInput,
  MemoryCandidate,
  MemoryCategory,
  MemorySource,
  MemoryStatus,
} from './dto/memory.dto';

const RISK_CATEGORIES = new Set<MemoryCategory>([
  MemoryCategory.HealthRisk,
  MemoryCategory.Allergy,
  MemoryCategory.ExecutionAuthorization,
]);

@Injectable()
export class AgentMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async createCandidate(userId: string, candidate: MemoryCandidate): Promise<unknown> {
    this.assertConfidence(candidate.confidence);
    return this.prisma.agentMemoryFact.create({
      data: {
        userId,
        category: candidate.category,
        content: candidate.content.trim(),
        source: candidate.source,
        confidence: candidate.confidence,
        status: MemoryStatus.Candidate,
      },
    });
  }

  async confirm(input: ConfirmMemoryInput): Promise<unknown> {
    const fact = await this.findOwnedCandidate(input.userId, input.factId);
    if (RISK_CATEGORIES.has(fact.category as MemoryCategory)) {
      if (input.source !== MemorySource.UserConfirmed || !input.confirmationSource?.trim()) {
        throw new BadRequestException('Risk-sensitive memory requires explicit user confirmation.');
      }
    }

    return this.prisma.agentMemoryFact.update({
      where: { id: input.factId },
      data: {
        status: MemoryStatus.Confirmed,
        source: input.source,
        confirmedAt: new Date(),
        confirmationSource: input.confirmationSource?.trim() || null,
      },
    });
  }

  async reject(userId: string, factId: string): Promise<unknown> {
    await this.findOwnedCandidate(userId, factId);
    return this.prisma.agentMemoryFact.update({
      where: { id: factId },
      data: { status: MemoryStatus.Rejected, invalidatedAt: new Date() },
    });
  }

  async expire(userId: string, factId: string): Promise<unknown> {
    const fact = await this.findOwned(userId, factId);
    if (
      fact.status !== MemoryStatus.Candidate &&
      fact.status !== MemoryStatus.Confirmed
    ) {
      throw new BadRequestException(`Cannot expire memory in ${fact.status} status.`);
    }
    return this.prisma.agentMemoryFact.update({
      where: { id: factId },
      data: { status: MemoryStatus.Expired, invalidatedAt: new Date() },
    });
  }

  private async findOwnedCandidate(userId: string, factId: string): Promise<AgentMemoryFact> {
    const fact = await this.findOwned(userId, factId);
    if (fact.status !== MemoryStatus.Candidate) {
      throw new BadRequestException(`Cannot transition memory from ${fact.status}.`);
    }
    return fact;
  }

  private async findOwned(userId: string, factId: string): Promise<AgentMemoryFact> {
    const fact = await this.prisma.agentMemoryFact.findFirst({ where: { id: factId, userId } });
    if (!fact) throw new NotFoundException('Memory fact not found.');
    return fact;
  }

  private assertConfidence(confidence: number): void {
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new BadRequestException('Memory confidence must be between 0 and 1.');
    }
  }
}
