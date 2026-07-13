import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
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
    if (manifest.version !== 1 || manifest.operationId !== operationId || manifest.agentId !== agentId || !Array.isArray(manifest.resources)) {
      throw new TypeError("operationId belongs to another agent or is invalid");
    }
    validateMoveManifest(manifest, { workspaceRoot, agentStateRoot, operationDir, agentId });
    if (manifest.status === "quarantined") {
      return { operationId, moved: manifest.resources.length, alreadyQuarantined: true, manifest, manifestPath, operationDir };
    }
    if (manifest.status !== "moving") throw new TypeError("quarantine manifest status is invalid");
    return resumeQuarantineMove({ operationId, manifest, manifestPath, operationDir });
  }

  const orphanStat = await lstat(operationDir).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (orphanStat && (!orphanStat.isDirectory() || orphanStat.isSymbolicLink())) throw new TypeError("quarantine operation must be a regular directory");
  if (orphanStat) {
    const entries = await readdir(operationDir, { withFileTypes: true });
    if (entries.some((entry) => !["workspace", "agent-state"].includes(entry.name) || !entry.isDirectory() || entry.isSymbolicLink())) {
      throw new TypeError("orphan quarantine operation is invalid");
    }
  }
  const candidates = [
    { kind: "workspace", root: workspaceRoot, source: workspacePath(workspaceRoot, agentId) },
    { kind: "agent-state", root: agentStateRoot, source: agentStatePath(agentStateRoot, agentId) },
  ];
  const resources = [];
  for (const candidate of candidates) {
    const canonicalSource = await existingManagedDirectory(candidate.root, candidate.source, candidate.kind);
    const destination = join(operationDir, candidate.kind);
    const destinationStat = await lstat(destination).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (canonicalSource && destinationStat) throw new Error("quarantine source and destination both exist");
    if (destinationStat && (!destinationStat.isDirectory() || destinationStat.isSymbolicLink())) throw new TypeError("quarantine destination must be a regular directory");
    if (canonicalSource || destinationStat) resources.push({ kind: candidate.kind, source: candidate.source, destination });
  }
  if (!orphanStat) await mkdir(operationDir, { recursive: false, mode: 0o700 });
  const manifest = { version: 1, operationId, agentId, status: "moving", resources };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return resumeQuarantineMove({ operationId, manifest, manifestPath, operationDir });
}

function validateMoveManifest(manifest, { workspaceRoot, agentStateRoot, operationDir, agentId }) {
  const expected = new Map([
    ["workspace", { source: workspacePath(workspaceRoot, agentId), destination: join(operationDir, "workspace") }],
    ["agent-state", { source: agentStatePath(agentStateRoot, agentId), destination: join(operationDir, "agent-state") }],
  ]);
  const seen = new Set();
  for (const resource of manifest.resources) {
    const contract = expected.get(resource?.kind);
    if (!contract || seen.has(resource.kind) || resource.source !== contract.source || resource.destination !== contract.destination) {
      throw new TypeError("quarantine manifest resource is invalid");
    }
    seen.add(resource.kind);
  }
}

async function resumeQuarantineMove({ operationId, manifest, manifestPath, operationDir }) {
  try {
    for (const resource of manifest.resources) {
      const sourceStat = await lstat(resource.source).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
      const destinationStat = await lstat(resource.destination).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
      if (sourceStat && destinationStat) throw new Error("quarantine source and destination both exist");
      if (!sourceStat && !destinationStat) throw new Error("quarantine source and destination are both missing");
      if (sourceStat) {
        if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new TypeError("quarantine source must be a regular directory");
        await rename(resource.source, resource.destination);
      } else if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink()) {
        throw new TypeError("quarantine destination must be a regular directory");
      }
    }
    manifest.status = "quarantined";
    manifest.quarantinedAt = manifest.quarantinedAt || new Date().toISOString();
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
    return { operationId, moved: manifest.resources.length, alreadyQuarantined: false, manifest, manifestPath, operationDir };
  } catch (error) {
    for (const resource of [...manifest.resources].reverse()) {
      const sourceStat = await lstat(resource.source).catch(() => null);
      const destinationStat = await lstat(resource.destination).catch(() => null);
      if (!sourceStat && destinationStat?.isDirectory() && !destinationStat.isSymbolicLink()) {
        await rename(resource.destination, resource.source).catch(() => {});
      }
    }
    await rm(operationDir, { recursive: true, force: true });
    throw error;
  }
}

function validateQuarantineOperationId(operationId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(operationId)) throw new TypeError("operationId is invalid");
  return operationId;
}

function validateRetentionDays(value) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new TypeError("retentionDays is invalid");
  return days;
}

async function readQuarantineManifest(quarantineRoot, operationId, directoryName = operationId) {
  validateQuarantineOperationId(operationId);
  const root = await realpath(resolve(quarantineRoot));
  const operationDir = resolve(root, directoryName);
  if (!operationDir.startsWith(root + sep)) throw new TypeError("quarantine operation escapes root");
  const directoryStat = await lstat(operationDir);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new TypeError("quarantine operation must be a regular directory");
  const manifestPath = join(operationDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== 1 || manifest.operationId !== operationId || manifest.status !== "quarantined") throw new TypeError("quarantine manifest is invalid");
  validateAgentIdForManifest(manifest.agentId);
  if (!Array.isArray(manifest.resources)) throw new TypeError("quarantine resources are invalid");
  const manifestOperationDir = resolve(root, operationId);
  for (const resource of manifest.resources) {
    const destination = resolve(String(resource.destination || ""));
    if (!destination.startsWith(manifestOperationDir + sep)) throw new TypeError("quarantine resource escapes operation root");
    const actualDestination = resolve(operationDir, destination.slice(manifestOperationDir.length + 1));
    if (!actualDestination.startsWith(operationDir + sep)) throw new TypeError("quarantine resource escapes current operation root");
  }
  const manifestStat = await stat(manifestPath);
  const quarantinedAt = Date.parse(manifest.quarantinedAt || manifestStat.mtime.toISOString());
  if (!Number.isFinite(quarantinedAt)) throw new TypeError("quarantine timestamp is invalid");
  return { root, operationDir, manifestPath, manifest, quarantinedAt };
}

function validateAgentIdForManifest(agentId) {
  userIdFromAgentId(String(agentId || ""));
}

export async function listQuarantines({ quarantineRoot, now = Date.now() }) {
  const root = await realpath(resolve(quarantineRoot));
  const entries = await readdir(root, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === "_purged" || entry.name.endsWith(".purging")) continue;
    const item = await readQuarantineManifest(root, entry.name);
    results.push({
      operationId: item.manifest.operationId,
      agentId: item.manifest.agentId,
      status: item.manifest.status,
      quarantinedAt: new Date(item.quarantinedAt).toISOString(),
      ageDays: Math.max(0, Math.floor((now - item.quarantinedAt) / 86_400_000)),
      resourceCount: item.manifest.resources.length,
    });
  }
  return results.sort((a, b) => a.quarantinedAt.localeCompare(b.quarantinedAt));
}

export async function purgeQuarantine({ quarantineRoot, operationId, retentionDays, dryRun, now = Date.now() }) {
  const days = validateRetentionDays(retentionDays);
  if (typeof dryRun !== "boolean") throw new TypeError("dryRun must be boolean");
  validateQuarantineOperationId(operationId);
  const root = await realpath(resolve(quarantineRoot));
  const tombstoneDir = join(root, "_purged");
  const tombstonePath = join(tombstoneDir, `${operationId}.json`);
  const operationDir = join(root, operationId);
  const purgingDir = join(root, `${operationId}.purging`);
  const operationStat = await lstat(operationDir).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  const purgingStat = await lstat(purgingDir).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (operationStat && purgingStat) throw new TypeError("quarantine purge state is ambiguous");
  if (operationStat && (!operationStat.isDirectory() || operationStat.isSymbolicLink())) throw new TypeError("quarantine operation must be a regular directory");
  if (purgingStat && (!purgingStat.isDirectory() || purgingStat.isSymbolicLink())) throw new TypeError("quarantine purging target must be a regular directory");
  const existingTombstone = await readFile(tombstonePath, "utf8").catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (existingTombstone) {
    const tombstone = JSON.parse(existingTombstone);
    if (tombstone.version !== 1 || tombstone.operationId !== operationId) throw new TypeError("purge tombstone is invalid");
    validateAgentIdForManifest(tombstone.agentId);
    if (operationStat) throw new TypeError("purge tombstone conflicts with active quarantine");
    if (purgingStat) {
      const item = await readQuarantineManifest(root, operationId, `${operationId}.purging`);
      if (item.manifest.agentId !== tombstone.agentId) throw new TypeError("purge tombstone agent is invalid");
      if (dryRun) return { operationId, dryRun, eligible: true, purged: false, alreadyPurged: false };
      await rm(purgingDir, { recursive: true, force: false });
      return { operationId, dryRun, eligible: true, purged: true, alreadyPurged: false };
    }
    return { operationId, dryRun, eligible: true, purged: false, alreadyPurged: true };
  }
  if (!operationStat && !purgingStat) throw new TypeError("quarantine purge state is missing");
  const item = purgingStat
    ? await readQuarantineManifest(root, operationId, `${operationId}.purging`)
    : await readQuarantineManifest(root, operationId);
  const eligible = now - item.quarantinedAt >= days * 86_400_000;
  if (dryRun || !eligible) return { operationId, dryRun, eligible, purged: false, alreadyPurged: false };
  if (operationStat) await rename(operationDir, purgingDir);
  await mkdir(tombstoneDir, { recursive: true, mode: 0o700 });
  await writeFile(tombstonePath, JSON.stringify({ version: 1, operationId, agentId: item.manifest.agentId, purgedAt: new Date(now).toISOString() }) + "\n", { flag: "wx", mode: 0o600 });
  await rm(purgingDir, { recursive: true, force: false });
  return { operationId, dryRun, eligible: true, purged: true, alreadyPurged: false };
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
