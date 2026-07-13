import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OpenClawProvisioningService } from '../openclaw/openclaw-provisioning.service';
import { UploadQuarantineService } from './upload-quarantine.service';

@Injectable()
export class AccountDeletionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountDeletionWorker.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly provisioning: OpenClawProvisioningService,
    private readonly uploads: UploadQuarantineService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('ACCOUNT_DELETION_WORKER_ENABLED') !== 'true') return;
    const configured = Number(this.config.get<string>('ACCOUNT_DELETION_WORKER_INTERVAL_MS') || 5000);
    const intervalMs = Number.isFinite(configured) ? Math.max(1000, Math.min(configured, 60000)) : 5000;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processNext(): Promise<boolean> {
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    const candidate = await this.prisma.accountDeletionJob.findFirst({
      where: {
        OR: [
          { status: { in: ['REQUESTED', 'FAILED_RETRYABLE', 'EXTERNAL_QUARANTINED', 'DB_PURGE', 'FINALIZING'] } },
          { status: 'EXTERNAL_CLEANUP', updatedAt: { lt: staleBefore } },
        ],
      },
      orderBy: { requestedAt: 'asc' },
    });
    if (!candidate) return false;
    const claimed = await this.prisma.accountDeletionJob.updateMany({
      where: { id: candidate.id, status: candidate.status, updatedAt: candidate.updatedAt },
      data: { status: 'EXTERNAL_CLEANUP', attempts: { increment: 1 }, lastErrorCode: null },
    });
    if (claimed.count !== 1) return false;
    await this.processJob(candidate.id);
    return true;
  }

  async processJob(jobId: string): Promise<void> {
    const job = await this.prisma.accountDeletionJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === 'COMPLETED') return;
    try {
      if (!job.externalCompletedAt) {
        await this.provisioning.deprovisionUserAgent(job.userId, job.externalOperationId);
        await this.uploads.quarantineUserUploads(job.userId, job.externalOperationId);
        await this.prisma.accountDeletionJob.update({
          where: { id: job.id },
          data: { status: 'EXTERNAL_QUARANTINED', externalCompletedAt: new Date(), lastErrorCode: null },
        });
      }

      const refreshed = await this.prisma.accountDeletionJob.findUnique({ where: { id: job.id } });
      if (!refreshed || refreshed.status === 'COMPLETED') return;
      if (!refreshed.dbPurgedAt) {
        await this.prisma.accountDeletionJob.update({ where: { id: job.id }, data: { status: 'DB_PURGE' } });
        await this.prisma.$transaction(async (tx) => {
          await tx.agentAuditLog.updateMany({
            where: { userId: job.userId },
            data: { userId: null, channelUserId: null, argsDigest: null },
          });
          await tx.wechatBindCode.deleteMany({ where: { userId: job.userId } });
          await tx.user.delete({ where: { id: job.userId } });
          await tx.accountDeletionJob.update({
            where: { id: job.id },
            data: { status: 'FINALIZING', dbPurgedAt: new Date(), lastErrorCode: null },
          });
        });
      }
      await this.prisma.accountDeletionJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', completedAt: new Date(), lastErrorCode: null },
      });
    } catch (error) {
      const code = this.errorCode(error);
      await this.prisma.accountDeletionJob.updateMany({
        where: { id: job.id, status: { not: 'COMPLETED' } },
        data: { status: 'FAILED_RETRYABLE', lastErrorCode: code },
      });
      throw error;
    }
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (await this.processNext()) {
        // Drain serially; never process two deletion jobs concurrently.
      }
    } catch (error) {
      this.logger.error(`Account deletion attempt failed: ${this.errorCode(error)}`);
    } finally {
      this.busy = false;
    }
  }

  private errorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (/OPENCLAW_DEPROVISION/.test(message)) return message.slice(0, 80);
    if (/UPLOAD_QUARANTINE/.test(message)) return message.slice(0, 80);
    if (/foreign key|constraint/i.test(message)) return 'ACCOUNT_DELETE_DB_CONSTRAINT';
    return 'ACCOUNT_DELETE_RETRYABLE';
  }
}
