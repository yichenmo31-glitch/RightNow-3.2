# P0 方案：加载 RightNow OpenClaw 插件并启用工具

日期：2026-07-02

服务器：`root@<your-server-host>`

项目：`/root/rightnow`

目标：让 OpenClaw Web 机器人真正使用 RightNow 数据工具、记忆上下文、饮食/训练工具和知识检索。

> 本文记录早期 Docker/P0 阶段的第二个阻塞问题。当前生产部署已经改为原生 systemd；具体路径和命令应以最新架构与 runbook 为准。

## 1. 问题

当时 Web 机器人已经通过 OpenClaw 回复，但 OpenClaw 日志显示 RightNow 插件没有被正确加载。

观察到的日志模式：

```text
plugins.allow: plugin not found: rightnow
stale config entry ignored; remove it from plugins config
ignored plugins.load.paths entry that points at OpenClaw's legacy bundled plugin directory
source=/app/extensions/rightnow
```

影响：

- Web 聊天仍可能得到模型回复。
- 但模型不一定能可靠调用 RightNow 工具。
- OpenClaw Agent 循环内可能无法使用长期记忆、用户上下文、饮食记录、训练数据和 RAG 知识工具。

## 2. 相关文件

RightNow 插件源码：

```text
/root/rightnow/openclaw/extensions/rightnow/openclaw.plugin.json
/root/rightnow/openclaw/extensions/rightnow/package.json
/root/rightnow/openclaw/extensions/rightnow/index.js
/root/rightnow/openclaw/extensions/rightnow/src/rightnow-tools.js
/root/rightnow/openclaw/extensions/rightnow/src/rightnow-knowledge.js
```

OpenClaw Gateway 部署：

```text
/root/rightnow/docker-compose.prod.yml
```

在线 OpenClaw 配置：

```text
/root/.openclaw/openclaw.json
```

工具使用的 Backend RPC 端点：

```text
/root/rightnow/backend/src/agent/agent.controller.ts
/root/rightnow/backend/src/agent/agent-rpc.service.ts
```

Backend 工具实现：

```text
/root/rightnow/backend/src/agent/tools/memory.tools.ts
/root/rightnow/backend/src/agent/tools/diet.tools.ts
/root/rightnow/backend/src/agent/tools/knowledge.tools.ts
```

## 3. 目标架构

预期工具链路：

```text
OpenClaw Agent
  -> RightNow 插件工具，例如 rightnow_get_context
  -> POST http://rn-backend:5000/api/agent/rpc
  -> Backend 校验 AGENT_SERVICE_TOKEN
  -> Backend 解析用户/通道身份
  -> Backend 读取或写入 RightNow 数据库
  -> 结果返回 OpenClaw Agent
  -> 模型在最终回复中使用结果
```

知识检索链路：

```text
OpenClaw Agent
  -> search_faq / search_core_theory / search_books
  -> RightNow 插件
  -> RAG 服务或 Backend 知识路径
  -> 检索结果返回模型
```

## 4. 产品边界

插件应该为机器人提供更好的上下文，但不能破坏身份隔离。

必需行为：

- Web 通道使用 `/api/chat` 中已登录 JWT 用户的 userId。
- 微信 P0 单用户模式可以在后续将官方微信消息映射到 `test7@qq.com`。
- RightNow 工具不得盲目操作一个全局用户。
- 工具无法解析用户身份时，必须明确失败，不能写入错误账号。

## 5. 可能的根本原因

当时 Compose 使用以下参数构建 OpenClaw：

```yaml
args:
  OPENCLAW_EXTENSIONS: "stepfun,deepseek,memory-core,feishu,rightnow"
  OPENCLAW_BUNDLED_PLUGIN_DIR: extensions
```

并挂载：

```yaml
./openclaw/extensions/rightnow:/app/extensions/rightnow:ro
```

但当时的 OpenClaw 运行时将 `/app/extensions/rightnow` 视为旧版内置插件路径并忽略。

因此源码虽然存在，但运行时插件发现路径或配置方式与当前 Loader 不匹配。

## 6. 建议的修复路径

使用 OpenClaw 当时官方的插件加载机制，不继续使用旧扩展路径。

由于加载方式与 OpenClaw 版本有关，后续操作人员应检查：

```text
/root/rightnow/openclaw
```

搜索以下概念：

```text
plugins.load.paths
plugins.allow
OPENCLAW_EXTENSIONS
OPENCLAW_BUNDLED_PLUGIN_DIR
openclaw.plugin.json
definePluginEntry
```

然后按照 Loader 当前期望的格式调整 RightNow 插件位置或配置。

优先修改部署和配置。除非已经证明插件注册 API 本身不兼容，否则不要重写全部工具逻辑。

## 7. 实施检查清单

### 步骤 1：确认已加载的插件

检查 Gateway 日志：

```bash
docker logs rn-openclaw-gateway --tail=200
```

最终状态应在已加载插件列表中包含 `rightnow`。

错误状态包括：

```text
plugin not found: rightnow
```

### 步骤 2：确认 `/api/agent/rpc` 可用

Backend 启动后检查日志：

```bash
docker logs rn-backend --tail=200
```

预期路由：

```text
Mapped {/api/agent/rpc, POST}
```

该路由当时已知存在，但仍应在测试工具前验证。

### 步骤 3：确认 Token 接线

两个服务必须使用相同的：

```text
AGENT_SERVICE_TOKEN
```

Gateway 环境变量：

```yaml
AGENT_SERVICE_TOKEN: ${AGENT_SERVICE_TOKEN}
RIGHTNOW_API_BASE: http://rn-backend:5000/api
```

Backend 环境变量：

```yaml
AGENT_SERVICE_TOKEN: ${AGENT_SERVICE_TOKEN:-}
```

在容器内检查：

```bash
docker exec rn-openclaw-gateway printenv | grep -E 'RIGHTNOW|AGENT'
docker exec rn-backend printenv | grep AGENT_SERVICE_TOKEN
```

如果 Token 为空或不一致，工具认证会失败。检查时不得把真实值复制到文档、日志或聊天中。

### 步骤 4：修复插件发现

采用当前 OpenClaw 源码支持的方式。候选方案：

1. 将 RightNow 插件移动或复制到 OpenClaw 期望的非旧版插件目录。
2. 将 `/root/.openclaw/openclaw.json` 中的 `plugins.load.paths` 改为受支持的路径格式。
3. 修改 Compose 构建参数或环境变量，在构建镜像时打包 `rightnow`。
4. 如果 OpenClaw 支持包形式插件，则在预期插件 workspace 中安装或链接 `@openclaw/rightnow`。

不得保留 OpenClaw 已标记为 stale 的配置项。过期的 allow/load 配置会造成插件已加载的错误印象。

### 步骤 5：重启 Gateway

修改插件发现或配置后：

```bash
cd /root/rightnow
docker compose -f docker-compose.prod.yml up -d --build openclaw-gateway
```

再次检查日志：

```bash
docker logs rn-openclaw-gateway --tail=200
```

预期结果：

- 不再出现 `plugin not found: rightnow`。
- 生效的 RightNow 插件路径不再出现 legacy path ignore 警告。
- 已加载插件列表包含 `rightnow`。

## 8. 工具调用验证

插件加载后，优先从产品链路测试。

1. 使用演示账号登录。
2. 向机器人询问档案或上下文：

```text
你还记得我的身高体重和今天的训练安排吗？
```

预期结果：

- Gateway 日志出现 RightNow 工具调用，理想情况下为 `rightnow_get_context`。
- Backend 日志显示调用 `/api/agent/rpc`。
- 如果已有数据，回复会引用真实档案或计划。

然后测试知识检索：

```text
减脂平台期应该怎么处理？
```

预期结果：

- Gateway 日志显示 `search_faq` 或 `search_core_theory`。
- 回复使用已配置知识库，而不只依赖模型通用知识。

再测试饮食分析：

```text
我午饭吃了一碗米饭和一份鸡胸肉，帮我估算一下热量。
```

预期结果：

- 工具可以调用 `rightnow_analyze_food_text`。
- 除非产品明确选择自动记录，否则机器人应在写入饮食记录前请求确认。

## 9. 重要实现风险

`rightnow-tools.js` 当时发送：

```js
const body = {
  tool,
  channel: "web",
  channelUserId: "",
  args,
};
```

除非 Backend 能从 OpenClaw Session 或参数可靠推导用户身份，否则该信息不足以完成身份解析。

完成前必须确认 `agent-rpc.service.ts` 如何解析用户身份。

最安全的设计：

- 对来自 Web 的 OpenClaw Session，Backend 应将 RightNow `userId` 暴露给工具调用或从可信 Session 推导。
- 对微信 P0，Backend 可以将微信通道映射到单个演示用户。
- 用户身份为空时，工具不得写入记录。

如果 OpenClaw 插件 API 提供 Session 或用户元数据，应使用该元数据，而不是硬编码 `channelUserId: ""`。

当前架构进一步要求：身份只能从规范的 RightNow Session/Agent 推导，模型参数不能覆盖 userId。

## 10. 验收标准

只有以下条件全部满足，问题才算解决：

- OpenClaw Gateway 日志显示 `rightnow` 插件已加载。
- 不再存在 stale 的 `plugin not found: rightnow` 警告。
- Web 聊天可以触发 `rightnow_get_context`。
- Backend 收到 `/api/agent/rpc`，且能够解析 RightNow 用户。
- 知识问题触发 `search_faq`、`search_core_theory` 或等效 RAG 路径。
- 饮食文本测试可以分析热量且不崩溃。
- 没有工具将数据写入错误用户。

## 11. 回滚

如果插件加载导致 Gateway 故障：

1. 移除新的插件加载配置。
2. 重启 `rn-openclaw-gateway`。
3. 确认 Web 聊天仍能获得普通 OpenClaw 模型回复。

该回滚保留基础聊天，但 Memory、工具和 RAG 仍不可用。

## 12. 与微信 P0 的关系

在 RightNow 插件修复前，微信 P0 食物图片流程没有实际业务意义。

期望的未来微信链路：

```text
微信官方 ClawBot
  -> OpenClaw 消息
  -> 同一 RightNow/OpenClaw 机器人内核
  -> rightnow_analyze_food_image
  -> 用户确认
  -> rightnow_log_diet
  -> Web 仪表板更新
```

没有 RightNow 插件时，微信可能可以聊天，但无法可靠地将热量同步回 RightNow Web。
