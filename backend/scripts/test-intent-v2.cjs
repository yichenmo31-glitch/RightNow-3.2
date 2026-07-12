const assert = require('node:assert/strict');
const { classifyReadOnlyV2 } = require('../dist/agent/intent/intent-v2-rules.js');
const { TodayPlanQueryService } = require('../dist/chat/today-plan-query.service.js');
const { IntentClassifierService } = require('../dist/agent/intent/intent-classifier.service.js');
const { IntentSemanticService } = require('../dist/agent/intent/intent-semantic.service.js');

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
  assert.equal((await classifier.classifyV2({ message: '今天练什么', useModelFallback: false })).selectedRoute, 'today_plan');
  const risky = await classifier.classifyV2({ message: '膝盖疼今天练什么', useModelFallback: false });
  assert.equal(risky.riskLevel, 'high');
  assert.equal(risky.selectedRoute, null);
  const mutation = await classifier.classifyV2({ message: '把今天深蹲换成腿举', useModelFallback: false });
  assert.equal(mutation.requestedWrite, true);
  assert.equal(mutation.selectedRoute, null);

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

  const empty = new TodayPlanQueryService({
    todo: { findMany: async () => [] },
    aiCoachProgress: { findUnique: async () => null },
    aiCoachProfile: { findUnique: async () => null },
  });
  assert.match(await empty.execute('user-c', 'today_plan'), /暂时没有/);
  assert.match(await empty.execute('user-c', 'weekly_plan'), /暂时没有/);
}

async function testSemanticShadow() {
  const originalFetch = global.fetch;
  const requests = [];
  const config = {
    get(key) {
      const values = {
        INTENT_CLASSIFIER_VERSION: 'v2-shadow', STEPFUN_BASE_URL: 'https://classifier.invalid/v1',
        STEPFUN_API_KEY: 'test-only', STEPFUN_CHAT_MODEL: 'classifier-test',
      };
      return values[key];
    },
  };
  global.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
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
    const semanticInput = JSON.parse(requests[0].messages[1].content);
    assert.equal(semanticInput.recentMessages.length, 4);
    assert.deepEqual(semanticInput.state, { hasActivePlan: true });
    assert.doesNotMatch(requests[0].messages[1].content, /must-not-leak/);

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
