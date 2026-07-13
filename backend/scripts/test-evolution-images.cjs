const assert = require('node:assert/strict');
const { existsSync, unlinkSync } = require('node:fs');
const { join } = require('node:path');
const sharp = require('sharp');
const { ImageGenService } = require('../dist/image-gen/image-gen.module');
const { EvolutionStageService } = require('../dist/evolution-stage/evolution-stage.service');
const { AiService } = require('../dist/ai/ai.service');

function evolutionHarness() {
  const state = {
    profile: null,
    tasks: [],
    stages: new Map(),
    user: { id: 'user-a', gender: 'male', userImage: null, idealBodyImage: null },
    imageCalls: 0,
  };
  const evolutionImageProfile = {
    async findUnique({ where }) {
      return state.profile?.userId === where.userId ? { ...state.profile } : null;
    },
    async upsert({ where, create, update }) {
      state.profile = state.profile?.userId === where.userId
        ? { ...state.profile, ...update }
        : { id: 'profile-a', ...create };
      return { ...state.profile };
    },
  };
  const evolutionStage = {
    async upsert({ where, create, update }) {
      const key = `${where.userId_stageIndex.userId}:${where.userId_stageIndex.stageIndex}`;
      const row = state.stages.has(key) ? { ...state.stages.get(key), ...update } : { id: `stage-${create.stageIndex}`, ...create };
      state.stages.set(key, row);
      return row;
    },
    async update({ where, data }) {
      const key = `${where.userId_stageIndex.userId}:${where.userId_stageIndex.stageIndex}`;
      const row = { ...state.stages.get(key), ...data };
      state.stages.set(key, row);
      return row;
    },
    async updateMany({ where, data }) {
      for (const [key, row] of state.stages) {
        if (row.userId === where.userId && (where.stageIndex == null || row.stageIndex === where.stageIndex)) {
          state.stages.set(key, { ...row, ...data });
        }
      }
      return { count: 1 };
    },
  };
  const prisma = {
    evolutionImageProfile,
    evolutionStage,
    evolutionAssessment: { async findFirst() { return { bodyFatEstimate: 29 }; } },
    aiCoachAssessment: { async findUnique() { return { targetBodyFatEstimate: 15 }; } },
    imageGenTask: {
      async findFirst({ where }) {
        return state.tasks.find((task) => task.id === where.id && task.userId === where.userId && task.status === where.status && task.variant === where.variant) || null;
      },
    },
    user: {
      async findUnique({ where }) { return where.id === state.user.id ? { ...state.user } : null; },
      async update({ where, data }) { assert.equal(where.id, state.user.id); Object.assign(state.user, data); return { ...state.user }; },
    },
    async $transaction(operations) { return Promise.all(operations); },
  };
  const imageGen = { async generateIdealBody() { state.imageCalls += 1; throw new Error('must not generate Stage 6'); } };
  return { state, service: new EvolutionStageService(prisma, {}, imageGen) };
}

async function testEvolutionSelection() {
  const { state, service } = evolutionHarness();
  const batch = await service.beginImageBatch('user-a');
  assert.match(batch.batchId, /^[0-9a-f-]{36}$/);
  assert.equal(state.profile.activeBatchId, batch.batchId);

  const resultUrl = '/uploads/generated-owned.png';
  state.tasks.push({ id: 'task-a', userId: 'user-a', status: 'completed', variant: 'athletic', batchId: batch.batchId, resultImageUrl: resultUrl });
  state.tasks.push({ id: 'task-a2', userId: 'user-a', status: 'completed', variant: 'athletic', batchId: batch.batchId, resultImageUrl: '/uploads/generated-a2.png' });
  state.tasks.push({ id: 'task-old', userId: 'user-a', status: 'completed', variant: 'lean', batchId: 'old-batch', resultImageUrl: '/uploads/generated-old.png' });
  state.tasks.push({ id: 'task-b', userId: 'user-b', status: 'completed', variant: 'athletic', batchId: batch.batchId, resultImageUrl: '/uploads/generated-b.png' });
  const key = 'evolution-selection-key-0001';
  const selected = await service.confirmIdealSelection('user-a', { imageTaskId: 'task-a', variant: 'athletic' }, key);
  assert.deepEqual(selected, { selectedIdealImageUrl: resultUrl, variant: 'athletic' });
  assert.equal(state.profile.selectedBatchId, batch.batchId);
  assert.equal(state.profile.selectedIdealTaskId, 'task-a');
  assert.equal(state.user.idealBodyImage, resultUrl);
  assert.equal(state.stages.get('user-a:6').previewImageUrl, resultUrl);
  assert.equal(state.imageCalls, 0);

  const repeated = await service.confirmIdealSelection('user-a', { imageTaskId: 'task-a', variant: 'athletic' }, key);
  assert.deepEqual(repeated, selected);
  await assert.rejects(
    () => service.confirmIdealSelection('user-a', { imageTaskId: 'task-a2', variant: 'athletic' }, key),
    /payload conflict/i,
  );
  await assert.rejects(
    () => service.confirmIdealSelection('user-a', { imageTaskId: 'task-old', variant: 'lean' }, 'evolution-selection-key-0003'),
    /active generation batch/i,
  );
  await assert.rejects(
    () => service.confirmIdealSelection('user-a', { imageTaskId: 'task-b', variant: 'athletic' }, 'evolution-selection-key-0002'),
    /not found/i,
  );
}

async function testGeneratedStorage() {
  let asset = null;
  const prisma = { uploadAsset: { async create({ data }) { asset = { id: 'asset-1', ...data }; return asset; } } };
  const service = new ImageGenService(prisma, { get() { return undefined; } }, {});
  const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#ffffff' } }).png().toBuffer();
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  const url = await service.persistGeneratedImage('user-a', dataUrl, { provider: 'mock', model: 'mock-image', promptVersion: 'ideal-test' });
  assert.match(url, /^\/uploads\/generated-[0-9a-f-]{36}\.png$/);
  assert.equal(asset.url, url);
  assert.equal(asset.mimeType, 'image/png');
  assert.equal(asset.byteSize, png.length);
  assert.match(asset.sha256, /^[0-9a-f]{64}$/);
  assert.equal(asset.provider, 'mock');
  assert.equal(asset.model, 'mock-image');
  assert.equal(asset.promptVersion, 'ideal-test');
  assert.ok(!JSON.stringify(asset).includes('base64'));
  const filepath = join(process.cwd(), 'uploads', url.split('/').pop());
  assert.ok(existsSync(filepath));
  unlinkSync(filepath);

  assert.equal(service.toSafeErrorMessage(new Error('Incorrect API key provided: secret')), 'IMAGE_PROVIDER_AUTH_FAILED');
  assert.equal(service.toSafeErrorMessage(new Error('429 too many requests')), 'IMAGE_PROVIDER_RATE_LIMITED');
  assert.equal(service.toSafeErrorMessage(new Error('request id private-value')), 'IMAGE_GENERATION_FAILED');
}

async function testThreeVariantProviderMock() {
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#777777' } }).png().toBuffer();
  const tasks = [];
  const assets = [];
  const prisma = {
    evolutionImageProfile: {
      async findUnique() { return { activeBatchId: 'batch-mock', identityAnchors: { hair: 'short' } }; },
    },
    imageGenTask: {
      async create({ data }) { const task = { id: `task-${tasks.length + 1}`, ...data }; tasks.push(task); return task; },
      async update({ where, data }) { const task = tasks.find((row) => row.id === where.id); Object.assign(task, data); return task; },
      async findFirst() { return null; },
    },
    uploadAsset: {
      async create({ data }) { const asset = { id: `asset-${assets.length + 1}`, ...data }; assets.push(asset); return asset; },
    },
  };
  const config = {
    get(key) {
      const values = {
        IMAGE_GEN_API_KEY: 'mock-key',
        IMAGE_GEN_BASE_URL: 'https://mock.invalid/v1',
        IMAGE_GEN_MODEL: 'mock-image-model',
      };
      return values[key];
    },
  };
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, async json() { return { data: [{ b64_json: png.toString('base64') }] }; } };
  };
  try {
    const service = new ImageGenService(prisma, config, {});
    const variants = ['lean', 'athletic', 'strong'];
    const results = await Promise.all(variants.map((variant) => service.generateIdealBody('user-a', {
      variant,
      batchId: 'batch-mock',
      targetStyle: 'athletic',
      gender: 'male',
    })));
    assert.equal(requests.length, 3);
    assert.deepEqual(tasks.map((task) => task.variant).sort(), [...variants].sort());
    assert.ok(tasks.every((task) => task.batchId === 'batch-mock' && task.status === 'completed'));
    assert.ok(tasks.every((task) => task.resultImageUrl.startsWith('/uploads/generated-')));
    assert.ok(tasks.every((task) => !task.resultImageUrl.startsWith('data:')));
    assert.equal(assets.length, 3);
    assert.ok(assets.every((asset) => asset.provider === 'L0:gpt-image-2' && asset.model === 'mock-image-model'));
    assert.ok(results.every((result) => result.image.startsWith('/uploads/generated-') && result.taskId));
  } finally {
    global.fetch = originalFetch;
    for (const asset of assets) {
      const filepath = join(process.cwd(), 'uploads', asset.url.split('/').pop());
      if (existsSync(filepath)) unlinkSync(filepath);
    }
  }
}

async function testProviderDegradeChain(mode) {
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#555555' } }).png().toBuffer();
  const tasks = [];
  const assets = [];
  const prisma = {
    evolutionImageProfile: { async findUnique() { return { activeBatchId: 'batch-degrade', identityAnchors: null }; } },
    imageGenTask: {
      async create({ data }) { const task = { id: 'task-degrade', ...data }; tasks.push(task); return task; },
      async update({ where, data }) { const task = tasks.find((row) => row.id === where.id); Object.assign(task, data); return task; },
      async findFirst() { return null; },
    },
    uploadAsset: { async create({ data }) { const asset = { id: 'asset-degrade', ...data }; assets.push(asset); return asset; } },
  };
  const values = {
    IMAGE_GEN_API_KEY: 'mock-primary-key',
    IMAGE_GEN_BASE_URL: 'https://primary.invalid/v1',
    IMAGE_GEN_MODEL: 'primary-model',
    ...(mode !== 'legacy' ? {
      ARK_IMAGE_API_KEY: 'mock-ark-key',
      ARK_IMAGE_BASE_URL: 'https://ark.invalid/v3',
      ARK_IMAGE_MODEL: 'ark-model',
    } : {}),
    ...(mode !== 'ark' ? {
      LEGACY_IMAGE_GEN_API_KEY: 'mock-legacy-key',
      LEGACY_IMAGE_GEN_BASE_URL: 'https://legacy.invalid/v1',
      LEGACY_IMAGE_GEN_MODEL: 'legacy-model',
    } : {}),
  };
  const service = new ImageGenService(prisma, { get(key) { return values[key]; } }, {});
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url) => {
    requests.push(url);
    const succeeds = (mode === 'ark' && url.startsWith('https://ark.invalid'))
      || (mode === 'legacy' && url.startsWith('https://legacy.invalid'));
    if (succeeds) {
      return { ok: true, status: 200, async json() { return { data: [{ b64_json: png.toString('base64') }] }; } };
    }
    return { ok: false, status: 503, async json() { return { error: { message: 'provider unavailable request-id-sensitive' } }; } };
  };
  try {
    if (mode === 'failed') {
      await assert.rejects(
        () => service.generateIdealBody('user-a', { variant: 'lean', batchId: 'batch-degrade' }),
        /Image generation failed/i,
      );
      assert.equal(tasks[0].status, 'failed');
      assert.equal(tasks[0].errorMessage, 'IMAGE_PROVIDER_UNAVAILABLE');
      assert.equal(assets.length, 0);
      assert.ok(!JSON.stringify(tasks).includes('request-id-sensitive'));
      return;
    }
    const result = await service.generateIdealBody('user-a', { variant: 'lean', batchId: 'batch-degrade' });
    const expected = mode === 'ark'
      ? { provider: 'L1:ark-seedream', model: 'ark-model', requestCount: 2 }
      : { provider: 'L2:legacy', model: 'legacy-model', requestCount: 2 };
    assert.equal(requests.length, expected.requestCount);
    assert.equal(tasks[0].status, 'completed');
    assert.equal(tasks[0].provider, expected.provider);
    assert.equal(tasks[0].model, expected.model);
    assert.equal(assets[0].provider, expected.provider);
    assert.equal(assets[0].model, expected.model);
    assert.ok(result.image.startsWith('/uploads/generated-'));
  } finally {
    global.fetch = originalFetch;
    for (const asset of assets) {
      const filepath = join(process.cwd(), 'uploads', asset.url.split('/').pop());
      if (existsSync(filepath)) unlinkSync(filepath);
    }
  }
}

async function testIdentityAnchorLifecycle() {
  const state = { profile: null, aiCalls: 0 };
  const prisma = {
    evolutionImageProfile: {
      async findUnique() { return state.profile; },
      async upsert({ create, update }) {
        state.profile = state.profile
          ? { ...state.profile, ...update, identityAnchorVersion: state.profile.identityAnchorVersion + 1 }
          : { id: 'profile-identity', ...create };
        return state.profile;
      },
    },
    user: { async findUnique() { return { userImage: '/uploads/owned.png', userFaceImage: null }; } },
    uploadAsset: { async findFirst({ where }) { return where.url === '/uploads/owned.png' ? { id: 'asset-owned' } : null; } },
  };
  const ai = {
    async extractIdentityAnchorsFromImage() {
      state.aiCalls += 1;
      return { hair: state.aiCalls === 1 ? 'short black hair' : 'short brown hair' };
    },
  };
  const service = new EvolutionStageService(prisma, ai);
  const first = await service.prepareImageProfile('user-a', '/uploads/owned.png');
  assert.equal(first.identityAnchorVersion, 1);
  assert.equal(state.aiCalls, 1);
  const repeated = await service.prepareImageProfile('user-a', '/uploads/owned.png');
  assert.equal(repeated.identityAnchorVersion, 1);
  assert.equal(state.aiCalls, 1);
  const recalibrated = await service.prepareImageProfile('user-a', '/uploads/owned.png', true);
  assert.equal(recalibrated.identityAnchorVersion, 2);
  assert.equal(state.aiCalls, 2);
  assert.equal(state.profile.identityAnchors.hair, 'short brown hair');
  await assert.rejects(
    () => service.prepareImageProfile('user-a', '/uploads/not-owned.png', true),
    /Owned start image not found/i,
  );
  assert.equal(state.aiCalls, 2);
}

async function testIdentityAnchorFiltering() {
  const service = new AiService({ get() { return undefined; } }, {});
  service.imageUrlToDataUrl = async () => 'data:image/png;base64,AA==';
  service.requestVision = async () => JSON.stringify({
    hair: '  short\u0000 black   hair  ',
    skinTone: 'Asian ethnicity with warm skin',
    faceShape: 'oval',
    glasses: 'black rectangular glasses',
    facialFeatures: '健康状态良好，年龄约 25',
    originalOutfit: 'dark training shirt',
    nationality: 'secret-extra-field',
  });
  const anchors = await service.extractIdentityAnchorsFromImage('/uploads/owned.png');
  assert.deepEqual(anchors, {
    hair: 'short black hair',
    faceShape: 'oval',
    glasses: 'black rectangular glasses',
    originalOutfit: 'dark training shirt',
  });
  assert.ok(!JSON.stringify(anchors).match(/Asian|健康|年龄|nationality/i));
  service.requestVision = async () => 'not-json';
  await assert.rejects(
    () => service.extractIdentityAnchorsFromImage('/uploads/owned.png'),
    /invalid identity anchors/i,
  );
}

async function main() {
  await testEvolutionSelection();
  await testGeneratedStorage();
  await testThreeVariantProviderMock();
  await testProviderDegradeChain('ark');
  await testProviderDegradeChain('legacy');
  await testProviderDegradeChain('failed');
  await testIdentityAnchorLifecycle();
  await testIdentityAnchorFiltering();
  console.log('Evolution image tests passed: identity anchors, three variants, provider degradation, batch ownership, idempotent selection, Stage 6 binding, controlled storage metadata and error redaction.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
