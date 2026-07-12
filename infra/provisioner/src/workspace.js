import { lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
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

export function agentStatePath(agentStateRoot, agentId) {
  userIdFromAgentId(agentId);
  const root = resolve(agentStateRoot);
  const target = resolve(root, agentId);
  if (!target.startsWith(root + sep)) throw new Error("agent state path escapes root");
  return target;
}

async function existingManagedDirectory(root, target, label) {
  const targetStat = await lstat(target).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (!targetStat) return null;
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) throw new TypeError(`${label} must be a regular directory`);
  const canonicalRoot = await realpath(resolve(root));
  const canonicalTarget = await realpath(target);
  if (!canonicalTarget.startsWith(canonicalRoot + sep)) throw new TypeError(`${label} resolves outside its root`);
  return canonicalTarget;
}

export async function quarantineAgentResources({
  workspaceRoot,
  agentStateRoot,
  quarantineRoot,
  agentId,
  operationId,
}) {
  userIdFromAgentId(agentId);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(operationId)) throw new TypeError("operationId is invalid");
  await mkdir(quarantineRoot, { recursive: true, mode: 0o700 });
  const canonicalQuarantineRoot = await realpath(resolve(quarantineRoot));
  for (const forbidden of [resolve(workspaceRoot), resolve(agentStateRoot)]) {
    if (canonicalQuarantineRoot === forbidden || canonicalQuarantineRoot.startsWith(forbidden + sep)) {
      throw new TypeError("quarantine root overlaps managed active state");
    }
  }
  const operationDir = join(canonicalQuarantineRoot, operationId);
  const manifestPath = join(operationDir, "manifest.json");
  const existingManifest = await readFile(manifestPath, "utf8").catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (existingManifest) {
    const manifest = JSON.parse(existingManifest);
    if (manifest.agentId !== agentId) throw new TypeError("operationId belongs to another agent");
    return { operationId, moved: manifest.resources.length, alreadyQuarantined: true, manifest, manifestPath, operationDir };
  }

  await mkdir(operationDir, { recursive: false, mode: 0o700 });
  const resources = [];
  const candidates = [
    { kind: "workspace", root: workspaceRoot, source: workspacePath(workspaceRoot, agentId) },
    { kind: "agent-state", root: agentStateRoot, source: agentStatePath(agentStateRoot, agentId) },
  ];
  try {
    for (const candidate of candidates) {
      const canonicalSource = await existingManagedDirectory(candidate.root, candidate.source, candidate.kind);
      if (!canonicalSource) continue;
      const destination = join(operationDir, candidate.kind);
      await rename(canonicalSource, destination);
      resources.push({ kind: candidate.kind, source: candidate.source, destination });
    }
    const manifest = { version: 1, operationId, agentId, status: "quarantined", resources };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return { operationId, moved: resources.length, alreadyQuarantined: false, manifest, manifestPath, operationDir };
  } catch (error) {
    for (const resource of [...resources].reverse()) {
      await rename(resource.destination, resource.source).catch(() => {});
    }
    await rm(operationDir, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreQuarantinedResources(result) {
  for (const resource of [...result.manifest.resources].reverse()) {
    const sourceExists = await lstat(resource.source).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (sourceExists) throw new Error("cannot restore over an existing active resource");
    await rename(resource.destination, resource.source);
  }
  await rm(result.manifestPath, { force: true });
  await rm(result.operationDir, { recursive: false });
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

export async function writeMemory({ workspaceRoot, agentId, content }) {
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > 65_536) {
    throw new TypeError("memory content must be a string no larger than 64 KiB");
  }
  if (!content.startsWith("# Durable Preferences\n\n") || !content.endsWith("\n") || content.includes("\0")) {
    throw new TypeError("memory content has an invalid format");
  }
  const workspace = workspacePath(workspaceRoot, agentId);
  if ((await lstat(workspace)).isSymbolicLink()) throw new Error("workspace must not be a symbolic link");
  const canonicalRoot = await realpath(resolve(workspaceRoot));
  const canonicalWorkspace = await realpath(workspace);
  if (!canonicalWorkspace.startsWith(canonicalRoot + sep)) throw new Error("workspace resolves outside root");

  const target = join(canonicalWorkspace, "MEMORY.md");
  const targetStat = await lstat(target);
  if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw new Error("MEMORY.md must be a regular file");
  if (await readFile(target, "utf8") === content) {
    return { agentId, workspace, bytes: Buffer.byteLength(content, "utf8"), updated: false };
  }

  const temporary = join(canonicalWorkspace, `.MEMORY.md.${process.pid}.${Date.now()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    await rename(temporary, target);
    const directory = await open(canonicalWorkspace, "r").catch(() => null);
    if (directory) { await directory.sync().catch(() => {}); await directory.close(); }
  } catch (error) {
    await handle.close().catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  }
  return { agentId, workspace, bytes: Buffer.byteLength(content, "utf8"), updated: true };
}
