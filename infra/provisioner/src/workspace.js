import { mkdir, open, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { userIdFromAgentId } from "./agent-id.js";

const TEMPLATES = {
  "AGENTS.md": "# RightNow Agent\n\nUse RightNow tools only for the isolated user represented by this workspace. PostgreSQL remains authoritative for current business facts.\n",
  "USER.md": ({ userId, language }) => `# User\n\n- userId: ${userId}\n- language: ${language}\n`,
  "MEMORY.md": "# Durable Preferences\n\nNo durable preferences confirmed yet.\n",
  ".gitignore": "memory/\n",
};

async function writeExclusive(path, content) {
  const handle = await open(path, "wx", 0o600).catch((error) => {
    if (error.code === "EEXIST") return null;
    throw error;
  });
  if (!handle) return false;
  try { await handle.writeFile(content); } finally { await handle.close(); }
  return true;
}

export function workspacePath(workspaceRoot, agentId) {
  userIdFromAgentId(agentId);
  const root = resolve(workspaceRoot);
  const target = resolve(root, `workspace-${agentId}`);
  if (!target.startsWith(root + sep)) throw new Error("workspace path escapes root");
  return target;
}

export async function bootstrapWorkspace({ workspaceRoot, agentId, language = "zh-CN" }) {
  const userId = userIdFromAgentId(agentId);
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(language)) throw new TypeError("language is invalid");
  const target = workspacePath(workspaceRoot, agentId);
  await mkdir(join(target, "memory"), { recursive: true, mode: 0o700 });
  const canonicalRoot = await realpath(resolve(workspaceRoot));
  const canonicalTarget = await realpath(target);
  if (!canonicalTarget.startsWith(canonicalRoot + sep)) throw new Error("workspace resolves outside root");

  const created = [];
  for (const [name, template] of Object.entries(TEMPLATES)) {
    const content = typeof template === "function" ? template({ userId, language }) : template;
    if (await writeExclusive(join(target, name), content)) created.push(name);
  }
  return { workspace: target, created };
}
