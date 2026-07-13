const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createServer } = require('node:http');
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { resolve, join, sep } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { OpenClawProvisioningService } = require('../dist/openclaw/openclaw-provisioning.service');
const { UploadQuarantineService } = require('../dist/account-deletion/upload-quarantine.service');
const { AccountDeletionWorker } = require('../dist/account-deletion/account-deletion.worker');

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main() {
  const prisma = new PrismaClient();
  const marker = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const operationId = `account-delete-${randomUUID()}`;
  const uploadsDir = resolve(process.cwd(), 'uploads');
  const quarantineRoot = resolve(process.cwd(), '..', '.work', `account-delete-e2e-${randomUUID()}`);
  const aFilename = `delete-e2e-a-${marker}.png`;
  const bFilename = `delete-e2e-b-${marker}.png`;
  const sentinelFilename = `delete-e2e-sentinel-${marker}.txt`;
  const token = `test-token-${randomUUID()}`;
  const provisionCalls = [];
  let userA = null;
  let userB = null;
  let jobId = null;
  let server;
  try {
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(join(uploadsDir, aFilename), 'private-a');
    writeFileSync(join(uploadsDir, bFilename), 'private-b');
    writeFileSync(join(uploadsDir, sentinelFilename), 'personal-sentinel');

    server = createServer(async (request, response) => {
      try {
        assert.equal(request.method, 'DELETE');
        assert.equal(request.headers.authorization, `Bearer ${token}`);
        const body = await readBody(request);
        assert.deepEqual(body, { operationId, reason: 'account-deletion' });
        provisionCalls.push({ url: request.url, body });
        const agentId = request.url.split('/').pop();
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ agentId, operationId, changed: true, configured: false, resourcesQuarantined: 2, gatewayReady: true }));
      } catch (error) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'test provisioner assertion failed' }));
      }
    });
    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const address = server.address();
    const configValues = {
      OPENCLAW_PROVISION_MODE: 'admin-http',
      OPENCLAW_ADMIN_URL: `http://127.0.0.1:${address.port}`,
      OPENCLAW_ADMIN_TOKEN: token,
      ACCOUNT_DELETION_UPLOAD_QUARANTINE_ROOT: quarantineRoot,
      ACCOUNT_DELETION_WORKER_ENABLED: 'false',
    };
    const config = { get(key) { return configValues[key]; } };

    [userA, userB] = await Promise.all([
      prisma.user.create({ data: { email: `rn-delete-e2e-a-${marker}@example.invalid`, passwordHash: 'not-a-login', name: 'Delete E2E A', accountStatus: 'DELETION_PENDING' } }),
      prisma.user.create({ data: { email: `rn-delete-e2e-b-${marker}@example.invalid`, passwordHash: 'not-a-login', name: 'Delete E2E B' } }),
    ]);
    await Promise.all([
      prisma.uploadAsset.create({ data: { userId: userA.id, url: `/uploads/${aFilename}`, kind: 'test' } }),
      prisma.uploadAsset.create({ data: { userId: userB.id, url: `/uploads/${bFilename}`, kind: 'test' } }),
      prisma.agentAuditLog.create({ data: { userId: userA.id, channel: 'web', channelUserId: 'private-a', tool: `test.delete.e2e.${marker}`, ok: true, argsDigest: 'private-a-args' } }),
    ]);
    const job = await prisma.accountDeletionJob.create({ data: { userId: userA.id, idempotencyKey: `delete-e2e-key-${marker}`, externalOperationId: operationId, status: 'EXTERNAL_CLEANUP' } });
    jobId = job.id;

    const client = { toAgentId(userId) { return `rightnow-${String(userId).toLowerCase()}`; } };
    const provisioning = new OpenClawProvisioningService(config, client);
    const quarantine = new UploadQuarantineService(prisma, config);
    const worker = new AccountDeletionWorker(prisma, config, provisioning, quarantine);
    await worker.processJob(job.id);

    const [aRow, bRow, bAsset, completedJob, audit] = await Promise.all([
      prisma.user.findUnique({ where: { id: userA.id } }),
      prisma.user.findUnique({ where: { id: userB.id } }),
      prisma.uploadAsset.findFirst({ where: { userId: userB.id } }),
      prisma.accountDeletionJob.findUnique({ where: { id: job.id } }),
      prisma.agentAuditLog.findFirst({ where: { tool: `test.delete.e2e.${marker}` } }),
    ]);
    assert.equal(provisionCalls.length, 1);
    assert.equal(provisionCalls[0].url, `/agents/rightnow-${userA.id}`);
    assert.equal(aRow, null);
    assert.ok(bRow && bAsset);
    assert.equal(completedJob.status, 'COMPLETED');
    assert.equal(audit.userId, null);
    assert.equal(audit.channelUserId, null);
    assert.equal(audit.argsDigest, null);
    assert.ok(!existsSync(join(uploadsDir, aFilename)));
    const operationDir = resolve(quarantineRoot, operationId);
    const manifest = JSON.parse(readFileSync(join(operationDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.entries.length, 1);
    const quarantinedFile = resolve(manifest.entries[0].destination);
    assert.ok(quarantinedFile.startsWith(`${operationDir}${sep}`));
    assert.equal(readFileSync(quarantinedFile, 'utf8'), 'private-a');
    assert.equal(readFileSync(join(uploadsDir, bFilename), 'utf8'), 'private-b');
    assert.equal(readFileSync(join(uploadsDir, sentinelFilename), 'utf8'), 'personal-sentinel');
    console.log('Account deletion local E2E passed: authenticated OpenClaw call, file quarantine, DB purge, audit anonymization and B/sentinel isolation.');
  } finally {
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    if (userA) await prisma.user.deleteMany({ where: { id: userA.id } });
    if (userB) await prisma.user.deleteMany({ where: { id: userB.id } });
    if (jobId) await prisma.accountDeletionJob.deleteMany({ where: { id: jobId } });
    await prisma.agentAuditLog.deleteMany({ where: { tool: { startsWith: 'test.delete.e2e.' } } });
    await prisma.$disconnect();
    for (const filename of [aFilename, bFilename, sentinelFilename]) rmSync(join(uploadsDir, filename), { force: true });
    rmSync(quarantineRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
