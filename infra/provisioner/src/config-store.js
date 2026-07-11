import { copyFile, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { validateAgentId } from "./agent-id.js";

const queues = new Map();

async function withFileLock(configPath, operation) {
  const lockPath = `${configPath}.lock`;
  const deadline = Date.now() + 5_000;
  let lock;
  while (!lock) {
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST" || Date.now() >= deadline) throw new Error("could not acquire OpenClaw config lock");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try { return await operation(); } finally { await lock.close(); await rm(lockPath, { force: true }); }
}

async function serialize(key, operation) {
  const previous = queues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  queues.set(key, tail);
  await previous;
  try { return await operation(); } finally { release(); if (queues.get(key) === tail) queues.delete(key); }
}

export async function provisionAgentConfig({ configPath, agentId, workspace, beforeRename }) {
  validateAgentId(agentId);
  return serialize(configPath, () => withFileLock(configPath, async () => {
    const text = await readFile(configPath, "utf8");
    const config = JSON.parse(text);
    config.agents ??= {};
    if (config.agents.list != null && !Array.isArray(config.agents.list)) throw new TypeError("agents.list must be an array");
    config.agents.list ??= [];
    const existing = config.agents.list.find((agent) => agent?.id === agentId);
    if (existing) {
      if (existing.workspace !== workspace) throw new Error("agent workspace conflicts with server-computed path");
      return { changed: false, agent: existing };
    }
    const agent = { id: agentId, workspace };
    config.agents.list.push(agent);
    const temporary = `${configPath}.${process.pid}.${Date.now()}.tmp`;
    const backup = `${configPath}.bak`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(config, null, 2) + "\n");
      await handle.sync();
      await handle.close();
      await copyFile(configPath, backup);
      if (beforeRename) await beforeRename();
      await rename(temporary, configPath);
      const directory = await open(dirname(configPath), "r").catch(() => null);
      if (directory) { await directory.sync().catch(() => {}); await directory.close(); }
    } catch (error) {
      await handle.close().catch(() => {});
      await rm(temporary, { force: true });
      throw error;
    }
    return { changed: true, agent };
  }));
}
