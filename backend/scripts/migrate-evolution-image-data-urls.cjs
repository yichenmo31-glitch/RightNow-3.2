const { createHash, randomUUID } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const restoreIndex = process.argv.indexOf('--restore');
const userIndex = process.argv.indexOf('--user-id');
const scopedUserId = userIndex >= 0 ? process.argv[userIndex + 1] : undefined;
const backupRoot = resolve(process.cwd(), '..', '.work', 'evolution-image-migration');
const uploadsDir = resolve(process.cwd(), 'uploads');

function writeBackup(path, payload) {
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
  renameSync(temp, path);
}

async function replaceReferences(userId, from, to) {
  return prisma.$transaction([
    prisma.imageGenTask.updateMany({ where: { userId, resultImageUrl: from }, data: { resultImageUrl: to } }),
    prisma.imageGenTask.updateMany({ where: { userId, sourceImageUrl: from }, data: { sourceImageUrl: to } }),
    prisma.evolutionImageProfile.updateMany({ where: { userId, selectedIdealImageUrl: from }, data: { selectedIdealImageUrl: to } }),
    prisma.evolutionImageProfile.updateMany({ where: { userId, startImageUrl: from }, data: { startImageUrl: to } }),
    prisma.user.updateMany({ where: { id: userId, idealBodyImage: from }, data: { idealBodyImage: to } }),
    prisma.user.updateMany({ where: { id: userId, userImage: from }, data: { userImage: to } }),
    prisma.user.updateMany({ where: { id: userId, userFaceImage: from }, data: { userFaceImage: to } }),
    prisma.evolutionStage.updateMany({ where: { userId, previewImageUrl: from }, data: { previewImageUrl: to } }),
    prisma.evolutionStage.updateMany({ where: { userId, actualImageUrl: from }, data: { actualImageUrl: to } }),
    prisma.evolutionRecord.updateMany({ where: { userId, imageUrl: from }, data: { imageUrl: to } }),
  ]);
}

async function restoreBackup(path) {
  const backup = JSON.parse(readFileSync(resolve(path), 'utf8'));
  if (!backup || backup.version !== 1 || !Array.isArray(backup.entries)) throw new Error('Invalid migration backup');
  let restored = 0;
  for (const entry of [...backup.entries].reverse()) {
    if (entry.status !== 'applied') continue;
    await replaceReferences(entry.userId, entry.newUrl, entry.originalDataUrl);
    await prisma.uploadAsset.deleteMany({ where: { userId: entry.userId, url: entry.newUrl, kind: 'generated-evolution-image-migration' } });
    const filepath = join(uploadsDir, entry.filename);
    if (existsSync(filepath)) unlinkSync(filepath);
    entry.status = 'restored';
    restored += 1;
    writeBackup(resolve(path), backup);
  }
  console.log(JSON.stringify({ mode: 'restore', restored }));
}

async function migrate() {
  const userScope = scopedUserId ? { userId: scopedUserId } : {};
  const idScope = scopedUserId ? { id: scopedUserId } : {};
  const [tasks, users, profiles, stages, records] = await Promise.all([
    prisma.imageGenTask.findMany({ where: { ...userScope, OR: [{ resultImageUrl: { startsWith: 'data:' } }, { sourceImageUrl: { startsWith: 'data:' } }] }, select: { userId: true, resultImageUrl: true, sourceImageUrl: true } }),
    prisma.user.findMany({ where: { ...idScope, OR: [{ idealBodyImage: { startsWith: 'data:' } }, { userImage: { startsWith: 'data:' } }, { userFaceImage: { startsWith: 'data:' } }] }, select: { id: true, idealBodyImage: true, userImage: true, userFaceImage: true } }),
    prisma.evolutionImageProfile.findMany({ where: { ...userScope, OR: [{ selectedIdealImageUrl: { startsWith: 'data:' } }, { startImageUrl: { startsWith: 'data:' } }] }, select: { userId: true, selectedIdealImageUrl: true, startImageUrl: true } }),
    prisma.evolutionStage.findMany({ where: { ...userScope, OR: [{ previewImageUrl: { startsWith: 'data:' } }, { actualImageUrl: { startsWith: 'data:' } }] }, select: { userId: true, previewImageUrl: true, actualImageUrl: true } }),
    prisma.evolutionRecord.findMany({ where: { ...userScope, imageUrl: { startsWith: 'data:' } }, select: { userId: true, imageUrl: true } }),
  ]);
  const rows = [];
  const add = (userId, ...values) => values.forEach((value) => { if (value?.startsWith('data:')) rows.push({ userId, value }); });
  tasks.forEach((row) => add(row.userId, row.resultImageUrl, row.sourceImageUrl));
  users.forEach((row) => add(row.id, row.idealBodyImage, row.userImage, row.userFaceImage));
  profiles.forEach((row) => add(row.userId, row.selectedIdealImageUrl, row.startImageUrl));
  stages.forEach((row) => add(row.userId, row.previewImageUrl, row.actualImageUrl));
  records.forEach((row) => add(row.userId, row.imageUrl));
  const unique = new Map();
  for (const row of rows) {
    const digest = createHash('sha256').update(row.value).digest('hex');
    unique.set(`${row.userId}:${digest}`, { userId: row.userId, digest, originalDataUrl: row.value });
  }
  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', scoped: Boolean(scopedUserId), referenceValues: rows.length, uniqueUserImages: unique.size }));
    return;
  }

  mkdirSync(backupRoot, { recursive: true });
  mkdirSync(uploadsDir, { recursive: true });
  const backupPath = join(backupRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`);
  const backup = { version: 1, createdAt: new Date().toISOString(), entries: [] };
  writeBackup(backupPath, backup);
  let migrated = 0;
  for (const item of unique.values()) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i.exec(item.originalDataUrl);
    if (!match) throw new Error(`Unsupported legacy image payload for digest ${item.digest.slice(0, 12)}`);
    const input = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (!input.length || input.length > 25 * 1024 * 1024) throw new Error(`Invalid legacy image size for digest ${item.digest.slice(0, 12)}`);
    const output = await sharp(input).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 8 }).toBuffer();
    if (output.length > 12 * 1024 * 1024) throw new Error(`Normalized image exceeds limit for digest ${item.digest.slice(0, 12)}`);
    const filename = `generated-migrated-${randomUUID()}.png`;
    const newUrl = `/uploads/${filename}`;
    const filepath = join(uploadsDir, filename);
    const entry = { userId: item.userId, digest: item.digest, originalDataUrl: item.originalDataUrl, filename, newUrl, status: 'pending' };
    backup.entries.push(entry);
    writeBackup(backupPath, backup);
    writeFileSync(filepath, output, { flag: 'wx' });
    try {
      await prisma.$transaction(async (tx) => {
        await tx.uploadAsset.create({ data: {
          userId: item.userId,
          url: newUrl,
          kind: 'generated-evolution-image-migration',
          sha256: createHash('sha256').update(output).digest('hex'),
          mimeType: 'image/png',
          byteSize: output.length,
          provider: 'legacy-migration',
          model: 'legacy-existing-result',
          promptVersion: 'legacy-migration-v1',
        } });
        await Promise.all([
          tx.imageGenTask.updateMany({ where: { userId: item.userId, resultImageUrl: item.originalDataUrl }, data: { resultImageUrl: newUrl } }),
          tx.imageGenTask.updateMany({ where: { userId: item.userId, sourceImageUrl: item.originalDataUrl }, data: { sourceImageUrl: newUrl } }),
          tx.evolutionImageProfile.updateMany({ where: { userId: item.userId, selectedIdealImageUrl: item.originalDataUrl }, data: { selectedIdealImageUrl: newUrl } }),
          tx.evolutionImageProfile.updateMany({ where: { userId: item.userId, startImageUrl: item.originalDataUrl }, data: { startImageUrl: newUrl } }),
          tx.user.updateMany({ where: { id: item.userId, idealBodyImage: item.originalDataUrl }, data: { idealBodyImage: newUrl } }),
          tx.user.updateMany({ where: { id: item.userId, userImage: item.originalDataUrl }, data: { userImage: newUrl } }),
          tx.user.updateMany({ where: { id: item.userId, userFaceImage: item.originalDataUrl }, data: { userFaceImage: newUrl } }),
          tx.evolutionStage.updateMany({ where: { userId: item.userId, previewImageUrl: item.originalDataUrl }, data: { previewImageUrl: newUrl } }),
          tx.evolutionStage.updateMany({ where: { userId: item.userId, actualImageUrl: item.originalDataUrl }, data: { actualImageUrl: newUrl } }),
          tx.evolutionRecord.updateMany({ where: { userId: item.userId, imageUrl: item.originalDataUrl }, data: { imageUrl: newUrl } }),
        ]);
      });
      entry.status = 'applied';
      migrated += 1;
      writeBackup(backupPath, backup);
    } catch (error) {
      if (existsSync(filepath)) unlinkSync(filepath);
      entry.status = 'failed';
      writeBackup(backupPath, backup);
      throw error;
    }
  }
  console.log(JSON.stringify({ mode: 'apply', migrated, backupPath }));
}

async function main() {
  if (restoreIndex >= 0) {
    const path = process.argv[restoreIndex + 1];
    if (!path) throw new Error('--restore requires a backup path');
    await restoreBackup(path);
  } else {
    await migrate();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Migration failed');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
