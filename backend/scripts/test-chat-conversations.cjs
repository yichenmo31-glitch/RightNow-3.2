const assert = require('node:assert/strict');
const { ChatService } = require('../dist/chat/chat.service');
const { todoTools } = require('../dist/agent/tools/todo.tools');

function harness({ owner = true, historyWindow = '0', decision, selectedRoute = null, ragPayload, trainingTodo = true } = {}) {
  const rows = [];
  const calls = { gateway: 0, provisioning: 0, memorySync: 0, candidates: 0, planQueries: [], sessionKey: null, queryWhere: null, lastUserMessage: null, systemPrompt: null, weights: [], diets: [], trainings: [], todoUpdates: [], analyses: [], audits: [], userUpdates: [], rag: [] };
  const chatMessage = {
    async count({ where }) { calls.queryWhere = where; return 0; },
    async findMany({ where }) { calls.queryWhere = where; return []; },
    async create({ data }) {
      const row = { id: `m-${rows.length + 1}`, createdAt: new Date(rows.length), ...data };
      rows.push(row);
      return row;
    },
  };
  const prisma = {
    chatMessage,
    chatConversation: {
      async create({ data }) { return { id: 'conv-a', createdAt: new Date(0), ...data }; },
      async findFirst() { return owner ? { id: 'conv-a' } : null; },
      async update() { return { id: 'conv-a' }; },
    },
    weightRecord: { async create({ data }) { calls.weights.push(data); return data; } },
    dietRecord: { async create({ data }) { const row = { id: 'diet-1', ...data }; calls.diets.push(row); return row; } },
    trainingRecord: { async create({ data }) { const row = { id: 'training-1', ...data }; calls.trainings.push(row); return row; } },
    todo: {
      async findFirst() { return trainingTodo ? { id: 'todo-1' } : null; },
      async update({ data }) { calls.todoUpdates.push(data); return data; },
    },
    user: { async update({ data }) { calls.userUpdates.push(data); return data; } },
    agentAuditLog: { async create({ data }) { calls.audits.push(data); return data; } },
    async $transaction(callback) {
      return callback({
        chatMessage,
        chatConversation: this.chatConversation,
        weightRecord: this.weightRecord,
        dietRecord: this.dietRecord,
        trainingRecord: this.trainingRecord,
        todo: this.todo,
        user: this.user,
        agentAuditLog: this.agentAuditLog,
      });
    },
  };
  const config = { get: (key) => key === 'OPENCLAW_DB_HISTORY_WINDOW' ? historyWindow : undefined };
  const provisioning = { ensureAgent: async () => { calls.provisioning += 1; return 'rightnow-user-a'; } };
  const memory = { synchronize: async () => { calls.memorySync += 1; } };
  const push = { deliverExistingToUser: async () => undefined };
  const openClaw = {
    toSessionKey: (userId, conversationId) => `rightnow:${userId}${conversationId ? `:${conversationId}` : ''}`,
    async chat(request) {
      calls.gateway += 1;
      calls.sessionKey = request.sessionKey;
      assert.equal(request.messages.at(-1).role, 'user');
      calls.lastUserMessage = request.messages.at(-1).content;
      calls.systemPrompt = request.messages[0].content;
      return { content: 'world' };
    },
  };
  const orchestrator = { captureCandidates: async () => { calls.candidates += 1; return 0; } };
  const classifier = {
    classifyV2: async () => ({
      legacyDecision: decision || ({ intent: 'social_chat', subIntent: null, entities: {} }),
      selectedRoute,
    }),
  };
  const diet = {
    async analyzeText({ foodName }) {
      calls.analyses.push(foodName);
      return { name: '鸡胸肉和米饭', calories: 520, protein: 42, fat: 9, carbs: 65, mealType: '午餐' };
    },
  };
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    calls.rag.push(JSON.parse(init.body));
    return { ok: true, async json() { return ragPayload || { source_layer: 'L2', results: { documents: [['知识片段']] } }; } };
  };
  return {
    service: new ChatService(prisma, config, provisioning, memory, push, openClaw, orchestrator, classifier, diet, {
      execute: async (userId, route) => { calls.planQueries.push({ userId, route }); return '确定性计划回复'; },
    }),
    calls,
    rows,
    restore() { global.fetch = originalFetch; },
  };
}

async function main() {
  const owned = harness();
  const conversation = await owned.service.createConversation('user-a');
  assert.equal(conversation.id, 'conv-a');
  await owned.service.send('user-a', 'hello', { conversationId: 'conv-a', source: 'wechat' });
  assert.equal(owned.calls.sessionKey, 'rightnow:user-a:conv-a');
  assert.equal(owned.calls.lastUserMessage, 'hello');
  assert.deepEqual(owned.rows.map((row) => [row.role, row.conversationId]), [
    ['user', 'conv-a'],
    ['assistant', 'conv-a'],
  ]);

  const denied = harness({ owner: false });
  await assert.rejects(
    () => denied.service.send('user-b', 'hello', { conversationId: 'conv-a' }),
    /Conversation not found/,
  );
  assert.equal(denied.calls.gateway, 0);
  assert.equal(denied.rows.length, 0);

  const legacy = harness();
  await legacy.service.history('user-a');
  assert.deepEqual(legacy.calls.queryWhere, { userId: 'user-a', conversationId: null });

  const readOnly = harness({ selectedRoute: 'today_plan' });
  const planReply = await readOnly.service.send('user-a', '今天计划是啥', { conversationId: 'conv-a' });
  assert.equal(planReply.content, '确定性计划回复');
  assert.deepEqual(readOnly.calls.planQueries, [{ userId: 'user-a', route: 'today_plan' }]);
  assert.equal(readOnly.calls.gateway, 0);
  assert.equal(readOnly.calls.provisioning, 0);
  assert.equal(readOnly.calls.memorySync, 0);
  assert.equal(readOnly.calls.candidates, 0);
  assert.equal(readOnly.calls.rag.length, 0);

  const weight = harness({
    decision: { intent: 'body_data_update', subIntent: 'weight_update', entities: { weightKg: 62.8 } },
  });
  await weight.service.send('user-a', '今天体重 62.8kg', { conversationId: 'conv-a', source: 'wechat' });
  assert.equal(weight.calls.weights.length, 1);
  assert.equal(weight.calls.weights[0].weight, 62.8);
  assert.deepEqual(weight.calls.userUpdates, [{ weight: 62.8 }]);
  assert.equal(weight.calls.audits[0].tool, 'weight.record');

  const advice = harness({
    decision: { intent: 'fitness_advice', subIntent: 'training_advice', riskLevel: 'low', requiresKnowledge: true, entities: {} },
  });
  await advice.service.send('user-a', '新手减脂一周练几次比较合适？', { source: 'wechat' });
  assert.equal(advice.calls.rag.length, 1);
  assert.equal(advice.calls.rag[0].collection, undefined);
  assert.match(advice.calls.systemPrompt, /检索知识来源层: L2/);
  assert.equal(advice.calls.audits.at(-1).tool, 'knowledge.search');
  assert.equal(JSON.parse(advice.calls.audits.at(-1).argsDigest).sourceLayer, 'L2');
  advice.restore();

  const highRisk = harness({
    decision: { intent: 'fitness_advice', subIntent: 'injury_risk_advice', riskLevel: 'high', requiresKnowledge: true, entities: {} },
    ragPayload: { source_layer: 'L3', results: { documents: [['伤病知识']] } },
  });
  const highRiskReply = await highRisk.service.send('user-a', '我膝盖疼，但还想继续跳绳冲一下', { source: 'wechat' });
  assert.equal(highRisk.calls.rag[0].collection, 'l3');
  assert.match(highRisk.calls.systemPrompt, /立即停止/);
  assert.match(highRiskReply.content, /请先停止.*不要带伤继续训练/);
  assert.equal(JSON.parse(highRisk.calls.audits.at(-1).argsDigest).sourceLayer, 'L3');
  assert.equal(highRisk.calls.weights.length, 0);
  highRisk.restore();

  const outOfDomain = harness({
    decision: { intent: 'out_of_domain', subIntent: null, riskLevel: 'low', requiresKnowledge: false, entities: {} },
  });
  const refused = await outOfDomain.service.send('user-a', '帮我总结这个 TypeScript 文件', { source: 'wechat' });
  assert.match(refused.content, /不属于 RightNow/);
  assert.equal(outOfDomain.calls.gateway, 0);
  assert.equal(outOfDomain.calls.provisioning, 0);
  assert.equal(outOfDomain.calls.memorySync, 0);
  assert.equal(outOfDomain.calls.candidates, 0);
  assert.equal(outOfDomain.calls.rag.length, 0);
  assert.equal(outOfDomain.calls.audits.length, 0);
  assert.equal(outOfDomain.calls.queryWhere, null);
  outOfDomain.restore();

  const dietAnalyze = harness({
    decision: { intent: 'diet_log', subIntent: 'food_text_log', riskLevel: 'low', requiresKnowledge: false, requiresWriteTool: false, entities: {} },
  });
  const analyzed = await dietAnalyze.service.send('user-a', '鸡胸肉和米饭大概多少热量', { source: 'wechat' });
  assert.equal(dietAnalyze.calls.analyses.length, 1);
  assert.equal(dietAnalyze.calls.diets.length, 0);
  assert.equal(dietAnalyze.calls.gateway, 0);
  assert.equal(dietAnalyze.calls.provisioning, 0);
  assert.equal(analyzed.businessAction.type, 'diet_analyzed');
  assert.match(analyzed.content, /估算结果.*520 千卡/);
  dietAnalyze.restore();

  const dietWrite = harness({
    decision: { intent: 'diet_log', subIntent: 'food_text_log', riskLevel: 'low', requiresKnowledge: false, requiresWriteTool: true, entities: {} },
  });
  const dietCreated = await dietWrite.service.send('user-a', '午饭吃了鸡胸肉和米饭', { source: 'wechat' });
  assert.equal(dietWrite.calls.diets.length, 1);
  assert.equal(dietWrite.calls.gateway, 0);
  assert.equal(dietWrite.calls.diets[0].calories, 520);
  assert.equal(dietWrite.calls.audits.at(-1).tool, 'diet.log.create');
  assert.equal(dietCreated.businessAction.recordId, 'diet-1');
  assert.match(dietCreated.content, /大致估算约 520 千卡。已写入饮食记录，如份量不准确可以纠正/);
  assert.doesNotMatch(dietCreated.content, /记录 ID|diet-1|[（）()]/);
  dietWrite.restore();

  const training = harness({
    decision: { intent: 'training_log', subIntent: 'complete_training', riskLevel: 'low', requiresKnowledge: false, requiresWriteTool: true, entities: { exercise: '深蹲', weightKg: 60, sets: 4 } },
  });
  const trainingCreated = await training.service.send('user-a', '我今天练完腿了，深蹲60kg做了4组', { source: 'wechat' });
  assert.equal(training.calls.trainings.length, 1);
  assert.equal(training.calls.gateway, 0);
  assert.equal(training.calls.trainings[0].targetMuscle, 'legs');
  assert.equal(training.calls.todoUpdates.length, 1);
  assert.equal(training.calls.todoUpdates[0].completedSource, 'auto');
  assert.equal(training.calls.audits.at(-1).tool, 'training.session.complete');
  assert.equal(trainingCreated.businessAction.recordId, 'training-1');
  assert.equal(trainingCreated.businessAction.todoCompleted, true);
  training.restore();

  let pureReads = 0;
  const todoHandlers = todoTools({
    async list() { throw new Error('todo.today.list must not initialize or mutate daily todos'); },
    async listExisting(userId) { assert.equal(userId, 'user-a'); pureReads += 1; return []; },
  });
  await todoHandlers.find((handler) => handler.name === 'todo.today.list').run({
    userId: 'user-a',
    args: {},
  });
  assert.equal(pureReads, 1);

  console.log('Chat tests passed: conversations, weight, RAG, risk, domain isolation, diet/training writes, pure TODO reads.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
