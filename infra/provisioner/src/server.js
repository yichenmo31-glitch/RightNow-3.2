import { createHash, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { validateAgentId } from "./agent-id.js";
import { deprovisionAgentConfig, provisionAgentConfig } from "./config-store.js";
import {
  bootstrapWorkspace,
  quarantineAgentResources,
  restoreQuarantinedResources,
  workspacePath,
  writeMemory,
} from "./workspace.js";

function tokenMatches(header, token) {
  const value = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = createHash("sha256").update(token).digest();
  const actual = createHash("sha256").update(value).digest();
  return timingSafeEqual(actual, expected);
}

function respond(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request, maximumLength = 16_384) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximumLength) throw new TypeError("request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function agentStatus(config, agentId) {
  const workspace = workspacePath(config.workspaceRoot, agentId);
  const parsed = JSON.parse(await readFile(config.configPath, "utf8"));
  const matches = Array.isArray(parsed.agents?.list)
    ? parsed.agents.list.filter((agent) => agent?.id === agentId)
    : [];
  const configured = matches.length === 1 && matches[0].workspace === workspace;
  const required = ["AGENTS.md", "USER.md", "MEMORY.md", ".gitignore", "memory"];
  const checks = await Promise.all(required.map((name) => stat(join(workspace, name)).catch(() => null)));
  const workspaceReady = checks.every(Boolean) && checks.at(-1)?.isDirectory() === true;
  return { agentId, configured, workspaceReady };
}

function executeGatewayRestart(execFileImpl) {
  return new Promise((resolve, reject) => {
    execFileImpl(
      "/usr/bin/systemctl",
      ["--user", "restart", "openclaw-gateway.service"],
      {
        timeout: 30_000,
        windowsHide: true,
        env: { ...process.env, XDG_RUNTIME_DIR: "/run/user/0" },
      },
      (error) => error ? reject(error) : resolve(),
    );
  });
}

async function waitForGateway(config, fetchImpl, sleep) {
  const deadline = Date.now() + config.gatewayHealthTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(config.gatewayHealthUrl, { method: "GET", signal: AbortSignal.timeout(2_000) });
      if (response.status === 200) return;
    } catch {}
    await sleep(Math.min(250, Math.max(1, deadline - Date.now())));
  }
  throw new Error("OpenClaw Gateway health check timed out");
}

export function createProvisionerServer(config, dependencies = {}) {
  const execFileImpl = dependencies.execFile || execFile;
  const fetchImpl = dependencies.fetch || fetch;
  const sleep = dependencies.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  return createServer(async (request, response) => {
    if (!tokenMatches(request.headers.authorization, config.token)) return respond(response, 401, { error: "unauthorized" });
    try {
      const statusMatch = request.method === "GET" && request.url?.match(/^\/agents\/(rightnow-[a-z0-9][a-z0-9_-]*)$/);
      if (statusMatch) return respond(response, 200, await agentStatus(config, validateAgentId(statusMatch[1])));
      const memoryMatch = request.method === "PUT" && request.url?.match(/^\/agents\/(rightnow-[a-z0-9][a-z0-9_-]*)\/memory$/);
      if (memoryMatch) {
        const agentId = validateAgentId(memoryMatch[1]);
        const body = await readJson(request, 70_000);
        const status = await agentStatus(config, agentId);
        if (!status.configured || !status.workspaceReady) return respond(response, 409, { error: "agent workspace is not ready" });
        const result = await writeMemory({ workspaceRoot: config.workspaceRoot, agentId, content: body.content });
        return respond(response, 200, { agentId: result.agentId, bytes: result.bytes, updated: result.updated });
      }
      const deleteMatch = request.method === "DELETE" && request.url?.match(/^\/agents\/(rightnow-[a-z0-9][a-z0-9_-]*)$/);
      if (deleteMatch) {
        const agentId = validateAgentId(deleteMatch[1]);
        const body = await readJson(request);
        const allowed = new Set(["operationId", "reason"]);
        if (Object.keys(body).some((key) => !allowed.has(key))) throw new TypeError("deprovision paths are server-controlled");
        if (body.reason !== "account-deletion") throw new TypeError("deprovision reason is invalid");
        const operationId = String(body.operationId || "");
        const workspace = workspacePath(config.workspaceRoot, agentId);
        const quarantine = await quarantineAgentResources({ ...config, agentId, operationId });
        let removal;
        try {
          removal = await deprovisionAgentConfig({ configPath: config.configPath, agentId, workspace });
          if (removal.changed) {
            await executeGatewayRestart(execFileImpl);
            await waitForGateway(config, fetchImpl, sleep);
          }
        } catch (error) {
          if (!quarantine.alreadyQuarantined) {
            await restoreQuarantinedResources(quarantine).catch(() => {});
          }
          if (removal?.changed) {
            await provisionAgentConfig({ configPath: config.configPath, agentId, workspace }).catch(() => {});
            await executeGatewayRestart(execFileImpl).catch(() => {});
          }
          throw error;
        }
        return respond(response, 200, {
          agentId,
          operationId,
          changed: !quarantine.alreadyQuarantined && (removal.changed || quarantine.moved > 0),
          configured: false,
          resourcesQuarantined: quarantine.moved,
          gatewayReady: true,
        });
      }
      if (request.method !== "POST" || request.url !== "/provision") return respond(response, 404, { error: "not found" });
      const body = await readJson(request);
      const agentId = validateAgentId(body.agentId);
      if (Object.hasOwn(body, "workspace")) throw new TypeError("workspace is server-controlled");
      const workspace = workspacePath(config.workspaceRoot, agentId);
      const bootstrap = await bootstrapWorkspace({ workspaceRoot: config.workspaceRoot, agentId, language: body.language || "zh-CN" });
      const provision = await provisionAgentConfig({ configPath: config.configPath, agentId, workspace });
      if (provision.changed) {
        await executeGatewayRestart(execFileImpl);
        await waitForGateway(config, fetchImpl, sleep);
      }
      return respond(response, 200, { agentId, workspace, changed: provision.changed, filesCreated: bootstrap.created });
    } catch (error) {
      const clientError = error instanceof TypeError || error instanceof SyntaxError;
      return respond(response, clientError ? 400 : 500, { error: clientError ? error.message : "provisioning failed" });
    }
  });
}
