import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
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
  await writeFile(configPath, '{"agents":{"list":[]}}\n');
  return { root, configPath, workspaceRoot, token: "a".repeat(32), bindAddress: "127.0.0.1", port: 0 };
}

test("configuration rejects missing values and wildcard binds", () => {
  assert.throws(() => loadConfig({}), /BIND_ADDRESS/);
  assert.throws(() => loadConfig({ PROVISIONER_BIND_ADDRESS: "0.0.0.0" }), /specific Tailscale/);
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
  const server = createProvisionerServer(config);
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
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
