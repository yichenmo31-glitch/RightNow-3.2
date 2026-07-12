import { isIP } from "node:net";
import { resolve } from "node:path";

export function loadConfig(env = process.env) {
  const bindAddress = String(env.PROVISIONER_BIND_ADDRESS || "").trim();
  const token = String(env.OPENCLAW_ADMIN_TOKEN || "").trim();
  const configPath = String(env.OPENCLAW_CONFIG_PATH || "").trim();
  const workspaceRoot = String(env.OPENCLAW_WORKSPACE_ROOT || "").trim();
  const agentStateRoot = String(env.OPENCLAW_AGENT_STATE_ROOT || "").trim();
  const quarantineRoot = String(env.OPENCLAW_QUARANTINE_ROOT || "").trim();
  const gatewayHealthUrl = String(env.OPENCLAW_GATEWAY_HEALTH_URL || "http://127.0.0.1:18789/healthz").trim();
  const gatewayHealthTimeoutMs = Number(env.OPENCLAW_GATEWAY_HEALTH_TIMEOUT_MS || 15_000);
  const port = Number(env.PROVISIONER_PORT || 8787);

  if (!bindAddress || !isIP(bindAddress)) throw new Error("PROVISIONER_BIND_ADDRESS must be an IP address");
  if (bindAddress === "0.0.0.0" || bindAddress === "::") throw new Error("PROVISIONER_BIND_ADDRESS must be a specific Tailscale address");
  if (!token || token.length < 32) throw new Error("OPENCLAW_ADMIN_TOKEN must contain at least 32 characters");
  if (!configPath) throw new Error("OPENCLAW_CONFIG_PATH is required");
  if (!workspaceRoot) throw new Error("OPENCLAW_WORKSPACE_ROOT is required");
  if (!agentStateRoot) throw new Error("OPENCLAW_AGENT_STATE_ROOT is required");
  if (!quarantineRoot) throw new Error("OPENCLAW_QUARANTINE_ROOT is required");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PROVISIONER_PORT is invalid");
  let healthUrl;
  try { healthUrl = new URL(gatewayHealthUrl); } catch { throw new Error("OPENCLAW_GATEWAY_HEALTH_URL is invalid"); }
  if (healthUrl.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(healthUrl.hostname)) {
    throw new Error("OPENCLAW_GATEWAY_HEALTH_URL must use HTTP loopback");
  }
  if (!Number.isInteger(gatewayHealthTimeoutMs) || gatewayHealthTimeoutMs < 100 || gatewayHealthTimeoutMs > 120_000) {
    throw new Error("OPENCLAW_GATEWAY_HEALTH_TIMEOUT_MS is invalid");
  }

  return {
    bindAddress,
    token,
    configPath: resolve(configPath),
    workspaceRoot: resolve(workspaceRoot),
    agentStateRoot: resolve(agentStateRoot),
    quarantineRoot: resolve(quarantineRoot),
    gatewayHealthUrl: healthUrl.toString(),
    gatewayHealthTimeoutMs,
    port,
  };
}
