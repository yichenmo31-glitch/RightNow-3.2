const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { AccountDeletionWorker } = require('../dist/account-deletion/account-deletion.worker');

async function main() {
  const prisma = new PrismaClient();
  const marker = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const operationId = `account-delete-${randomUUID()}`;
  let userId = null;
  let jobId = null;
  try {
    const user = await prisma.user.create({ data: {
      email: `rn-delete-worker-${marker}@example.invalid`,
      passwordHash: 'integration-test-not-a-login',
      name: 'Deletion Worker Test',
      accountStatus: 'DELETION_PENDING',
    } });
    userId = user.id;
    await prisma.uploadAsset.create({ data: { userId, url: `/uploads/delete-worker-${marker}.png`, kind: 'test' } });
    await prisma.imageGenTask.create({ data: { userId, status: 'completed', resultImageUrl: `/uploads/delete-worker-${marker}.png` } });
    await prisma.wechatBindCode.create({ data: { userId, code: `T${randomUUID().replace(/-/g, '').slice(0, 7)}`, expiresAt: new Date(Date.now() + 60000) } });
    await prisma.agentAuditLog.create({ data: { userId, channel: 'web', channelUserId: 'private-channel-id', tool: 'test.delete', ok: true, argsDigest: 'private-args' } });
    const job = await prisma.accountDeletionJob.create({ data: {
      userId,
      idempotencyKey: `delete-worker-key-${marker}`,
      externalOperationId: operationId,
      status: 'EXTERNAL_CLEANUP',
    } });
    jobId = job.id;

    const calls = [];
    const worker = new AccountDeletionWorker(
      prisma,
      { get() { return 'false'; } },
      { async deprovisionUserAgent(id, operation) { calls.push('openclaw'); assert.equal(id, userId); assert.equal(operation, operationId); return { agentId: `rightnow-${id}`, changed: true }; } },
      { async quarantineUserUploads(id, operation) { calls.push('uploads'); assert.equal(id, userId); assert.equal(operation, operationId); return { changed: true, fileCount: 1 }; } },
    );
    await worker.processJob(jobId);

    const [deletedUser, uploadCount, taskCount, bindCodeCount, completedJob, audit] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.uploadAsset.count({ where: { userId } }),
      prisma.imageGenTask.count({ where: { userId } }),
      prisma.wechatBindCode.count({ where: { userId } }),
      prisma.accountDeletionJob.findUnique({ where: { id: jobId } }),
      prisma.agentAuditLog.findFirst({ where: { tool: 'test.delete', createdAt: { gte: new Date(Date.now() - 60000) } }, orderBy: { createdAt: 'desc' } }),
    ]);
    assert.deepEqual(calls, ['openclaw', 'uploads']);
    assert.equal(deletedUser, null);
    assert.equal(uploadCount, 0);
    assert.equal(taskCount, 0);
    assert.equal(bindCodeCount, 0);
    assert.equal(completedJob.status, 'COMPLETED');
    assert.ok(completedJob.externalCompletedAt && completedJob.dbPurgedAt && completedJob.completedAt);
    assert.equal(audit.userId, null);
    assert.equal(audit.channelUserId, null);
    assert.equal(audit.argsDigest, null);
    console.log('Account deletion PostgreSQL integration passed: cascade purge, non-FK cleanup, audit anonymization and durable completion.');
  } finally {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (jobId) await prisma.accountDeletionJob.deleteMany({ where: { id: jobId } });
    await prisma.agentAuditLog.deleteMany({ where: { tool: 'test.delete', userId: null } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
