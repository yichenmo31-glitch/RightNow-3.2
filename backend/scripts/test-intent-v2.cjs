const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifyReadOnlyV2 } = require('../dist/agent/intent/intent-v2-rules.js');
const { TodayPlanQueryService } = require('../dist/chat/today-plan-query.service.js');
const { IntentClassifierService } = require('../dist/agent/intent/intent-classifier.service.js');
const { IntentSemanticService } = require('../dist/agent/intent/intent-semantic.service.js');
const { compareShadowDecisions } = require('../dist/agent/intent/intent-shadow.js');
const { normalizeSemanticPolicy } = require('../dist/agent/intent/intent-policy.js');

const shadowDocument = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../docs/AGENT_INTENT_V2_SHADOW_SAMPLE.json'), 'utf8',
));
const shadowSamples = shadowDocument.groups.flatMap((group) => group.messages.map((message, index) => ({
  caseId: `${group.id}-${index + 1}`, message,
  resource: group.resource, operation: group.operation, scope: group.scope,
})));
assert.equal(shadowSamples.length, 120, 'shadow golden set must contain 120 cases');
assert.equal(new Set(shadowSamples.map((sample) => sample.caseId)).size, 120, 'shadow case IDs must be unique');
assert.equal(new Set(shadowSamples.map((sample) => sample.message)).size, 120, 'shadow messages must be unique');
for (const sample of shadowSamples) {
  assert.ok(['plan', 'todo', 'training', 'diet', 'weight', 'progress', 'memory'].includes(sample.resource));
  assert.ok(['query', 'analyze', 'advise', 'create', 'update'].includes(sample.operation));
  assert.ok([null, 'today', 'week', 'latest', 'current', 'history'].includes(sample.scope));
}
assert.deepEqual(
  normalizeSemanticPolicy('training', 'query', 'week', '本周有几次训练'),
  { resource: 'plan', operation: 'query', scope: 'week', matchedRuleIds: ['normalize.plan-query.v1'] },
);
const progressPolicy = normalizeSemanticPolicy('plan', 'query', null, '我的计划执行得怎么样');
assert.deepEqual([progressPolicy.resource, progressPolicy.operation, progressPolicy.scope], ['progress', 'analyze', 'current']);
assert.equal(normalizeSemanticPolicy('weight', 'query', 'history', '上次称重是多少').scope, 'latest');

const cases = [
  ['今天计划是啥', 'plan', 'query', 'today', 'today_plan'],
  ['今天练什么', 'plan', 'query', 'today', 'today_plan'],
  ['今天干嘛？', 'plan', 'query', 'today', 'today_plan'],
  ['给我看看今天安排', 'plan', 'query', 'today', 'today_plan'],
  ['这周怎么练', 'plan', 'query', 'week', 'weekly_plan'],
  ['本周训练安排', 'plan', 'query', 'week', 'weekly_plan'],
  ['这星期练啥', 'plan', 'query', 'week', 'weekly_plan'],
  ['今天有哪些任务', 'todo', 'query', 'today', 'today_todos'],
  ['今天有哪些 TODO', 'todo', 'query', 'today', 'today_todos'],
  ['今日待办', 'todo', 'query', 'today', 'today_todos'],
  ['还有什么没完成', 'todo', 'query', 'today', 'pending_todos'],
  ['今天还剩啥', 'todo', 'query', 'today', 'pending_todos'],
  ['未完成任务', 'todo', 'query', 'today', 'pending_todos'],
  ['今天吃了多少', 'diet', 'query', 'today', 'today_diet'],
  ['最近练了什么', 'training', 'query', 'history', 'training_history'],
  ['最新体重是多少', 'weight', 'query', 'latest', 'latest_weight'],
  ['最近进展怎么样', 'progress', 'query', 'current', 'current_progress'],
];

for (const [message, resource, operation, scope, selectedRoute] of cases) {
  const actual = classifyReadOnlyV2({ message });
  assert.ok(actual, `${message}: expected V2 rule`);
  assert.deepEqual(
    [actual.resource, actual.operation, actual.scope, actual.selectedRoute, actual.requestedWrite, actual.requiresKnowledge],
    [resource, operation, scope, selectedRoute, false, false],
    message,
  );
}

for (const message of [
  '把今天深蹲换成腿举', '帮我创建明天喝水提醒', '今天练完腿了', '膝盖疼今天练什么',
  '用 TypeScript 写今天训练计划',
]) {
  assert.equal(classifyReadOnlyV2({ message }), null, `${message}: must stay on safety/write policy path`);
}

async function testQueryService() {
  const classifier = new IntentClassifierService({ get: () => undefined });
  const todayPlanDecision = await classifier.classifyV2({ message: '今天练什么', useModelFallback: false });
  assert.equal(todayPlanDecision.selectedRoute, 'today_plan');
  assert.equal(todayPlanDecision.contextProfile, 'current_plan');
  assert.deepEqual(todayPlanDecision.selectedReadSet, ['active_plan', 'today_todos']);
  const risky = await classifier.classifyV2({ message: '膝盖疼今天练什么', useModelFallback: false });
  assert.equal(risky.riskLevel, 'high');
  assert.equal(risky.selectedRoute, null);
  assert.equal(risky.requestedWrite, false);
  assert.ok(risky.matchedRuleIds.includes('safety.high-risk.v1'));
  const mutation = await classifier.classifyV2({ message: '把今天深蹲换成腿举', useModelFallback: false });
  assert.equal(mutation.requestedWrite, true);
  assert.equal(mutation.selectedRoute, null);
  assert.deepEqual([mutation.resource, mutation.operation, mutation.scope], ['plan', 'update', 'today']);
  assert.ok(mutation.explicitWriteEvidence.includes('换成'));
  assert.ok(mutation.matchedRuleIds.includes('write.plan-explicit.v1'));
  assert.equal(mutation.contextProfile, 'fitness_state');

  const todoCreate = await classifier.classifyV2({ message: '帮我创建明天喝水提醒', useModelFallback: false });
  assert.deepEqual([todoCreate.resource, todoCreate.operation, todoCreate.scope], ['todo', 'create', 'tomorrow']);
  assert.equal(todoCreate.requestedWrite, true);
  assert.ok(todoCreate.explicitWriteEvidence.length > 0);

  const dietWrite = await classifier.classifyV2({ message: '午饭吃了鸡胸肉和米饭', useModelFallback: false });
  assert.deepEqual([dietWrite.resource, dietWrite.operation, dietWrite.requestedWrite], ['diet', 'create', true]);
  assert.ok(dietWrite.matchedRuleIds.includes('write.diet-explicit.v1'));

  const trainingComplete = await classifier.classifyV2({ message: '今天练完腿了', useModelFallback: false });
  assert.deepEqual([trainingComplete.resource, trainingComplete.operation, trainingComplete.requestedWrite], ['training', 'complete', true]);
  assert.ok(trainingComplete.matchedRuleIds.includes('write.training-complete.v1'));

  const outside = await classifier.classifyV2({ message: '帮我查上海天气', useModelFallback: false });
  assert.equal(outside.resource, 'general');
  assert.equal(outside.contextProfile, 'none');
  assert.deepEqual(outside.selectedReadSet, []);
  const mixedOutside = await classifier.classifyV2({ message: '用 TypeScript 写今天训练计划', useModelFallback: false });
  assert.equal(mixedOutside.legacyIntent, 'out_of_domain');
  assert.equal(mixedOutside.contextProfile, 'none');
  const ambiguousTraining = await classifier.classifyV2({ message: '我喜欢跑步', useModelFallback: false });
  assert.equal(ambiguousTraining.requestedWrite, false);
  assert.deepEqual(ambiguousTraining.explicitWriteEvidence, []);

  const calls = [];
  const prisma = {
    todo: {
      findMany: async (args) => {
        calls.push(['todo.findMany', args]);
        return [
          { title: '力量训练', category: 'training', completed: false },
          { title: '喝水 2000ml', category: 'water', completed: true },
        ];
      },
      groupBy: async () => [{ completed: true, _count: { _all: 3 } }, { completed: false, _count: { _all: 1 } }],
    },
    aiCoachProgress: {
      findUnique: async (args) => {
        calls.push(['progress.findUnique', args]);
        return { activePlan: { tasks: [{ title: '记录饮食', category: 'nutrition' }] } };
      },
    },
    aiCoachProfile: {
      findUnique: async (args) => {
        calls.push(['profile.findUnique', args]);
        return { fitnessPlan: { weeklyTrainingPlan: [{ day: 1, focus: '腿部', durationMinutes: 45, tasks: ['深蹲'] }] } };
      },
    },
    dietRecord: { findMany: async () => [{ name: '鸡胸肉', calories: 200, mealType: '午餐' }] },
    trainingRecord: { findMany: async () => [{ date: '2026-07-11', description: '腿部训练' }] },
    weightRecord: { findFirst: async () => ({ date: '2026-07-12', weight: 62.8 }) },
    user: { findUnique: async () => ({ weight: 63 }) },
  };
  const service = new TodayPlanQueryService(prisma);
  const today = await service.todayPlan('user-a', '2026-07-12');
  assert.equal(today.source, 'active_plan');
  assert.deepEqual(today.training, [{ title: '力量训练', completed: false }]);
  assert.deepEqual(today.nutrition, [{ title: '记录饮食', completed: false }]);
  assert.deepEqual(today.hydration, [{ title: '喝水 2000ml', completed: true }]);
  assert.equal(calls[0][1].where.userId, 'user-a');
  assert.equal(calls[1][1].where.userId, 'user-a');
  assert.ok(!calls.some(([name]) => /create|update|delete|ensure/.test(name)), 'query must not write');

  const pending = await service.execute('user-a', 'pending_todos');
  assert.match(pending, /力量训练/);
  assert.doesNotMatch(pending, /喝水 2000ml/);
  const weekly = await service.execute('user-b', 'weekly_plan');
  assert.match(weekly, /腿部/);
  assert.equal(calls.at(-1)[1].where.userId, 'user-b');
  assert.match(await service.execute('user-a', 'today_diet'), /200 千卡/);
  assert.match(await service.execute('user-a', 'training_history'), /腿部训练/);
  assert.match(await service.execute('user-a', 'latest_weight'), /62.8 kg/);
  assert.match(await service.execute('user-a', 'current_progress'), /3\/4/);

  const empty = new TodayPlanQueryService({
    todo: { findMany: async () => [] },
    aiCoachProgress: { findUnique: async () => null },
    aiCoachProfile: { findUnique: async () => null },
  });
  assert.match(await empty.execute('user-c', 'today_plan'), /暂时没有/);
  assert.match(await empty.execute('user-c', 'weekly_plan'), /暂时没有/);
}

async function testSemanticShadow() {
  const baseDecision = {
    resource: 'general', operation: 'clarify', scope: null, selectedRoute: null, riskLevel: 'low',
  };
  assert.deepEqual(compareShadowDecisions(baseDecision, { ...baseDecision }), { differs: false, differingFields: [] });
  assert.deepEqual(
    compareShadowDecisions(baseDecision, { ...baseDecision, resource: 'plan', operation: 'query', scope: 'today', selectedRoute: 'today_plan' }),
    { differs: true, differingFields: ['resource', 'operation', 'scope', 'selectedRoute'] },
  );
  const originalFetch = global.fetch;
  const requests = [];
  const config = {
    get(key) {
      const values = {
        INTENT_CLASSIFIER_VERSION: 'v2-shadow',
        INTENT_MODEL_BASE_URL: 'https://intent-classifier.invalid/v1', INTENT_MODEL_API_KEY: 'intent-test-only',
        INTENT_MODEL_NAME: 'intent-model-test', INTENT_MODEL_TIMEOUT_MS: '5000', INTENT_MODEL_MAX_ATTEMPTS: '1',
        STEPFUN_BASE_URL: 'https://chat-provider.invalid/v1', STEPFUN_API_KEY: 'chat-test-only', STEPFUN_CHAT_MODEL: 'chat-model-test',
      };
      return values[key];
    },
  };
  global.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return {
      ok: true, status: 200,
      async text() {
        return JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          resource: 'plan', operation: 'query', scope: 'today', subIntent: 'today_plan',
          confidence: 0.72, riskLevel: 'low', requiresContext: true, requiresKnowledge: false,
          requestedWrite: false, explicitWriteEvidence: [], suggestedTools: ['plan.query'], clarifyingQuestion: null,
        }) } }] });
      },
    };
  };
  try {
    const semantic = new IntentSemanticService(config);
    const result = await semantic.classify({
      message: '那今天呢', channel: 'web',
      recentMessages: Array.from({ length: 6 }, (_, index) => ({ role: 'user', content: `turn-${index}` })),
      knownContextSummary: { hasActivePlan: true, privateProfile: 'must-not-leak', token: 'must-not-leak' },
    });
    assert.equal(result.resource, 'plan');
    assert.equal(result.confidence, 0.72);
    assert.equal(requests[0].url, 'https://intent-classifier.invalid/v1/chat/completions');
    assert.equal(requests[0].body.model, 'intent-model-test');
    const semanticInput = JSON.parse(requests[0].body.messages[1].content);
    assert.equal(semanticInput.recentMessages.length, 4);
    assert.equal(semanticInput.timeZone, 'Asia/Shanghai');
    assert.match(semanticInput.currentLocalDateTime, /^\d{4}-\d{2}-\d{2}/);
    assert.deepEqual(semanticInput.state, { hasActivePlan: true });
    assert.doesNotMatch(requests[0].body.messages[1].content, /must-not-leak/);

    let shadowCalls = 0;
    const pendingSemantic = { classify: async () => { shadowCalls += 1; return result; } };
    const classifier = new IntentClassifierService(config, pendingSemantic);
    const executed = await classifier.classifyV2({ message: '那今天呢', useModelFallback: false });
    assert.equal(executed.legacyIntent, 'unknown_mixed');
    assert.equal(executed.selectedRoute, null, 'shadow result must not execute');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shadowCalls, 1);
    await classifier.classifyV2({ message: '膝盖疼今天练什么', useModelFallback: false });
    await classifier.classifyV2({ message: '今天练完腿了', useModelFallback: false });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shadowCalls, 1, 'risk and write requests must bypass semantic shadow');

    const readonlyConfig = { get: (key) => key === 'INTENT_CLASSIFIER_VERSION' ? 'v2-readonly' : key === 'INTENT_MODEL_MIN_CONFIDENCE' ? '0.90' : undefined };
    const readonlySemantic = { classify: async () => ({
      ...result, resource: 'progress', operation: 'analyze', scope: 'current',
      selectedRoute: 'current_progress', confidence: 0.95, requestedWrite: false, riskLevel: 'low',
    }) };
    const readonlyClassifier = new IntentClassifierService(readonlyConfig, readonlySemantic);
    const readonlyDecision = await readonlyClassifier.classifyV2({ message: '最近这状态是不是掉了', useModelFallback: false });
    assert.equal(readonlyDecision.selectedRoute, 'current_progress');
    readonlySemantic.classify = async () => ({ ...result, selectedRoute: 'today_plan', confidence: 0.5 });
    const lowConfidence = await readonlyClassifier.classifyV2({ message: '那个怎么样', useModelFallback: false });
    assert.equal(lowConfidence.selectedRoute, null);

    global.fetch = async () => ({ ok: true, status: 200, async text() {
      return JSON.stringify({ choices: [{ message: { content: 'not-json' } }] });
    } });
    await assert.rejects(() => semantic.classify({ message: '测试' }), /JSON/);
  } finally {
    global.fetch = originalFetch;
  }
}

Promise.all([testQueryService(), testSemanticShadow()])
  .then(() => console.log(`Intent V2: ${cases.length + 5} classifier cases, query-service and semantic-shadow checks passed`))
  .catch((error) => { console.error(error); process.exitCode = 1; });
