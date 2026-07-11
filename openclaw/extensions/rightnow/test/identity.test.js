import assert from "node:assert/strict";
import test from "node:test";
import { resolveRightNowWebUserId, stripModelIdentity, userIdFromAgentId, userIdFromSessionKey } from "../src/identity.js";

test("canonical session identity maps to database user id", () => {
  assert.equal(userIdFromSessionKey("rightnow:user-123"), "user-123");
  assert.equal(resolveRightNowWebUserId({ sessionKey: "rightnow:user-123" }), "user-123");
});

test("canonical agent identity maps to database user id", () => {
  assert.equal(userIdFromAgentId("openclaw/rightnow-user-123"), "user-123");
  assert.equal(resolveRightNowWebUserId({ agentId: "openclaw/rightnow-user-123" }), "user-123");
});

test("model-controlled identity fields are stripped", () => {
  assert.deepEqual(stripModelIdentity({ userId: "victim", channelUserId: "victim", value: 1 }), { value: 1 });
});

test("empty and personal identities cannot use RightNow web tools", () => {
  assert.throws(() => resolveRightNowWebUserId({}), /requires an isolated/);
  assert.throws(() => resolveRightNowWebUserId({ sessionKey: "agent:main:main", agentId: "openclaw/personal" }), /requires an isolated/);
});

test("mismatched RightNow session and agent identities fail closed", () => {
  assert.throws(() => resolveRightNowWebUserId({ sessionKey: "rightnow:user-a", agentId: "openclaw/rightnow-user-b" }), /mismatch/);
});
