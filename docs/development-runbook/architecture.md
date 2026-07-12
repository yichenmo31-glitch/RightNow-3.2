# RightNow 架构决策

## 跨服务身份契约

- 规范化用户 ID：去除应用用户 ID 首尾的空白字符，并转换为小写。
- OpenClaw Agent ID：`rightnow-<normalizedUserId>`。
- OpenClaw Session Key：`rightnow:<normalizedUserId>`。
- 新对话 Session Key：`rightnow:<normalizedUserId>:<serverGeneratedConversationId>`；旧的不带后缀格式继续兼容。Conversation 必须由 Backend 为当前 JWT 用户创建，客户端不能控制 userId。
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
- Gateway 的 OpenAI-compatible Chat Completions 端点必须显式设置 `gateway.http.endpoints.chatCompletions.enabled=true`；2026.3.24 缺省关闭并返回 404。该端点仍只通过 `127.0.0.1:18789` 和 Gateway Token 访问。

## 环境拓扑与原生部署契约

- 本地 Dev：React/Vite、NestJS、PostgreSQL、RAG 和可选的本地 OpenClaw 全部在开发机运行，只使用测试数据和本地密钥。
- 云端 Prod：Nginx、NestJS Backend、PostgreSQL 16、RAG、OpenClaw Gateway 和 Provisioner 全部部署在 `106.54.16.31`，不依赖开发机在线。
- 云端全部采用原生服务，不使用 Docker。Node.js 服务、Python RAG、OpenClaw Gateway 和 Provisioner 由 `systemd` 管理；前端静态文件和 HTTPS 由 Nginx 提供。
- PostgreSQL Prod 使用独立数据库 `rightnow_fitness_prod` 和专用低权限应用用户，仅监听回环地址或受限私网；应用不得使用 `postgres` 超级用户。
- Prod 只对公网开放 HTTPS（`443`，必要时 `80` 用于跳转）和受限来源的 SSH（`22`）。`5000`、`8000`、`8787`、`18789`、`5432` 不直接暴露公网。
- Dev 与 Prod 使用完全不同的 `.env`、JWT、内部 Token、Gateway Token、数据库和 workspace。Schema 通过可审查的 Prisma migration 发布到 Prod，不在 Prod 使用临时 `prisma db push`。
- Prod 必须配置 PostgreSQL、OpenClaw 配置/workspace、RAG 持久化目录和 uploads 的备份与恢复演练。

## 生产数据库发布契约

- `rightnow_fitness_prod` 的 public schema、业务表、序列和 Prisma 管理的类型统一归低权限登录角色 `rightnow_app` 所有；旧角色 `rightnow` 只保留迁移兼容，不供新服务使用。
- 云端 PostgreSQL 的本机普通 TCP 连接使用 `scram-sha-256`；peer 仅用于本机 Unix socket 管理，replication 规则保持独立。PostgreSQL 仍只监听回环地址。
- 生产 schema 发布先使用 `prisma migrate diff --from-url ... --to-schema-datamodel ... --script` 生成 SQL，人工检查无破坏性语句后再应用。应用后必须再次 diff 并得到空迁移；禁止在 Prod 使用未审查的 `prisma db push`。
- Backend 必须通过 `DATABASE_URL` 以 `rightnow_app` 连接，并用 `current_user/current_database()` 验证实际身份。环境文件由 root 管理且权限为 `600`，不得将连接凭据写入 Git、日志或进度文档。

## 云端现状基线（2026-07-11）

- 主机为 OpenCloudOS 9.4，2 vCPU、3.6 GiB RAM、8 GiB Swap、系统盘可用约 36 GiB。
- 已运行 Nginx、PostgreSQL 15、`rightnow-backend.service` 和用户级 `openclaw-gateway.service`；不能按空机方案直接覆盖。
- Nginx 当前将公网根路径代理到 Personal OpenClaw Gateway；Personal workspace `/root/.openclaw/workspace` 及 `main/knowledge/health` Agent 必须保留。
- PostgreSQL 当前已有 `rightnow_fitness` 数据库和非超级用户 `rightnow`。升级到 PostgreSQL 16 或迁移到 `rightnow_fitness_prod` 前必须先备份并确认旧数据处理策略。
- OpenClaw Gateway 正确监听 `127.0.0.1:18789/18791`；旧 RightNow Backend 错误监听 `0.0.0.0:5000`，正式部署时必须改为 `127.0.0.1:5000` 并验证公网不可达。

## OpenClaw 配置供应契约

- 内部端点为 `POST /provision`，使用 Bearer 身份验证，请求体为 `{ agentId, language? }`；调用方不能提供工作区路径。
- Agent ID 必须匹配 `^rightnow-[a-z0-9][a-z0-9_-]*$`，且长度不得超过 128 个字符。
- 工作区由服务器计算，位于 `OPENCLAW_WORKSPACE_ROOT` 下，名称为 `workspace-<agentId>`；生产环境中最终路径为 `/root/.openclaw/workspace-rightnow-<normalizedUserId>`。
- 配置供应过程使用排他锁串行执行，先校验现有 JSON，再写入备份和位于同一目录且经过 fsync 的临时文件，最后以原子方式重命名。
- 工作区初始化使用排他性文件创建，绝不覆盖现有用户文件。解析后的路径必须位于配置的根目录下；绝不读取或写入个人工作区。
- Web 插件调用仅从规范的 RightNow Session 或 Agent 推导数据库身份。Session 与 Agent 不匹配时，以拒绝方式安全失败；模型参数不能覆盖身份。
- OpenClaw 会自动发现 `~/.openclaw/extensions/` 下的插件目录；RightNow 插件的历史备份不得保存在该目录内，否则会形成重复 plugin ID。备份统一放入 `/root/backups/` 的部署快照中。
- RightNow 插件必须声明并安装 `@sinclair/typebox` 运行时依赖。`registerMemoryPromptSupplement` 是版本相关的可选 Gateway API：存在时注册增强提示，不存在时跳过，不能阻止数据工具和 RAG 工具注册。

## RAG 生产运行契约

- 生产 embedding 模型固定为 `BAAI/bge-small-zh-v1.5`，缓存位于 `/var/lib/rightnow/models/hf`；首次下载可使用可达镜像，但运行时设置 `HF_HUB_OFFLINE=1`，不依赖外网启动。
- L1/L2/L3 Chroma 分别持久化到 `/var/lib/rightnow/rag/l1`、`l2`、`l3`，均由 `rightnow` 服务用户管理。知识源仍以 release 中的 `l1-faq/`、`l2-core/`、`l3-books/` 为权威，索引可以重建。
- RAG systemd 仅监听 `127.0.0.1:8000`；健康检查必须报告各层 vector count，空白 query 返回 422。风险/恢复问题必须保留 L3 来源元数据。

## 关键文件职责

- `AGENTS.md`：适用于整个仓库的贡献规则和强制阅读顺序。
- `docs/development-runbook/RIGHTNOW_DEVELOPMENT_STEP_BY_STEP.md`：有序的实现工作、职责归属、测试和门禁。
- `docs/development-runbook/progress.md`：执行证据、当前状态、阻塞项和交接说明。
- `docs/development-runbook/architecture.md`：已确认的跨模块决策和文件职责图；不包含临时调试记录。
- `backend/src/openclaw/openclaw.client.ts`：唯一的后端 gateway 客户端，以及规范的 Agent/Session ID 转换实现。
- `backend/src/openclaw/openclaw-provisioning.service.ts`：后端 Agent 存在性检查和 Provisioner 调用边界。生产 Gateway 2026.3.24 的 `/v1/models` 返回管理界面 HTML，不能作为 Agent 列表；`admin-http` 模式改为通过 Provisioner 的认证状态接口确认配置和 workspace 就绪，并拒绝非 JSON 或不完整状态响应。
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
- `backend/src/agent-memory/memory-sync.service.ts`：将 PostgreSQL Profile 确定性序列化为只含稳定偏好的 `MEMORY.md`，清理控制字符并转义 Markdown；通过认证 Provisioner 端点传输，不接受调用方 workspace 路径。
- `backend/src/agent-memory/memory-orchestrator.service.ts`：Memory 生命周期应用层边界；确认、拒绝、过期和纠正后依次聚合 Profile、确保 Agent 并同步 workspace。PostgreSQL 成功而外部同步失败时保留权威事实并明确返回 `workspaceSynced=false`。
- `backend/src/agent-memory/agent-memory.controller.ts`：JWT 用户候选列表和显式确认/拒绝/过期/纠正入口；ownership 只来自认证上下文，请求不得提供 userId 或确认来源。
- `backend/scripts/test-agent-memory.cjs`：使用与 Prisma 兼容的内存测试替身，覆盖候选事实、生命周期、隔离、冲突和档案规则的可执行回归测试套件。
- `infra/provisioner/src/config.js`：启动配置校验；拒绝缺失的 secret/path 和通配符网络绑定。
- `infra/provisioner/src/agent-id.js`：Provisioner 唯一的 Agent ID 语法和长度校验器。
- `infra/provisioner/src/config-store.js`：对 `openclaw.json` 中 `agents.list` 进行加锁、备份和原子更新的组件。
- `infra/provisioner/src/workspace.js`：隔离的工作区路径推导、模板和非破坏性初始化。
- `infra/provisioner/src/server.js`：经过身份验证的内部 `POST /provision` HTTP 契约和经过清理的错误边界。
- Provisioner 的 `GET /agents/<agentId>` 使用同一 Bearer 鉴权，只返回 `agentId`、`configured` 和 `workspaceReady`；它以 `openclaw.json`、服务端推导路径及必需模板为依据，不读取或返回 workspace 内容。
- 新 Agent 配置写入后，Provisioner 使用固定、无 shell 的 `systemctl --user restart openclaw-gateway.service`，并设置 `XDG_RUNTIME_DIR=/run/user/0` 等待 loopback health 200 后才返回；幂等 provision 不重启 Gateway。
- Provisioner 的 `PUT /agents/<agentId>/memory` 只接受 Backend 生成且不超过 64 KiB 的固定格式文本；服务端推导 workspace，拒绝符号链接/非普通 `MEMORY.md`，并用同目录临时文件、fsync 和原子 rename 更新。PostgreSQL Profile 始终是权威来源。
- Provisioner 反注册契约为认证 `DELETE /agents/<rightnow-agentId>`，body 只允许 `operationId` 和固定 `reason=account-deletion`；调用方不得提供 workspace、session、config、quarantine 或 force 参数。服务端分别从 `OPENCLAW_WORKSPACE_ROOT` 和 `OPENCLAW_AGENT_STATE_ROOT` 推导唯一 active 目录。
- 反注册不直接删除目录：workspace 与 OpenClaw 2026.3.24 的 `/agents/<agentId>` state 先原子 rename 到同盘 `OPENCLAW_QUARANTINE_ROOT/<operationId>`，写入不含正文/Token 的 manifest，再原子移除唯一 Agent 配置并重启/等待 Gateway。重复相同 operation 返回幂等结果；Gateway/配置失败时恢复 active 目录和 Agent 配置。
- Quarantine root 必须位于 active OpenClaw state 之外；目标 workspace/state 必须是 canonical root 下的普通目录且不是 symlink。Personal workspace、main/knowledge/health 及调用方路径永远不能成为反注册目标。Quarantine purge 和 restore 是后续独立运维状态，不属于同步 DELETE 的递归删除动作。
- 账户删除采用持久状态机而不是跨 PostgreSQL/文件系统伪事务。User 先从 `ACTIVE` 转为 `DELETION_PENDING` 并递增 `authVersion`，JWT guard 立即拒绝 pending 或旧版本 Token；同一事务撤销 Agent/所有外部通道绑定入口并创建不依赖 User FK 的 `AccountDeletionJob`。
- `DELETE /users/me` 只从 JWT 获取 userId，要求当前密码和安全 `Idempotency-Key`，拒绝 body userId。冻结请求只返回 202/job 状态，不直接删除 User。后续 worker 必须依次完成 OpenClaw/upload quarantine、DB purge、审计匿名化和 finalization，阶段失败保持可重试。
- 删除后的 AgentAudit 采用匿名最小保留：清空 `userId`、`channelUserId` 和 `argsDigest`，保留 tool、ok、errorCode、durationMs、createdAt。`WechatBindCode` 无 User FK，DB purge 必须显式删除；UploadAsset 行级联不能替代磁盘文件 quarantine。

## Intent Classifier V2 Phase 1 契约

- Chat 分类保留 V1 `IntentDecision`，并通过 `IntentDecisionV2` 增加 `resource / operation / scope / selectedRoute`；现有写入、高风险和领域外策略继续使用 V1 确定性规则。
- 当前启用的 V2 范围仅限 `today_plan`、`weekly_plan`、`today_todos` 和 `pending_todos` 四个低风险只读路由。语义模型、Shadow 分类、多轮指代和其他资源查询尚未启用。
- 四个只读路由必须在 OpenClaw、RAG、Memory 同步和聊天模型之前短路。它们只能按 JWT 用户作用域读取 PostgreSQL；除正常保存用户/助手 ChatMessage 外，不得写业务表。
- 今日聚合直接读取 `Todo` 和 `AiCoachProgress.activePlan`，不得调用会创建或刷新任务的 `TodosService.list/ensureDailyTodos`。周计划权威来源为 `AiCoachProfile.fitnessPlan.weeklyTrainingPlan`。
- PostgreSQL 没有可用计划时，Backend 返回确定性空状态模板，不得因为 OpenClaw、RAG 或模型不可用而返回 500。
- 输入规范化只生成分类特征，原始消息仍用于聊天持久化；分类诊断不得记录完整正文。领域外、高风险和明确修改/创建措辞优先回到既有安全与写入门禁。
- `INTENT_CLASSIFIER_VERSION=v2-shadow` 只启用异步语义比较，不改变执行路径。语义输入最多包含当前消息、最近四条必要消息、通道、图片类型和白名单布尔状态；不得包含完整 Profile、Memory 或身份凭据。
- Shadow 对高风险和确定性写入请求保持关闭。成功日志只记录分类枚举、置信度、阈值差异和耗时；失败日志只记录 `invalid_response/rate_limited/timeout/not_configured/provider_error`。默认 `v2` 不产生 Shadow 模型费用。
- V2 将业务目标与上下文装配分离。`contextProfile` 只能是 `none/current_plan/fitness_state/nutrition_state/progress_review/memory_preferences`；Backend 在 `intent-policy.ts` 中将其展开为固定 `selectedReadSet`。模型不能提供表名、文件路径、userId 或任意工具名来扩大读取范围。
- `current_plan` 只读取 active plan 和今日 TODO；其他 profile 只包含 PostgreSQL 汇总、目标和 confirmed preferences。计划、饮食、训练、体重和进展不得通过读取 workspace 文件替代数据库事实。
- V2 写入策略要求 `operation` 属于 `create/update/complete/delete`、旧确定性规则允许且存在明确措辞证据，三者缺一即 `requestedWrite=false`。稳定规则 ID 包括 `write.plan-explicit.v1`、`write.todo-explicit.v1`、`write.diet-explicit.v1`、`write.training-complete.v1` 和 `write.weight-explicit.v1`。
- 高风险请求在 V2 策略层强制 `requestedWrite=false`；领域外任务强制 `contextProfile=none` 和空读取集合。代码/文件类请求即使夹带“训练计划”等词也不能读取 RightNow 上下文。
- 语义分类器优先使用独立的 `INTENT_MODEL_BASE_URL/API_KEY/NAME`，默认超时 7 秒、最多 2 次；未配置时仅为本地兼容而回退到聊天 provider。真实密钥只写忽略的环境文件。聊天与图片模型不受分类 provider 切换影响。
- Backend 对明确日期词、无日期 TODO、进展分析、训练/饮食历史、最新体重和当前 Memory scope 做确定性规范化，并记录 `normalize.*`/`scope.*` 规则 ID。模型的 scope 不得覆盖明确日期或这些稳定产品默认值。

## 飞书官方机器人与 OpenClaw 通道契约

- 首版只运营一个 RightNow 官方“小爪”飞书应用/机器人，不为每位用户动态创建飞书应用。用户在 Web 生成 8 位一次性绑定码，在飞书私聊小爪并发送该码完成绑定。
- 飞书传输统一由独立 `feishu-bridge` 负责。生产不得同时启用另一套可接收同一官方应用事件的 OpenClaw Feishu ingress；避免形成双入口、重复 ACK、重复回复和两个 Event ID 权威来源。
- `feishu-bridge` 只负责飞书 URL challenge、验签/解密、Event Inbox、快速 ACK、媒体下载、OpenClaw 调用、Message Outbox、tenant access token 缓存和飞书发送 API。它不保存 RightNow 业务事实，也不接受模型提供的 userId。
- RightNow Backend 是绑定权威。规范映射为 `(tenantKey, openId) -> userId`；`tenantKey + openId` 唯一。`unionId` 只作为可选关联字段，不能代替已确认绑定。
- 绑定码有效期默认 10 分钟，只保存密码学摘要，只能成功核销一次。核销与创建/换绑检查必须在同一 PostgreSQL 事务完成。绑定码消息不得进入 OpenClaw、ChatMessage、RAG、Memory 或业务写入。
- 未绑定飞书身份只能执行绑定流程并收到固定引导；不得调用 OpenClaw、RAG、用户数据读取或业务写工具。一个飞书身份不得静默换绑其他 RightNow 用户，换绑需要显式撤销/确认流程。
- 飞书事件进入模型前必须持久化 `FeishuEventInbox.eventId UNIQUE`。重复 Event ID 直接返回成功且不再次进入 OpenClaw。回调在完成验签和 Inbox claim 后快速 ACK，模型推理与回复异步执行。
- Event ID 去重不能替代业务幂等。确定性写入使用 `(channel=feishu, eventId, actionType)` 唯一键；在业务写入成功但 Inbox 状态更新失败后重试时，必须返回原 `resultRecordId`，不得重复创建 DietRecord、TrainingRecord 或 TODO 变化。
- 飞书回复和主动推送统一写 `FeishuMessageOutbox`，发送 Worker 负责退避重试和最终失败状态。业务事务不得直接调用飞书发送 API；同一业务通知必须有唯一幂等键。
- 飞书用户绑定后仍使用独立 RightNow Agent `rightnow-<normalizedUserId>`。每个飞书私聊建立 Backend 生成的 `ChatConversation`，Session 为 `rightnow:<normalizedUserId>:<conversationId>`。Web 与飞书默认使用不同 Session，但共享 PostgreSQL Profile、业务事实、Agent 和 `MEMORY.md`。
- Bridge 调用 Gateway 时同时提供规范 Agent 和 Session；RightNow Plugin 必须从运行上下文推导 userId，并拒绝 Agent/Session 不一致、Personal Agent、模型伪造 userId 以及 `DELETION_PENDING` 用户。
- MVP 仅开放文本私聊、绑定、TODO 查询、饮食/训练确定性写入和文本回复。图片、群聊和主动推送必须在文本私聊与幂等门禁通过后分阶段开放。
- 群聊只响应明确 `@小爪`；身份仍来自发送者 openId。体重、体脂、伤病、饮食明细等敏感结果不得直接发到群聊，应转私聊。群 Session 与私聊 Session 分离。
- 图片通过飞书资源 API 下载后校验 MIME、大小和尺寸，保存为有清理期限的临时 UploadAsset；图片正文、绑定码、App Secret、Token 和完整私密消息不得进入日志或审计摘要。
- 账户进入 `DELETION_PENDING` 时立即撤销 `FeishuUserBinding`、删除未使用绑定码、取消未发送 Outbox，并拒绝新飞书业务消息。最终 Worker 清除或匿名化 Inbox 用户关联；企业级 `FeishuTenant` 不随单个用户删除。
- `infra/provisioner/src/index.js`：进程入口点，绑定经过校验的地址和端口。
- `infra/provisioner/test/provisioner.test.js`：本地安全性、幂等性、原子性、并发、隔离和 HTTP 回归测试套件。
- `openclaw/extensions/rightnow/openclaw.plugin.json`：插件清单和已声明的运行时工具契约。
- `openclaw/extensions/rightnow/package.json` 和 `package-lock.json`：插件独立运行时依赖及可重复安装锁定；云端插件部署后执行 `npm ci --omit=dev`。
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
- `ChatConversation`：服务端生成的新对话作用域，所有查询同时按 `id` 和 `userId` 验证 ownership；旧 `ChatMessage.conversationId=null` 继续属于 legacy Session。DB history 可通过 `OPENCLAW_USE_DB_HISTORY` 和 `OPENCLAW_DB_HISTORY_WINDOW` 控制，窗口为 0 时仍发送当前用户消息。
- Chat 的确定性业务写入先使用 `IntentClassifierService` 的规则结果。`body_data_update/weight_update` 在 ChatMessage 事务内写 `WeightRecord`、更新 User 当前体重并写最小审计；动态体重不得进入候选/Profile/MEMORY。模型回复不能作为是否写入权威业务事实的唯一决定者。
- Chat 的知识路由由 Backend 在调用 Gateway 前确定性执行：一般 `requiresKnowledge=true` 请求调用 RAG 自动多层 `/search`，高风险请求固定传 `collection=l3`。返回文档仅作为受限上下文注入 system prompt，`source_layer` 写入不含用户正文的 `knowledge.search` 审计；模型不能自行决定或伪造已使用的层。
- `out_of_domain` 在读取 DB 历史、ensure Agent、同步/提取 Memory、RAG 和 Gateway 之前短路，返回固定范围说明。该路径只持久化当前 user/assistant ChatMessage 以维持产品历史，不得写业务表或 Agent 工具审计。
- 高风险建议无论 RAG 是否可用都注入固定安全约束：停止可能加重伤情的活动，不作诊断、不提供激进或带伤训练方案，并在持续、严重或恶化时建议专业医疗评估。高风险分类不得触发确定性业务写入；风险事实仍只能经候选和用户显式确认进入 Profile/MEMORY。
- 饮食文本与训练完成属于 Backend 单写入者路径，不进入 Gateway，因此 OpenClaw 模型没有机会重复调用同类写工具。饮食先调用 `DietService.analyzeText`；只有 classifier 明确 `requiresWriteTool=true` 才在 Chat 事务中创建 `DietRecord`，否则仅返回估算。训练完成在同一事务创建 `TrainingRecord`、完成当前用户当天第一条未完成 training TODO，并写最小审计。
- Chat 写入结果通过可选 `businessAction` 返回 record ID、动作类型和 TODO 完成状态；前端不得从自然语言推断是否落库。动态饮食、训练和 TODO 继续排除在 Memory candidate/Profile/MEMORY 之外。
- `todo.today.list` 的 Agent tool 必须调用纯读 `TodosService.listExisting`。页面显式初始化可继续调用 `list/ensureDailyTodos`；任何标记为只读的 Agent 工具不得隐式创建、删除或重建 TODO。
- `frontend/vite.config.ts`：本地浏览器到后端的代理边界。面向用户的应用运行在端口 5173；端口 5000 仅供 API 使用，有意不提供根 HTML 页面。
- 本地 CORS 同时允许前端端口 5173/5174 上的 `localhost` 和 `127.0.0.1`。Vite 代理会保留浏览器 Origin，因此这两种回环地址写法是允许列表中的不同条目。
