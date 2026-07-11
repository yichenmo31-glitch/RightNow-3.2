const assert = require('node:assert/strict');
const { MemoryCandidateService } = require('../dist/agent-memory/memory-candidate.service');
const { AgentMemoryService } = require('../dist/agent-memory/agent-memory.service');
const { MemoryConflictService } = require('../dist/agent-memory/memory-conflict.service');
const { MemoryProfileService } = require('../dist/agent-memory/memory-profile.service');
const {
  MemoryCategory,
  MemorySource,
  MemoryStatus,
} = require('../dist/agent-memory/dto/memory.dto');

function createStore(initialFacts = []) {
  const state = { facts: initialFacts.map((fact) => ({ ...fact })), profiles: new Map() };
  let nextId = state.facts.length + 1;
  const matches = (fact, where) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'not' in value) return fact[key] !== value.not;
    return fact[key] === value;
  });
  const factDelegate = {
    async create({ data }) {
      const fact = { id: `fact-${nextId++}`, observedAt: new Date(), ...data };
      state.facts.push(fact);
      return { ...fact };
    },
    async findFirst({ where }) {
      return state.facts.find((fact) => matches(fact, where)) || null;
    },
    async findMany({ where }) {
      return state.facts
        .filter((fact) => matches(fact, where))
        .sort((a, b) => `${a.category}|${a.id}`.localeCompare(`${b.category}|${b.id}`))
        .map(({ category, content }) => ({ category, content }));
    },
    async update({ where, data }) {
      const fact = state.facts.find((item) => item.id === where.id);
      Object.assign(fact, data);
      return { ...fact };
    },
    async updateMany({ where, data }) {
      const selected = state.facts.filter((fact) => matches(fact, where));
      selected.forEach((fact) => Object.assign(fact, data));
      return { count: selected.length };
    },
  };
  const profileDelegate = {
    async findUnique({ where }) {
      return state.profiles.get(where.userId) || null;
    },
    async upsert({ where, create, update }) {
      const current = state.profiles.get(where.userId);
      const profile = current
        ? {
            ...current,
            ...update,
            memoryVersion: current.memoryVersion + update.memoryVersion.increment,
          }
        : { id: `profile-${where.userId}`, ...create };
      state.profiles.set(where.userId, profile);
      return profile;
    },
  };
  const prisma = {
    agentMemoryFact: factDelegate,
    agentMemoryProfile: profileDelegate,
    async $transaction(callback) {
      return callback(this);
    },
  };
  return { prisma, state };
}

async function testCandidates() {
  const service = new MemoryCandidateService();
  const cases = [
    ['以后回答直接一点', 1, MemoryCategory.ResponseStyle],
    ['今天体重 62.8kg', 0],
    ['午饭吃了米饭', 0],
    ['我膝盖可能有伤', 1, MemoryCategory.HealthRisk],
  ];
  for (const [message, count, category] of cases) {
    const candidates = service.extract(message);
    assert.equal(candidates.length, count, message);
    if (category) assert.equal(candidates[0].category, category, message);
  }
  assert.equal(service.extract('我膝盖可能有伤')[0].riskSensitive, true);
}

async function testTransitions() {
  const { prisma, state } = createStore([
    { id: 'risk-a', userId: 'user-a', category: MemoryCategory.HealthRisk, content: '膝盖可能有伤', status: MemoryStatus.Candidate },
    { id: 'style-a', userId: 'user-a', category: MemoryCategory.ResponseStyle, content: '直接一点', status: MemoryStatus.Candidate },
  ]);
  const service = new AgentMemoryService(prisma);
  await assert.rejects(() => service.confirm({ userId: 'user-b', factId: 'style-a', source: MemorySource.UserExplicit }), /not found/i);
  await assert.rejects(() => service.confirm({ userId: 'user-a', factId: 'risk-a', source: MemorySource.UserExplicit }), /explicit user confirmation/i);
  await service.confirm({ userId: 'user-a', factId: 'risk-a', source: MemorySource.UserConfirmed, confirmationSource: 'chat-confirmation:req-1' });
  await assert.rejects(() => service.reject('user-a', 'risk-a'), /cannot transition/i);
  await service.reject('user-a', 'style-a');
  assert.equal(state.facts.find((fact) => fact.id === 'style-a').status, MemoryStatus.Rejected);
}

async function testConflict() {
  const { prisma, state } = createStore([
    { id: 'old-a', userId: 'user-a', category: MemoryCategory.ExercisePreference, content: '不喜欢跑步', status: MemoryStatus.Confirmed },
    { id: 'old-b', userId: 'user-b', category: MemoryCategory.ExercisePreference, content: '不喜欢跑步', status: MemoryStatus.Confirmed },
  ]);
  const service = new MemoryConflictService(prisma);
  await service.replaceConfirmed({
    userId: 'user-a',
    category: MemoryCategory.ExercisePreference,
    content: '现在喜欢跑步',
    confirmationSource: 'explicit-correction:req-2',
  });
  const activeA = state.facts.filter((fact) => fact.userId === 'user-a' && fact.status === MemoryStatus.Confirmed);
  assert.deepEqual(activeA.map((fact) => fact.content), ['现在喜欢跑步']);
  assert.equal(state.facts.find((fact) => fact.id === 'old-a').status, MemoryStatus.Superseded);
  assert.equal(state.facts.find((fact) => fact.id === 'old-a').supersededById, activeA[0].id);
  assert.equal(state.facts.find((fact) => fact.id === 'old-b').status, MemoryStatus.Confirmed);
}

async function testProfile() {
  const { prisma, state } = createStore([
    { id: 'confirmed', userId: 'user-a', category: MemoryCategory.ResponseStyle, content: '直接一点', status: MemoryStatus.Confirmed },
    { id: 'candidate', userId: 'user-a', category: MemoryCategory.ExercisePreference, content: '喜欢游泳', status: MemoryStatus.Candidate },
    { id: 'rejected', userId: 'user-a', category: MemoryCategory.Other, content: '旧值', status: MemoryStatus.Rejected },
  ]);
  const service = new MemoryProfileService(prisma);
  const first = await service.synchronize('user-a');
  assert.deepEqual(first.content.facts, [{ category: MemoryCategory.ResponseStyle, content: '直接一点' }]);
  assert.equal(first.memoryVersion, 1);
  const repeated = await service.synchronize('user-a');
  assert.equal(repeated.memoryVersion, 1, 'identical synchronization is idempotent');
  state.facts.find((fact) => fact.id === 'candidate').status = MemoryStatus.Confirmed;
  const changed = await service.synchronize('user-a');
  assert.equal(changed.memoryVersion, 2);
  state.facts.find((fact) => fact.id === 'confirmed').status = MemoryStatus.Expired;
  const removed = await service.synchronize('user-a');
  assert.equal(removed.memoryVersion, 3);
  assert.deepEqual(removed.content.facts, [{ category: MemoryCategory.ExercisePreference, content: '喜欢游泳' }]);
}

async function main() {
  await testCandidates();
  await testTransitions();
  await testConflict();
  await testProfile();
  console.log('Agent memory tests passed: candidates, transitions, conflicts, profile aggregation.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
