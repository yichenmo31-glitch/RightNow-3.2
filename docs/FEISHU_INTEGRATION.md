# 把 RightNow 接入飞书上的 OpenClaw

本文说明如何把 RightNow 的健身私教能力接入一个**你自己运行的 OpenClaw**（例如已经跑在飞书渠道上的 OpenClaw 助手「小爪」）。

> 一句话理解：
> **RightNow = 健身产品（Web + 后端 + 知识库 + 微信桥） + 一个给 OpenClaw 用的插件。**
> **OpenClaw = Agent 运行时（大脑），需要你自己准备**，本仓库不包含它的服务端源码。

---

## 1. 你需要准备什么

| 组件 | 来自哪里 | 说明 |
|------|----------|------|
| OpenClaw 网关（含 feishu 渠道） | 你自己（[github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)） | 已经在飞书上跑的那套 |
| RightNow 后端 | 本仓库 `backend/` | 暴露 `/api/agent/rpc` 供插件调用 |
| RAG 知识库服务 | 本仓库 `rag-service/` | `search_faq / search_core_theory / search_books` 使用 |
| RightNow 插件 | 本仓库 `openclaw/extensions/rightnow/` | 装进你的 OpenClaw |
| RightNow Web 前端 | 本仓库 `frontend/` | 用来生成绑定码（「绑定小爪」页面） |

本仓库 `docker-compose.prod.yml` 里的 `openclaw-gateway` 服务是一个**占位模板**（它 `build: ./openclaw` 引用的 `Dockerfile` 并不在仓库里）。如果你已经有自己的 OpenClaw，就**不要用**这个占位服务，直接把插件装进你现有的 OpenClaw。

---

## 2. 整体数据流

```
飞书用户
   │  发消息 / 发绑定码
   ▼
你的 OpenClaw 网关（feishu 渠道）
   │  加载 RightNow 插件 → 注册 20 个数据工具 + 3 个知识库工具
   │  工具调用时带 AGENT_SERVICE_TOKEN
   ▼
POST {RIGHTNOW_API_BASE}/agent/rpc         ← backend/src/agent/agent.controller.ts
   │  AgentServiceGuard 校验 AGENT_SERVICE_TOKEN
   │  resolveUser(channel, channelUserId) 解析出 RightNow 用户
   ▼
PostgreSQL（读写健身数据）
search_* 工具 → RAG 服务（{RAG_SERVICE_URL}/search）
```

---

## 3. 第一步：跑起来 RightNow 后端

```bash
cp .env.example .env
cp backend/.env.example backend/.env
# 填好 DATABASE_URL、JWT_SECRET、模型 key、以及下面第 4 步的 token
npm install
npm run db:up
npm run db:init
npm run dev:backend      # 或生产用 npm run build:backend + 部署
npm run dev:rag          # 可选，但知识库工具需要它
```

确认后端已经挂载 RPC 路由（日志里应出现）：

```
Mapped {/api/agent/rpc, POST}
```

后端 API 全局前缀是 `api`（`backend/src/main.ts` 里 `setGlobalPrefix('api')`），所以 RPC 完整路径是 `POST /api/agent/rpc`。

---

## 4. 第二步：接通 token 和地址

插件读取的配置（见 `openclaw/extensions/rightnow/index.js` 的 `resolveConfig`），可以通过插件 config 或环境变量注入到 **OpenClaw 网关进程**：

| 配置项 | 环境变量 | 值 |
|--------|----------|-----|
| `rightnowApiBase` | `RIGHTNOW_API_BASE` | 指向 RightNow 后端，**要带 `/api`**，例如 `http://rn-backend:5000/api` |
| `agentServiceToken` | `AGENT_SERVICE_TOKEN` | 任意强随机串，**必须和后端 `.env` 里的 `AGENT_SERVICE_TOKEN` 完全一致** |
| `ragServiceUrl` | `RAG_SERVICE_URL` | 指向 RAG 服务，例如 `http://rn-rag:8000` |

> 校验点：后端 `AgentServiceGuard`（`backend/src/agent/agent-service.guard.ts`）会比对 `Authorization: Bearer <token>` 与 `AGENT_SERVICE_TOKEN`。为空或不一致 → `401 Invalid agent service token`，所有工具调用失败。

容器内自检：

```bash
# OpenClaw 网关侧
printenv | grep -E 'RIGHTNOW_API_BASE|AGENT_SERVICE_TOKEN|RAG_SERVICE_URL'
# RightNow 后端侧
printenv | grep AGENT_SERVICE_TOKEN
```

---

## 5. 第三步：把插件装进你的 OpenClaw

RightNow 插件是标准的 OpenClaw 工具插件：

- 入口 `openclaw/extensions/rightnow/index.js`，用 `definePluginEntry` 注册。
- 清单 `openclaw/extensions/rightnow/openclaw.plugin.json`（`id: rightnow`、`activation.onStartup: true`、声明全部工具名）。
- 包名 `@openclaw/rightnow`（`package.json` 的 `openclaw.extensions` 指向 `./index.js`）。

按你所用 OpenClaw 版本的**插件加载方式**装入并允许它（三选一，取决于你的 OpenClaw）：

1. 放进 OpenClaw 期望的插件目录，并在 `openclaw.json` 的 `plugins.load.paths` / `plugins.allow` 中登记 `rightnow`；
2. 或作为包式插件安装 `@openclaw/rightnow` 到 OpenClaw 的插件工作区；
3. 或按你 OpenClaw 镜像的构建参数把 `rightnow` 打进镜像。

> **已知坑（插件加载）**：旧的加载方式会把插件目录当成 legacy 路径忽略，日志出现
> `plugins.allow: plugin not found: rightnow` / `stale config entry ignored`。
> 详见 `docs/P0_RIGHTNOW_OPENCLAW_PLUGIN_LOADING_SOLUTION.md`。
> 加载成功的标志：网关日志的已加载插件列表里含 `rightnow`，且没有 `plugin not found` 警告。

---

## 6. 第四步：飞书用户绑定（身份的关键）

飞书是「非 web」渠道，后端通过**绑定关系**来确定「这个飞书用户对应哪个 RightNow 账号」（`backend/src/agent/agent-binding.service.ts` 的 `resolveUser`）。因此每个飞书用户首次使用前要绑定一次：

1. 用户在 **RightNow Web 端** 打开 Dashboard 右上角菜单 → **「绑定小爪」**（`views/BindXiaozhua.tsx`）→ 点「生成绑定码」。
   - 该按钮调用 `POST /api/agent/bindings/code`（JWT 鉴权），返回 8 位大写十六进制码，**默认 10 分钟有效**（`AGENT_BIND_CODE_TTL_MIN` 可配）。
   - 如果暂时没有前端入口，也可以直接调 API：
     ```bash
     curl -X POST https://<你的域名>/api/agent/bindings/code \
       -H "Authorization: Bearer <用户登录后的 accessToken>"
     ```
2. 用户把这 8 位码**在飞书里发给小爪**。
3. 小爪触发 `rightnow_bind_email` 工具 → 后端 `auth.bind` → 建立 `feishu` 渠道到该 RightNow 用户的绑定。
4. 之后该飞书用户的所有工具调用都能解析到正确账户；可在 Web 的「绑定小爪」页看到已绑定账号并可解绑。

> Web 端聊天不需要绑定：web 渠道下 `channelUserId` 直接就是登录用户的 userId（`resolveUser` 的 web 分支）。绑定只针对 IM 渠道（飞书 / Telegram / 微信）。

---

## 7. 第五步：验证

在飞书里对小爪说一句需要用户数据的话，例如：

```
你还记得我的身高体重和今天的训练安排吗？
```

预期：

- OpenClaw 网关日志出现 RightNow 工具调用（理想是 `rightnow_get_context`）。
- RightNow 后端出现 `POST /api/agent/rpc` 调用，且能解析到用户（`AgentAuditService` 会写审计）。
- 回复引用了真实的档案 / 计划数据。

再测知识库：

```
减脂平台期应该怎么处理？
```

预期触发 `search_faq` 或 `search_core_theory`，走你配置的知识库而非模型泛化知识。

---

## 8. 已知坑与排查

### 8.1 飞书渠道识别（务必现场确认）

插件运行时用 `resolveRpcIdentity(ctx)`（`openclaw/extensions/rightnow/src/rightnow-tools.js`）从工具上下文 `ctx` 里取渠道和用户标识，读的字段是 `ctx.messageChannel`、`ctx.deliveryContext`、`ctx.requesterSenderId` 等。

但开源 OpenClaw 当前版本传给工具工厂的 `OpenClawPluginToolContext` 用的字段名是 `channel` / `channelUserId` / `senderId` / `sessionKey` / `agentId`。**字段名可能与插件读取的不一致**，导致：

- 若 `ctx.messageChannel` 为空 → `channel` 回退成 `"web"`，飞书身份被解析错；
- `channelUserId` 可能回退到 `sessionKey`/`agentId` 甚至 `"p0-single-user"`。

**验证方法**：在飞书触发一次工具，看后端收到的 `/api/agent/rpc` 请求体里 `channel` 和 `channelUserId` 是什么。
**修复方法**：若 `channel` 不是 `feishu`，把 `resolveRpcIdentity` 里读的字段名对齐到你这版 OpenClaw 实际传入的 `ctx` 字段（例如改用 `ctx.channel` / `ctx.channelUserId` / `ctx.senderId`）。

### 8.2 源码 `.ts` 与运行 `.js` 不一致

`openclaw/extensions/rightnow/src/*.js` 是实际运行的产物，`*.ts` 是**过时的旧源码**（例如 `rightnow-tools.ts` 里还写死 `channelUserId: ""`，而 `.js` 已实现 `resolveRpcIdentity`）。**以 `.js` 为准**。如果你要改逻辑并重新 build，务必先让 `.ts` 与 `.js` 对齐，否则 build 会用旧 `.ts` 覆盖掉正确的 `.js`。

### 8.3 Web 多用户首聊 500（仅当你也用 web 聊天）

后端默认 `OPENCLAW_PROVISION_MODE=verify` 只校验不创建 agent，新用户首次 web 聊天可能报 `agent not provisioned`。多用户 web 场景改为 `OPENCLAW_PROVISION_MODE=config-file`。详见 `docs/P0_OPENCLAW_AGENT_PROVISIONING_SOLUTION.md`。（纯飞书接入通常不涉及此项。）

### 8.4 常见错误对照

| 现象 | 可能原因 |
|------|----------|
| `401 Invalid agent service token` | 两侧 `AGENT_SERVICE_TOKEN` 不一致或为空 |
| `INVALID_REQUEST: channel, channelUserId, tool are required` | `ctx` 身份没解析出来（见 8.1），`channelUserId` 为空 |
| `NOT_BOUND: 尚未绑定` | 该飞书用户还没走绑定流程（见第 6 节） |
| `UNKNOWN_TOOL` | 工具名未在后端 `ToolRegistry` 注册，检查插件与后端版本是否匹配 |
| 知识库无结果 | `RAG_SERVICE_URL` 不通或 RAG 服务未起 |

---

## 9. 涉及的关键文件

```
openclaw/extensions/rightnow/
  index.js                       插件入口 / 配置解析
  openclaw.plugin.json           插件清单（工具声明）
  src/rightnow-tools.js          20 个数据工具 + resolveRpcIdentity（实际运行）
  src/rightnow-knowledge.js      3 个知识库工具（调 RAG）
backend/src/agent/
  agent.controller.ts            POST /api/agent/rpc
  agent-service.guard.ts         AGENT_SERVICE_TOKEN 校验
  agent-rpc.service.ts           分发工具 + 解析用户
  agent-binding.service.ts       绑定码生成 / 渠道绑定 / resolveUser
frontend/
  views/BindXiaozhua.tsx         「绑定小爪」页面（生成绑定码）
  api/agent-bindings.ts          绑定相关 API 客户端
```
