import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryStatus } from './dto/memory.dto';

interface ProfileContent {
  facts: Array<{ category: string; content: string }>;
}

@Injectable()
export class MemoryProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async synchronize(userId: string): Promise<unknown> {
    return this.prisma.$transaction(async (tx) => {
      const facts = await tx.agentMemoryFact.findMany({
        where: { userId, status: MemoryStatus.Confirmed },
        orderBy: [{ category: 'asc' }, { confirmedAt: 'asc' }, { id: 'asc' }],
        select: { category: true, content: true },
      });
      const content: ProfileContent = { facts };
      const profiles = tx.agentMemoryProfile;
      const current = await profiles.findUnique({ where: { userId } });

      if (current && this.sameContent(current.content, content)) return current;

      return profiles.upsert({
        where: { userId },
        create: {
          userId,
          content: content as unknown as Prisma.InputJsonValue,
          memoryVersion: 1,
          lastSyncedAt: new Date(),
        },
        update: {
          content: content as unknown as Prisma.InputJsonValue,
          memoryVersion: { increment: 1 },
          lastSyncedAt: new Date(),
        },
      });
    });
  }

  private sameContent(left: unknown, right: ProfileContent): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }
}
