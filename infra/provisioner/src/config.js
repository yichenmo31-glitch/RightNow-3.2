import { isIP } from "node:net";
import { resolve } from "node:path";

export function loadConfig(env = process.env) {
  const bindAddress = String(env.PROVISIONER_BIND_ADDRESS || "").trim();
  const token = String(env.OPENCLAW_ADMIN_TOKEN || "").trim();
  const configPath = String(env.OPENCLAW_CONFIG_PATH || "").trim();
  const workspaceRoot = String(env.OPENCLAW_WORKSPACE_ROOT || "").trim();
  const port = Number(env.PROVISIONER_PORT || 8787);

  if (!bindAddress || !isIP(bindAddress)) throw new Error("PROVISIONER_BIND_ADDRESS must be an IP address");
  if (bindAddress === "0.0.0.0" || bindAddress === "::") throw new Error("PROVISIONER_BIND_ADDRESS must be a specific Tailscale address");
  if (!token || token.length < 32) throw new Error("OPENCLAW_ADMIN_TOKEN must contain at least 32 characters");
  if (!configPath) throw new Error("OPENCLAW_CONFIG_PATH is required");
  if (!workspaceRoot) throw new Error("OPENCLAW_WORKSPACE_ROOT is required");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PROVISIONER_PORT is invalid");

  return { bindAddress, token, configPath: resolve(configPath), workspaceRoot: resolve(workspaceRoot), port };
}
