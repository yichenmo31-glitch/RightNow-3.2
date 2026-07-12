const assert = require('node:assert/strict');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { TodayPlanQueryService } = require('../dist/chat/today-plan-query.service');

const prisma = new PrismaService();
const queries = [
  ['today_plan', '今天计划是啥'],
  ['weekly_plan', '这周怎么练'],
  ['today_todos', '今天有哪些任务'],
  ['pending_todos', '还有什么没完成'],
  ['today_diet', '今天吃了多少'],
  ['training_history', '最近练了什么'],
  ['latest_weight', '最新体重是多少'],
  ['current_progress', '最近进展怎么样'],
];

function shanghaiDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function assertLocalTestDatabase() {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  const databaseName = databaseUrl.pathname.replace(/^\//, '');
  assert(localHosts.has(databaseUrl.hostname), 'Isolation test only permits a localhost database.');
  assert(databaseName && !/prod/i.test(databaseName), 'Isolation test refuses a production-named database.');
}

async function seedUser(side, runId) {
  const marker = `ISO-${side}-${runId}`;
  const number = side === 'A' ? 61.1 : 92.2;
  const user = await prisma.user.create({
    data: {
      email: `read-route-${side.toLowerCase()}-${runId}@example.invalid`,
      passwordHash: 'not-a-login-credential',
      name: `Isolation ${side}`,
      weight: number,
    },
  });
  try {
    const date = shanghaiDate();
    await prisma.$transaction([
      prisma.todo.create({ data: { userId: user.id, date, title: `${marker}-TODO`, category: 'training' } }),
      prisma.dietRecord.create({ data: { userId: user.id, date, name: `${marker}-DIET`, calories: side === 'A' ? 611 : 922 } }),
      prisma.trainingRecord.create({ data: { userId: user.id, date, description: `${marker}-TRAINING` } }),
      prisma.weightRecord.create({ data: { userId: user.id, date, weight: number } }),
      prisma.aiCoachProgress.create({
        data: {
          userId: user.id,
          dayIndex: side === 'A' ? 11 : 22,
          streakDays: side === 'A' ? 3 : 7,
          totalTasks: 1,
          activePlan: { tasks: [{ title: `${marker}-PLAN`, category: 'training' }] },
        },
      }),
      prisma.aiCoachProfile.create({
        data: {
          userId: user.id,
          assessmentSnapshot: {},
          fitnessPlan: { weeklyTrainingPlan: [{ day: 1, focus: `${marker}-WEEK`, tasks: [`${marker}-WEEK-TASK`] }] },
          hydrationPlan: {},
          mealPlan: {},
          nextRefreshAt: new Date(Date.now() + 86400000),
        },
      }),
    ]);
  } catch (error) {
    await prisma.user.delete({ where: { id: user.id } });
    throw error;
  }
  return { id: user.id, marker, number };
}

async function main() {
  assertLocalTestDatabase();
  const runId = `${Date.now()}-${process.pid}`;
  const users = [];
  try {
    users.push(await seedUser('A', runId));
    users.push(await seedUser('B', runId));
    const service = new TodayPlanQueryService(prisma);

    for (const [route, label] of queries) {
      const replies = await Promise.all(users.map((user) => service.execute(user.id, route)));
      for (let index = 0; index < users.length; index += 1) {
        const own = users[index];
        const other = users[1 - index];
        const reply = replies[index];
        if (route === 'latest_weight') {
          assert.match(reply, new RegExp(String(own.number).replace('.', '\\.')));
          assert.doesNotMatch(reply, new RegExp(String(other.number).replace('.', '\\.')));
        } else if (route === 'current_progress') {
          const ownDay = index === 0 ? 11 : 22;
          const otherDay = index === 0 ? 22 : 11;
          assert.match(reply, new RegExp(`第 ${ownDay} 天`));
          assert.doesNotMatch(reply, new RegExp(`第 ${otherDay} 天`));
        } else {
          assert.match(reply, new RegExp(own.marker));
          assert.doesNotMatch(reply, new RegExp(other.marker));
        }
      }
      console.log(`PASS ${route} (${label}) A/B isolation`);
    }
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
