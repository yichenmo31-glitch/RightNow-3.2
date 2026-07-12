import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { provisionAgentConfig } from "../src/config-store.js";
import { validateAgentId } from "../src/agent-id.js";
import { createProvisionerServer } from "../src/server.js";
import { bootstrapWorkspace, workspacePath } from "../src/workspace.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "rightnow-provisioner-"));
  const configPath = join(root, "openclaw.json");
  const workspaceRoot = join(root, "openclaw");
  const agentStateRoot = join(root, "agents");
  const quarantineRoot = join(root, "quarantine");
  await writeFile(configPath, '{"agents":{"list":[]}}\n');
  await mkdir(agentStateRoot, { recursive: true });
  return {
    root,
    configPath,
    workspaceRoot,
    agentStateRoot,
    quarantineRoot,
    token: "a".repeat(32),
    bindAddress: "127.0.0.1",
    gatewayHealthUrl: "http://127.0.0.1:18789/healthz",
    gatewayHealthTimeoutMs: 100,
    port: 0,
  };
}

test("configuration rejects missing values and wildcard binds", () => {
  assert.throws(() => loadConfig({}), /BIND_ADDRESS/);
  assert.throws(() => loadConfig({ PROVISIONER_BIND_ADDRESS: "0.0.0.0" }), /specific Tailscale/);
  const base = {
    PROVISIONER_BIND_ADDRESS: "127.0.0.1",
    OPENCLAW_ADMIN_TOKEN: "a".repeat(32),
    OPENCLAW_CONFIG_PATH: "/tmp/openclaw.json",
    OPENCLAW_WORKSPACE_ROOT: "/tmp/openclaw",
    OPENCLAW_AGENT_STATE_ROOT: "/tmp/openclaw-agents",
    OPENCLAW_QUARANTINE_ROOT: "/tmp/openclaw-quarantine",
  };
  assert.throws(() => loadConfig({ ...base, OPENCLAW_GATEWAY_HEALTH_URL: "http://example.com/healthz" }), /loopback/);
});

test("agent ids reject traversal, personal, empty and overlong values", () => {
  for (const value of ["../workspace", "personal", "", `rightnow-${"a".repeat(129)}`]) {
    assert.throws(() => validateAgentId(value), /valid RightNow/);
  }
  assert.equal(validateAgentId("rightnow-user_123"), "rightnow-user_123");
});

test("workspace bootstrap is complete and does not overwrite user files", async () => {
  const config = await fixture();
  const personal = join(config.workspaceRoot, "workspace");
  await writeFile(personal, "personal sentinel\n", { flag: "wx" }).catch(async (error) => {
    if (error.code === "ENOENT") {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(config.workspaceRoot, { recursive: true });
      await writeFile(personal, "personal sentinel\n", { flag: "wx" });
      return;
    }
    throw error;
  });
  const personalBefore = await readFile(personal, "utf8");
  const first = await bootstrapWorkspace({ ...config, agentId: "rightnow-user-1", language: "zh-CN" });
  assert.deepEqual(first.created.sort(), [".gitignore", "AGENTS.md", "MEMORY.md", "USER.md"].sort());
  const memoryPath = join(first.workspace, "MEMORY.md");
  assert.equal(await readFile(memoryPath, "utf8"), "# Durable Preferences\n\nNo durable preferences confirmed yet.\n");
  await writeFile(memoryPath, "confirmed preference\n");
  const second = await bootstrapWorkspace({ ...config, agentId: "rightnow-user-1" });
  assert.deepEqual(second.created, []);
  assert.equal(await readFile(memoryPath, "utf8"), "confirmed preference\n");
  assert.equal((await stat(join(first.workspace, "memory"))).isDirectory(), true);
  assert.equal(await readFile(personal, "utf8"), personalBefore);
  assert.throws(() => workspacePath(config.workspaceRoot, "../workspace"));
});

test("atomic config update is idempotent and preserves source on failure", async () => {
  const config = await fixture();
  const workspace = workspacePath(config.workspaceRoot, "rightnow-user-1");
  const first = await provisionAgentConfig({ ...config, agentId: "rightnow-user-1", workspace });
  const second = await provisionAgentConfig({ ...config, agentId: "rightnow-user-1", workspace });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  const before = await readFile(config.configPath, "utf8");
  await assert.rejects(provisionAgentConfig({
    ...config,
    agentId: "rightnow-user-2",
    workspace: workspacePath(config.workspaceRoot, "rightnow-user-2"),
    beforeRename: () => { throw new Error("simulated failure"); },
  }), /simulated failure/);
  assert.equal(await readFile(config.configPath, "utf8"), before);
});

test("concurrent config updates retain both agents", async () => {
  const config = await fixture();
  await Promise.all(["rightnow-user-a", "rightnow-user-b"].map((agentId) => provisionAgentConfig({
    ...config,
    agentId,
    workspace: workspacePath(config.workspaceRoot, agentId),
  })));
  const parsed = JSON.parse(await readFile(config.configPath, "utf8"));
  assert.deepEqual(parsed.agents.list.map((agent) => agent.id).sort(), ["rightnow-user-a", "rightnow-user-b"]);
});

test("HTTP endpoint enforces bearer auth and server-owned workspace", async () => {
  const config = await fixture();
  const restarts = [];
  let healthChecks = 0;
  const server = createProvisionerServer(config, {
    execFile: (file, args, options, callback) => { restarts.push({ file, args, options }); callback(null); },
    fetch: async () => new Response(null, { status: ++healthChecks === 1 ? 503 : 200 }),
    sleep: async () => {},
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/provision`;
  try {
    for (const authorization of [undefined, "Bearer wrong"]) {
      const response = await fetch(url, { method: "POST", headers: authorization ? { authorization } : {}, body: "{}" });
      assert.equal(response.status, 401);
    }
    const invalid = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${config.token}` }, body: JSON.stringify({ agentId: "rightnow-user-1", workspace: "/tmp/injected" }) });
    assert.equal(invalid.status, 400);
    const valid = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${config.token}` }, body: JSON.stringify({ agentId: "rightnow-user-1" }) });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).agentId, "rightnow-user-1");
    assert.equal(restarts.length, 1);
    assert.equal(healthChecks, 2);
    assert.equal(restarts[0].file, "/usr/bin/systemctl");
    assert.deepEqual(restarts[0].args, ["--user", "restart", "openclaw-gateway.service"]);
    assert.equal(restarts[0].options.env.XDG_RUNTIME_DIR, "/run/user/0");
    const idempotent = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${config.token}` }, body: JSON.stringify({ agentId: "rightnow-user-1" }) });
    assert.equal((await idempotent.json()).changed, false);
    assert.equal(restarts.length, 1);

    const statusUrl = `http://127.0.0.1:${port}/agents/rightnow-user-1`;
    const unauthorizedStatus = await fetch(statusUrl);
    assert.equal(unauthorizedStatus.status, 401);
    const readyStatus = await fetch(statusUrl, { headers: { authorization: `Bearer ${config.token}` } });
    assert.deepEqual(await readyStatus.json(), {
      agentId: "rightnow-user-1",
      configured: true,
      workspaceReady: true,
    });
    const missingStatus = await fetch(`http://127.0.0.1:${port}/agents/rightnow-user-2`, { headers: { authorization: `Bearer ${config.token}` } });
    assert.deepEqual(await missingStatus.json(), {
      agentId: "rightnow-user-2",
      configured: false,
      workspaceReady: false,
    });

    const memoryUrl = `${statusUrl}/memory`;
    const memoryContent = "# Durable Preferences\n\n- **RESPONSE_STYLE**: concise\n";
    assert.equal((await fetch(memoryUrl, { method: "PUT", body: "{}" })).status, 401);
    const invalidMemory = await fetch(memoryUrl, {
      method: "PUT",
      headers: { authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ content: "invalid" }),
    });
    assert.equal(invalidMemory.status, 400);
    const memory = await fetch(memoryUrl, {
      method: "PUT",
      headers: { authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ content: memoryContent }),
    });
    assert.equal(memory.status, 200);
    assert.equal((await memory.json()).updated, true);
    assert.equal(await readFile(join(config.workspaceRoot, "workspace-rightnow-user-1", "MEMORY.md"), "utf8"), memoryContent);
    const memoryPath = join(config.workspaceRoot, "workspace-rightnow-user-1", "MEMORY.md");
    const beforeRepeat = await stat(memoryPath);
    const repeatedMemory = await fetch(memoryUrl, {
      method: "PUT",
      headers: { authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ content: memoryContent }),
    });
    assert.equal((await repeatedMemory.json()).updated, false);
    assert.equal((await stat(memoryPath)).mtimeMs, beforeRepeat.mtimeMs);
    const oversizedMemory = await fetch(memoryUrl, {
      method: "PUT",
      headers: { authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ content: `# Durable Preferences\n\n${"x".repeat(65_537)}\n` }),
    });
    assert.equal(oversizedMemory.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("new agent returns 500 when Gateway restart or health readiness fails", async () => {
  for (const failure of ["restart", "health"]) {
    const config = await fixture();
    let restartCount = 0;
    const server = createProvisionerServer(config, {
      execFile: (_file, _args, _options, callback) => {
        restartCount += 1;
        callback(failure === "restart" ? new Error("mock restart failure") : null);
      },
      fetch: async () => new Response(null, { status: 503 }),
      sleep: async () => { config.gatewayHealthTimeoutMs = 0; },
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/provision`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.token}` },
        body: JSON.stringify({ agentId: `rightnow-${failure}` }),
      });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "provisioning failed" });
      assert.equal(restartCount, 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test("deprovision quarantines only the target and is idempotent", async () => {
  const config = await fixture();
  const restarts = [];
  const server = createProvisionerServer(config, {
    execFile: (_file, _args, _options, callback) => { restarts.push(true); callback(null); },
    fetch: async () => new Response(null, { status: 200 }),
    sleep: async () => {},
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const headers = { authorization: `Bearer ${config.token}` };
  try {
    for (const agentId of ["rightnow-user-a", "rightnow-user-b"]) {
      const response = await fetch(`http://127.0.0.1:${port}/provision`, {
        method: "POST", headers, body: JSON.stringify({ agentId }),
      });
      assert.equal(response.status, 200);
      await mkdir(join(config.agentStateRoot, agentId, "sessions"), { recursive: true });
      await writeFile(join(config.agentStateRoot, agentId, "sessions", "sentinel"), agentId);
    }
    const personal = join(config.workspaceRoot, "workspace");
    await mkdir(personal, { recursive: true });
    await writeFile(join(personal, "sentinel"), "personal");
    const personalBefore = await readFile(join(personal, "sentinel"), "utf8");
    const bMemory = join(config.workspaceRoot, "workspace-rightnow-user-b", "MEMORY.md");
    const bBefore = await readFile(bMemory, "utf8");

    const endpoint = `http://127.0.0.1:${port}/agents/rightnow-user-a`;
    const injected = await fetch(endpoint, {
      method: "DELETE", headers, body: JSON.stringify({
        operationId: "delete-user-a-0001", reason: "account-deletion", workspace: "/tmp/injected",
      }),
    });
    assert.equal(injected.status, 400);

    const body = JSON.stringify({ operationId: "delete-user-a-0001", reason: "account-deletion" });
    const first = await fetch(endpoint, { method: "DELETE", headers, body });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), {
      agentId: "rightnow-user-a",
      operationId: "delete-user-a-0001",
      changed: true,
      configured: false,
      resourcesQuarantined: 2,
      gatewayReady: true,
    });
    const parsed = JSON.parse(await readFile(config.configPath, "utf8"));
    assert.deepEqual(parsed.agents.list.map((agent) => agent.id), ["rightnow-user-b"]);
    assert.equal(await readFile(join(config.quarantineRoot, "delete-user-a-0001", "workspace", "MEMORY.md"), "utf8"), "# Durable Preferences\n\nNo durable preferences confirmed yet.\n");
    assert.equal(await readFile(join(config.quarantineRoot, "delete-user-a-0001", "agent-state", "sessions", "sentinel"), "utf8"), "rightnow-user-a");

    const repeated = await fetch(endpoint, { method: "DELETE", headers, body });
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).changed, false);
    assert.equal(restarts.length, 3);
    assert.equal(await readFile(bMemory, "utf8"), bBefore);
    assert.equal(await readFile(join(personal, "sentinel"), "utf8"), personalBefore);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("deprovision restores config and resources when Gateway restart fails", async () => {
  const config = await fixture();
  let failRestart = false;
  const server = createProvisionerServer(config, {
    execFile: (_file, _args, _options, callback) => callback(failRestart ? new Error("restart failed") : null),
    fetch: async () => new Response(null, { status: 200 }),
    sleep: async () => {},
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const headers = { authorization: `Bearer ${config.token}` };
  try {
    const agentId = "rightnow-rollback";
    assert.equal((await fetch(`http://127.0.0.1:${port}/provision`, {
      method: "POST", headers, body: JSON.stringify({ agentId }),
    })).status, 200);
    await mkdir(join(config.agentStateRoot, agentId, "sessions"), { recursive: true });
    await writeFile(join(config.agentStateRoot, agentId, "sessions", "sentinel"), "session");
    failRestart = true;
    const deletion = await fetch(`http://127.0.0.1:${port}/agents/${agentId}`, {
      method: "DELETE", headers,
      body: JSON.stringify({ operationId: "rollback-operation-1", reason: "account-deletion" }),
    });
    assert.equal(deletion.status, 500);
    const parsed = JSON.parse(await readFile(config.configPath, "utf8"));
    assert.equal(parsed.agents.list.filter((agent) => agent.id === agentId).length, 1);
    assert.equal((await stat(workspacePath(config.workspaceRoot, agentId))).isDirectory(), true);
    assert.equal(await readFile(join(config.agentStateRoot, agentId, "sessions", "sentinel"), "utf8"), "session");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("deprovision rejects a symlink workspace without changing config", async (t) => {
  const config = await fixture();
  const agentId = "rightnow-symlink";
  const workspace = workspacePath(config.workspaceRoot, agentId);
  await bootstrapWorkspace({ ...config, agentId });
  await provisionAgentConfig({ ...config, agentId, workspace });
  const personal = join(config.workspaceRoot, "workspace");
  await mkdir(personal, { recursive: true });
  await writeFile(join(personal, "sentinel"), "personal");
  await rm(workspace, { recursive: true });
  try {
    await symlink(personal, workspace, "dir");
  } catch (error) {
    if (error.code === "EPERM") {
      t.skip("symlink creation is not permitted in this Windows environment");
      return;
    }
    throw error;
  }
  const before = await readFile(config.configPath, "utf8");
  const server = createProvisionerServer(config, {
    execFile: (_file, _args, _options, callback) => callback(null),
    fetch: async () => new Response(null, { status: 200 }),
    sleep: async () => {},
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/agents/${agentId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ operationId: "symlink-operation-1", reason: "account-deletion" }),
    });
    assert.equal(response.status, 400);
    assert.equal(await readFile(config.configPath, "utf8"), before);
    assert.equal(await readFile(join(personal, "sentinel"), "utf8"), "personal");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
