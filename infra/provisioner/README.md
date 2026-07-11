# RightNow OpenClaw Provisioner

Internal Node.js 22 service for idempotently declaring isolated RightNow agents and bootstrapping their workspaces. Bind `PROVISIONER_BIND_ADDRESS` to the cloud host's specific Tailscale IP; wildcard binds are rejected.

Required environment variables: `OPENCLAW_ADMIN_TOKEN` (32+ characters), `OPENCLAW_CONFIG_PATH`, `OPENCLAW_WORKSPACE_ROOT`, and `PROVISIONER_BIND_ADDRESS`. Optional: `PROVISIONER_PORT` (default `8787`).

`POST /provision` accepts `{ "agentId": "rightnow-user-123", "language": "zh-CN" }` with `Authorization: Bearer ...`. Workspace paths are always computed by the service and cannot be supplied by callers.
