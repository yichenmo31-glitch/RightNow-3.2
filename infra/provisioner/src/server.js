import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { validateAgentId } from "./agent-id.js";
import { provisionAgentConfig } from "./config-store.js";
import { bootstrapWorkspace, workspacePath } from "./workspace.js";

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

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16_384) throw new TypeError("request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function createProvisionerServer(config) {
  return createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/provision") return respond(response, 404, { error: "not found" });
    if (!tokenMatches(request.headers.authorization, config.token)) return respond(response, 401, { error: "unauthorized" });
    try {
      const body = await readJson(request);
      const agentId = validateAgentId(body.agentId);
      if (Object.hasOwn(body, "workspace")) throw new TypeError("workspace is server-controlled");
      const workspace = workspacePath(config.workspaceRoot, agentId);
      const bootstrap = await bootstrapWorkspace({ workspaceRoot: config.workspaceRoot, agentId, language: body.language || "zh-CN" });
      const provision = await provisionAgentConfig({ configPath: config.configPath, agentId, workspace });
      return respond(response, 200, { agentId, workspace, changed: provision.changed, filesCreated: bootstrap.created });
    } catch (error) {
      const clientError = error instanceof TypeError || error instanceof SyntaxError;
      return respond(response, clientError ? 400 : 500, { error: clientError ? error.message : "provisioning failed" });
    }
  });
}
