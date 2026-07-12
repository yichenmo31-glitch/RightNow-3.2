const USER_ID = /^[a-z0-9][a-z0-9_-]*$/;
const CONVERSATION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateUserId(value: string): string {
  return USER_ID.test(value) ? value : "";
}

export function userIdFromSessionKey(value: unknown): string {
  if (typeof value !== "string") return "";
  const parts = value.trim().split(":");
  if (parts.length !== 2 && parts.length !== 3) return "";
  if (parts[0].toLowerCase() !== "rightnow") return "";
  if (parts.length === 3 && !CONVERSATION_ID.test(parts[2])) return "";
  return validateUserId(parts[1].toLowerCase());
}

export function userIdFromAgentId(value: unknown): string {
  const raw = clean(value);
  const agentId = raw.startsWith("openclaw/") ? raw.slice("openclaw/".length) : raw;
  return agentId.startsWith("rightnow-") ? validateUserId(agentId.slice("rightnow-".length)) : "";
}

export function resolveRightNowWebUserId(ctx: { sessionKey?: unknown; agentId?: unknown }): string {
  const fromSession = userIdFromSessionKey(ctx?.sessionKey);
  const fromAgent = userIdFromAgentId(ctx?.agentId);
  if (fromSession && fromAgent && fromSession !== fromAgent) throw new Error("RightNow session and agent identity mismatch");
  const userId = fromSession || fromAgent;
  if (!userId) throw new Error("RightNow tool requires an isolated RightNow session or agent");
  return userId;
}

export function stripModelIdentity(args: unknown): unknown {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  const sanitized = { ...(args as Record<string, unknown>) };
  for (const key of ["userId", "channelUserId", "agentId", "sessionKey", "workspace"]) delete sanitized[key];
  return sanitized;
}
