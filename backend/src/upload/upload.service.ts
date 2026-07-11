import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildUploadUrl } from '../common/upload.util';

interface UploadListOptions {
  kind?: string;
  limit?: number;
}

@Injectable()
export class UploadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, options: UploadListOptions) {
    return this.prisma.uploadAsset.findMany({
      where: {
        userId,
        ...(options.kind ? { kind: options.kind } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit,
    });
  }

  async save(userId: string, filename: string, kind: string) {
    return this.prisma.uploadAsset.create({
      data: {
        userId,
        url: buildUploadUrl(filename),
        kind,
      },
    });
  }
}
