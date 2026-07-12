const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { UsersService } = require('../dist/users/users.module');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');

async function main() {
  const passwordHash = await bcrypt.hash('test-password', 4);
  const state = {
    user: { id: 'user-a', passwordHash, accountStatus: 'ACTIVE', authVersion: 0 },
    job: null,
    revoked: [],
  };
  const tx = {
    accountDeletionJob: {
      async findUnique() { return state.job; },
      async create({ data }) {
        state.job = {
          id: 'deletion-1',
          status: 'REQUESTED',
          requestedAt: new Date(0),
          ...data,
        };
        return state.job;
      },
    },
    user: {
      async updateMany({ where, data }) {
        if (state.user.accountStatus !== where.accountStatus) return { count: 0 };
        state.user.accountStatus = data.accountStatus;
        state.user.authVersion += data.authVersion.increment;
        return { count: 1 };
      },
    },
  };
  for (const name of ['agentBindToken', 'agentChannelBinding', 'wechatBinding', 'wechatBindCode']) {
    tx[name] = { async deleteMany() { state.revoked.push(name); return { count: 1 }; } };
  }
  const prisma = {
    user: { async findUnique() { return state.user; } },
    async $transaction(callback) { return callback(tx); },
  };
  const service = new UsersService(prisma);
  const key = 'account-delete-key-0001';
  const first = await service.requestAccountDeletion('user-a', 'test-password', key);
  assert.deepEqual(first, { deletionId: 'deletion-1', status: 'REQUESTED', requestedAt: new Date(0).toISOString() });
  assert.equal(state.user.accountStatus, 'DELETION_PENDING');
  assert.equal(state.user.authVersion, 1);
  assert.deepEqual(state.revoked.sort(), ['agentBindToken', 'agentChannelBinding', 'wechatBindCode', 'wechatBinding'].sort());

  const repeated = await service.requestAccountDeletion('user-a', 'test-password', key);
  assert.equal(repeated.deletionId, first.deletionId);
  await assert.rejects(
    () => service.requestAccountDeletion('user-a', 'test-password', 'account-delete-key-0002'),
    /already pending/,
  );
  await assert.rejects(
    () => service.requestAccountDeletion('user-a', 'wrong-password', key),
    /Invalid password/,
  );

  const config = { get: (_key, fallback) => fallback };
  const authPrisma = {
    user: {
      async findUnique() {
        return { id: 'user-a', email: 'a@example.invalid', name: 'A', accountStatus: state.user.accountStatus, authVersion: state.user.authVersion };
      },
    },
  };
  const strategy = new JwtStrategy(config, authPrisma);
  await assert.rejects(
    () => strategy.validate({ sub: 'user-a', email: 'a@example.invalid', name: 'A', authVersion: 0 }),
    /Invalid token/,
  );

  state.user.accountStatus = 'ACTIVE';
  const refreshed = await strategy.validate({ sub: 'user-a', email: 'a@example.invalid', name: 'A', authVersion: 1 });
  assert.equal(refreshed.authVersion, 1);
  await assert.rejects(
    () => strategy.validate({ sub: 'user-a', email: 'a@example.invalid', name: 'A', authVersion: 0 }),
    /Invalid token/,
  );

  console.log('Account deletion freeze tests passed: password, idempotency, revocation, status and JWT version gates.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
