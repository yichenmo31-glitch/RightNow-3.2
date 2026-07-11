import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemorySource, MemoryStatus, ReplaceMemoryInput } from './dto/memory.dto';

@Injectable()
export class MemoryConflictService {
  constructor(private readonly prisma: PrismaService) {}

  async replaceConfirmed(input: ReplaceMemoryInput): Promise<unknown> {
    const content = input.content.trim();
    const confirmationSource = input.confirmationSource.trim();
    const confidence = input.confidence ?? 1;
    if (!content || !confirmationSource) {
      throw new BadRequestException('Correction content and confirmation source are required.');
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new BadRequestException('Memory confidence must be between 0 and 1.');
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const replacement = await tx.agentMemoryFact.create({
        data: {
          userId: input.userId,
          category: input.category,
          content,
          source: MemorySource.UserConfirmed,
          confidence,
          status: MemoryStatus.Confirmed,
          observedAt: now,
          confirmedAt: now,
          confirmationSource,
        },
      });
      await tx.agentMemoryFact.updateMany({
        where: {
          userId: input.userId,
          category: input.category,
          status: MemoryStatus.Confirmed,
          id: { not: replacement.id },
        },
        data: {
          status: MemoryStatus.Superseded,
          invalidatedAt: now,
          supersededById: replacement.id,
        },
      });
      return replacement;
    });
  }
}
