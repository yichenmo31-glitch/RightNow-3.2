const AGENT_ID = /^rightnow-[a-z0-9][a-z0-9_-]*$/;
const MAX_AGENT_ID_LENGTH = 128;

export function validateAgentId(value) {
  if (typeof value !== "string" || value.length > MAX_AGENT_ID_LENGTH || !AGENT_ID.test(value)) {
    throw new TypeError("agentId must be a valid RightNow agent identifier");
  }
  return value;
}

export function userIdFromAgentId(agentId) {
  return validateAgentId(agentId).slice("rightnow-".length);
}
