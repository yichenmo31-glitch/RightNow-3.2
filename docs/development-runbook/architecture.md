# RightNow 架构决策

## 跨服务身份契约

- 规范化用户 ID：去除应用用户 ID 首尾的空白字符，并转换为小写。
- OpenClaw Agent ID：`rightnow-<normalizedUserId>`。
- OpenClaw Session Key：`rightnow:<normalizedUserId>`。
- 云端工作区：`/root/.openclaw/workspace-rightnow-<normalizedUserId>`。
- 前缀转换具有幂等性。这些标识符由后端计算；模型提供的身份字段绝不作为权威来源。

## 数据权威性与冲突解决

权威性顺序如下：

1. 用户当前的明确陈述。
2. PostgreSQL 中最新确认的业务事实。
3. PostgreSQL `AgentMemoryProfile`。
4. OpenClaw `MEMORY.md`。
5. `memory/YYYY-MM-DD.md` 中带日期的观察记录。
6. Agent 推断。

PostgreSQL 负责保存当前体重、饮食、训练、TODO、计划、已确认的记忆事实和可恢复的档案。`MEMORY.md` 仅包含稳定且已确认的偏好，绝不能取代数据库中的当前事实。RAG 提供参考知识，而非用户事实。Session 历史记录用于保持对话连续性，而非作为持久事实来源。

## 安全与隔离边界

- 个人 OpenClaw 工作区 `/root/.openclaw/workspace` 不属于 RightNow 的管理范围。
- 每位 RightNow 用户都有独立的 Agent、Session 命名空间、工作区、数据库作用域和审计作用域。
- 浏览器客户端绝不接收 gateway、provisioner、internal API 或 agent-service token。
- 生产环境的 Backend、RAG、OpenClaw Gateway、Provisioner 和 PostgreSQL 全部位于云端，服务间仅通过回环地址或受限私网通信，并继续使用应用层 Bearer 身份验证。
- 本地 Dev 与云端 Prod 不互相调用、不共享数据库、Token、Agent workspace 或用户数据。Tailscale 仅作为可选远程开发通道，不是生产依赖。
- 高风险事实必须经过明确确认后，才能提升为持久事实。
- `out_of_domain` 请求不得调用 RightNow 数据库、记忆、RAG 或写入工具。

## 记忆持久化契约

- `AgentMemoryFact` 是候选或已确认持久事实的生命周期记录。状态只能是 `candidate`、`confirmed`、`rejected`、`expired` 或 `superseded`。
- `AgentMemoryProfile` 是每位用户仅有一份的版本化投影，仅根据已确认事实构建。
- 服务会将置信度校验为 `0..1`；Prisma 没有适用于该字段的可移植检查约束。
- 健康风险、过敏信息和执行授权必须具有明确的确认来源，才能被确认。
- 删除用户时，两个模型都会级联删除。查询与状态转换必须始终按 `userId` 限定事实 ID 的作用域。
- 事实生命周期只能向前推进：`candidate` 可以变为 `confirmed`、`rejected` 或 `expired`；`confirmed` 可以变为 `expired` 或 `superseded`。`rejected`、`expired` 和 `superseded` 状态的事实不能再次变为活跃状态。
- 明确更正会在同一事务中创建替代事实，并将同一用户、同一类别的活跃事实标记为 `superseded`。每条旧事实通过 `supersededById` 记录其替代事实。
- 档案同步会以确定性顺序排列已确认事实。仅当投影内容发生变化时，才递增 `memoryVersion` 并更新 `lastSyncedAt`；内容相同的同步为只读操作且具有幂等性。

## 本地端口

- React/Vite：默认为 `5173`。
- NestJS API：`5000`。
- RAG API：`8000`。
- 本地 Dev 使用 Windows 原生 PostgreSQL 16 或更高版本，连接契约为 `localhost:15433`。
- OpenClaw Gateway：`18789`，除非部署配置覆盖该值。
- OpenClaw Provisioner：默认为 `8787`；生产环境与 Backend 同机时仅绑定 `127.0.0.1`。

## 环境拓扑与原生部署契约

- 本地 Dev：React/Vite、NestJS、PostgreSQL、RAG 和可选的本地 OpenClaw 全部在开发机运行，只使用测试数据和本地密钥。
- 云端 Prod：Nginx、NestJS Backend、PostgreSQL 16、RAG、OpenClaw Gateway 和 Provisioner 全部部署在 `106.54.16.31`，不依赖开发机在线。
- 云端全部采用原生服务，不使用 Docker。Node.js 服务、Python RAG、OpenClaw Gateway 和 Provisioner 由 `systemd` 管理；前端静态文件和 HTTPS 由 Nginx 提供。
- PostgreSQL Prod 使用独立数据库 `rightnow_fitness_prod` 和专用低权限应用用户，仅监听回环地址或受限私网；应用不得使用 `postgres` 超级用户。
- Prod 只对公网开放 HTTPS（`443`，必要时 `80` 用于跳转）和受限来源的 SSH（`22`）。`5000`、`8000`、`8787`、`18789`、`5432` 不直接暴露公网。
- Dev 与 Prod 使用完全不同的 `.env`、JWT、内部 Token、Gateway Token、数据库和 workspace。Schema 通过可审查的 Prisma migration 发布到 Prod，不在 Prod 使用临时 `prisma db push`。
- Prod 必须配置 PostgreSQL、OpenClaw 配置/workspace、RAG 持久化目录和 uploads 的备份与恢复演练。

## OpenClaw 配置供应契约

- 内部端点为 `POST /provision`，使用 Bearer 身份验证，请求体为 `{ agentId, language? }`；调用方不能提供工作区路径。
- Agent ID 必须匹配 `^rightnow-[a-z0-9][a-z0-9_-]*$`，且长度不得超过 128 个字符。
- 工作区由服务器计算，位于 `OPENCLAW_WORKSPACE_ROOT` 下，名称为 `workspace-<agentId>`；生产环境中最终路径为 `/root/.openclaw/workspace-rightnow-<normalizedUserId>`。
- 配置供应过程使用排他锁串行执行，先校验现有 JSON，再写入备份和位于同一目录且经过 fsync 的临时文件，最后以原子方式重命名。
- 工作区初始化使用排他性文件创建，绝不覆盖现有用户文件。解析后的路径必须位于配置的根目录下；绝不读取或写入个人工作区。
- Web 插件调用仅从规范的 RightNow Session 或 Agent 推导数据库身份。Session 与 Agent 不匹配时，以拒绝方式安全失败；模型参数不能覆盖身份。

## 关键文件职责

- `AGENTS.md`：适用于整个仓库的贡献规则和强制阅读顺序。
- `docs/development-runbook/RIGHTNOW_DEVELOPMENT_STEP_BY_STEP.md`：有序的实现工作、职责归属、测试和门禁。
- `docs/development-runbook/progress.md`：执行证据、当前状态、阻塞项和交接说明。
- `docs/development-runbook/architecture.md`：已确认的跨模块决策和文件职责图；不包含临时调试记录。
- `backend/src/openclaw/openclaw.client.ts`：唯一的后端 gateway 客户端，以及规范的 Agent/Session ID 转换实现。
- `backend/scripts/test-openclaw-identity.cjs`：用于验证身份规范化和前缀幂等性的可执行回归测试。
- `backend/prisma/schema.prisma`：权威的关系型数据架构，包括业务事实、审计记录和持久记忆生命周期记录。
- `AgentAuditLog`：最小化工具审计记录，包含限定作用域的身份、工具、成功/错误状态、参数摘要和 `durationMs`；不得存储 token 或完整的私密记忆。
- `backend/src/agent/agent-rpc.service.ts`：经过身份验证的工具分发器；负责测量每个请求的持续时间，并且仅传递经过清理的审计输入。
- `backend/src/agent/agent-audit.service.ts`：最小化 Agent 工具审计记录的唯一持久化边界。
- `C:\Program Files\PostgreSQL\16\data`：本机原生 PostgreSQL 数据和配置目录，位于 Git 管理范围之外。该目录由 `postgresql-x64-16` 服务管理；仓库代码不得直接编辑它。
- `backend/src/agent-memory/agent-memory.module.ts`：Memory provider/export 边界；`AppModule` 负责应用级连接。
- `backend/src/agent-memory/dto/memory.dto.ts`：与 Prisma 枚举值匹配的生命周期、类别、来源词汇和服务输入契约。
- `backend/src/agent-memory/memory-candidate.service.ts`：确定性的第一阶段候选事实筛选；排除临时体重、饮食和训练事实，且绝不确认候选事实。
- `backend/src/agent-memory/agent-memory.service.ts`：候选事实持久化，以及限定用户作用域的确认、拒绝和过期状态转换。
- `backend/src/agent-memory/memory-conflict.service.ts`：以事务方式替换相互矛盾的已确认事实。
- `backend/src/agent-memory/memory-profile.service.ts`：仅包含已确认事实、版本化且幂等的 PostgreSQL 档案投影。
- `backend/src/agent-memory/memory-sync.service.ts`：为 Wave 3 `MEMORY.md` 序列化和远程同步预留的边界；在 Wave 1 中不包含传输行为。
- `backend/scripts/test-agent-memory.cjs`：使用与 Prisma 兼容的内存测试替身，覆盖候选事实、生命周期、隔离、冲突和档案规则的可执行回归测试套件。
- `infra/provisioner/src/config.js`：启动配置校验；拒绝缺失的 secret/path 和通配符网络绑定。
- `infra/provisioner/src/agent-id.js`：Provisioner 唯一的 Agent ID 语法和长度校验器。
- `infra/provisioner/src/config-store.js`：对 `openclaw.json` 中 `agents.list` 进行加锁、备份和原子更新的组件。
- `infra/provisioner/src/workspace.js`：隔离的工作区路径推导、模板和非破坏性初始化。
- `infra/provisioner/src/server.js`：经过身份验证的内部 `POST /provision` HTTP 契约和经过清理的错误边界。
- `infra/provisioner/src/index.js`：进程入口点，绑定经过校验的地址和端口。
- `infra/provisioner/test/provisioner.test.js`：本地安全性、幂等性、原子性、并发、隔离和 HTTP 回归测试套件。
- `openclaw/extensions/rightnow/openclaw.plugin.json`：插件清单和已声明的运行时工具契约。
- `openclaw/extensions/rightnow/src/identity.js`：在运行时提取规范的 RightNow session/agent 身份，并移除由模型控制的身份字段。
- `openclaw/extensions/rightnow/src/identity.ts`：运行时身份契约的类型化源代码镜像。
- `openclaw/extensions/rightnow/src/rightnow-tools.js`：运行时工具注册和经过身份验证的后端 RPC 适配器；Web 调用在 RPC 之前使用身份模块。
- `openclaw/extensions/rightnow/test/identity.test.js`：针对 session、agent、伪造身份、空身份、个人身份及不匹配身份的回归测试用例。
- `.env` 和 `backend/.env`：被忽略的本地配置和 secret；绝不提交。
- `l1-faq/faq.json`：权威的结构化 FAQ 来源；每个条目都必须具有唯一 ID、问题和答案。
- `l2-core/`：权威的精炼核心指导 Markdown 来源；导入时记录源文件名。
- `l3-books/`：权威的深度参考以及安全/恢复 Markdown 来源；与 L2 保持分离，以便进行明确的风险路由。
- `rag-service/scripts/structure_check.py`：以只读方式校验 L1/L2/L3 的架构、唯一性、存在性和非空状态。
- `rag-service/scripts/prepare_sources.py`：可选的非破坏性规范化工具，以及将完整文档精确去重到调用方指定的一次性输出目录的工具。
- `rag-service/scripts/ingest_all.py`：规范的本地三层导入器；将 L1/L2/L3 映射到不同的 Chroma collection，并接受显式指定的持久化根目录。
- `rag-service/main.py`：用于分层检索和组合检索的 FastAPI RAG 边界；请求校验会在检索前拒绝空白查询。
- `rag-service/.work/` 和 `rag-service/chroma_*/`：被忽略的本地准备状态和 Chroma 持久化状态；它们是可重建的运行时数据，绝不是知识源的权威来源。
- `frontend/views/AIChat.tsx`：AI 教练/聊天视图状态机；从 `frontend/api/chat` 导入聊天运行时 API，且不得通过聚合 API barrel 再次声明同一个绑定。
- `frontend/vite.config.ts`：本地浏览器到后端的代理边界。面向用户的应用运行在端口 5173；端口 5000 仅供 API 使用，有意不提供根 HTML 页面。
- 本地 CORS 同时允许前端端口 5173/5174 上的 `localhost` 和 `127.0.0.1`。Vite 代理会保留浏览器 Origin，因此这两种回环地址写法是允许列表中的不同条目。
