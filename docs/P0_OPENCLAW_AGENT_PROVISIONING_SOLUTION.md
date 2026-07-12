# P0 方案：为 Web 用户自动创建 OpenClaw Agent

日期：2026-07-02

服务器：`root@<your-server-host>`

项目：`/root/rightnow`

目标：让每位普通 RightNow Web 用户都能通过 OpenClaw 与 Web 机器人聊天，而不是将所有 Web 用户映射到 P0 演示账号。

> 本文是早期 Docker/P0 阶段的历史运维方案。当前生产架构已经改为原生 systemd 和独立 Provisioner；执行前应以 `development-runbook/architecture.md` 和最新 runbook 为准。

## 1. 问题

Web 机器人已经通过 Backend 调用 OpenClaw，但新注册的 Web 用户在首次聊天时可能失败。

观察到的错误模式：

```text
OpenClawProvisioningService
agent "<rightnow-user-id>" not declared in openclaw.json agents.list
OpenClaw agent not provisioned for user <rightnow-user-id>
```

当时的 Web 聊天链路：

```text
frontend AIChat
  -> POST /api/chat
  -> backend ChatService
  -> OpenClawProvisioningService.ensureAgent(userId)
  -> OpenClawClient.chat(model = openclaw/<userId>)
  -> OpenClaw Gateway /v1/chat/completions
```

故障发生在模型回复之前，位于 `ensureAgent(userId)` 内部。

## 2. 根本原因

Backend 当时的默认配置为：

```text
OPENCLAW_PROVISION_MODE=verify
```

在 `verify` 模式下，Backend 只检查 Agent 是否已经存在，不会创建缺失的 Agent。

在线 OpenClaw 配置文件：

```text
/root/.openclaw/openclaw.json
```

当时并没有为每个新 RightNow 用户在 `agents.list` 中配置对应条目。

控制该行为的代码：

```text
/root/rightnow/backend/src/openclaw/openclaw-provisioning.service.ts
```

当时的部署细节：`docker-compose.prod.yml` 已将 `/root/.openclaw` 同时挂载到 `rn-backend` 和 `rn-openclaw-gateway`，因此直接修改配置文件在技术上可行。

## 3. 产品边界

不要将此问题与 P0 微信单用户测试模式混淆。

必需行为：

- Web 用户继续使用各自 JWT 中的 `userId`。
- 新用户可以正常注册、登录并通过 Web 机器人聊天。
- P0 演示账号 `test7@qq.com` 只用于最初的微信官方 ClawBot 集成。
- 不得将所有 Web 用户映射到 `test7@qq.com`。
- 任何单用户映射只能作用于微信通道。

## 4. 当时建议的修复

当时建议 Backend 使用 `OPENCLAW_PROVISION_MODE=config-file`。

原因：

- 与当时的实现一致。
- 不需要新建 sidecar 服务。
- `/root/.openclaw` 已在 Backend 与 OpenClaw Gateway 之间共享。
- 在尚未完成微信多租户隔离时，也能支持普通 Web 多用户聊天。

修复后的预期行为：

1. 新用户发送第一条 Web 聊天消息。
2. Backend 发现缺少 `openclaw/<userId>`。
3. Backend 将 Agent 写入 `/root/.openclaw/openclaw.json`。
4. OpenClaw Gateway 热加载或检测到新 Agent。
5. Backend 重试或等待，直到 `/v1/models` 包含 `openclaw/<userId>`。
6. 聊天继续。

> 当前实现不再使用 `/v1/models` 判断 Agent 是否存在，而是通过经过认证的 Provisioner 状态接口检查配置和 workspace 是否就绪。

## 5. 历史实施步骤

### 步骤 1：向 Backend 传入创建模式

编辑：

```text
/root/rightnow/docker-compose.prod.yml
```

在 `backend.environment` 中加入：

```yaml
OPENCLAW_PROVISION_MODE: ${OPENCLAW_PROVISION_MODE:-config-file}
```

保留：

```yaml
OPENCLAW_CONFIG_PATH: /root/.openclaw/openclaw.json
```

### 步骤 2：清理 `.env`

编辑：

```text
/root/rightnow/.env
```

确保只有一个最终值：

```env
OPENCLAW_PROVISION_MODE=config-file
```

移除或忽略旧的重复值，例如：

```env
OPENCLAW_PROVISION_MODE=verify
```

同时让运行时 Gateway URL 与 Docker Compose 保持一致：

```env
OPENCLAW_GATEWAY_URL=http://rn-openclaw-gateway:18789
```

说明：当时 Compose 已为 Backend 固定该 Gateway URL，因此 `.env` 不一致的紧迫性低于传入创建模式。

### 步骤 3：确认 OpenClaw 配置结构

检查：

```text
/root/.openclaw/openclaw.json
```

最小有效结构：

```json
{
  "agents": {
    "defaults": {
      "model": "stepfun/step-3.7-flash"
    },
    "list": []
  }
}
```

当时的 Backend 代码可以在 `agents.list` 缺失时创建它，但显式保留该结构更便于审查。

### 步骤 4：重新构建或重启 Backend

修改 Compose 或环境变量后：

```bash
cd /root/rightnow
docker compose -f docker-compose.prod.yml up -d --build backend
```

如果没有源码变更，仅修改了 Compose 或环境变量：

```bash
cd /root/rightnow
docker compose -f docker-compose.prod.yml up -d backend
```

### 步骤 5：验证运行时环境变量

在 Backend 容器内检查：

```bash
docker exec rn-backend printenv | grep OPENCLAW
```

预期输出：

```text
OPENCLAW_PROVISION_MODE=config-file
OPENCLAW_CONFIG_PATH=/root/.openclaw/openclaw.json
OPENCLAW_GATEWAY_URL=http://rn-openclaw-gateway:18789
```

## 6. 必需的代码加固

`openclaw-provisioning.service.ts` 当时的错误日志字符串包含未展开的模板表达式：

```ts
'(mode=${this.mode()}). Pre-provision it via: openclaw agents add ${agentId}'
```

应改为模板字符串，让日志显示真实 mode 和 Agent ID：

```ts
`(mode=${this.mode()}). Pre-provision it via: openclaw agents add ${agentId}`
```

如果 OpenClaw 热加载慢于 3.2 秒，也可以增加 `waitForAgent` 的等待时间：

```ts
private async waitForAgent(agentId: string, tries = 20, delayMs = 500)
```

这只是提高部署容错性，不改变产品行为。

## 7. 验证计划

### 现有演示账号

使用：

```text
email: test7@qq.com
password: 123456
```

预期结果：

- 登录成功。
- Web 机器人聊天成功。
- 用户 ID 仍是 `test7@qq.com` 对应的真实 RightNow userId。

### 新注册账号

通过 Web 应用注册一个新邮箱。

预期结果：

- 登录成功。
- 首次聊天不返回 HTTP 500。
- `/root/.openclaw/openclaw.json` 为新 userId 增加一条 `agents.list` 配置。
- Backend/Gateway 网络内的 `GET /v1/models` 最终包含 `openclaw/<newUserId>`。

### 回归边界

确认：

- 其他用户仍能正常注册。
- 每个用户仍使用自己的 JWT 身份。
- 除非实际登录账号就是 `test7@qq.com`，否则任何 Web 请求都不得映射到该账号。

## 8. 回滚

如果配置文件创建模式导致不稳定：

1. 将 Backend 环境变量恢复为：

```env
OPENCLAW_PROVISION_MODE=verify
```

2. 重启 Backend。
3. 在 `openclaw.json` 中手动预创建所需 Agent。

该回滚会恢复之前较保守的行为，但新用户再次需要手动创建 Agent。

## 9. 长期方案

对于生产级多租户运行，`admin-http` 比 Backend 直接写配置文件更清晰：

- Backend 调用内部 Provisioner 服务。
- Provisioner 独占所有 OpenClaw 配置变更。
- 写入可以加锁并串行执行。
- 可以增加审计日志。

该方向后来已经成为当前架构。生产配置写入、Agent 删除和恢复必须由主操作方串行执行。
