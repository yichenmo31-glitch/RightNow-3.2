const assert = require('node:assert/strict');
const { ConfigService } = require('@nestjs/config');
const { OpenClawClient } = require('../dist/openclaw/openclaw.client.js');

const client = new OpenClawClient(new ConfigService({}));

const cases = [
  ['User-1', 'rightnow-user-1', 'rightnow:user-1'],
  ['  USER_2  ', 'rightnow-user_2', 'rightnow:user_2'],
  ['rightnow-user-3', 'rightnow-user-3', 'rightnow:rightnow-user-3'],
  ['rightnow:user-4', 'rightnow-rightnow:user-4', 'rightnow:user-4'],
];

for (const [input, expectedAgentId, expectedSessionKey] of cases) {
  assert.equal(client.toAgentId(input), expectedAgentId, `agent ID for ${input}`);
  assert.equal(client.toSessionKey(input), expectedSessionKey, `session key for ${input}`);
}

assert.equal(client.toAgentId(client.toAgentId('User-1')), 'rightnow-user-1');
assert.equal(client.toSessionKey(client.toSessionKey('User-1')), 'rightnow:user-1');
assert.equal(client.toSessionKey(' User-1 ', 'Chat_2026-07'), 'rightnow:user-1:Chat_2026-07');
for (const invalid of ['', 'bad:id', '../escape', 'a'.repeat(65), ' leading']) {
  assert.throws(() => client.toSessionKey('user-1', invalid), /conversationId/);
}

console.log(`OpenClaw identity contract: ${cases.length + 8} assertions passed`);
