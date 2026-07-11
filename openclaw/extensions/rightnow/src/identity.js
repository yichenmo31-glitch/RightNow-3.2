const USER_ID = /^[a-z0-9][a-z0-9_-]*$/;

function clean(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateUserId(value) {
  return USER_ID.test(value) ? value : "";
}

export function userIdFromSessionKey(value) {
  const sessionKey = clean(value);
  return sessionKey.startsWith("rightnow:")
    ? validateUserId(sessionKey.slice("rightnow:".length))
    : "";
}

export function userIdFromAgentId(value) {
  const raw = clean(value);
  const agentId = raw.startsWith("openclaw/") ? raw.slice("openclaw/".length) : raw;
  return agentId.startsWith("rightnow-")
    ? validateUserId(agentId.slice("rightnow-".length))
    : "";
}

export function resolveRightNowWebUserId(ctx) {
  const fromSession = userIdFromSessionKey(ctx?.sessionKey);
  const fromAgent = userIdFromAgentId(ctx?.agentId);
  if (fromSession && fromAgent && fromSession !== fromAgent) throw new Error("RightNow session and agent identity mismatch");
  const userId = fromSession || fromAgent;
  if (!userId) throw new Error("RightNow tool requires an isolated RightNow session or agent");
  return userId;
}

export function stripModelIdentity(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  const sanitized = { ...args };
  for (const key of ["userId", "channelUserId", "agentId", "sessionKey", "workspace"]) delete sanitized[key];
  return sanitized;
}
