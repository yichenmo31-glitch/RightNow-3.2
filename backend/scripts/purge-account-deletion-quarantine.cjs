const { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } = require('node:fs');
const { isAbsolute, relative, resolve, join, sep } = require('node:path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const retentionIndex = process.argv.indexOf('--retention-days');
const retentionDays = retentionIndex >= 0 ? Number(process.argv[retentionIndex + 1]) : 30;

function rootPath() {
  const configured = String(process.env.ACCOUNT_DELETION_UPLOAD_QUARANTINE_ROOT || '').trim();
  return resolve(configured || join(process.cwd(), '..', '.work', 'account-deletion-upload-quarantine'));
}

function assertChild(root, path) {
  const rel = relative(root, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('QUARANTINE_PURGE_PATH_INVALID');
}

function validateOperation(operationId) {
  if (!/^account-delete-[0-9a-f-]{36}$/.test(operationId)) throw new Error('QUARANTINE_PURGE_OPERATION_INVALID');
}

async function main() {
  if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error('retention-days must be between 1 and 3650');
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const jobs = await prisma.accountDeletionJob.findMany({
    where: { status: 'COMPLETED', completedAt: { lte: cutoff }, quarantinePurgedAt: null },
    orderBy: { completedAt: 'asc' },
  });
  const root = rootPath();
  const candidates = [];
  for (const job of jobs) {
    validateOperation(job.externalOperationId);
    const operationDir = resolve(root, job.externalOperationId);
    const purgingDir = resolve(root, `${job.externalOperationId}.purging`);
    const tombstonePath = resolve(root, '_purged', `${job.externalOperationId}.json`);
    assertChild(root, operationDir);
    assertChild(root, purgingDir);
    assertChild(root, tombstonePath);
    const activeDir = existsSync(operationDir) ? operationDir : existsSync(purgingDir) ? purgingDir : null;
    if (activeDir) {
      const stat = lstatSync(activeDir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('QUARANTINE_PURGE_TARGET_INVALID');
      const manifestPath = join(activeDir, 'manifest.json');
      if (!existsSync(manifestPath)) throw new Error('QUARANTINE_PURGE_MANIFEST_MISSING');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest.version !== 1 || manifest.userId !== job.userId || manifest.operationId !== job.externalOperationId || manifest.status !== 'quarantined') {
        throw new Error('QUARANTINE_PURGE_MANIFEST_INVALID');
      }
    } else {
      if (!existsSync(tombstonePath)) throw new Error('QUARANTINE_PURGE_STATE_MISSING');
      const tombstone = JSON.parse(readFileSync(tombstonePath, 'utf8'));
      if (tombstone.version !== 1 || tombstone.userId !== job.userId || tombstone.operationId !== job.externalOperationId) {
        throw new Error('QUARANTINE_PURGE_TOMBSTONE_INVALID');
      }
    }
    candidates.push({ job, operationDir, purgingDir, tombstonePath, activeDir });
  }
  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', retentionDays, eligibleJobs: candidates.length }));
    return;
  }
  let purged = 0;
  for (const candidate of candidates) {
    if (candidate.activeDir === candidate.operationDir) renameSync(candidate.operationDir, candidate.purgingDir);
    mkdirSync(resolve(root, '_purged'), { recursive: true });
    if (!existsSync(candidate.tombstonePath)) {
      const temp = `${candidate.tombstonePath}.tmp`;
      writeFileSync(temp, JSON.stringify({ version: 1, userId: candidate.job.userId, operationId: candidate.job.externalOperationId, purgedAt: new Date().toISOString() }), { encoding: 'utf8', mode: 0o600 });
      renameSync(temp, candidate.tombstonePath);
    }
    if (existsSync(candidate.purgingDir)) rmSync(candidate.purgingDir, { recursive: true, force: false });
    await prisma.accountDeletionJob.updateMany({
      where: { id: candidate.job.id, status: 'COMPLETED', quarantinePurgedAt: null },
      data: { quarantinePurgedAt: new Date() },
    });
    purged += 1;
  }
  console.log(JSON.stringify({ mode: 'apply', retentionDays, purged }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Quarantine purge failed');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
