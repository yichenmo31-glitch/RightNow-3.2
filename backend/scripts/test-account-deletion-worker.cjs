const assert = require('node:assert/strict');
const { AccountDeletionWorker } = require('../dist/account-deletion/account-deletion.worker');

function harness({ failDbOnce = false, failProvision = false } = {}) {
  const calls = [];
  const job = {
    id: 'job-1',
    userId: 'user-a',
    status: 'EXTERNAL_CLEANUP',
    attempts: 1,
    lastErrorCode: null,
    externalOperationId: 'account-delete-00000000-0000-4000-8000-000000000001',
    externalCompletedAt: null,
    dbPurgedAt: null,
    completedAt: null,
    requestedAt: new Date(0),
    updatedAt: new Date(0),
  };
  let dbFailures = failDbOnce ? 1 : 0;
  let userDeleted = false;
  const accountDeletionJob = {
    async findUnique() { return { ...job }; },
    async update({ data }) { calls.push(`job:${data.status || 'update'}`); Object.assign(job, data, { updatedAt: new Date() }); return { ...job }; },
    async updateMany({ data }) { calls.push(`job:${data.status || 'updateMany'}`); Object.assign(job, data, { updatedAt: new Date() }); return { count: 1 }; },
  };
  const prisma = {
    accountDeletionJob,
    async $transaction(callback) {
      calls.push('db:begin');
      if (dbFailures > 0) { dbFailures -= 1; throw new Error('database unavailable'); }
      const tx = {
        agentAuditLog: { async updateMany({ data }) { calls.push('audit:anonymous'); assert.deepEqual(data, { userId: null, channelUserId: null, argsDigest: null }); return { count: 1 }; } },
        wechatBindCode: { async deleteMany() { calls.push('bind-code:delete'); return { count: 1 }; } },
        user: { async delete() { calls.push('user:delete'); userDeleted = true; return { id: 'user-a' }; } },
        accountDeletionJob,
      };
      return callback(tx);
    },
  };
  const provisioning = {
    async deprovisionUserAgent(userId, operationId) {
      calls.push('openclaw:quarantine');
      assert.equal(userId, job.userId);
      assert.equal(operationId, job.externalOperationId);
      if (failProvision) throw new Error('OPENCLAW_DEPROVISION_UNAVAILABLE');
      return { agentId: 'rightnow-user-a', changed: true };
    },
  };
  const uploads = { async quarantineUserUploads() { calls.push('uploads:quarantine'); return { changed: true, fileCount: 2 }; } };
  const worker = new AccountDeletionWorker(prisma, { get() { return 'false'; } }, provisioning, uploads);
  return { worker, job, calls, get userDeleted() { return userDeleted; } };
}

async function main() {
  const success = harness();
  await success.worker.processJob('job-1');
  assert.equal(success.job.status, 'COMPLETED');
  assert.ok(success.job.externalCompletedAt instanceof Date);
  assert.ok(success.job.dbPurgedAt instanceof Date);
  assert.ok(success.job.completedAt instanceof Date);
  assert.equal(success.userDeleted, true);
  assert.deepEqual(success.calls, [
    'openclaw:quarantine',
    'uploads:quarantine',
    'job:EXTERNAL_QUARANTINED',
    'job:DB_PURGE',
    'db:begin',
    'audit:anonymous',
    'bind-code:delete',
    'user:delete',
    'job:FINALIZING',
    'job:COMPLETED',
  ]);

  const retry = harness({ failDbOnce: true });
  await assert.rejects(() => retry.worker.processJob('job-1'), /database unavailable/);
  assert.equal(retry.job.status, 'FAILED_RETRYABLE');
  assert.equal(retry.job.lastErrorCode, 'ACCOUNT_DELETE_RETRYABLE');
  assert.equal(retry.userDeleted, false);
  await retry.worker.processJob('job-1');
  assert.equal(retry.job.status, 'COMPLETED');
  assert.equal(retry.calls.filter((call) => call === 'openclaw:quarantine').length, 1);
  assert.equal(retry.calls.filter((call) => call === 'uploads:quarantine').length, 1);

  const externalFailure = harness({ failProvision: true });
  await assert.rejects(() => externalFailure.worker.processJob('job-1'), /OPENCLAW_DEPROVISION_UNAVAILABLE/);
  assert.equal(externalFailure.job.status, 'FAILED_RETRYABLE');
  assert.equal(externalFailure.job.lastErrorCode, 'OPENCLAW_DEPROVISION_UNAVAILABLE');
  assert.ok(!externalFailure.calls.includes('uploads:quarantine'));
  assert.equal(externalFailure.userDeleted, false);

  let claimWhere;
  const claimWorker = new AccountDeletionWorker({
    accountDeletionJob: {
      async findFirst({ where }) { claimWhere = where; return null; },
    },
  }, { get() { return 'false'; } }, {}, {});
  assert.equal(await claimWorker.processNext(), false);
  assert.deepEqual(claimWhere.OR[0].status.in, ['REQUESTED', 'FAILED_RETRYABLE']);
  assert.deepEqual(claimWhere.OR[1].status.in, ['EXTERNAL_CLEANUP', 'EXTERNAL_QUARANTINED', 'DB_PURGE', 'FINALIZING']);
  assert.ok(claimWhere.OR[1].updatedAt.lt instanceof Date);

  console.log('Account deletion worker tests passed: strict ordering, retry, external idempotency, lease-safe claims, audit anonymization and completion.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
