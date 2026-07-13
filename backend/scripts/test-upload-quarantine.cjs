const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { UploadQuarantineService } = require('../dist/account-deletion/upload-quarantine.service');

async function main() {
  const uploads = resolve(process.cwd(), 'uploads');
  const root = resolve(process.cwd(), '..', '.work', `upload-quarantine-test-${randomUUID()}`);
  mkdirSync(uploads, { recursive: true });
  const files = [`quarantine-a-${randomUUID()}.png`, `quarantine-b-${randomUUID()}.png`];
  const assets = files.map((filename, index) => ({ id: `asset-${index + 1}`, url: `/uploads/${filename}` }));
  const prisma = { uploadAsset: { async findMany({ where }) { assert.equal(where.userId, 'user-a'); return assets; } } };
  const config = { get(key) { return key === 'ACCOUNT_DELETION_UPLOAD_QUARANTINE_ROOT' ? root : undefined; } };
  const service = new UploadQuarantineService(prisma, config);
  const operationId = `account-delete-${randomUUID()}`;
  try {
    writeFileSync(join(uploads, files[0]), 'first-private-content');
    writeFileSync(join(uploads, files[1]), 'second-private-content');
    const quarantined = await service.quarantineUserUploads('user-a', operationId);
    assert.deepEqual(quarantined, { changed: true, fileCount: 2 });
    assert.ok(files.every((filename) => !existsSync(join(uploads, filename))));
    const manifestText = readFileSync(join(root, operationId, 'manifest.json'), 'utf8');
    assert.ok(!manifestText.includes('private-content'));
    const manifest = JSON.parse(manifestText);
    assert.ok(manifest.entries.every((entry) => existsSync(entry.destination)));
    const repeated = await service.quarantineUserUploads('user-a', operationId);
    assert.deepEqual(repeated, { changed: false, fileCount: 2 });
    const restored = service.restoreQuarantine('user-a', operationId);
    assert.deepEqual(restored, { restored: true, fileCount: 2 });
    assert.ok(files.every((filename) => existsSync(join(uploads, filename))));
    assert.deepEqual(service.restoreQuarantine('user-a', operationId), { restored: false, fileCount: 2 });

    const conflictOperation = `account-delete-${randomUUID()}`;
    rmSync(join(uploads, files[0]), { force: true });
    rmSync(join(uploads, files[1]), { force: true });
    writeFileSync(join(uploads, files[0]), 'rollback-first');
    writeFileSync(join(uploads, files[1]), 'rollback-second');
    mkdirSync(join(root, conflictOperation), { recursive: true });
    writeFileSync(service.destinationPath(join(root, conflictOperation), join(uploads, files[1])), 'conflict');
    await assert.rejects(
      () => service.quarantineUserUploads('user-a', conflictOperation),
      /DESTINATION_CONFLICT/,
    );
    assert.equal(readFileSync(join(uploads, files[0]), 'utf8'), 'rollback-first');
    assert.equal(readFileSync(join(uploads, files[1]), 'utf8'), 'rollback-second');
    assert.throws(
      () => service.quarantineUserUploads('user-a', 'unsafe-operation'),
      /OPERATION_INVALID/,
    );

    const tamperedOperation = `account-delete-${randomUUID()}`;
    const tamperedDir = join(root, tamperedOperation);
    mkdirSync(tamperedDir, { recursive: true });
    writeFileSync(join(tamperedDir, 'manifest.json'), JSON.stringify({
      version: 1,
      operationId: tamperedOperation,
      userId: 'user-a',
      status: 'quarantined',
      entries: [{ assetId: 'asset-outside', source: join(root, 'outside.png'), destination: join(tamperedDir, 'outside.png'), moved: true }],
    }));
    assert.throws(() => service.restoreQuarantine('user-a', tamperedOperation), /MANIFEST_INVALID|PATH_OUTSIDE_ROOT/);
    console.log('Upload quarantine tests passed: safe paths, idempotency, manifest validation, restore, content-free manifest and rollback.');
  } finally {
    for (const filename of files) rmSync(join(uploads, filename), { force: true });
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
