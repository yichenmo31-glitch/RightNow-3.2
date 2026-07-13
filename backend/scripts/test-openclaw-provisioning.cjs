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

  const deletionRequests = [];
  const operationId = 'account-delete-00000000-0000-4000-8000-000000000001';
  global.fetch = async (url, options = {}) => {
    deletionRequests.push({ url: String(url), options });
    return response(JSON.stringify({
      agentId: 'rightnow-user-3',
      operationId,
      changed: true,
      configured: false,
      resourcesQuarantined: 2,
      gatewayReady: true,
    }));
  };
  assert.deepEqual(await service.deprovisionUserAgent('user-3', operationId), { agentId: 'rightnow-user-3', changed: true });
  assert.equal(deletionRequests[0].url, 'http://127.0.0.1:8787/agents/rightnow-user-3');
  assert.equal(deletionRequests[0].options.method, 'DELETE');
  assert.equal(deletionRequests[0].options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(deletionRequests[0].options.body), { operationId, reason: 'account-deletion' });

  global.fetch = async () => response(JSON.stringify({ configured: false }), 'application/json', 200);
  await assert.rejects(() => service.deprovisionUserAgent('user-3', operationId), /INVALID_RESPONSE/);
  await assert.rejects(() => service.deprovisionUserAgent('user-3', 'unsafe-operation'), /OPERATION_INVALID/);

  console.log('OpenClaw provisioning checks passed: status, ensure and authenticated idempotent deprovision contracts.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
