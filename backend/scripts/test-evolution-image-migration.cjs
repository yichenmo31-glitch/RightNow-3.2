const assert = require('node:assert/strict');
const { existsSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');

function runMigration(args) {
  const result = spawnSync(process.execPath, ['--env-file=.env', 'scripts/migrate-evolution-image-data-urls.cjs', ...args], {
    cwd: process.cwd(), encoding: 'utf8', env: process.env,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Migration command failed');
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}

async function main() {
  const prisma = new PrismaClient();
  const marker = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#333333' } }).png().toBuffer();
  const original = `data:image/png;base64,${png.toString('base64')}`;
  let user = null;
  let backupPath = null;
  try {
    user = await prisma.user.create({ data: {
      email: `rn-img-migration-${marker}@example.invalid`,
      passwordHash: 'integration-test-not-a-login',
      name: 'Image Migration Test',
      gender: 'male',
      idealBodyImage: original,
    } });
    await prisma.evolutionImageProfile.create({ data: {
      userId: user.id,
      activeBatchId: `batch-${marker}`,
      selectedBatchId: `batch-${marker}`,
      selectedIdealImageUrl: original,
      startImageUrl: original,
    } });
    await prisma.imageGenTask.create({ data: { userId: user.id, status: 'completed', resultImageUrl: original } });
    await prisma.evolutionStage.create({ data: { userId: user.id, stageIndex: 0, targetBodyFat: 29, title: 'test', previewImageUrl: original, actualImageUrl: original } });
    await prisma.evolutionRecord.create({ data: { userId: user.id, imageUrl: original } });

    const dry = runMigration(['--user-id', user.id]);
    assert.equal(dry.mode, 'dry-run');
    assert.equal(dry.scoped, true);
    assert.ok(dry.referenceValues >= 1);
    assert.equal(dry.uniqueUserImages, 1);
    const applied = runMigration(['--apply', '--user-id', user.id]);
    backupPath = applied.backupPath;
    assert.equal(applied.migrated, 1);
    assert.ok(existsSync(backupPath));

    const [task, profile, updatedUser, stage, record, assets] = await Promise.all([
      prisma.imageGenTask.findFirst({ where: { userId: user.id } }),
      prisma.evolutionImageProfile.findUnique({ where: { userId: user.id } }),
      prisma.user.findUnique({ where: { id: user.id } }),
      prisma.evolutionStage.findFirst({ where: { userId: user.id } }),
      prisma.evolutionRecord.findFirst({ where: { userId: user.id } }),
      prisma.uploadAsset.findMany({ where: { userId: user.id } }),
    ]);
    const migratedUrl = task.resultImageUrl;
    assert.match(migratedUrl, /^\/uploads\/generated-migrated-[0-9a-f-]{36}\.png$/);
    assert.equal(profile.selectedIdealImageUrl, migratedUrl);
    assert.equal(profile.startImageUrl, migratedUrl);
    assert.equal(updatedUser.idealBodyImage, migratedUrl);
    assert.equal(stage.previewImageUrl, migratedUrl);
    assert.equal(stage.actualImageUrl, migratedUrl);
    assert.equal(record.imageUrl, migratedUrl);
    assert.equal(assets.length, 1);
    assert.ok(existsSync(join(process.cwd(), 'uploads', migratedUrl.split('/').pop())));

    const restored = runMigration(['--restore', backupPath]);
    assert.equal(restored.restored, 1);
    const [restoredTask, restoredProfile, restoredUser, restoredStage, restoredRecord, assetCount] = await Promise.all([
      prisma.imageGenTask.findFirst({ where: { userId: user.id } }),
      prisma.evolutionImageProfile.findUnique({ where: { userId: user.id } }),
      prisma.user.findUnique({ where: { id: user.id } }),
      prisma.evolutionStage.findFirst({ where: { userId: user.id } }),
      prisma.evolutionRecord.findFirst({ where: { userId: user.id } }),
      prisma.uploadAsset.count({ where: { userId: user.id } }),
    ]);
    assert.equal(restoredTask.resultImageUrl, original);
    assert.equal(restoredProfile.selectedIdealImageUrl, original);
    assert.equal(restoredProfile.startImageUrl, original);
    assert.equal(restoredUser.idealBodyImage, original);
    assert.equal(restoredStage.previewImageUrl, original);
    assert.equal(restoredStage.actualImageUrl, original);
    assert.equal(restoredRecord.imageUrl, original);
    assert.equal(assetCount, 0);
    assert.ok(!existsSync(join(process.cwd(), 'uploads', migratedUrl.split('/').pop())));
    console.log('Evolution image migration round-trip passed: scoped dry-run, transactional apply, reference consistency and restore.');
  } finally {
    if (user) await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
    if (backupPath && existsSync(backupPath)) rmSync(backupPath, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
