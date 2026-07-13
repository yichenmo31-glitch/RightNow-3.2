const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { PrismaClient } = require('@prisma/client');

function run(root, args) {
  const result = spawnSync(process.execPath, ['--env-file=.env', 'scripts/purge-account-deletion-quarantine.cjs', ...args], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, ACCOUNT_DELETION_UPLOAD_QUARANTINE_ROOT: root },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'purge failed');
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}

async function main() {
  const prisma = new PrismaClient();
  const root = resolve(process.cwd(), '..', '.work', `quarantine-purge-test-${randomUUID()}`);
  const jobs = [];
  try {
    for (const ageDays of [45, 5]) {
      const operationId = `account-delete-${randomUUID()}`;
      const userId = `purge-user-${randomUUID()}`;
      const operationDir = join(root, operationId);
      mkdirSync(operationDir, { recursive: true });
      writeFileSync(join(operationDir, 'private.png'), `private-${ageDays}`);
      writeFileSync(join(operationDir, 'manifest.json'), JSON.stringify({ version: 1, operationId, userId, status: 'quarantined', entries: [] }));
      jobs.push(await prisma.accountDeletionJob.create({ data: {
        userId,
        idempotencyKey: `purge-key-${randomUUID()}`,
        externalOperationId: operationId,
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000),
      } }));
    }
    const dry = run(root, ['--retention-days', '30']);
    assert.deepEqual(dry, { mode: 'dry-run', retentionDays: 30, eligibleJobs: 1 });
    assert.ok(existsSync(join(root, jobs[0].externalOperationId)));
    const applied = run(root, ['--apply', '--retention-days', '30']);
    assert.deepEqual(applied, { mode: 'apply', retentionDays: 30, purged: 1 });
    assert.ok(!existsSync(join(root, jobs[0].externalOperationId)));
    assert.ok(existsSync(join(root, '_purged', `${jobs[0].externalOperationId}.json`)));
    assert.ok(existsSync(join(root, jobs[1].externalOperationId)));
    const [oldJob, recentJob] = await Promise.all(jobs.map((job) => prisma.accountDeletionJob.findUnique({ where: { id: job.id } })));
    assert.ok(oldJob.quarantinePurgedAt instanceof Date);
    assert.equal(recentJob.quarantinePurgedAt, null);
    const repeated = run(root, ['--apply', '--retention-days', '30']);
    assert.deepEqual(repeated, { mode: 'apply', retentionDays: 30, purged: 0 });
    console.log('Account deletion quarantine purge passed: retention, dry-run, tombstone, idempotency and recent-job preservation.');
  } finally {
    if (jobs.length) await prisma.accountDeletionJob.deleteMany({ where: { id: { in: jobs.map((job) => job.id) } } });
    await prisma.$disconnect();
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
