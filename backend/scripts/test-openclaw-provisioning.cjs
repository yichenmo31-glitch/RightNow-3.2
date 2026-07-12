const assert = require('node:assert/strict');
const { OpenClawProvisioningService } = require('../dist/openclaw/openclaw-provisioning.service');

const values = {
  OPENCLAW_PROVISION_MODE: 'admin-http',
  OPENCLAW_ADMIN_URL: 'http://127.0.0.1:8787',
  OPENCLAW_ADMIN_TOKEN: 'test-token',
};
const config = { get: (key) => values[key] };
const client = { toAgentId: (userId) => `rightnow-${userId}` };

function response(body, contentType = 'application/json', status = 200) {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

async function main() {
  const service = new OpenClawProvisioningService(config, client);

  global.fetch = async () => response('<!doctype html>', 'text/html');
  assert.equal(await service.agentExists('rightnow-user-1'), false);

  global.fetch = async () => response(JSON.stringify({
    agentId: 'rightnow-user-1',
    configured: true,
    workspaceReady: true,
  }));
  assert.equal(await service.agentExists('rightnow-user-1'), true);

  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || 'GET' });
    if (options.method === 'POST') return response(JSON.stringify({ changed: true }));
    const ready = requests.some((request) => request.method === 'POST');
    return response(JSON.stringify({
      agentId: 'rightnow-user-2',
      configured: ready,
      workspaceReady: ready,
    }));
  };
  assert.equal(await service.ensureAgent('user-2'), 'rightnow-user-2');
  assert.deepEqual(requests.map(({ method }) => method), ['GET', 'POST', 'GET']);

  console.log('OpenClaw provisioning status checks passed: 3 scenarios');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
