# RightNow 分步开发与子代理执行指令

版本：1.0
基线分支：`local-integration`
依据：`RIGHTNOW_LOCAL_DEVELOPMENT_RUNBOOK.md`、`RIGHTNOW_MEMORY_ARCHITECTURE_RUNBOOK_SUPPLEMENT.md`
适用架构：Windows 本地 RightNow + PostgreSQL/RAG + Tailscale + 云端共享 OpenClaw Gateway

## 1. 完成目标

最终链路必须完整通过：

```text
React Web
  -> NestJS API
  -> PostgreSQL（权威业务事实与可恢复 Memory Profile）
  -> OpenClaw rightnow-<userId>
       |- Session（当前对话和工具轨迹）
       |- MEMORY.md（稳定偏好）
       |- memory/YYYY-MM-DD.md（阶段性观察）
       `- RightNow Plugin
            |- RightNow RPC -> PostgreSQL
            |- memory_search -> Agent Memory
            `- search_* -> RAG
```

完成时必须证明：

- 注册、登录、档案和核心业务数据可用。
- 首次聊天自动创建隔离的 RightNow Agent、Session 和 workspace。
- Agent ID 为 `rightnow-<userId>`，Session Key 为 `rightnow:<userId>`。
- PostgreSQL 事实、Agent Memory、Session 和 RAG 的职责没有混用。
- 记录类消息写入 PostgreSQL，建议类消息按需检索 RAG。
- 稳定偏好可以跨 Session 召回，动态业务事实不会进入 `MEMORY.md`。
- `out_of_domain` 不调用 RightNow 数据、知识或写工具。
- 高风险消息进入保守路径，未确认风险信息不能晋升为长期事实。
- Agent 重建、账户删除和用户隔离测试通过。

## 2. 子代理组织和硬性规则

最多同时运行 4 个角色：1 个主代理和 3 个子代理。

| 角色 | 标识 | 独占范围 | 主要职责 |
| --- | --- | --- | --- |
| 主代理 | `ROOT` | `backend/prisma/`、共享 `.env.example`、跨模块契约 | 计划、Schema、集成、合并、最终验收 |
| 后端与 Memory | `AGENT-BE` | `backend/src/agent-memory/`、后端单元测试 | Memory Profile、候选、冲突、同步、删除 |
| RAG | `AGENT-RAG` | `rag-service/`、L1/L2/L3 数据与测试 | 环境、导入、检索、持久化、质量验收 |
| OpenClaw/Provisioner | `AGENT-OC` | `infra/provisioner/`、`openclaw/extensions/rightnow/` | Agent 创建、workspace bootstrap、Plugin、Memory |
| 前端 | `AGENT-FE` | `frontend/` | 注册登录、档案、业务写读和聊天验收 |

并发槽位只有 4 个。需要前端工作时，结束或暂停当前已完成的子代理，再启动 `AGENT-FE`。

所有代理必须遵守：

1. 开始前执行 `git status --short`，不得覆盖其他代理的改动。
2. 只修改分配范围；共享文件修改请求交给 `ROOT`。
3. 不提交真实 Token、密码、用户数据、workspace 或 Chroma 数据。
4. 每一步完成后立即更新本目录的 `progress.md`，写入命令、结果和阻塞项。
5. 子代理不得自行提交 Git；由 `ROOT` 审查和提交。
6. 失败测试不得标记完成，不得用删除数据库 volume 代替普通故障诊断。
7. 对外 HTTP 流量必须同时使用 Tailscale 网络隔离和应用层 Token。

## 3. 阶段与并发安排

```text
Wave 0  ROOT：基线与契约
Wave 1  AGENT-BE + AGENT-RAG + AGENT-OC：模块骨架和独立测试
Wave 2  ROOT：数据库/后端集成；AGENT-FE：前端基线
Wave 3  AGENT-BE + AGENT-RAG + AGENT-OC：跨服务联调
Wave 4  ROOT：端到端、安全、恢复和提交
```

只有当前 Wave 的全部门禁通过后才能进入下一 Wave。

## 4. Wave 0：仓库、环境和契约

### 步骤 0.1：确认干净基线

负责人：`ROOT`

操作：

```powershell
git switch local-integration
git status --short --branch
git remote -v
git fsck --full --no-dangling
```

测试与通过标准：

- 分支为 `local-integration`。
- 远端为 `yichenmo31-glitch/RightNow-3.2`。
- `git fsck` 无错误。
- 已知未提交改动逐项记录到 `progress.md`，没有来源不明文件。

### 步骤 0.2：确认工具版本

负责人：`ROOT`

操作：

```powershell
git --version
node --version
npm --version
docker --version
docker compose version
py -0p
```

测试与通过标准：Node.js >= 22；Python 可选版本 >= 3.10；Docker CLI 和 Compose 可执行。

### 步骤 0.3：建立本地密钥文件

负责人：`ROOT`

操作：从 `.env.example` 和 `backend/.env.example` 创建本地 `.env`，分别生成 `JWT_SECRET`、`AGENT_SERVICE_TOKEN`、`INTERNAL_API_TOKEN`、`OPENCLAW_GATEWAY_TOKEN`、`OPENCLAW_ADMIN_TOKEN`。不得复用同一个值。

测试：

```powershell
git check-ignore .env backend/.env
git status --short
```

通过标准：两个 `.env` 均被忽略，`git status` 不显示任何密钥文件。

### 步骤 0.4：固定跨服务标识契约

负责人：`ROOT`

指令：在 `architecture.md` 记录并冻结：

```text
Agent ID    = rightnow-<normalizedUserId>
Session Key = rightnow:<normalizedUserId>
Workspace   = /root/.openclaw/workspace-rightnow-<normalizedUserId>
```

测试：为 `OpenClawClient.toAgentId` 和 `toSessionKey` 增加正常值、大小写、重复前缀测试。

```powershell
cd backend
npm run build
node -e "const {OpenClawClient}=require('./dist/openclaw/openclaw.client.js'); const c=new OpenClawClient({}); console.log(c.toAgentId('User-1'),c.toSessionKey('User-1'))"
```

通过标准：输出严格为 `rightnow-user-1 rightnow:user-1`，重复调用不会增加第二层前缀。

### 步骤 0.5：固定数据权威和冲突优先级

负责人：`ROOT`

指令：在 `architecture.md` 记录：

```text
当前用户明确表达
  > PostgreSQL 最新确认事实
  > PostgreSQL AgentMemoryProfile
  > MEMORY.md
  > 每日观察
  > Agent 推断
```

测试：由 `ROOT` 审查后续每个 API/工具设计；任何当前体重、训练明细、饮食明细或计划全文写入 `MEMORY.md` 的方案必须拒绝。

## 5. Wave 1A：PostgreSQL 与基础后端

### 步骤 1.1：启动独立 PostgreSQL

负责人：`ROOT`

```powershell
docker desktop start
npm run db:up
docker ps --filter name=rightnow-fitness-postgres
```

测试与通过标准：容器为 running/healthy；宿主机端口与 `DATABASE_URL` 一致。若 compose 映射 `15433:5432`，URL 必须使用 `localhost:15433`。

### 步骤 1.2：生成并验证现有 Prisma Schema

负责人：`ROOT`

```powershell
cd backend
npm install
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
```

测试：

```powershell
npx prisma validate
npx prisma db pull --print | Select-String 'model User|model ChatMessage'
```

通过标准：生成、push、seed 和 validate 均成功；`User`、`ChatMessage` 及训练、饮食、TODO 表存在。

### 步骤 1.3：验证认证和业务 API 基线

负责人：`ROOT`

启动后端：

```powershell
npm run start:dev
```

在另一终端注册、登录，并使用 JWT 请求 `GET /api/chat`。

通过标准：注册返回用户，登录返回 JWT，受保护接口无 Token 返回 401、有效 Token 返回 200。

### 步骤 1.4：验证意图分类基线

负责人：`ROOT`

```powershell
cd backend
npm run test:intent
```

通过标准：全部字段检查通过；至少覆盖训练记录、饮食记录、建议、高风险、混合意图和 `out_of_domain`。

### 步骤 1.5：验证 Agent RPC 鉴权和审计

负责人：`ROOT`

测试三个请求：无 Token、错误 Token、正确 `AGENT_SERVICE_TOKEN`。正确 Token 调用只读工具 `memory.context.assemble`。

通过标准：前两项为 401；正确 Token 为 200；`AgentAuditLog` 包含 userId、tool、状态和耗时，不包含 Token 或完整私密记忆。

## 6. Wave 1B：Memory 数据层

### 步骤 2.1：设计 Memory Schema

负责人：`AGENT-BE`；Schema 实际编辑由 `ROOT` 执行。

指令：提交字段提案，至少包括 `AgentMemoryProfile` 和 `AgentMemoryFact`；Fact 包含 category、content、source、confidence、status、观察和确认时间。

测试：`ROOT` 检查 `userId` 唯一性/索引、级联删除策略、status/source 枚举以及 `confidence` 写入校验方案。

### 步骤 2.2：实现并应用 Memory Schema

负责人：`ROOT`

重大变更前：

```powershell
docker exec rightnow-fitness-postgres pg_dump -U postgres rightnow_fitness > rightnow-before-memory.sql
```

修改 `backend/prisma/schema.prisma` 后执行：

```powershell
cd backend
npx prisma format
npx prisma validate
npm run prisma:generate
npm run prisma:push
npm run build
```

通过标准：所有命令成功，旧业务表和数据仍存在。

### 步骤 2.3：创建 `agent-memory` 模块骨架

负责人：`AGENT-BE`

创建 `backend/src/agent-memory/` 中的 module、service、candidate、conflict、sync service 和 DTO。先只接线，不实现自动模型抽取。

测试：

```powershell
cd backend
npm run build
```

通过标准：模块被 `AppModule` 引入，依赖注入无循环错误，应用可启动。

### 步骤 2.4：实现候选记忆写入

负责人：`AGENT-BE`

规则：明确的回复风格/运动偏好可创建 candidate；当前体重、单餐、单次训练不得创建；伤病、过敏和自动执行授权只能是 candidate，不能自动 confirmed。

测试：添加表驱动单元测试，至少包含：

```text
“以后回答直接一点” -> candidate
“今天体重 62.8kg” -> no memory candidate
“午饭吃了米饭” -> no memory candidate
“我膝盖可能有伤” -> candidate, never confirmed
```

通过标准：四类断言全部通过。

### 步骤 2.5：实现确认、拒绝和过期

负责人：`AGENT-BE`

实现 candidate -> confirmed/rejected/expired 的显式状态转换；高风险类别确认必须记录用户明确确认来源。

测试：非法反向转换、跨用户 fact ID、无确认依据的风险 fact 均必须失败。

### 步骤 2.6：实现冲突与纠正

负责人：`AGENT-BE`

输入“我现在喜欢跑步了，之前那条不用记了”时，使旧偏好失效并创建/确认新事实，不保留两个同时有效的矛盾结论。

测试：同一 user/category 查询只能返回新值；用户 B 不能更新用户 A 的 fact。

### 步骤 2.7：实现 Profile 聚合

负责人：`AGENT-BE`

仅从 confirmed facts 生成 `AgentMemoryProfile`；每次变更增加 `memoryVersion` 并更新 `lastSyncedAt`。

测试：candidate 不进入 Profile；confirmed 进入；rejected/expired 被移除；重复同步幂等。

## 7. Wave 1C：RAG 独立链路

### 步骤 3.1：创建 Python 3.11 虚拟环境

负责人：`AGENT-RAG`

```powershell
py -V:Astral/CPython3.11.15 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r rag-service/requirements.txt
```

测试：`python --version` >= 3.10；`python -c "import fastapi,chromadb; print('ok')"` 输出 `ok`。

### 步骤 3.2：检查知识源结构

负责人：`AGENT-RAG`

```powershell
python rag-service/scripts/structure_check.py --help
Test-Path l1-faq/faq.json
Get-ChildItem l2-core -File
Get-ChildItem l3-books -File
```

通过标准：三层均有数据；结构检查无阻断错误。

### 步骤 3.3：清洗和去重

负责人：`AGENT-RAG`

先对副本或脚本支持的输出目录执行清洗/去重，不直接覆盖唯一原始知识源。

测试：输出文件数、空文件数、重复摘要写入 `progress.md`；空文件数为 0。

### 步骤 3.4：导入 L1/L2/L3

负责人：`AGENT-RAG`

先运行 `ingest_all.py --help`，按实际参数导入到持久化目录。

测试：分别查询 collection 记录数；每层记录数 > 0；重启进程后记录数不变。

### 步骤 3.5：运行检索验收集

负责人：`AGENT-RAG`

固定测试：平台期、新手频率、力量与有氧、腰伤恢复、严重睡眠不足。

通过标准：普通问题命中 L1/L2；风险/恢复命中 L3；无大量无关结果；结果保留来源层和文档标识。

### 步骤 3.6：验证 RAG API

负责人：`AGENT-RAG`

```powershell
npm run dev:rag
Invoke-WebRequest http://localhost:8000/docs
```

测试 FAQ/Core/Books 三类 HTTP 查询，并验证非法空 query 返回 4xx，而不是 500。

## 8. Wave 1D：Provisioner 与 OpenClaw

### 步骤 4.1：只读审计云端

负责人：`AGENT-OC`

通过 SSH 只读取：OpenClaw 版本、Gateway 状态、`openclaw.json` 结构、插件目录、现有 Personal workspace。不得输出 Token，不得修改文件。

测试与通过标准：记录版本和路径；确认 Personal workspace 为 `/root/.openclaw/workspace`，后续方案不会访问它。

### 步骤 4.2：建立 Provisioner 骨架

负责人：`AGENT-OC`

在 `infra/provisioner/` 创建 Node.js 22 内部服务、Bearer 鉴权、配置读写和 workspace bootstrap 模块。

测试：无 Token/错误 Token 返回 401；服务只绑定配置的 Tailscale 地址；缺少配置时拒绝启动。

### 步骤 4.3：实现 Agent ID 校验

负责人：`AGENT-OC`

只接受 `^rightnow-[a-z0-9][a-z0-9_-]*$`，workspace 必须由服务端计算，API 不接受任意 workspace 路径。

测试：`../workspace`、Personal Agent ID、空 ID、超长 ID 全部返回 400；合法 ID 返回预期规范化值。

### 步骤 4.4：实现原子配置更新

负责人：`AGENT-OC`

流程：加锁 -> 读取 -> 校验 JSON -> 备份 -> 写临时文件 -> fsync/rename -> 触发或等待热加载。

测试：重复 provision 幂等；模拟写入失败时原文件不损坏；并发创建两个 Agent 不丢失任一配置。

### 步骤 4.5：创建 workspace 模板

负责人：`AGENT-OC`

创建 `AGENTS.md`、`USER.md`、`MEMORY.md` 和 `.gitignore` 模板。`MEMORY.md` 初始仅含 “No durable preferences confirmed yet.”。

测试：模板不含 Token、体重、计划全文或 Personal workspace 路径；`USER.md` 仅含最小 userId 和语言信息。

### 步骤 4.6：实现 workspace bootstrap

负责人：`AGENT-OC`

创建 `/root/.openclaw/workspace-rightnow-<userId>` 和 `memory/`；已有用户文件不得被无条件覆盖。

测试：首次创建文件齐全；第二次执行内容不丢失；路径逃逸测试失败；Personal workspace 的 mtime 和哈希不变。

### 步骤 4.7：连接 NestJS `admin-http`

负责人：`ROOT` 修改后端；`AGENT-OC` 提供契约。

配置：`OPENCLAW_PROVISION_MODE=admin-http`、`OPENCLAW_ADMIN_URL`、`OPENCLAW_ADMIN_TOKEN`。

测试：模拟 `/provision` 成功、401、500、超时和 Agent 热加载超时；错误信息不得泄漏 Token。

### 步骤 4.8：验证 Plugin contract

负责人：`AGENT-OC`

确认 `openclaw.plugin.json` 声明 `rightnow_classify_intent`，运行时工具清单与 contract 一致。

测试：JSON 可解析；插件 JS 通过 `node --check`；Gateway 日志显示 loaded 且无 ignored legacy path。

### 步骤 4.9：验证 Plugin 身份映射

负责人：`AGENT-OC`

`rightnow:user-123` 和 `openclaw/rightnow-user-123` 必须解析为数据库 userId `user-123`；任何模型参数都不能覆盖该映射。

测试：合法 session、合法 agent、伪造 args.userId、空身份和 Personal session 五类用例；后三类写工具必须失败。

### 步骤 4.10：配置 Memory embedding

负责人：`AGENT-OC`

先验证 provider 确实支持 OpenClaw embedding，不得假设 StepFun 聊天 Key 可用于 embedding。

```bash
openclaw memory status
openclaw memory index --force
openclaw memory search "不喜欢跑步的训练偏好"
```

通过标准：索引成功、搜索有来源；未配置 provider 时系统给出明确错误而不是伪造召回。

## 9. Wave 2：前端与后端集成

### 步骤 5.1：读取前端约束并建立基线

负责人：`AGENT-FE`

先完整阅读 `frontend/AGENTS.md`，再执行：

```powershell
npm --workspace frontend install
npm run build:frontend
npm run dev:frontend
```

通过标准：构建成功，`http://localhost:5173` 无白屏和阻断性控制台错误。

### 步骤 5.2：验证 Vite API 代理

负责人：`AGENT-FE`

确认浏览器使用 `/api`，开发代理指向后端实际端口。

测试：浏览器 Network 中注册/登录请求无 CORS 错误，刷新后 JWT 状态仍正确。

### 步骤 5.3：验证档案和体重闭环

负责人：`AGENT-FE`

创建测试用户、保存档案、写入体重、刷新页面。

通过标准：刷新后仍能读取；数据库存在同一 userId 数据；体重没有写入 Agent Memory 文件。

### 步骤 5.4：验证 TODO、饮食和训练页面

负责人：`AGENT-FE`

每类执行一次创建/读取；饮食使用虚构测试数据。

通过标准：页面立即更新，刷新后仍存在；请求失败显示可恢复错误状态；微信入口隐藏或标记未启用。

### 步骤 5.5：实现聊天诊断信息的开发态可见性

负责人：`AGENT-FE` 与 `ROOT`

不向普通用户泄漏内部工具参数；开发环境通过后端日志关联 requestId、intent、agentId、tool 和 audit。

测试：一次聊天可从浏览器 requestId 追踪到后端、OpenClaw 和 AgentAuditLog。

## 10. Wave 3：Memory、业务工具和 RAG 联调

### 步骤 6.1：实现 Memory 同步输出

负责人：`AGENT-BE`

从 `AgentMemoryProfile` 生成结构稳定、简短的 `MEMORY.md` 内容；动态业务事实字段不参与生成。

测试：固定 Profile 生成快照；字段顺序稳定；重复生成字节一致；恶意 Markdown 内容被安全处理。

### 步骤 6.2：实现安全的远程 Memory 同步

负责人：`AGENT-BE` 定义 payload；`AGENT-OC` 实现云端写入。

写入使用临时文件和原子 rename，只能写目标 RightNow workspace 的 `MEMORY.md`。

测试：跨用户路径、Personal 路径、符号链接逃逸全部拒绝；成功写入后文件权限正确。

### 步骤 6.3：验证偏好跨 Session 召回

负责人：`ROOT`

输入“以后回答直接一点，别写太长”，确认/同步偏好，创建新 Session 后询问普通健身问题。

通过标准：新 Session 回复风格生效；PostgreSQL Profile 与 `MEMORY.md` 一致；不依赖旧 Session transcript。

### 步骤 6.4：验证业务事实不进入 Memory

负责人：`ROOT`

输入“今天体重 62.8kg”。

通过标准：体重进入 PostgreSQL；`MEMORY.md` 和每日记忆不包含 62.8kg；新 Session 通过 RightNow 工具得到最新值。

### 步骤 6.5：验证每日观察和晋升

负责人：`ROOT`

第一次表达“不喜欢跑步，愿意用椭圆机”只写观察/candidate；不同日期第二次表达后才允许确认或晋升。

通过标准：首次不进入长期 Memory；满足规则后生成一句稳定偏好，不复制完整聊天。

### 步骤 6.6：验证冲突优先级

负责人：`ROOT`

构造旧 Memory 与新 PostgreSQL 事实冲突。

通过标准：回复使用 PostgreSQL 最新事实；审计记录冲突；同步流程移除不应存在的旧动态事实。

### 步骤 6.7：验证建议类 RAG 路由

负责人：`ROOT` + `AGENT-RAG`

输入“新手减脂一周练几次比较合适？”

通过标准：`fitness_advice/training_advice`、`requiresKnowledge=true`、调用正确 RAG 层、回复可执行且有来源。

### 步骤 6.8：验证饮食直接写入边界

负责人：`ROOT`

对比：

```text
“午饭吃了鸡胸肉和米饭” -> 分析 + 写入
“鸡胸肉和米饭大概多少热量” -> 只分析
```

通过标准：第一条返回记录 ID、声明估算且可纠正；第二条数据库行数不变；两条均不进入 `MEMORY.md`。

### 步骤 6.9：验证训练写入

负责人：`ROOT`

输入“我今天练完腿了，深蹲60kg做了4组”。

通过标准：分类为 `training_log/complete_training`；写入当前用户训练历史；相关 TODO 状态正确；前端刷新可见。

### 步骤 6.10：验证高风险路径

负责人：`ROOT` + `AGENT-RAG`

输入“我膝盖疼，但还想继续跳绳冲一下”。

通过标准：riskLevel=high；不写激进计划；优先检索 L3；不做医学诊断；未经确认的伤病不进入 confirmed memory。

### 步骤 6.11：验证领域外门控

负责人：`ROOT` + `AGENT-OC`

输入“帮我总结这个 TypeScript 文件”。

通过标准：`out_of_domain`；RightNow 数据工具、Memory Search、RAG 和写工具调用数均为 0；路由回通用 Agent 或明确返回领域外。

## 11. Wave 4：安全、恢复和生命周期

### 步骤 7.1：用户隔离测试

负责人：`ROOT`

用户 A 保存独特偏好，用户 B 发起语义相似查询。

通过标准：B 无法召回 A 的 Profile、Memory、Session、业务数据或审计内容；零泄漏。

### 步骤 7.2：Agent 重建测试

负责人：`ROOT` + `AGENT-OC`

备份后删除测试 Agent/workspace，保留 PostgreSQL，再触发 ensureAgent。

通过标准：Agent、模板和 Memory Profile 恢复；业务数据无损；Memory 索引可重建；Personal workspace 未变化。

### 步骤 7.3：账户删除流程

负责人：`AGENT-BE` + `AGENT-OC`，由 `ROOT` 验收。

删除对象：PostgreSQL 用户数据、ChatMessage、Memory Profile/Fact、RightNow Agent、workspace、sessions、上传文件。

通过标准：重复删除幂等；目标用户数据全部消失；其他用户和 Personal Agent 数据不变；审计保留合规的最小删除事件。

### 步骤 7.4：备份和恢复演练

负责人：`ROOT`

备份 PostgreSQL、uploads、Chroma、`openclaw.json`、RightNow workspaces/sessions 和加密环境变量。

通过标准：在隔离测试环境恢复后，至少一个测试用户完成登录、事实读取、偏好召回和 RAG 查询。

### 步骤 7.5：Tailscale 和防火墙验收

负责人：`AGENT-OC` + `ROOT`

只允许云服务器 Tailscale IP 访问 Windows TCP 5000/8000，不配置公网端口映射。

通过标准：云端私网请求成功；非允许来源失败；公网扫描不可达；应用层错误 Token 仍返回 401。

### 步骤 7.6：历史注入 feature flag

负责人：`ROOT`

第一阶段保持：

```env
OPENCLAW_USE_DB_HISTORY=true
OPENCLAW_DB_HISTORY_WINDOW=16
```

测试 16、4、0/仅恢复摘要三种模式的多轮指代、工具连续性和新 Session 恢复。只有回归通过后才降低窗口，不能一次性删除数据库历史注入。

### 步骤 7.7：日志隐私检查

负责人：`ROOT`

搜索运行日志和源码，确认不输出 Token、完整 `MEMORY.md`、完整私密聊天或模型可控 userId。

通过标准：日志只含 requestId、agentId、userId、tool、状态、耗时和必要摘要。

### 步骤 7.8：最终六流程验收

负责人：`ROOT`

依次完成：注册与 Agent、RAG 建议、训练写入、饮食直接写入、高风险、领域外。

通过标准：六条全部通过，并可从 requestId 和审计日志还原链路。

### 步骤 7.9：最终自动化检查

负责人：`ROOT`

```powershell
npm run build:backend
npm run build:frontend
cd backend
npm run test:intent
npx prisma validate
cd ..
node --check openclaw/extensions/rightnow/index.js
node --check openclaw/extensions/rightnow/src/rightnow-tools.js
git diff --check
git status --short
```

另运行 Memory 单元测试、Provisioner 测试、RAG smoke tests 和端到端 smoke tests。

通过标准：所有命令退出码为 0；无意外生成文件或密钥。

## 12. 每一步的进度记录格式

在 `progress.md` 中逐步追加：

```markdown
## <步骤编号> <标题>

- 负责人：
- 状态：pending | in_progress | blocked | completed
- 开始/完成时间：
- 修改文件：
- 执行命令：
- 测试结果：
- 证据摘要：
- 阻塞项：
- 下一步：
```

`architecture.md` 只记录已确认且跨模块生效的架构决策、接口契约、数据权威、命名、端口和安全边界，不记录临时调试过程。

## 13. Git 提交策略

每个提交只包含一个可独立验证的目标，建议顺序：

```text
docs(dev): add integrated step-by-step runbook
fix(openclaw): isolate RightNow agent namespace
feat(memory): add durable memory profile schema
feat(provisioner): bootstrap isolated RightNow workspaces
feat(memory): add candidate confirmation and sync
test(rag): add layered retrieval smoke tests
test(e2e): cover RightNow agent and memory flows
```

提交前必须执行对应模块测试和 `git diff --check`。禁止将 `.env`、数据库 dump、Chroma 索引、用户 workspace、Token 或测试用户隐私数据加入 Git。
