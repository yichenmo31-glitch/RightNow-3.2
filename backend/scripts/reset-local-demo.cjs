const { existsSync, lstatSync, rmSync } = require('node:fs');
const { basename, resolve, sep } = require('node:path');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const DEMO_EMAIL = 'test7@qq.com';
const DEMO_PASSWORD = '123456';
const apply = process.argv.includes('--apply');
const confirmIndex = process.argv.indexOf('--confirm-email');
const confirmedEmail = confirmIndex >= 0 ? String(process.argv[confirmIndex + 1] || '').trim().toLowerCase() : '';

function assertLocalDatabase() {
  let parsed;
  try {
    parsed = new URL(String(process.env.DATABASE_URL || ''));
  } catch {
    throw new Error('DEMO_RESET_DATABASE_URL_INVALID');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DEMO_RESET_DATABASE_URL_INVALID');
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase())) throw new Error('DEMO_RESET_REQUIRES_LOOPBACK_DATABASE');
  if (decodeURIComponent(parsed.pathname).replace(/^\//, '') !== 'rightnow_fitness') throw new Error('DEMO_RESET_DATABASE_NAME_INVALID');
  if (process.env.ACCOUNT_DELETION_WORKER_ENABLED === 'true') throw new Error('DEMO_RESET_REQUIRES_DELETION_WORKER_DISABLED');
}

function shanghaiDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function localUploadPath(url) {
  const prefix = String(process.env.PUBLIC_UPLOADS_PREFIX || '/uploads').replace(/^\/*|\/*$/g, '');
  const prefixes = ['/uploads/', `/${prefix}/`];
  const matched = prefixes.find((candidate) => String(url).startsWith(candidate));
  if (!matched) return null;
  const filename = String(url).slice(matched.length);
  if (!filename || filename !== basename(filename) || filename.includes('/') || filename.includes('\\')) return null;
  const root = resolve(process.cwd(), 'uploads');
  const target = resolve(root, filename);
  if (!target.startsWith(`${root}${sep}`)) throw new Error('DEMO_RESET_UPLOAD_PATH_INVALID');
  return target;
}

async function main() {
  assertLocalDatabase();
  if (apply && confirmedEmail !== DEMO_EMAIL) throw new Error('DEMO_RESET_CONFIRM_EMAIL_REQUIRED');

  const prisma = new PrismaClient();
  try {
    const current = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
      include: { uploads: { select: { url: true } } },
    });
    const assetUrls = [...new Set((current?.uploads || []).map((asset) => asset.url))];
    const sharedAssets = current && assetUrls.length > 0
      ? await prisma.uploadAsset.findMany({
          where: { userId: { not: current.id }, url: { in: assetUrls } },
          select: { url: true },
        })
      : [];
    const sharedUrls = new Set(sharedAssets.map((asset) => asset.url));
    const localFiles = [...new Set((current?.uploads || [])
      .filter((asset) => !sharedUrls.has(asset.url))
      .map((asset) => localUploadPath(asset.url))
      .filter(Boolean))];
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', email: DEMO_EMAIL, existingUser: Boolean(current), localFiles: localFiles.length, sharedFilesSkipped: sharedUrls.size }));
      return;
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const today = shanghaiDate();
    const created = await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.agentAuditLog.deleteMany({ where: { userId: current.id } });
        await tx.wechatBindCode.deleteMany({ where: { userId: current.id } });
        await tx.accountDeletionJob.deleteMany({ where: { userId: current.id } });
        await tx.user.delete({ where: { id: current.id } });
      }
      const user = await tx.user.create({ data: {
        email: DEMO_EMAIL,
        name: 'RightNow Demo User',
        passwordHash,
        gender: 'male',
        height: 176,
        weight: 74,
        age: 28,
        bodyStyle: 'athletic',
        currentPhase: 'B',
        goalWeight: 70,
        activityLevel: 'medium',
        isProfileComplete: true,
      } });
      await tx.weightRecord.create({ data: { userId: user.id, date: today, weight: 74 } });
      await tx.dietRecord.create({ data: { userId: user.id, date: today, mealType: 'breakfast', name: '演示早餐', calories: 420, protein: 24, carbs: 52, fat: 12 } });
      await tx.trainingRecord.create({ data: { userId: user.id, date: today, description: '演示全身基础训练', duration: 45, targetMuscle: 'full-body' } });
      await tx.todo.createMany({ data: [
        { userId: user.id, date: today, title: '完成 30 分钟力量训练', category: 'training' },
        { userId: user.id, date: today, title: '记录今日饮食', category: 'diet' },
      ] });
      await tx.fitnessPlan.create({ data: {
        userId: user.id,
        exerciseBase: '每周三次基础力量训练',
        dietHabit: '规律三餐并优先保证蛋白质',
        trainingPlan: JSON.stringify({ focus: '全身基础', weeklyDays: 3 }),
        mealPlan: JSON.stringify({ calorieTarget: 2100, proteinTarget: 130 }),
        aiSummary: '本地 Demo 基线计划',
      } });
      await tx.aiCoachProgress.create({ data: {
        userId: user.id,
        dayIndex: 1,
        totalTasks: 2,
        activePlan: { date: today, focus: '全身基础训练', calorieTarget: 2100 },
      } });
      const buddy = await tx.user.findUnique({ where: { email: 'buddy@rightnow.fit' }, select: { id: true } });
      if (buddy) await tx.friendship.create({ data: { requesterId: user.id, receiverId: buddy.id, status: 'accepted' } });
      return user;
    });

    let filesRemoved = 0;
    for (const path of localFiles) {
      if (!existsSync(path)) continue;
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('DEMO_RESET_UPLOAD_TARGET_INVALID');
      rmSync(path, { force: false });
      filesRemoved += 1;
    }
    console.log(JSON.stringify({ mode: 'apply', email: DEMO_EMAIL, userId: created.id, filesRemoved, sharedFilesSkipped: sharedUrls.size, baselineDate: today }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'DEMO_RESET_FAILED');
  process.exitCode = 1;
});
