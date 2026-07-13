const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { ImageGenService } = require('../dist/image-gen/image-gen.module');
const { EvolutionStageService } = require('../dist/evolution-stage/evolution-stage.service');

async function main() {
  const prisma = new PrismaClient();
  const marker = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const emails = [`rn-img-a-${marker}@example.invalid`, `rn-img-b-${marker}@example.invalid`];
  let users = [];
  try {
    users = await Promise.all(emails.map((email, index) => prisma.user.create({
      data: { email, passwordHash: 'integration-test-not-a-login', name: `Image Isolation ${index + 1}`, gender: 'male' },
      select: { id: true },
    })));
    const [a, b] = users;
    const batchA = `batch-a-${marker}`;
    const batchB = `batch-b-${marker}`;
    await Promise.all([
      prisma.evolutionImageProfile.create({ data: { userId: a.id, activeBatchId: batchA } }),
      prisma.evolutionImageProfile.create({ data: { userId: b.id, activeBatchId: batchB } }),
    ]);
    const imageA = `/uploads/isolation-anchor-a-${marker}.png`;
    const imageB = `/uploads/isolation-anchor-b-${marker}.png`;
    await Promise.all([
      prisma.uploadAsset.create({ data: { userId: a.id, url: imageA, kind: 'identity-test' } }),
      prisma.uploadAsset.create({ data: { userId: b.id, url: imageB, kind: 'identity-test' } }),
    ]);
    const [taskA, taskB] = await Promise.all([
      prisma.imageGenTask.create({ data: { userId: a.id, batchId: batchA, variant: 'athletic', status: 'completed', resultImageUrl: `/uploads/isolation-a-${marker}.png` } }),
      prisma.imageGenTask.create({ data: { userId: b.id, batchId: batchB, variant: 'athletic', status: 'completed', resultImageUrl: `/uploads/isolation-b-${marker}.png` } }),
    ]);

    const imageService = new ImageGenService(prisma, { get() { return undefined; } }, {});
    let anchorCalls = 0;
    const stageService = new EvolutionStageService(prisma, {
      async extractIdentityAnchorsFromImage() { anchorCalls += 1; return { hair: `anchor-version-${anchorCalls}` }; },
    }, { async generateIdealBody() { throw new Error('model must not be called'); } });
    assert.equal((await stageService.prepareImageProfile(a.id, imageA)).identityAnchorVersion, 1);
    assert.equal((await stageService.prepareImageProfile(a.id, imageA)).identityAnchorVersion, 1);
    assert.equal(anchorCalls, 1);
    assert.equal((await stageService.prepareImageProfile(a.id, imageA, true)).identityAnchorVersion, 2);
    assert.equal(anchorCalls, 2);
    await assert.rejects(() => stageService.prepareImageProfile(a.id, imageB, true), /Owned start image not found/i);
    assert.equal(anchorCalls, 2);
    await prisma.evolutionImageProfile.update({ where: { userId: a.id }, data: { startImageUrl: null } });
    const [listA, listB] = await Promise.all([imageService.findByUser(a.id), imageService.findByUser(b.id)]);
    assert.deepEqual(listA.map((task) => task.id), [taskA.id]);
    assert.deepEqual(listB.map((task) => task.id), [taskB.id]);
    assert.equal(await imageService.findOne(taskB.id, a.id), null);
    assert.equal((await imageService.updateStatus(taskB.id, { status: 'failed' }, a.id)).count, 0);

    const selected = await stageService.confirmIdealSelection(
      a.id,
      { imageTaskId: taskA.id, variant: 'athletic' },
      `isolation-selection-${marker}`,
    );
    assert.equal(selected.selectedIdealImageUrl, taskA.resultImageUrl);
    await assert.rejects(
      () => stageService.confirmIdealSelection(a.id, { imageTaskId: taskB.id, variant: 'athletic' }, `isolation-cross-${marker}`),
      /not found/i,
    );

    const [profileA, profileB, stagesA, stagesB] = await Promise.all([
      prisma.evolutionImageProfile.findUnique({ where: { userId: a.id } }),
      prisma.evolutionImageProfile.findUnique({ where: { userId: b.id } }),
      prisma.evolutionStage.findMany({ where: { userId: a.id } }),
      prisma.evolutionStage.findMany({ where: { userId: b.id } }),
    ]);
    assert.equal(profileA.selectedIdealTaskId, taskA.id);
    assert.equal(profileA.selectedIdealImageUrl, taskA.resultImageUrl);
    assert.equal(profileA.identityAnchorVersion, 2);
    assert.equal(profileB.selectedIdealTaskId, null);
    assert.equal(profileB.selectedIdealImageUrl, null);
    assert.equal(stagesA.length, 7);
    assert.equal(stagesA.find((stage) => stage.stageIndex === 6).previewImageUrl, taskA.resultImageUrl);
    assert.equal(stagesB.length, 0);
    console.log('Evolution image PostgreSQL isolation passed: A/B task, profile, selection and stage ownership are isolated.');
  } finally {
    if (users.length) {
      await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
