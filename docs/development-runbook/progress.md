# RightNow 开发进度

## Chat 与意图分类时间上下文

- 负责人：ROOT
- 状态：completed
- 开始/完成时间：2026-07-12
- 修改文件：`chat.service.ts`、`intent-semantic.service.ts`、相关测试及架构文档。
- 测试结果：Chat system prompt 包含 `Asia/Shanghai` 当前时间；语义输入包含固定日期时间、星期和时区；Intent/Chat 回归通过。
- 证据摘要：模型可以理解今天、今晚、明早等相对表达，但业务记录时间仍由 Backend/数据库生成。
- 阻塞项：无。
- 下一步：扩展“今晚/明早/周末”的 scope 黄金样本。
- 时间扩展已完成：`今晚/今早 -> today`、`明早/明晚 -> tomorrow`、`周末 -> week`、`刚才/刚刚 -> current`，并加入确定性单测。
- 八类本地真实 PostgreSQL 冒烟：计划、周计划、今日/未完成 TODO、训练历史、最新体重和当前进展均正确；首次“今天吃了多少”暴露旧规则误写，已收紧为带“多少/什么/哪些/查询”等问句绝不因“吃了”触发写入。误记录已从隔离测试账户清理，修复后返回空饮食记录且业务行数保持 0。

## Intent V2 Phase 3：受限只读语义灰度

- 负责人：ROOT
- 状态：completed（本地 Demo 开启；生产关闭）
- 开始/完成时间：2026-07-12
- 修改文件：`intent-policy.ts`、`intent-semantic.service.ts`、`intent-classifier.service.ts`、V2 测试、环境模板及架构/设计文档；本地忽略的 `backend/.env`。
- 执行命令：`npm --workspace backend run test:intent`、Chat/Memory 回归、Demo restart/readiness、`git diff --check`。
- 测试结果：高置信 low-risk progress analyze 可映射 `current_progress`；低置信、无 route、写入、高风险和分类失败均不执行；执行超时 2500ms、一次尝试，五次失败熔断 60 秒。
- 证据摘要：模型不能提供表、文件或任意工具；selectedRoute 来自 Backend route table。写入继续只走确定性规则。生产模板不默认开启 `v2-readonly`。
- 阻塞项：生产开放前仍需真实 Chat 长尾冒烟和连续失败熔断观测。
- 下一步：本地 Demo 验证长尾进展查询，并评估用户可接受延迟；生产保持 `v2`。
- 本地真实 Chat 验证：2500ms 首次尝试按设计超时并安全回退，但总回复约 9520ms；结合单请求 P95 约 3761ms，将执行上限调整为 4500ms。重启后同一长尾“最近这状态是不是有点掉了”在约 3484ms 返回 PostgreSQL `current_progress` 模板，确认未进入 OpenClaw/普通聊天。生产仍未开启。

## Intent V2：扩展确定性业务查询

- 负责人：ROOT
- 状态：completed
- 开始/完成时间：2026-07-12
- 修改文件：`intent-classifier.types.ts`、`intent-v2-rules.ts`、`today-plan-query.service.ts`、V2 测试及设计/架构文档。
- 执行命令：`npm --workspace backend run test:intent`、Chat/Memory 回归、`git diff --check`。
- 测试结果：新增 `today_diet/training_history/latest_weight/current_progress` 四类分类和 PostgreSQL 聚合模板测试；V1 224/224 及原四类只读路由继续通过。
- 证据摘要：八类常用查询全部在远程模型前短路；按 userId 查询且不写业务表，不调用 OpenClaw、RAG 或 Memory。远程语义结果仍不参与同步执行。
- 阻塞项：无。进展汇总目前是确定性任务/连续天数摘要，不声称提供模型分析或 RAG 建议。
- 下一步：补充这些路由的真实数据库 Chat 冒烟；同步语义 Phase 3 继续受 P95 门禁限制。

## Intent V2：120 条分层 Shadow 黄金集

- 负责人：ROOT
- 状态：completed（准确率与有效率门禁通过）；Phase 3 仍未启用
- 开始/完成时间：2026-07-12
- 修改文件：`docs/AGENT_INTENT_V2_SHADOW_SAMPLE.json`、`observe-intent-shadow.cjs`、`test-intent-v2.cjs`、`intent-policy.ts`、`intent-semantic.service.ts`、环境模板及本进度文档。
- 执行命令：`npm --workspace backend run test:intent`、两轮 `npm run observe:intent-shadow`、Chat/Memory 回归、`git diff --check`。
- 测试结果：黄金集扩展为 12 类 x 10 条，共 120 条且 case/message 唯一。首轮 `103/120=85.83%`；确定性冲突校正后最终有效响应 `120/120`、错误 `0`、resource `120/120`、operation `120/120`、三字段 `119/120=99.17%`、平均约 `2638ms/样本`。
- 证据摘要：今日计划、周计划、TODO、训练历史、今日饮食、进展、训练建议、TODO 创建、计划调整和 Memory 更新均达到 10/10；唯一 scope 偏差位于 latest weight 表达，已加入“上次称重/最近体重”确定性规范化与单测。
- 阻塞项：大样本准确率和有效响应率已超过设计门槛，但尚未测量 P95、并发限流和连续多轮稳定性；高风险/写入零误触发仍由确定性套件证明，语义写入执行继续关闭。
- 下一步：增加耗时分位数与小并发观测，然后仅评估只读 Phase 3 灰度；写入不随 Phase 3 开放。
- 小并发观测（2026-07-12）：每组 2 条、共 24 条、`concurrency=3`，有效 `24/24`、完全匹配 `24/24`、错误/限流 `0`、平均约 `3370ms`，P95 约 `10779ms`。准确率与可用性通过，但 P95 超过 `5000ms` 门禁，因此 Phase 3 保持关闭。

## Intent V2：独立分类模型与确定性 Scope

- 负责人：ROOT
- 状态：completed（小样本验证）；大样本门禁 pending
- 开始/完成时间：2026-07-12
- 修改文件：忽略的 `backend/.env`、`llm-chat.helper.ts`、`intent-semantic.service.ts`、`intent-policy.ts`、环境模板、V2 测试及设计/架构文档。
- 执行命令：安全 `/v1/models` 探测、`npm --workspace backend run test:intent`、`npm run observe:intent-shadow`、Chat/Memory 回归和 `git diff --check`。
- 测试结果：独立 OpenAI-compatible 分类端点 models 探测返回 200；12 条受控样本有效响应率 `100%`、三字段完全匹配 `12/12`、错误 `0`、平均约 `3304ms/样本`。
- 证据摘要：切换独立小型分类模型后先得到 `12/12` 有效、`9/12` 完全匹配；加入 Backend scope/冲突规范化后达到 `12/12`。真实 API Key 未进入 Git 或输出。
- 阻塞项：12 条样本不足以开放 Phase 3；仍需 100-150 条分层黄金集验证高风险漏判为 0、写入误触发为 0，并评估 P95。
- 下一步：扩展黄金集并重复受控 Shadow；达到正式门禁后才启用只读语义路由。

## Intent V2：上下文装配与确定性安全/写入策略

- 负责人：ROOT
- 状态：completed
- 开始/完成时间：2026-07-12
- 修改文件：`intent-classifier.types.ts`、`intent-policy.ts`、`intent-rules.ts`、`intent-v2-rules.ts`、`intent-semantic.service.ts`、`intent-classifier.service.ts`、`intent-shadow.ts`、V2 测试及设计/架构文档。
- 执行命令：`npm --workspace backend run test:intent`、`npm --workspace backend run test:chat-conversations`、`npm --workspace backend run test:agent-memory`、`git diff --check`。
- 测试结果：上下文 profile/read set、动作替换、TODO 创建、饮食写入、训练完成、高风险、领域外夹带和无证据训练表达均通过；V1 32 例 224/224 回归通过。
- 证据摘要：模型只提供业务分类候选，Backend 生成白名单 `selectedReadSet`；高风险强制撤销写入；明确写入同时具有正确 operation、规则 ID 和证据；“我喜欢跑步”不再描述为可写请求。
- 阻塞项：无。该变更不开放新的业务执行路由；Phase 3 仍受 Shadow 准确率和供应商稳定性门禁约束。
- 下一步：扩展 100-150 条分层黄金集，并在更稳定的分类供应商上重新运行 Shadow；达到门禁后才评估只读执行灰度。

## Intent V2 Phase 2：语义分类 Shadow 能力

- 负责人：ROOT
- 状态：completed（实现与自动化）；真实流量灰度证据 pending
- 开始/完成时间：2026-07-12
- 修改文件：`backend/src/agent/intent/intent-semantic.service.ts`、`intent-classifier.service.ts`、`agent.module.ts`、V2 测试、三份环境变量模板及设计/架构文档。
- 执行命令：`npm --workspace backend run test:intent`、`npm --workspace backend run test:chat-conversations`、`npm --workspace backend run test:agent-memory`、`git diff --check`。
- 测试结果：结构化 JSON 正常响应、低置信度只记录、坏 JSON 拒绝、最近四条上下文限制、布尔状态白名单、风险/写入不调用 Shadow、Shadow 不改变 selectedRoute 均通过。
- 证据摘要：`v2-shadow` 异步执行，V1 主链路不等待模型；日志不含消息正文或 prompt。默认 `v2` 保持 Phase 1 行为，不自动增加模型费用。
- 阻塞项：完成 Phase 2 产品灰度验收前，需要在明确授权的本地或预发布环境启用 `v2-shadow` 并积累一致率、错误率和延迟指标；生产未启用。
- 下一步：先运行受控 Shadow 观察窗口并扩展真实误判黄金集，再决定是否进入 Phase 3 只读灰度。
- 首轮受控观测（2026-07-12）：12 条虚构样本中 6 条供应商错误；6 条有效结果中 4 条三字段完全匹配，`exactRate=0.6667`，平均总耗时约 `7124ms/样本`。主要已知混淆为 `progress/analyze` 和训练建议 resource。结果未达到 Phase 3 门禁，已加强分类定义；不得据此开启执行灰度。
- 第二轮受控观测（2026-07-12）：加强定义后 12 条中仍有 5 条供应商/结构错误；7 条有效结果中 5 条完全匹配，`exactRate=0.7143`，平均总耗时约 `6731ms/样本`。剩余明确混淆为训练历史 `history/current` 和动作替换 `plan/training`。Phase 3 继续关闭。

## Intent V2 Phase 1：契约与只读计划查询

- 负责人：ROOT（子代理只读审计设计与测试边界）
- 状态：completed
- 开始/完成时间：2026-07-12
- 修改文件：`backend/src/agent/intent/intent-classifier.types.ts`、`intent-normalizer.ts`、`intent-v2-rules.ts`、`intent-classifier.service.ts`、`backend/src/chat/today-plan-query.service.ts`、`chat.service.ts`、`chat.module.ts`、相关测试脚本及架构/设计文档。
- 执行命令：`npm run test:intent`、`npm run test:chat-conversations`、`npm run test:agent-memory`、`npm run build:backend`。
- 测试结果：V1 32 例 224/224 字段断言通过；V2 18 个分类边界及只读聚合检查通过；Chat conversation、写入、RAG、高风险、领域外、纯 TODO 查询和 Memory 全部回归通过。
- 证据摘要：`今天计划是啥/今天练什么` 命中 `today_plan`；周计划、今日 TODO、未完成 TODO 均使用 PostgreSQL 确定性读取和模板回复；Chat 路由测试确认 OpenClaw、Provisioner、Memory、RAG 和候选事实捕获调用数为 0。
- 阻塞项：无。Phase 2 语义分类 Shadow、更多只读资源和有限多轮指代仍未实现。
- 下一步：先以 Shadow 模式实现结构化语义分类和最小化差异指标，不改变业务执行路径；写入继续由确定性门禁控制。

## 0.1 确认干净基线

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：无
- 执行命令：`git status --short --branch`、`git remote -v`、`git fsck --full --no-dangling`、`git log -5 --oneline`
- 测试结果：分支为 `local-integration`；远端为 `yichenmo31-glitch/RightNow-3.2`；完整 fsck 检查通过。
- 证据摘要：初始状态下唯一未提交的文件是按要求放在仓库根目录的 `AGENTS.md`。
- 阻塞项：无
- 下一步：验证工具链。

## 0.2 确认工具版本

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：无
- 执行命令：`git --version`、`node --version`、`npm --version`、Docker CLI/Compose 版本检查、`py -0p`
- 测试结果：Git 2.52.0、Node 24.13.0、npm 11.6.2、Docker 29.6.1、Compose 5.2.0、Python 3.11.15 可用。
- 证据摘要：Docker CLI 位于 `C:\Program Files\Docker\Docker\resources\bin\docker.exe`，可正常使用。
- 阻塞项：当前 shell 的 PATH 中没有 Docker CLI 目录；修复前需使用绝对路径或刷新 PATH。
- 下一步：创建忽略的本地配置。

## 0.3 建立本地密钥文件

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`.env`、`backend/.env`（已忽略，未提交）
- 执行命令：复制模板，生成独立随机值，`git check-ignore .env backend/.env`、`git status --short`
- 测试结果：两个文件均已被忽略；五个独立生成的 256 位值互不相同，且长度均至少为 64 个十六进制字符。
- 证据摘要：`git check-ignore` 返回 `.env` 和 `backend/.env`；两者均未出现在 `git status` 中。
- 阻塞项：无
- 下一步：生成文件而不暴露值。

## 0.4 固化跨服务身份契约

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`architecture.md`、`backend/package.json`、`backend/scripts/test-openclaw-identity.cjs`
- 执行命令：`npm run test:openclaw-identity`
- 测试结果：后端构建通过；针对规范化、大小写、空格、已有前缀和重复转换的 6 个身份断言均通过。
- 证据摘要：`npm run test:openclaw-identity` 执行成功，规范示例解析为 `rightnow-user-1 rightnow:user-1`。
- 阻塞项：无
- 下一步：构建并运行身份测试。

## 0.5 固化数据权威性与冲突优先级

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`docs/development-runbook/architecture.md`
- 执行命令：针对两个运行手册进行架构审查。
- 测试结果：数据权威顺序、Memory 排除项、隔离、风险和领域外边界均已明确记录。
- 证据摘要：`Data Authority and Conflict Resolution` 和 `Security and Isolation Boundaries` 部分。
- 阻塞项：无
- 下一步：完成 Wave 0 验证，然后开始 Wave 1。

## 1.1 启动隔离的 PostgreSQL

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：无
- 执行命令：Docker Desktop 启动/状态、`npm run db:up`、`wsl --status`、本机 PostgreSQL 发现、PostgreSQL 16 `winget` 安装尝试、PostgreSQL 9.5 只读版本/身份验证探测。
- 测试结果：本机 PostgreSQL 16.14 安装为 `postgresql-x64-16`，独立于旧版 9.5 服务运行，并接受 `localhost:15433` 上经过身份验证的连接。
- 证据摘要：`select version()` 返回 PostgreSQL 16.14；该服务设为自动启动并以 NetworkService 身份运行。超级用户密码已轮换，且仅保存在已忽略的本地环境文件中。
- 阻塞项：无。如果没有 WSL 2，Docker 仍然不可用，但本地数据库开发不再需要 Docker。
- 下一步：将旧版 PostgreSQL 9.5 服务排除在 RightNow 配置之外。

## 2.2 实现并应用 Memory Schema

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`backend/prisma/schema.prisma`
- 执行命令：`prisma format`、`prisma validate`、`prisma generate`，后端构建。
- 测试结果：Schema 格式化与验证、Prisma Client 生成、数据库推送、种子写入和 NestJS 编译均通过。
- 证据摘要：`AgentMemoryFact` 和 `AgentMemoryProfile` 与 `User`、`ChatMessage` 表均已存在。该 RightNow 数据库为新建空库，因此没有变更前备份或旧数据行。
- 阻塞项：无
- 下一步：扩展模块时添加基于数据库的 Memory 集成测试用例。

## 1.2 生成并验证 Prisma Schema

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：仅涉及已忽略的本地数据库和环境文件
- 执行命令：`prisma generate`、`prisma db push`、seed、`prisma validate`、PostgreSQL 系统目录查询。
- 测试结果：所有命令均通过；已创建 demo、buddy 和 admin 种子用户。
- 证据摘要：core 和 Memory 表存在于 PostgreSQL 16 的端口 15433 上。
- 阻塞项：无
- 下一步：验证受保护的 HTTP API。

## 1.3 验证认证与业务 API 基线

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：无
- 执行命令：启动已构建的 NestJS 应用；执行注册、登录和历史记录 HTTP 冒烟请求。
- 测试结果：未认证的聊天历史请求返回 401；注册成功；登录返回 JWT；认证后的历史记录请求返回 200。
- 证据摘要：后端在 `127.0.0.1:5000` 上成功启动并为数据库支持的请求提供服务。
- 阻塞项：无
- 下一步：将生成的测试用户保留为一次性本地数据。

## 1.4 验证意图分类基线

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：无
- 执行命令：`npm --workspace backend run test:intent`
- 测试结果：32 个用例和 224/224 项字段检查全部通过。
- 证据摘要：覆盖范围包括日志记录、建议、高风险、混合意图和 `out_of_domain`。
- 阻塞项：无
- 下一步：分类器更改后重新运行。

## 1.5 验证 Agent RPC 认证与审计

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`backend/prisma/schema.prisma`、`backend/src/agent/agent-audit.service.ts`、`backend/src/agent/agent-rpc.service.ts`
- 执行命令：三种认证 HTTP 请求、`memory.context.assemble`、直接审计验证。
- 测试结果：丢失/错误的令牌返回 401；正确的令牌成功；审计存储用户 ID、工具、状态、持续时间和经过净化的参数摘要。
- 证据摘要：冒烟审计记录了 `memory.context.assemble`、成功状态、269ms 耗时和 `{}`，未包含任何令牌或私有 Memory 内容。
- 阻塞项：无
- 下一步：围绕这些断言添加自动化 HTTP 集成套件。

## 2.1 设计 Memory Schema

- 负责人：AGENT-BE（提案）、ROOT（审核）
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`backend/prisma/schema.prisma`、`docs/development-runbook/architecture.md`
- 执行命令：根据权限、生命周期、风险、隔离和删除要求进行架构审查。
- 测试结果：Schema 已体现每个用户一个 Profile、事实索引、生命周期枚举、级联删除，以及由服务强制执行的置信度与风险约束。
- 证据摘要：已向 Schema 添加 `AgentMemoryProfile`、`AgentMemoryFact` 和三个 Memory 枚举。
- 阻塞项：无；Schema 已应用到原生 PostgreSQL。
- 下一步：补充针对真实 PostgreSQL 的 Memory Schema 集成测试。

## 2.3 创建 agent-memory 模块骨架

- 负责人：AGENT-BE
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`backend/src/agent-memory/agent-memory.module.ts`、`backend/src/agent-memory/memory-sync.service.ts`，以及同目录下的 DTO 和服务文件
- 执行命令：`npm --workspace backend run test:agent-memory`、`npm run build:backend`
- 测试结果：包含全部 Memory Provider 和导出项的 NestJS TypeScript 构建通过；模块内部不存在循环依赖。
- 证据摘要：ROOT 已在 `AppModule` 中导入 `AgentMemoryModule`；正式 Memory 测试脚本和仓库后端构建均成功退出。
- 阻塞项：无；后端启动和数据库连接已在步骤 1.3 验证。
- 下一步：后续模块接入时继续运行启动冒烟测试。

## 2.4 实现候选记忆创建

- 负责人：AGENT-BE
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`backend/src/agent-memory/memory-candidate.service.ts`、`backend/src/agent-memory/agent-memory.service.ts`、`backend/scripts/test-agent-memory.cjs`
- 执行命令：`cd backend`、`npm run build`、`node scripts/test-agent-memory.cjs`
- 测试结果：直接表达的回复风格偏好会创建候选记忆；当前体重、单次饮食和单次训练不会创建候选记忆；可能的膝伤仍会作为风险敏感候选记忆保留。
- 证据摘要：四个必需的表驱动用例全部通过，候选记忆持久化会验证置信度处于 `0..1` 范围内。
- 阻塞项：无
- 下一步：待聊天编排契约明确后再集成提取调用。

## 2.5 实现确认、拒绝与过期

- 负责人：AGENT-BE
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`backend/src/agent-memory/agent-memory.service.ts`、`backend/src/agent-memory/dto/memory.dto.ts`、`backend/scripts/test-agent-memory.cjs`
- 执行命令：`cd backend`、`npm run build`、`node scripts/test-agent-memory.cjs`
- 测试结果：跨用户事实访问失败；缺少明确用户证据时风险确认失败；有效风险确认成功；非法的 confirmed 到 rejected 反向转换失败。
- 证据摘要：状态转换同时按 `id` 和 `userId` 查询；失效时间戳和确认证据均会持久化。
- 阻塞项：无；原生 PostgreSQL 已可用。
- 下一步：补充针对真实 PostgreSQL 的状态转换集成测试。

## 2.6 实现冲突与纠正

- 负责人：AGENT-BE
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`backend/src/agent-memory/memory-conflict.service.ts`、`backend/scripts/test-agent-memory.cjs`
- 执行命令：`cd backend`、`npm run build`、`node scripts/test-agent-memory.cjs`
- 测试结果：纠正用户 A 的训练偏好后只保留一个有效值，旧事实会关联至替代事实，且不会修改用户 B 的同类事实。
- 证据摘要：创建替代事实并废止同一用户同类别旧事实的操作在一个 Prisma 事务中执行。
- 阻塞项：无；原生 PostgreSQL 已可用。
- 下一步：添加真实事务/并发集成案例。

## 2.7 实现 Profile 聚合

- 负责人：AGENT-BE
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`backend/src/agent-memory/memory-profile.service.ts`、`backend/scripts/test-agent-memory.cjs`
- 执行命令：`cd backend`、`npm run build`、`node scripts/test-agent-memory.cjs`、`npx prisma validate`
- 测试结果：只有已确认事实会进入 Profile；确认候选记忆会增加版本号；事实过期后会从 Profile 移除并再次增加版本号；内容相同的同步不会改变版本号。
- 证据摘要：确定性排序和字节等效 JSON 比较使重复同步只读且幂等； Prisma 验证已通过。
- 阻塞项：无；原生 PostgreSQL 已可用。
- 下一步：补充真实数据库投影测试；Wave 3 将在 `MemorySyncService` 后添加稳定的 `MEMORY.md` 序列化。

## 4.1 云端只读审计

- 负责人：AGENT-OC
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：无
- 执行命令：使用 `C:\Users\maggie mo\.ssh\id_ed25519` 登录后，检查系统资源、版本、服务、端口、Nginx、PostgreSQL、OpenClaw 配置结构和项目目录；所有输出均脱敏。
- 测试结果：SSH 成功；OpenCloudOS 9.4、2 vCPU、3.6 GiB RAM、36 GiB 可用磁盘；Python 3.11.6、PostgreSQL 15.18、Nginx 1.26.3、OpenClaw 2026.3.24 可用。
- 证据摘要：Personal workspace 为 `/root/.openclaw/workspace`；Agent 为 `main/knowledge/health`；Gateway 仅监听回环地址。已有 `/root/rightnow`、`rightnow-backend.service` 和 `rightnow_fitness` 数据库。
- 阻塞项：正式迁移前需确认现有 Personal OpenClaw 公网入口是否保留，以及旧 RightNow 数据库是否迁移；Backend 当前错误监听 `0.0.0.0:5000`。
- 下一步：先备份现有数据库、Nginx、systemd、OpenClaw 配置和 `/root/rightnow`，再按确认后的入口与数据策略部署。

## 4.2 建立 Provisioner 骨架

- 负责人：AGENT-OC
- 状态：completed（本地）
- 开始/完成日期：2026-07-11
- 修改文件：`infra/provisioner/package.json`、`README.md`、`src/config.js`、`src/server.js`、`src/index.js`
- 执行命令：`cd infra/provisioner`、`npm test`
- 测试结果：缺少配置或使用通配符绑定时服务会安全失败；缺少或使用错误 Bearer token 时返回 401；有效请求成功。
- 证据摘要：Provisioner 测试套件在 Node 24 上通过 6/6，与声明的 Node >=22 运行环境兼容。
- 阻塞项：SSH 已恢复；等待确认 Nginx 入口和旧数据库迁移策略。
- 下一步：Prod 同机部署时绑定 `127.0.0.1`，并由 systemd 管理服务。

## 4.3 验证 Agent ID

- 负责人：AGENT-OC
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`infra/provisioner/src/agent-id.js`、`infra/provisioner/test/provisioner.test.js`
- 执行命令：`npm test`
- 测试结果：路径遍历、Personal ID、空 ID 和超长 ID 均失败；`rightnow-user_123` 通过；调用方提供 workspace 时返回 400。
- 证据摘要：严格验证 `rightnow-*` 后，工作区仅按 `<workspaceRoot>/workspace-<agentId>` 派生。
- 阻塞项：无
- 下一步：保留此验证器作为唯一的配置 API 入口路径。

## 4.4 实现配置原子更新

- 负责人：AGENT-OC
- 状态：completed（本地）
- 开始/完成日期：2026-07-11
- 修改文件：`infra/provisioner/src/config-store.js`、`infra/provisioner/test/provisioner.test.js`
- 执行命令：`npm test`
- 测试结果：重复 provision 操作具有幂等性；模拟重命名前失败时会保留原文件；并发创建的 Agent 均会保留。
- 证据摘要：已实现独占锁文件、JSON 验证、备份、同目录临时写入、文件 fsync、原子重命名和尽力执行的目录 fsync。
- 阻塞项：网关热加载行为需要云审计/部署。
- 下一步：验证实时网关是否观察到新代理，或者添加经过身份验证的重新加载挂钩（如果其安装的版本需要）。

## 4.5 创建工作区模板

- 负责人：AGENT-OC
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`infra/provisioner/src/workspace.js`、`infra/provisioner/test/provisioner.test.js`
- 执行命令：`npm test`
- 测试结果：已创建 `AGENTS.md`、`USER.md`、`MEMORY.md`、`.gitignore` 和 `memory/`；初始 Memory 仅包含 `No durable preferences confirmed yet.`。
- 证据摘要：模板不包含令牌、当前业务事实、计划正文或 Personal 工作区路径；`USER.md` 仅包含 userId 和 language。
- 阻塞项：无
- 下一步：在云端使用实际 OpenClaw 账户对生成文件的所有权和权限模式进行冒烟测试。

## 4.6 实现工作区引导

- 负责人：AGENT-OC
- 状态：completed（本地）
- 开始/完成日期：2026-07-11
- 修改文件：`infra/provisioner/src/workspace.js`、`infra/provisioner/test/provisioner.test.js`
- 执行命令：`npm test`
- 测试结果：首次引导完整执行；第二次引导保留已编辑的 Memory；无效路径失败；操作后 Personal 工作区哨兵文件逐字节保持一致。
- 证据摘要：文件采用独占创建；目标 realpath 必须始终位于配置的根目录下。
- 阻塞项：比较云端 Personal 工作区的 hash/mtime 需要 SSH 访问。
- 下一步：对云上的一次性 RightNow 用户重复隔离检查。

## 4.7 连接 NestJS admin-http

- 负责人：AGENT-OC（合约）、ROOT（后端）
- 状态：completed（仅契约）
- 开始/完成日期：2026-07-11
- 修改文件：`infra/provisioner/README.md`、`infra/provisioner/src/server.js`
- 执行命令：通过 `npm test` 进行本地 HTTP 测试
- 测试结果：契约为 `POST /provision`，采用 Bearer auth，请求体为 `{agentId, language?}`；任意 workspace 参数都会被拒绝，错误信息不会回显令牌。
- 证据摘要：Provisioner 测试套件中的有效、未授权和无效 HTTP 用例均通过。
- 阻塞项：ROOT 必须端到端验证后端成功、401、500、超时和 Gateway 热加载超时行为。
- 下一步：云部署后配置 `OPENCLAW_PROVISION_MODE=admin-http`、URL 和不同的管理令牌。

## 4.8 验证插件契约

- 负责人：AGENT-OC
- 状态：completed（本地）；云端加载检查 blocked
- 开始/完成日期：2026-07-11
- 修改文件：`openclaw/extensions/rightnow/package.json`
- 执行命令：manifest 解析、契约成员检查、`node --check index.js`、`node --check src/rightnow-tools.js`、`node --check src/identity.js`
- 测试结果：manifest 解析成功，声明了 `rightnow_classify_intent`，所有运行时 JS 语法检查均通过。
- 证据摘要：PowerShell 契约查询返回 `True`。
- 阻塞项：确认 Gateway 已加载且未使用旧路径的日志证据需要 SSH 访问。
- 下一步：部署后检查脱敏的 Gateway 日志。

## 4.9 验证插件身份映射

- 负责人：AGENT-OC
- 状态：completed（本地）
- 开始/完成日期：2026-07-11
- 修改文件：`openclaw/extensions/rightnow/src/identity.js`、`identity.ts`、`rightnow-tools.js`、`test/identity.test.js`
- 执行命令：`cd openclaw/extensions/rightnow`、`npm test`
- 测试结果：规范 session、规范 Agent、移除伪造模型身份、拒绝空值/Personal，以及拒绝 session 与 Agent 不匹配这 5/5 个用例均通过。
- 证据摘要：Web RPC 身份仅接受 RightNow session/Agent 上下文；模型参数不能设置 user、session、Agent、channel-user 或 workspace 身份。
- 阻塞项：恢复云端访问后，应通过 Gateway 再次验证实时写工具拒绝行为。
- 下一步：针对已部署的插件运行五个案例并关联后端审核用户 ID。

## 4.10 配置 Memory embedding

- 负责人：AGENT-OC
- 状态：blocked
- 开始/完成日期：2026-07-11
- 修改文件：无
- 执行命令：由于 SSH 身份验证失败而未运行。
- 测试结果：未假定 provider 具备相关能力，也未记录不实的召回结果。
- 证据摘要：云命令 `openclaw memory status/index/search` 需要恢复 SSH 访问。
- 阻塞项：需要通过 SSH 身份验证，并确认 provider 配置支持 embedding。
- 下一步：验证 provider 支持后，在不暴露凭据的前提下运行 status、强制 index 和带来源的 search。

## 3.1 创建 Python 3.11 虚拟环境

- 负责人：AGENT-RAG
- 状态：blocked
- 开始/完成日期：2026-07-11
- 修改文件：`rag-service/requirements.txt`
- 执行命令：`py -V:Astral/CPython3.11.15 -m venv .venv`、`.venv/Scripts/python -m pip install --upgrade pip`、`.venv/Scripts/python -m pip install -r rag-service/requirements.txt`、Python/导入检查。
- 测试结果：Python 3.11.15 和 pip 26.1.2 已安装；已删除 requirements 文件开头无效的 `"""`。完整依赖安装超过 120 秒命令时限，`import fastapi, chromadb` 仍然失败。
- 证据摘要：虚拟环境被忽略；导入以 `ModuleNotFoundError: fastapi` 退出。
- 阻塞项：执行导入和 API 测试前，需要在允许长时间运行的 shell 中完成依赖安装。
- 下一步：重新运行 pip install，并确认得到文档要求的 `ok` 导入结果。

## 3.2 检查知识源结构

- 负责人：AGENT-RAG
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`rag-service/scripts/structure_check.py`
- 执行命令：`python rag-service/scripts/structure_check.py --help`、`python rag-service/scripts/structure_check.py`。
- 测试结果：检查通过；L1 包含 30 个 ID 唯一的有效 FAQ 条目，L2 包含 11 个非空 Markdown 文件，L3 包含 8 个非空 Markdown 文件。
- 证据摘要：脚本打印 `structure check passed` 并退出 0。
- 阻塞项：无
- 下一步：每次导入前均执行此只读验证。

## 3.3 清理与去重

- 负责人：AGENT-RAG
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`rag-service/scripts/prepare_sources.py`、`.gitignore`
- 执行命令：`python rag-service/scripts/prepare_sources.py --source l2-core --source l3-books --output rag-service/.work/prepared`，文件/空计数，`git check-ignore rag-service/.work/prepared`。
- 测试结果：19 个输出文件，0 个空文件，0 个完全相同的重复文档；源目录未修改。
- 证据摘要：输出隔离在已忽略的 `rag-service/.work/` 下；Chroma 运行时目录也已被忽略。
- 阻塞项：无
- 下一步：将原始的经过验证的源或准备好的副本导入到忽略的持久目录中。

## 3.4 导入 L1/L2/L3

- 负责人：AGENT-RAG
- 状态：blocked
- 开始/完成日期：2026-07-11
- 修改文件：`rag-service/scripts/ingest_all.py`、`.gitignore`
- 执行命令：`python rag-service/scripts/ingest_all.py --help`。
- 测试结果：三层 CLI 和显式持久目录参数验证成功；由于步骤 3.1 依赖项不可用，因此未运行实际导入/计数/重新启动检查。
- 证据摘要：帮助信息列出 `--l1`、`--l2`、`--l3`、`--persist-dir` 和 `--force`；输出默认写入已忽略的 `rag-service/.work/chroma`。
- 阻塞项：Python 依赖尚未完整安装，embedding 模型也尚不可用。
- 下一步：运行强制导入，记录所有三个计数，在第二个进程中重新打开存储，然后比较计数。

## 3.5 运行检索验收集

- 负责人：AGENT-RAG
- 状态：pending
- 开始/完成日期：2026-07-11
- 修改文件：无
- 执行命令：未运行。
- 测试结果：pending，等待步骤 3.4 成功完成导入。
- 证据摘要：暂无。
- 阻塞项：步骤 3.4。
- 下一步：测试平台期、初学者训练频率、力量/有氧训练、背伤恢复和严重睡眠不足场景，并断言来源元数据。

## 3.6 验证 RAG API

- 负责人：AGENT-RAG
- 状态：pending
- 开始/完成日期：2026-07-11
- 修改文件：`rag-service/main.py`
- 执行命令：仅审查源代码。
- 测试结果：请求模式现在修剪查询，拒绝空白查询，并将 `top_k` 限制为 1..20；在依赖项和集合准备就绪之前，HTTP 行为仍未得到验证。
- 证据摘要：Pydantic 验证定义在 `SearchRequest` 上；对于空白查询，FastAPI 应返回 422。
- 阻塞项：步骤 3.1 和 3.4。
- 下一步：启动 API，测试 docs、FAQ/Core/Books 查询，以及空白查询返回 422。

## 5.1 阅读前端约束并建立基线

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`frontend/views/AIChat.tsx`
- 执行命令：读取前端贡献者说明和 Memory 文件、`npm run build:frontend`、启动 Vite 开发服务器、检查浏览器重载/DOM/控制台。
- 测试结果：删除了阻塞 Babel 编译的重复 `chatApi` 导入；生产构建通过，Vite 返回 200，渲染后的启动页无浏览器控制台错误。
- 证据摘要：浏览器 DOM 在 `http://127.0.0.1:5173/` 处显示 `点击遇见 未来的自己` 和 `Tap to Start`。
- 阻塞项：无
- 下一步：在步骤 5.2-5.4 中验证 Vite `/api` 代理和经过身份验证的工作流程。

## 5.2 验证 Vite API 代理

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`frontend/api/client.ts`、`frontend/vite.config.ts`、`.env.example`、`backend/.env.example`
- 执行命令：前端构建、重启 Vite/后端、使用显式 Origin 的代理认证探测、浏览器 demo 登录。
- 测试结果：前端使用同源 `/api`；`/api/agent` 已通过代理；后端接受 localhost 和 127.0.0.1 开发源；demo 登录可进入仪表板。
- 证据摘要：代理登录返回 201，并包含 `Access-Control-Allow-Origin: http://127.0.0.1:5173`；浏览器成功渲染已认证的 RightNow 仪表板，且无控制台错误。
- 阻塞项：无
- 下一步：在步骤 5.3-5.4 中验证个人资料/体重和业务记录工作流程。

## A.1 固化云端 Prod 与本地 Dev 全原生拓扑

- 负责人：ROOT
- 状态：completed
- 开始/完成日期：2026-07-11
- 修改文件：`docs/development-runbook/architecture.md`、`docs/development-runbook/RIGHTNOW_DEVELOPMENT_STEP_BY_STEP.md`
- 执行命令：审查现有混合部署、Tailscale 和 Docker 相关契约。
- 测试结果：已确认 Prod 所有服务部署在云端并采用原生 `systemd + Nginx + PostgreSQL 16`；本地仅作为隔离 Dev 环境。
- 证据摘要：生产运行不依赖开发机在线，不使用 Docker，也不要求 Tailscale；公网仅开放 HTTPS 和受限 SSH。
- 阻塞项：SSH 公钥尚未安装到服务器，云端部署仍无法开始。
- 下一步：恢复 SSH 后执行云端只读审计，并按原生服务拓扑生成部署配置。

## 4.11 部署云端全原生 Prod 基线

- 负责人：ROOT + AGENT-OC
- 状态：blocked
- 开始/完成日期：2026-07-11 / 未完成
- 修改文件：待部署阶段确定
- 执行命令：尚未执行；部署指令与测试门禁已加入开发 runbook。
- 测试结果：未运行。
- 证据摘要：目标拓扑已冻结为 Nginx、systemd、PostgreSQL 16、Backend、RAG、OpenClaw Gateway 和 Provisioner 全部云端原生运行。
- 阻塞项：`C:\Users\maggie mo\.ssh\id_ed25519` 对 `root@106.54.16.31` 仍返回 `Permission denied`；公钥尚未安装到服务器。
- 下一步：通过云控制台将 `id_ed25519.pub` 加入 `/root/.ssh/authorized_keys`，再执行只读审计和部署前检查。

## 接下来待做清单（2026-07-11 更新）

### 当前真实基线

- [x] SSH 已恢复：使用 `C:\Users\maggie mo\.ssh\id_ed25519` 可登录 `root@106.54.16.31`。
- [x] 已创建并校验完整备份 `/root/backups/rightnow-pre-native-20260711-230719`；旧 PostgreSQL 15 数据目录仍保留。
- [x] PostgreSQL 已升级到 16.12，`rightnow_fitness_prod` 已恢复 31 张旧业务表和 3 个用户。
- [x] release `468941a` 已上传并构建到 `/opt/rightnow/releases/468941a`，前端已复制到 `/var/www/rightnow`。
- [x] `/etc/rightnow/{backend,provisioner,rag}.env` 已在服务器生成，权限为 `600 root:root`；密钥未回显、未进入 Git。
- [x] PostgreSQL 本机应用连接已由 `ident` 调整为 `scram-sha-256`，并保留修改前的 `pg_hba.conf` 备份。
- [!] Schema SQL 首次应用只创建了 3 个尚未被表引用的 Memory 枚举，随后因旧表所有者仍为 `rightnow` 而停止；尚未修改现有表，也尚未创建 Memory 表。

### P0：完成生产数据库收口（ROOT，必须串行）

- [x] 记录现有表、序列和类型所有者；确认旧角色 `rightnow` 仅用于迁移兼容。
- [x] 在 `rightnow_fitness_prod` 中执行 `REASSIGN OWNED BY rightnow TO rightnow_app`，并验证 `rightnow_app` 为非超级用户、不可建库、不可建角色。
- [x] 删除本次半完成且未被引用的 3 个 Memory 枚举，再重新运行 `prisma migrate diff --from-url ... --to-schema-datamodel ... --script`。
- [x] 人工确认新差异仅包含 Memory 枚举/表/索引/外键和 `AgentAuditLog.durationMs`，不得包含 `DROP TABLE` 或旧数据重写。
- [x] 应用差异；运行第二次 diff，必须为空；验证旧 3 个用户、31 张旧表数据仍存在，新增 Memory 表可由 `rightnow_app` 读写。
- [x] 使用 release 根目录的 `@prisma/client` 做最小连接测试，确认 `current_user=rightnow_app`、`current_database=rightnow_fitness_prod`。

### P1：RAG 云端环境与数据（可交给 `AGENT-RAG`）

- [x] 创建 `/opt/rightnow/venv-rag`，用 Python 3.11 安装 `rag-service/requirements.txt`；验证 `import fastapi, chromadb`。
- [x] 运行 `structure_check.py`，确认 L1=30 条 FAQ、L2=11 个文件、L3=8 个文件且无空文件。
- [x] 导入到 `/var/lib/rightnow/rag/{l1,l2,l3}`，记录三层 collection 数量；新进程重新打开后数量必须一致。
- [x] 对“新手频率、平台期、力量与有氧、腰伤恢复、严重睡眠不足”执行检索；风险问题必须优先返回 L3 来源。
- [x] 启动 loopback RAG API，验证 `/health`、三层查询和空 query 返回 422；现由 systemd 接管。

### P1：OpenClaw/Provisioner 云端验收（可交给 `AGENT-OC`）

- [x] 在变更前记录 Personal workspace `/root/.openclaw/workspace` 的 hash/mtime 哨兵。
- [x] 安装并启动 Provisioner unit，仅绑定 `127.0.0.1:8787`；无 Token/错误 Token 均返回 401。
- [x] 创建一次性 `rightnow-deploy-smoke` 测试 Agent；重复 provision 均返回 200，且 Personal workspace 未改变。
- [x] 安装/验证 RightNow 插件，Gateway 2026.3.24 日志显示 RightNow 插件加载成功。
- [x] 本地 session/agent/伪造 userId/空身份/Personal 身份回归测试 5/5 通过；云端 Agent RPC 错误/正确 Token 为 401/201。
- [ ] 执行 `openclaw memory status/index/search`；只有 provider 确实支持 embedding 时才标记完成，否则记录明确阻塞，不伪造召回结果。

### P2：systemd 与 Nginx 上线（ROOT，数据库和 RAG 完成后）

- [x] 建立 `/opt/rightnow/current -> /opt/rightnow/releases/1039a8b`，校验 release 文件完整性。
- [x] 安装 `rightnow-backend.service`、`rightnow-rag.service`、`rightnow-provisioner.service`，执行 `daemon-reload` 并 enable。
- [x] 启动三个服务；逐一检查 `systemctl status` 和脱敏 journal，未输出 Token、数据库密码或完整私密内容。
- [x] 将 `rightnow.locations.conf` include 到现有 Nginx public server；Personal OpenClaw 的 `location /` 保持原样。
- [x] 运行 `nginx -t` 后 reload；验证 `/`=200、`/rightnow/`=200、未认证 `/rightnow-api/auth/me`=401、缺失 upload=404。
- [x] 用仓库 `validate-host.sh` 确认 5000、8000、8787、18789、5432 仅绑定回环；脚本输出 `native host validation: OK`。

### P3：业务与浏览器验收（可交给 `AGENT-FE` 做只读/测试操作）

- [x] 浏览器打开 `http://106.54.16.31/rightnow/`，确认无白屏、资源路径均带 `/rightnow/`，控制台无阻断错误。
- [ ] 完成 demo 登录、档案读取、体重、TODO、饮食、训练各一次创建/刷新验证；仅使用虚构测试数据。
- [ ] 验证聊天建议调用 RAG、训练/饮食记录写 PostgreSQL、高风险走保守路径、领域外请求不调用 RightNow 工具。
- [ ] 验证首次聊天创建隔离 Agent/Session/workspace；用户 A/B 数据、Memory 和审计零串读。
- [x] 确认 Personal OpenClaw 根路径上线后为 200，Personal workspace hash/mtime 哨兵未变化。

### P4：恢复、文档和提交（ROOT）

- [ ] 执行服务重启验收；如获准安排主机重启，再验证 PostgreSQL、Nginx、Backend、RAG、Gateway、Provisioner 自动恢复。
- [ ] 补做备份恢复演练、账户删除幂等、Agent 重建和日志隐私检查。
- [ ] 每完成一个板块，立即在本文件新增命令、结果、证据和阻塞项；把稳定文件职责与架构洞察同步到 `architecture.md`。
- [x] 运行 backend/frontend build、Memory、intent 224/224、Provisioner 6/6、RAG smoke、Prisma validate、`git diff --check`。
- [x] 删除所有临时远程执行脚本，确认 `.env`、dump、Chroma、workspace、Token 均未进入 Git。
- [ ] 审查 `git diff` 后按独立目标提交；推送远端需单独确认远端和分支状态。

### 子代理并发安排

- Wave A：`ROOT` 独占生产数据库；`AGENT-RAG` 可并行安装/导入 RAG；`AGENT-OC` 只做 OpenClaw 只读检查和 Personal workspace 哨兵。
- Wave B：数据库和 RAG 门禁通过后，`ROOT` 安装 systemd/Nginx；`AGENT-OC` 验证 Provisioner/插件，不能同时修改 Nginx 或数据库。
- Wave C：服务全部 active 后，`AGENT-FE` 执行浏览器工作流；`ROOT` 负责跨服务审计、网络边界和最终合并。
- 子代理不得提交 Git、不得查看或回显 secret、不得修改 Personal workspace；所有生产写操作先由 `ROOT` 明确分配并记录验证结果。

## 4.11-P0 生产数据库收口

- 负责人：ROOT
- 状态：completed
- 开始/完成时间：2026-07-11
- 修改文件：云端 `/var/lib/pgsql/data/pg_hba.conf`、`rightnow_fitness_prod` schema；本地 `docs/development-runbook/progress.md`、`architecture.md`
- 执行命令：PostgreSQL `REASSIGN OWNED`；Prisma `migrate diff --script`；`psql -f`；第二次 schema diff；Prisma Client 最小查询。
- 测试结果：应用前 31 张旧表均归 `rightnow`；迁移后 33 张 public 表均归 `rightnow_app`。旧用户数仍为 3，Memory 表数为 2；第二次 diff 输出 `This is an empty migration`。
- 证据摘要：`rightnow_app` 为 `super=false/createdb=false/createrole=false`；数据库连接返回 `rightnow_app|rightnow_fitness_prod`，Prisma Client 返回相同身份。应用 SQL 仅增加 3 个 Memory 枚举、2 张表、3 个索引、2 个外键和可空的 `AgentAuditLog.durationMs`。
- 阻塞项：无。
- 下一步：等待 RAG 与 OpenClaw Wave A 验证完成，然后安装 systemd 服务并接入 Nginx。

## 4.11-P1 云端 RAG 与 OpenClaw

- 负责人：ROOT（子代理因额度 403 未能执行）
- 状态：completed；OpenClaw Memory embedding provider blocked
- 开始/完成时间：2026-07-11 / 2026-07-12
- 修改文件：云端 `/opt/rightnow/venv-rag`、`/var/lib/rightnow/rag`、`/var/lib/rightnow/models/hf`、`/root/.openclaw/extensions/rightnow`；仓库 OpenClaw 插件依赖与兼容代码。
- 执行命令：Python import/structure check/ingest；HF mirror `hf download`；持久化复开和五组检索；RAG HTTP 三层/空 query；Provisioner 401/200/幂等测试；Gateway restart 和日志检查；Agent RPC 401/201。
- 测试结果：FastAPI 0.115.9、ChromaDB 1.0.9；L1/L2/L3 持久数量为 30/16/14，风险问题命中 L3 安全与恢复文档；三层 HTTP 均 200，空 query 为 422。Provisioner 为 `401,401,200,200`，Personal workspace hash/mtime 未改变。
- 证据摘要：云主机无法访问 huggingface.co，改用 `hf-mirror.com` 一次性下载同一 `BAAI/bge-small-zh-v1.5` 模型；运行时设置 `HF_HUB_OFFLINE=1`。修复 `typebox` 错误 import 和 Gateway 2026.3.24 缺少可选 Prompt API 两项生产兼容问题，Gateway 日志最终显示 RightNow 插件 loaded。
- 阻塞项：OpenClaw `memory status` 明确显示 provider `none`，因此未执行或伪造 memory index/search；需要后续选定真实 embedding provider。
- 下一步：执行剩余业务写入、聊天路由、用户隔离和生命周期 E2E。

## 4.11-P2 systemd 与 Nginx 上线

- 负责人：ROOT
- 状态：completed
- 开始/完成时间：2026-07-11 / 2026-07-12
- 修改文件：云端 `/etc/systemd/system/rightnow-*.service`、`/etc/nginx/conf.d/openclaw.conf`、`/etc/nginx/rightnow.locations.conf`、`/opt/rightnow/current`。
- 执行命令：systemd enable/restart/status；`nginx -t`/reload；`ss -lntp`；`validate-host.sh`；公网 HTTP 和真实浏览器测试。
- 测试结果：PostgreSQL、Nginx、Backend、RAG、Provisioner、Gateway 均 active；原生主机验证通过。Personal `/`=200，RightNow `/rightnow/`=200，未认证 API=401；真实浏览器演示登录进入仪表板且控制台无错误。
- 证据摘要：5000、8000、8787、18789、5432 均只监听回环。一次 Gateway 重启因备份目录放入插件自动发现路径而短暂返回 502；将备份移至 `/root/backups/rightnow-pre-native-20260711-230719` 后立即恢复 200，并形成禁止在 extensions 内留插件备份的部署规则。
- 阻塞项：尚无域名和 TLS；当前仅通过 `http://106.54.16.31/rightnow/` 提供服务。
- 下一步：完成 P3/P4 业务 E2E、安全/恢复演练和最终验收。

## 4.11-P2 最终自动化门禁

- 负责人：ROOT
- 状态：completed
- 开始/完成时间：2026-07-12
- 修改文件：无额外运行时代码；仅更新本进度记录。
- 执行命令：`npm run build:backend`、`npm run build:frontend`、`test:agent-memory`、`test:intent`、`test:upload-prefix`、显式 schema 的 Prisma validate、Provisioner/Plugin tests、native template validation、`git diff --check`。
- 测试结果：Backend/Frontend build 成功；Memory 规则通过；intent 32 cases/224 assertions；upload 6 assertions；Prisma schema valid；Provisioner 6/6；OpenClaw identity 5/5；native template OK；diff check 通过。
- 证据摘要：最初误用不存在的 `test:memory` 和错误 cwd 的 Prisma 命令，两者均为命令名/路径问题；改用仓库真实 `test:agent-memory` 与 `npx prisma validate --schema backend/prisma/schema.prisma` 后通过。
- 阻塞项：深度 P3/P4 E2E 尚未执行，具体保持在上方未勾选清单中。
- 下一步：使用隔离测试用户完成 CRUD、聊天六流程、用户隔离、Agent 重建、账户删除与恢复演练。

## 7.2 Agent 重建测试

- 负责人：ROOT
- 状态：blocked（重建持久化成功，自动路由确认失败）
- 开始/完成时间：2026-07-12 / 未完成
- 修改文件：生产 `/root/.openclaw/openclaw.json`、测试 workspace；本地 `docs/development-runbook/progress.md`、`architecture.md`
- 执行命令：Provisioner 幂等创建；备份配置/workspace；从配置移除 demo Agent 并移动 workspace；重启 Backend 清空 ensureAgent 缓存；通过 `POST /api/chat/internal/send-as` 触发 ensureAgent；Gateway 重启与 `/v1/models` 探测；PostgreSQL/Profile/业务计数和 Personal workspace 完整性检查。
- 测试结果：`rightnow-cmrg25e480000b1vess7phqby` 已重新写入配置并创建全新 workspace，`AGENTS.md`、`USER.md`、`MEMORY.md`、`.gitignore` 和 `memory/` 齐全，旧 workspace 哨兵未进入新 workspace。测试期间临时 Memory Profile 保持存在，原有 6 条饮食记录保持为 6；测试 Profile 随后已删除。Personal workspace 检查期间 hash/mtime 稳定，Backend、Provisioner、Gateway 均为 active。
- 证据摘要：可逆备份位于 `/root/backups/rightnow-agent-rebuild-20260712-011958`。首次触发 Provisioner 后 Agent 配置和 workspace 均恢复，但聊天返回 500；Gateway 2026.3.24 的认证 `/v1/models` 返回 `200 text/html` 管理页面，后端 `agentExists()` JSON 解析失败并返回 false，导致 `waitForAgent()` 必然超时。Gateway 重启不能修复错误的探测契约。重建后的 `MEMORY.md` 为默认模板；当前 `MemorySyncService` 尚未把 PostgreSQL Profile 序列化回文件。
- 阻塞项：必须将 `OpenClawProvisioningService.agentExists()` 改为 Gateway 2026.3.24 支持的 Agent 可路由探测，或让经过认证的 Provisioner 返回并验证 Gateway 已加载的确认；同时补齐 Profile 到 `MEMORY.md` 的同步后，才能满足完整通过标准。
- 下一步：修复 Agent 可路由确认契约并部署 Backend，复跑首次聊天必须为 2xx；随后实现/验证 Memory Profile 原子同步，再将本步骤标记 completed。

## 7.2a 修复 Agent 状态确认契约

- 负责人：ROOT
- 状态：completed（本地，按要求未部署、未复跑生产重建）
- 开始/完成时间：2026-07-12
- 修改文件：`infra/provisioner/src/server.js`、`infra/provisioner/test/provisioner.test.js`、`backend/src/openclaw/openclaw-provisioning.service.ts`、`backend/scripts/test-openclaw-provisioning.cjs`、`backend/package.json`、开发文档。
- 执行命令：`cd infra/provisioner && npm test`；`cd backend && npm run build`；`npm run test:openclaw-provisioning`；`git diff --check`。
- 测试结果：Provisioner 6/6 通过；Backend 构建通过；后端 provisioning 回归的 HTML 拒绝、合法 JSON 状态接受、provision 后二次 ready 确认 3 个场景通过。
- 证据摘要：新增认证 `GET /agents/<agentId>`，直接检查唯一 Agent 配置、服务端推导 workspace 和五项必需模板。Backend 不再请求或解析 Gateway `/v1/models`，且只有 `configured=true`、`workspaceReady=true`、Agent ID 匹配时才缓存成功。
- 阻塞项：本地修复尚未发布到生产；该接口证明配置与 workspace 就绪，不宣称证明 Gateway 模型路由或 Memory Profile 已同步。
- 下一步：后续发布时同时部署 Provisioner 与 Backend，再复跑 7.2 首次聊天和 Profile 到 `MEMORY.md` 同步测试。

## 6.1-6.2 Memory 文件序列化与安全同步

- 负责人：ROOT；AGENT-BE/AGENT-OC 只读审查
- 状态：completed（本地，未部署生产）
- 开始/完成时间：2026-07-12
- 修改文件：`backend/src/agent-memory/memory-sync.service.ts`、`backend/src/agent-memory/agent-memory.module.ts`、`backend/src/chat/chat.service.ts`、`backend/scripts/test-agent-memory.cjs`、`infra/provisioner/src/workspace.js`、`infra/provisioner/src/server.js`、`infra/provisioner/test/provisioner.test.js`、开发文档。
- 执行命令：`npm run test:agent-memory`；`cd infra/provisioner && npm test`；Backend 构建；子代理只读架构、数据库断言与 E2E 清单审查。
- 测试结果：Memory candidate/lifecycle/conflict/profile/serialization/transport 套件通过；Backend 构建通过；Provisioner 6/6 通过。覆盖空 Profile、确定性排序、控制字符清理、Markdown 转义、认证 PUT、非法格式拒绝和序列化内容逐字节传输。
- 证据摘要：聊天在 `ensureAgent` 后从 PostgreSQL `AgentMemoryProfile` 生成 `MEMORY.md`；Provisioner 仅向服务端推导的目标 workspace 原子写入，拒绝 workspace 与 `MEMORY.md` 符号链接、非普通目标、NUL、错误标题、缺少结尾换行及超过 64 KiB 的内容。provider 仍为 `none`，不宣称向量召回。
- 阻塞项：尚未部署生产；尚未用全新隔离用户验证首次聊天 2xx、Profile 文件恢复、业务 digest、双用户隔离和 Personal workspace hash/mtime。
- 下一步：由 ROOT 独占生产配置写操作，创建全新 `rightnow-rebuild-smoke` 隔离用户和独立对照用户，按子代理清单备份、删除、重建并验收；失败立即从 `/root/backups` 恢复。

## 下一阶段开发计划（2026-07-12）

### 总体顺序

```text
Track A：Memory/Chat 代码收口 ─┐
                              ├─> 代码冻结与统一门禁 -> 单一 release -> ROOT 串行发布
Track B：发布/回滚工具开发 ────┘                                      |
                                                                      v
                                                         Wave 3 跨服务业务联调
                                                                      |
                                                                      v
                                                         Wave 4 生命周期与恢复
```

Track A 与 Track B 可以并行开发；最终构建 artifact、生产切换和生产配置写入不能并行，必须由 ROOT 在代码冻结后串行执行。

### 阶段 1A：Memory 与 Chat 代码收口

- 负责人：AGENT-BE；ROOT 审核共享模块。
- 状态：completed（本地，未发布生产）。
- 工作项：
  - 补齐 `MemorySyncService` 对未配置、401、409、500、超时、非 JSON 和 Agent ID 不匹配响应的测试。
  - 以 `memoryVersion` 或内容 hash 避免每条聊天重复写相同 `MEMORY.md`。
  - 区分 Profile 聚合时间与 workspace 文件同步成功时间；在 Schema 未明确前不得把 `lastSyncedAt` 当成文件同步证据。
  - 明确聊天失败语义：`ensureAgent`、Memory 同步或 Gateway 失败时不得留下无状态说明的孤立用户消息或重复消息。
  - 保证动态体重、饮食、训练和 TODO 不参与 `MEMORY.md` 序列化。
- 测试门禁：Backend build；Memory 套件；provisioning 套件；失败注入后的 ChatMessage 数量/顺序；A/B Agent ID 隔离；`git diff --check`。
- 完成标准：同步幂等、错误可观测但不泄密，聊天成功/失败的数据契约有自动化断言。

### 阶段 1B：可靠发布与回滚工具

- 负责人：AGENT-OC 设计和本地脚本；ROOT 负责生产执行。
- 状态：completed（本地及 Linux `/tmp` 隔离验证，未发布生产）。
- 工作项：
  - 从真实 release 目录创建新目录，禁止对 `/opt/rightnow/current` symlink 直接使用 `cp -a`。
  - 构建单一 release artifact，生成 manifest 和 SHA-256；artifact 不包含 env、Token、数据库、Chroma 或 workspace。
  - 增加 Nest 启动/依赖注入冒烟，不能只以 TypeScript build 作为发布门禁。
  - 发布顺序固定为 Provisioner -> Backend；逐服务执行切换、active、端口、401 和回滚验证。
  - 生产切换前记录当前 release、服务状态与回滚命令；失败只回滚当前服务，不继续后续阶段。
- 测试门禁：Provisioner tests；Backend build/启动；native template validation；artifact checksum；旧 release 可启动验证。
- 完成标准：本地隔离目录完成一次发布和回滚演练，命令不依赖未解析 symlink，失败不会修改当前 release。

### 阶段 2：代码冻结与生产发布

- 负责人：ROOT，单写入者。
- 状态：pending，依赖 1A 和 1B 全部通过。
- 操作顺序：
  - 审查完整 diff，运行 Backend/Frontend build、Memory、intent、Provisioner、Plugin、Prisma、native host template 和 diff check。
  - 生成唯一 artifact/checksum；冻结代码后不得在服务器临时改源码。
  - 创建 `/root/backups/<timestamp>` 发布备份；不得把备份放入 OpenClaw extensions。
  - 先发布 Provisioner 并验证旧 Backend 仍兼容，再发布 Backend；最后按需重启 Gateway。
  - 每一步记录当前 release、HTTP 状态和回滚是否触发。
- 硬停止条件：Nest 启动失败、服务非 active、认证端点不是预期 401、内部端口暴露、日志泄露、artifact checksum 不符或 Personal baseline 漂移。

### 阶段 3：Wave 3 跨服务联调

- 负责人：ROOT；AGENT-BE/AGENT-RAG/AGENT-OC/AGENT-TEST 仅做分范围验证。
- 状态：pending，依赖阶段 2 稳定发布。
- 测试数据：只使用新建隔离用户 A/B 和虚构数据，不使用现有 3 个用户作为写入测试对象。
- 执行批次：
  - 3A Memory：6.3 偏好跨 Session、6.4 动态业务事实不进 Memory、6.5 candidate 晋升、6.6 冲突优先级。
  - 3B 路由：6.7 RAG 建议、6.10 高风险 L3 保守路径、6.11 领域外零 RightNow 工具调用。
  - 3C 写入：6.8 饮食记录/只分析边界、6.9 训练写入及 TODO/前端刷新。
  - 3D 隔离：用户 A/B 的 Profile、Memory、Session、业务数据和审计零串读。
- 通过标准：每条链路均有 requestId、意图、工具、数据库行或不写入断言；`MEMORY.md` 与 PostgreSQL Profile 一致；provider=`none` 时不声称向量召回通过。

### 阶段 4：Wave 4 生命周期与恢复

- 负责人：ROOT 统筹；生产 OpenClaw 删除/恢复只允许 ROOT 执行。
- 状态：pending，依赖 Wave 3 通过。
- 开发顺序：
  - 实现 Provisioner 幂等反注册：只接受 `rightnow-*`，配置原子移除，workspace/session 先 quarantine，拒绝 Personal/路径参数/符号链接逃逸。
  - 实现账户删除状态机和重试：冻结新写入 -> 外部资源清理 -> PostgreSQL 删除 -> 最终清理；不得假装跨 DB/文件系统事务原子。
  - 使用新建隔离用户完成 7.1 用户隔离、7.2 Agent 重建、7.3 两次账户删除幂等。
  - 在隔离恢复环境完成 7.4 备份恢复，不覆盖在线 Prod。
  - 完成 7.5 网络边界、7.6 历史窗口、7.7 日志隐私、7.8 六流程和 7.9 最终自动化。
- 硬停止条件：目标身份不唯一、备份不可读、业务 digest 变化、其他用户或 Personal hash/mtime 漂移、重复 Agent、服务健康失败或日志出现 secret/完整私密正文。

### 当前下一步

- ROOT：审查并拆分当前未提交改动，优先完成阶段 1A 的错误语义和测试。
- AGENT-OC：只在本地/隔离目录实现阶段 1B artifact、启动冒烟和回滚脚本，不连接生产。
- AGENT-TEST：为 Wave 3 每个案例准备输入、预期 intent/tool/数据库变化和失败停止条件。
- 在 1A/1B 完成前，不再执行生产 Agent 删除、账户删除或主机重启。

## 阶段 1A/1B 开发执行结果

- 负责人：ROOT；AGENT-BE（Memory/Chat）；AGENT-OC（发布工具）；AGENT-TEST（只读测试审查）。
- 状态：completed。
- 开始/完成时间：2026-07-12。
- 修改文件：Backend Memory/Chat/Provisioning 代码与测试；Provisioner Memory/状态端点与测试；`infra/native-deploy/release-manager.sh`、隔离测试和模板检查；开发文档。
- 执行命令：`npm run test:agent-memory`、`npm run test:openclaw-provisioning`、Provisioner `npm test`、Frontend build、native template validation、Git Bash/远端 Linux `/tmp` release-manager isolation tests、`git diff --check`。
- 测试结果：
  - Memory candidate/lifecycle/conflict/profile/serialization/sync protocol 与 Chat 失败持久化通过；Backend 构建通过。
  - ensureAgent、Memory 或 Gateway 失败时新增 ChatMessage 为 0；成功后在事务中按 user/assistant 写入两行。
  - Memory 同步支持超时、拒绝非 JSON/错误 Agent ID；每次可安全重试。Provisioner 对字节相同内容返回 `updated=false` 且不改 mtime，Agent 重建后仍可恢复文件。
  - Provisioner 6/6；状态查询、Memory 认证写、固定格式、64 KiB、符号链接/非普通目标和原子替换门禁通过。
  - release manager 默认 dry-run，只允许带隔离标记的非生产 root；拒绝危险 release ID、secret/数据库 artifact、runtime 目录和源符号链接；生成并校验 `ARTIFACTS.sha256`。
  - Linux `/tmp` 隔离测试真实完成 base -> next 原子 symlink deploy -> base rollback；未访问 `/opt/rightnow`、systemd 或生产 release。
- 证据摘要：发布工具不含 SSH/生产地址，服务白名单仅 `rightnow-backend/rag/provisioner`。Nest 启动/DI 冒烟已纳入工具；生产 artifact 和切换仍须在阶段 2 代码冻结后由 ROOT 串行执行。
- 阻塞项：尚未执行阶段 2 的正式 diff 拆分、单一 artifact 构建和生产发布；尚未进入 Wave 3。
- 下一步：ROOT 审查当前完整 diff，按独立目标拆分提交候选并运行最终全套门禁；得到明确发布窗口后再执行阶段 2。

## 阶段 2 Memory/Chat 正式生产发布

- 负责人：ROOT。
- 状态：completed。
- 开始/完成时间：2026-07-12。
- 修改文件：生产 `/opt/rightnow/releases/rn-20260712-memory-chat`、`/opt/rightnow/current`、`/opt/rightnow/previous`；未修改数据库、OpenClaw 配置或 workspace。
- 执行命令：从 `readlink -f /opt/rightnow/current` 的真实目录复制独立 release；覆盖已验证源码；Provisioner/Backend/intent/Memory/Plugin/Prisma 测试；备用端口 Nest 启动/DI 冒烟；完整 artifact manifest；原子 symlink 切换；逐服务 restart/HTTP 门禁。
- 测试结果：Provisioner 6/6；OpenClaw provisioning 3 场景；Memory/Chat 套件通过；intent 32 cases/224 assertions；Plugin identity 5/5；Prisma valid；备用端口 `/api/auth/me`=401。发布后 Backend、Provisioner、RAG、Nginx 均 active；5000、8000、8787、18789 仅监听 `127.0.0.1`；Personal `/`=200、RightNow `/rightnow/`=200、未认证 API=401。
- 证据摘要：`current=/opt/rightnow/releases/rn-20260712-memory-chat`；`previous=/opt/rightnow/releases/1039a8b`。`ARTIFACTS.sha256` 覆盖 40,403 个文件，manifest SHA-256 为 `be9f8eac009792ce5f0a7b8b616e854ea7a9492de1c53350fd4b2ffb81ea7d11`。发布包扫描未发现真实 `.env`、密钥、dump、Chroma 或 workspace；允许版本化的 `.env.example` 模板。
- 恢复/异常记录：首次切换中 systemd 已报告 Provisioner active、但 8787 尚未监听，HTTP 门禁失败并自动恢复旧 `current`。将等待条件改为真实 401/200 HTTP readiness 后第二次切换成功。此前中断部署曾因复制 symlink 修改旧 release，并触发 ChatModule DI 失败；已通过新增 `AgentMemoryModule` 导入恢复服务。本次正式 release 使用真实源目录复制、Nest DI 冒烟和 manifest，消除了目录名与运行内容不一致状态。
- 阻塞项：未执行聊天、Agent 重建或业务写入 E2E；这些属于 Wave 3/4，按用户要求未在本次发布中复跑。
- 下一步：进入 Wave 3，先使用新建隔离用户执行 3A Memory 联调，再执行路由、写入和 A/B 隔离批次。

## Wave 3A Memory/Conversation 基础链路

- 负责人：ROOT；AGENT-BE/AGENT-OC 实现分范围代码；AGENT-TEST 只读测试设计。
- 状态：completed（生产发布与隔离 A/B E2E 通过）。
- 开始/完成时间：2026-07-12。
- 修改文件：`backend/prisma/schema.prisma`、conversation migration、Chat/Memory/OpenClaw 模块与测试、RightNow 插件 identity、前端 API 客户端、env examples、开发文档。
- 执行命令：Prisma format/generate/validate；迁移 SQL 人工审查；本地 `prisma db execute`；二次 migrate diff；Backend/Frontend build；Memory/JWT、Conversation、OpenClaw identity、Plugin tests。
- 测试结果：迁移仅新增 `ChatConversation`、nullable `ChatMessage.conversationId`、两个索引和两个级联外键；本地应用成功且二次 diff 为 empty。JWT Memory 编排、A/B ownership、候选服务端确认来源、Profile/外部同步状态、conversation ownership、history window=0、legacy null 隔离和 Session 后缀验证通过。
- 证据摘要：Chat 成功后尽力提取去重 candidate；动态体重/饮食/训练仍被排除。用户通过 JWT API 显式确认后才进入 confirmed/Profile/MEMORY。新 conversation 使用 `rightnow:<userId>:<conversationId>`，旧客户端继续 `rightnow:<userId>`。provider=`none`，不声明向量召回。
- 阻塞项：OpenClaw Memory provider 仍为 `none`，未执行或声称向量索引/语义召回；模型行为验证只作为 workspace prompt 观察。
- 下一步：进入 3B 路由联调：RAG 建议、高风险 L3 保守路径和领域外零 RightNow 工具调用。

## Wave 3A 生产发布与 E2E

- 负责人：ROOT；AGENT-OC 提供 Gateway reload 修复；其他子代理只读设计/本地测试。
- 状态：completed。
- 开始/完成时间：2026-07-12。
- 修改文件：生产 Conversation Schema、`/opt/rightnow/releases/rn-20260712-wave3a-*`、Gateway chat completions 配置、RightNow 插件 identity；本地相关源码、测试和开发文档。
- 数据库发布：完整 dump 位于 `/root/backups/rightnow-wave3a-20260712-0240/rightnow_fitness_prod.dump`，SHA-256 `beed2531aac28fa61dde5f8d06fd0639b9c03c9501ab9750b3b4ee15de533484`。生产 diff 精确为 1 表、1 nullable 列、2 索引、2 外键，零 DROP/UPDATE；应用后二次 diff empty，`ChatConversation` owner=`rightnow_app`，旧 3 用户和旧 ChatMessage 保留。
- 自动化结果：Backend/Frontend build；Memory/JWT orchestration；Conversation ownership/window=0/legacy；intent 224/224；OpenClaw identity 12 assertions；Plugin 6/6；Provisioner 7/7；Prisma validate 与真实迁移通过。
- E2E 测试数据：仅创建 `rn3a-a-1783795654@example.invalid` 与 `rn3a-b-1783795654@example.invalid` 两个隔离用户；现有 3 用户未用于写入测试。测试凭据未写入 Git/进度文档。
- E2E 结果：
  - A 首聊成功并创建一个 RESPONSE_STYLE candidate；B candidates=0，B 确认 A fact 返回 404。
  - A 显式确认后 Profile 与原子 `MEMORY.md` 同步成功；Markdown marker 按安全规则转义。
  - A 第二 conversation 使用 `rightnow:<userId>:<conversationId>`，Backend 日志有 2 条对应 session 证据；临时 DB history window=0 后已恢复默认配置。
  - B 读取 A conversation 返回 404；A/B Agent、workspace、Fact 和 Session 均按用户隔离。
  - B Agent 可逆删除测试后，首次聊天为 201；Provisioner 自动重启 Gateway、重建唯一 Agent/workspace，Personal workspace hash 不变。
  - 动态体重 `63.1kg` 首聊为 201，`WeightRecord` 由 0 增为 1，User 当前体重更新为 63.1，`weight.record` 审计存在；candidate=0，`MEMORY.md` 不含 63.1。
- 故障与修复：
  - Gateway 2026.3.24 默认关闭 `/v1/chat/completions`，导致首聊 404；备份后显式启用 loopback Token 端点，Personal workspace hash/mtime 不变。
  - Provisioner system service 缺 `XDG_RUNTIME_DIR`，user bus 返回 `No medium found`；固定 `/run/user/0` 后同沙箱 `is-active` 成功，B 首次 provision 自动重启通过。
  - “请按我的长期偏好…训练几次”误报运动偏好 candidate；规则收紧为明确第一人称偏好或句首偏好表达，新增回归并将隔离误报 fact 标记 REJECTED。
- 发布结果：当前 release `/opt/rightnow/releases/rn-20260712-wave3a-weight`；manifest 覆盖 40,413 个文件，SHA-256 `27d23bd71452e41cc1a29530c0760bd8a3937dee57db5775432da0f7e8731ee5`。Backend、Provisioner、RAG、Gateway、Nginx 均 active，内部端口保持回环。
- 阻塞项：provider=`none`；3B/3C 尚未执行。
- 下一步：3B 先验证建议请求触发 RAG、高风险请求走 L3 且不激进写入、领域外请求零 RightNow 工具/零业务表变化。

## Wave 3B 确定性路由实现

- 负责人：ROOT；AGENT-BE/AGENT-OC/AGENT-TEST 只读审计和测试设计。
- 状态：completed（本地实现、正式生产发布与隔离 E2E 通过）。
- 开始/完成时间：2026-07-12。
- 修改文件：`backend/src/chat/chat.service.ts`、`backend/scripts/test-chat-conversations.cjs`、开发文档。
- 实现结果：
  - 一般建议由 Backend 根据 `requiresKnowledge` 调用 RAG 自动多层 `/search`，将返回的 `source_layer` 与最多 5 条文档作为受限上下文传给 Gateway；不执行业务写工具。
  - high-risk 请求固定传 `collection=l3`，并始终增加停止危险活动、禁止诊断/激进方案和医疗升级边界；RAG 失败时安全约束仍保留。
  - `out_of_domain` 在 DB 历史、Provisioner、Memory sync/candidate、RAG 和 Gateway 之前短路，只保存当前 ChatMessage 对并返回固定领域边界说明。
  - `knowledge.search` 审计只记录用户作用域、channel、成功/错误、耗时、目标层和 intent，不保存消息正文、Token 或检索文档。
- 测试结果：`test:chat-conversations` 覆盖一般建议 RAG、high-risk L3/安全 prompt/零体重写入、领域外零 Gateway/Provisioner/Memory/RAG/audit/历史读取；conversation ownership、Session Key、window=0、legacy 和体重写入回归继续通过。`test:intent` 为 32 cases/224 assertions；`test:agent-memory` 全部通过；Backend build 通过；`git diff --check` 通过（仅 CRLF 提示）。
- 生产发布：最终 `current=/opt/rightnow/releases/rn-20260712-wave3b-routing-v3`，`previous=/opt/rightnow/releases/rn-20260712-wave3b-routing-v2`；manifest 覆盖 40,413 个文件，SHA-256 `aa1004484d5bf35e53ac845c7c05ead78d8ba3c81c5cba135faf57a1ec15639c`。Backend、RAG、Provisioner、Gateway、Nginx 均 active，Backend 未认证端点为 401，Nginx `/rightnow/` 为 200。
- 生产 E2E：仅使用新建 `.invalid` 隔离用户和虚构输入；凭据未输出或记录。一般建议 201 且实际 `source_layer=1`；膝痛继续跳绳请求 201、固定 L3 且实际 `source_layer=3`；领域外请求 201，并保持 audit 计数不变。Diet/Weight/Training/Todo 聚合计数为 `0 -> 0`，CONFIRMED Memory=0，三轮对话精确写 6 条 ChatMessage。
- 故障与修复：首次发布门禁误用不匹配证书的域名，自动回滚至 Wave 3A；改用本机 Nginx Host/path 门禁后切换成功。首次新 release 的旧 Memory 测试桩缺 classifier，补齐已通过的测试版本后恢复全套门禁。真实高风险回答虽命中 L3，但模型未稳定输出明确停止措辞；v3 改为 Backend 确定性添加停止危险活动/禁止带伤继续训练前缀，再次 E2E 通过。RAG 审计新增实际 `sourceLayer`，高风险返回非 L3 时按 `RAG_LAYER_MISMATCH` 安全降级。
- 约束与未验证项：OpenClaw 插件现有 `score_threshold` 参数未被 RAG schema 消费，不计入本轮通过项。provider=`none`，仍不声称向量 Memory 召回。
- 下一步：进入 3C，按确定性白名单实现饮食记录/只分析边界、训练写入及 TODO/前端刷新；继续只使用新隔离用户做生产写入测试。

## Wave 3C 饮食/训练确定性写入

- 负责人：ROOT；AGENT-BE/AGENT-OC/AGENT-TEST 只读审计与测试设计。
- 状态：completed（本地实现、正式发布与隔离 E2E 通过）。
- 开始/完成时间：2026-07-12。
- 实现结果：饮食文本统一先走现有营养分析服务；明确“吃了/记录”才事务创建 DietRecord，只询问热量时只返回估算。训练 `complete_training` 由 Backend 事务创建 TrainingRecord、完成当天 training TODO 并写审计。两类请求均不进入 Gateway/Provisioner/Memory，消除模型插件重复写入入口。
- API/前端：Chat 响应增加可选 `businessAction`，包含动作类型、record ID、估算和 TODO 状态；AIChat 派发 `rightnow:data-changed`，页面后续 GET/切换读取 PostgreSQL 最新数据。
- 只读修复：`todo.today.list` 改用 `listExisting`，不再通过 `list` 隐式执行 ensure/delete/create；显式页面初始化契约保持不变。
- 本地测试：Chat 套件覆盖饮食只分析 0 行/0 Gateway、明确记录 1 行/record ID/审计、训练完成 1 行/TODO auto/审计/0 Gateway，以及 TODO tool 纯读；Wave 3A/3B、Memory、intent 回归和 Backend/Frontend build 均通过。
- 正式发布：`current=/opt/rightnow/releases/rn-20260712-wave3c-writes`，`previous=/opt/rightnow/releases/rn-20260712-wave3b-routing-v3`；manifest 覆盖 40,413 个文件，SHA-256 `eefecd2657116652a1fb0f2df16bbca1f8f6c6490a3b62269f097d12a490d0e2`。Backend、RAG、Provisioner、Gateway、Nginx 均 active，Backend 401、RAG 200、Nginx `/rightnow/` 200。
- 生产 E2E：仅创建新的 `.invalid` 隔离用户，凭据未输出/记录。预置当天 training TODO；“鸡胸肉和米饭大概多少热量”返回 `diet_analyzed` 且 DietRecord=0；“午饭吃了鸡胸肉和米饭”返回唯一 record ID 且 DietRecord=1；训练完成返回唯一 record ID、TrainingRecord=1、TODO=`completed=true/completedSource=auto`。
- 前端/隔离证据：JWT GET diet/training/todos 均精确读到对应 ID/完成状态，构建产物包含 `rightnow:data-changed`；三轮 ChatMessage=6，CONFIRMED Memory=0；审计工具精确为 `diet.log.create,training.session.complete`，未记录食物/训练正文。
- 发布异常：首次批量传输误将 `AIChat.tsx` 放入新 release 的 `frontend/api/`；在切换前删除误放文件并覆盖正确 `frontend/views/AIChat.tsx`，随后重新构建和生成 manifest，未影响 current 或生产服务。
- 已知限制：Chat API 尚无持久化 request/idempotency key；用户或网络重复提交可能创建重复 DietRecord/TrainingRecord。本轮不声称重复请求幂等，后续需独立 schema/API 迁移解决。训练 update/start 和 Chat TODO 创建仍未纳入确定性路径，不计入 3C 完成项。
- 下一步：进入 3D，验证新 A/B 用户的 Profile、Memory、Session、业务数据和审计零串读；随后为 request idempotency、训练 start/update 和 TODO Chat 状态机建立后续开发项。

## Wave 3D A/B 全链路隔离验收

- 负责人：ROOT；AGENT-BE/AGENT-OC/AGENT-TEST 只读审计和断言设计。
- 状态：completed（生产新建 A/B 隔离用户矩阵通过；未执行 Agent 删除/重建）。
- 开始/完成时间：2026-07-12。
- 测试边界：只使用新建 `.invalid` A/B 用户和虚构标记；凭据、聊天正文、Memory 正文、Token 和审计参数均未输出或记录。provider=`none`，本轮不声称向量索引或语义 Memory 召回通过。
- Memory/Profile：A 产生唯一运动偏好 candidate，B candidates=0；B 确认 A fact 返回 404，A 确认返回 201 且 `workspaceSynced=true`。数据库断言为 A Profile=1、B Profile=0、A marker 仅存在于 A Profile/Facts，B marker 命中=0；B `MEMORY.md` hash 在 A 确认前后不变。
- Conversation/Session：A/B 各建独立 conversation；B 读取 A conversation 返回 404。关系完整性查询 `ChatMessage.userId <> ChatConversation.userId` 为 0；Backend 日志分别存在 `rightnow:<A>:<A conversation>` 与 `rightnow:<B>:<B conversation>`，未交叉复用。
- 业务/审计：A 通过确定性 Chat 写入 1 条 DietRecord，B DietRecord/API 列表为 0；`diet.log.create` 审计 A=1、B=0。B 的 conversation/history 中 A marker=0，交叉操作未改变 B 业务数据或审计。
- Agent/workspace：A/B workspace canonical path 不同，均为非 symlink，必需模板和 `MEMORY.md` 均为普通文件；`openclaw.json` 中两个 Agent 各唯一 1 条。完成 Memory/业务/交叉访问后，OpenClaw 配置 hash、B `MEMORY.md` hash 和 Personal workspace 根层文件聚合 hash 均保持不变。
- 执行结果：隔离脚本最终状态 `stage=final rc=0`。Backend、RAG、Provisioner、Gateway、Nginx 未重启、未修改 Personal workspace，未执行生产 Agent/workspace 删除或恢复。
- 已知限制：当前 AgentAudit `argsDigest` 名称与实现不一致，RPC 路径可能保存原始参数截断；3D 只使用不含正文参数的确定性审计，不能据此声称全局日志隐私已通过。缺少普通用户 Conversation 列表和审计查询 API，相关验收由 ownership 404 与 ROOT 数据库只读查询完成。
- 下一步：Wave 3 主链路完成。进入 Wave 4 前先实现 request idempotency、训练 start/update 与 TODO Chat 状态机，或按风险优先直接开发 7.3 账户删除状态机；生产 OpenClaw 删除/恢复仍只允许 ROOT 串行执行。

## Wave 4A Provisioner 可恢复反注册原语

- 负责人：ROOT；AGENT-OC/AGENT-BE/AGENT-TEST 只读审计与测试设计。
- 状态：completed（本地与 Linux `/tmp` 隔离测试通过，未部署生产、未执行真实 Agent 删除）。
- 开始/完成时间：2026-07-12。
- 实现：新增认证 `DELETE /agents/<agentId>`；只接受 operationId 和 account-deletion reason，拒绝调用方路径。服务端显式配置 workspace、2026.3.24 agent-state 和同盘 quarantine root；两类 active 资源先 rename quarantine 并写 manifest，Agent 配置唯一项再经原锁/backup/fsync/temp/rename 原子移除。
- 恢复/幂等：相同 operation manifest 重复调用不再次移动或重启；Gateway restart/health 或配置移除失败时补偿恢复 workspace、agent-state 和 Agent 配置。目标配置重复、workspace 冲突、路径越界、symlink、Personal/非 rightnow ID 均安全拒绝。
- 测试：Provisioner Windows 为 9 pass、0 fail、1 symlink 权限 skip；同一源码复制到主机 `/tmp` 后 Linux 10/10 全通过，真实覆盖 symlink workspace 拒绝。成功路径断言仅 A 被 quarantine、B/Personal 不变、第二次 changed=false；失败路径断言 Gateway restart 失败后 config/workspace/session 全恢复。
- 部署模板：新增 `OPENCLAW_AGENT_STATE_ROOT=/root/.openclaw/agents` 与 `OPENCLAW_QUARANTINE_ROOT=/root/.openclaw-rightnow-quarantine`，native template validation 通过。生产只读确认实际 agent state 布局符合 `/root/.openclaw/agents/<agentId>/{sessions,agent}`，未读取 session 内容。
- 生产状态：仍运行 `/opt/rightnow/releases/rn-20260712-wave3c-writes`；未修改 `/etc/rightnow/provisioner.env`、`openclaw.json`、workspace 或 systemd，未调用新 DELETE。
- Backend 审计结论：账户删除仍需持久 job 与冻结状态；`WechatBindCode`、`AgentAuditLog` 无 User FK，uploads 磁盘文件不随 DB 级联。禁止直接暴露 `prisma.user.delete()`；下一步实现 `AccountDeletionJob`、ACTIVE/DELETION_PENDING 写门禁、上传 quarantine 和明确的审计匿名化策略，再接入 Provisioner DELETE。

## Wave 4B 账户冻结与删除 Job

- 负责人：ROOT；AGENT-BE/AGENT-TEST 提供只读 schema/状态机审计。
- 状态：completed（本地冻结/job 基础完成，DB purge worker 尚未实现，未部署生产）。
- 开始/完成时间：2026-07-12。
- Schema/migration：User 新增 `accountStatus=ACTIVE`、`deletionRequestedAt`、`authVersion=0`；新增无 User FK 的 `AccountDeletionJob`，状态覆盖 REQUESTED、外部 cleanup/quarantine、DB purge、finalizing、completed 和 retryable failure。userId、idempotencyKey、externalOperationId 均唯一，避免重复 job/外部操作。
- API：新增 JWT `DELETE /users/me`，要求当前密码与 16-128 位安全 `Idempotency-Key`；userId 只能来自 JWT，body 携带 userId 直接拒绝。事务冻结 ACTIVE 用户、authVersion+1、撤销 AgentBindToken/AgentChannelBinding/WechatBinding/WechatBindCode，并创建 REQUESTED job；不调用 `prisma.user.delete()`。
- Auth 门禁：新 JWT 包含 authVersion；JwtStrategy 只接受 ACTIVE 且 token version 等于数据库版本。现有 Token 缺 version 时按 0 兼容现有用户；冻结后旧 Token 立即失效，登录也拒绝 pending 用户。
- 审计策略：确定为匿名保留最小 AgentAudit，最终 purge 清空 userId/channelUserId/argsDigest，保留工具、结果、错误码、耗时与时间。WechatBindCode 显式删除；uploads 磁盘文件必须在 DB purge 前 quarantine。
- 测试：Prisma format/generate/validate 与 Backend build 通过；`test:account-deletion` 覆盖密码、同 key 幂等、不同 key 冲突、四类绑定撤销、pending/旧版本 JWT 拒绝；Chat、Memory 回归继续通过。
- 安全停止点：Provisioner DELETE 尚未生产部署，上传文件 quarantine 和 job worker 尚未实现，因此 REQUESTED job 不会自动进入外部 cleanup 或删除 User。生产 schema/API 均未发布，未冻结或删除任何生产用户。
- 下一步：实现上传资源安全 manifest/quarantine 与内部 deletion worker；worker 仅在 Provisioner/上传均完成后进入单事务 DB purge，并补充每阶段失败注入、重复执行和 B/Personal 哨兵测试。

## Wave 4C 飞书私聊 MVP 架构决策

- 负责人：ROOT。
- 状态：planned（仅完成架构与 runbook，尚未实现飞书 Schema、Bridge、回调或 E2E）。
- 决策时间：2026-07-12。
- 产品入口：采用单一 RightNow 官方“小爪”飞书应用。用户在 Web 生成 8 位、默认 10 分钟有效的一次性绑定码，在飞书私聊小爪并发送该码完成绑定；不为每位用户动态创建飞书应用。
- 服务边界：新增独立 `feishu-bridge` 作为唯一官方应用 ingress，负责 challenge、验签/解密、Event Inbox、快速 ACK、OpenClaw 调用、Message Outbox、token 缓存和飞书发送 API。RightNow Backend 负责绑定与业务事实，OpenClaw 负责 Agent/Session/Memory/工具编排。
- 身份契约：`(tenantKey, openId) -> userId -> rightnow-<userId> -> rightnow:<userId>:<Backend conversationId>`。Web 与飞书默认不同 Session，但共享 Agent、PostgreSQL Profile/事实和 `MEMORY.md`。
- 幂等契约：`FeishuEventInbox.eventId` 唯一只保证事件一次进入；饮食、训练和 TODO 等确定性写入另用 `(channel=feishu, eventId, actionType)` 唯一键，重试返回原 record ID。回复和主动推送统一经过 Outbox。
- MVP 范围：文本私聊、绑定码、文本回复、TODO 查询、饮食只分析/写入和训练完成写入。图片、群聊和主动推送后置，文本与幂等门禁通过前不得开放。
- 删除门禁：账户冻结必须立即撤销飞书绑定、取消未发送 Outbox 并拒绝新业务消息；删除 Worker 后续匿名化 Inbox 用户关联。企业级 tenant 安装不随单个用户删除。
- 当前缺口：仓库尚无 `feishu-bridge`、飞书数据模型、Event Inbox/Outbox、飞书凭据模板或回调测试；Chat 持久业务幂等也尚未实现。不得声称飞书已接入。
- 下一步：先实现账户删除 Worker 与通道幂等基础，再按 runbook 7.8-7.13 完成飞书文本 MVP；随后再做图片、群聊和主动推送。

## 本地 Demo 测试交付与稳定启动

- 负责人：ROOT。
- 状态：completed。
- 完成时间：2026-07-12。
- 文档：将 `RightNow_本地Demo开发者测试指南.md` 纳入仓库为 `docs/development-runbook/LOCAL_DEMO_TESTING_GUIDE.md`，修正本地 PostgreSQL 端口为 `15433`，补充一键启动、停止、冒烟和真实图片编辑说明。
- 启动器：新增 `scripts/start-local-demo.ps1` 与 `scripts/stop-local-demo.ps1`。启动器使用已构建的 Backend/Frontend 产物，启动本机 PostgreSQL 16（不可用时尝试 Docker Compose），只清理属于当前仓库的 `5000/5173` 监听进程，以 Backend 单进程和 Vite preview 启动；PID/日志位于被忽略的 `.work/local-demo`。
- 冒烟：新增 `scripts/smoke-local-demo.ps1`，覆盖前端 HTTP、小爪聊天入口契约、演示账号登录、真实教练聊天、TODO/饮食/训练读取；`-IncludeImageEdit` 显式增加一次真实 `step-image-edit-2` 请求，默认不消耗图片额度。
- 完善（2026-07-12）：新增 `demo:smoke:full`，将真实图片编辑作为显式完整冒烟；新增 `test:read-route-isolation`，使用本地 PostgreSQL 临时 A/B 用户验证八条确定性只读路由零串读并在结束时清理；测试指南补充版本记录、隔离命令和本地数据库限制。
- 验证结果：`test:read-route-isolation` 的 8/8 A/B 路由通过；`demo:smoke:full` 的前端、入口、登录、聊天、TODO、饮食、训练和真实图片编辑 8/8 通过；Backend/Frontend production build、`demo:stop`、`demo:start` 均通过，Demo 已恢复监听 `127.0.0.1:5173/5000`。
- 验证：Backend/Frontend 构建通过；完整冒烟 8/8 通过；stop 后 `5000/5173` 均释放，再次 start 后 Backend 401 readiness 与 Frontend 200 readiness 通过。测试仅新增演示账号聊天/图片生成记录，不写饮食、训练或 TODO。
- Windows 约束：当前环境 Vite/esbuild 在嵌套 PowerShell 构建时存在 IPC 不稳定，因此启动器只消费独立构建产生的 `dist`；使用前先运行 `npm run build:backend` 和 `npm run build:frontend`。
- 聊天稳定性补充：用户实际输入“今天什么安排”曾遇到一次阶跃瞬时失败并显示 `Internal server error`。本地 direct-chat fallback 超时从 12 秒调整为 30 秒，对网络错误、429、5xx 和空回复最多重试一次；前端 5xx 改为可重试中文提示。冒烟消息改为覆盖“今天什么安排”路径，重启后连续 3 轮均为 7/7。
- 意图链路文档（2026-07-13）：新增 `docs/INTENT_CLASSIFICATION_COMPLETE_FLOW.md`，按当前代码记录 V1 安全/写入优先、八条 V2 确定性只读、长尾语义只读、分类回退、OpenClaw/direct-chat 回退、`progress/analyze/current` 映射和当前实际可写入矩阵。
- 意图文档合并（2026-07-13）：将旧 V1 规范和 V2 设计计划中仍有效的契约、上下文 Profile、隐私、测试门禁和实施状态合并到 `INTENT_CLASSIFICATION_COMPLETE_FLOW.md`；`AGENT_INTENT_ROUTING_STRATEGY.md` 收敛为当前产品回复策略并移除过时实施建议；删除两份重复旧文档，后续不再维护平行 V1/V2 规范。

## Wave 4D 身材图与进化路径设计

- 负责人：ROOT。
- 状态：in_progress（核心链路、身份锚点、生成指纹和本地受控文件存储已实现；自动化矩阵与正式发布门禁仍待完成）。
- 设计时间：2026-07-13。
- 产品决策：保留首次三选一，将三个版本收敛为 `lean/athletic/strong` 三种可信体型；用户选中的理想态成为 Stage 6 的唯一终点参考。
- 数据契约：计划新增版本化身份锚点、理想态任务选择、Prompt/策略版本和生成指纹；PostgreSQL 继续作为体脂、阶段、选择和图片元数据的权威来源，图片模型不能决定写入或解锁。
- 阶段生图：下一阶段预览计划从“最新照 + 起始照”调整为“最新照 + 选定理想图”，起始照作为供应商能力允许时的补充；Stage 6 不再重复生成。
- 安全与幂等：理想态确认只接受当前 JWT 用户拥有的已完成 task ID，并使用 Idempotency-Key；客户端不得提交 userId、任意图片 URL、目标体脂或解锁状态。
- 文档：新增 `docs/EVOLUTION_IMAGE_GENERATION_DESIGN.md` 与 `docs/development-runbook/EVOLUTION_IMAGE_IMPLEMENTATION_RUNBOOK.md`，并在总开发 Runbook 增加 Wave 4D 入口。
- 实施顺序：Schema/迁移 -> 身份锚点 -> 三选一 Prompt 后端化 -> 理想态确认 -> 下一阶段参考图 -> 前端接线 -> 存储迁移与内容降级。
- 验收门禁：三选一保持可用、Stage 0/6 绑定正确、确认与生成幂等、A/B 零串读、图片失败不回滚业务事实、日志/Git/PostgreSQL 元数据不含 Key 或大型 Base64。
- 2026-07-13 第一批实现：新增兼容 migration 和 `EvolutionImageProfile`；三选一改为 `lean/athletic/strong` 并由 Backend 固化 Prompt；保留 taskId/variant；新增 ownership + Idempotency-Key 保护的 `ideal-selection`；Stage 6 绑定选中图；下一阶段优先以选中理想图为 reference；移除前端提前 north-star 调用；修复 `PATCH /image-gen/:id` 跨用户更新风险。
- 第一批验证：Prisma format/validate 通过；Windows 引擎被运行进程锁定后使用 `prisma generate --no-engine` 成功刷新类型；Backend 和 Frontend production build 通过，Frontend 仅保留既有大 chunk 警告。
- 2026-07-13 第二批推进：新增 `GET /evolution-stage/image-profile` 供刷新恢复选中理想态；`EvolutionStage.previewInputDigest` 保存阶段预览输入指纹，相同最新照、参考理想图、阶段和策略版本不重复生成。确认失败时前端保留当前选择和同一 Idempotency-Key，允许安全重试。
- 本地数据库：仓库既有数据库未建立 Prisma migration baseline，`migrate deploy` 以 P3005 安全停止且未改库；两份已审查的纯新增 migration SQL 改用 `prisma db execute` 成功应用。正式环境仍必须走审查后的 migration 发布流程，不能照搬本地命令。
- 运行验证：停止仓库所属旧 Demo 进程，常规 Prisma Client 生成、Backend/Frontend production build 和一键启动全部成功；新构建已运行于 `127.0.0.1:5173` 与 `127.0.0.1:5000/api`。
- 2026-07-13 身份与阶段图修复：新增首次照片身份锚点提取，严格限制为头发、肤色、脸型、眼镜、可见面部特征和原始穿着；三选一与阶段图从 PostgreSQL 读取同一锚点并锁定肤色/身份。生成结果通过双图视觉校验身份、肤色和身体变化，不合格时带纠错指令自动重试一次，第二次仍不合格则任务失败且不展示。
- 体脂表现：体脂描述区间改为半开区间，35% 不再误命中 30-35%；阶段 Prompt 同时注入当前与目标体脂，并要求腰腹、上臂、大腿和下颌线连续变化，禁止相邻阶段套用同一外观。
- 图片来源：进化页面中间阶段不再从照片时间线静默复用；只有阶段自身真实达标图或 AI 预览才展示，否则明确显示“待生成”，并标注“真实达标 / AI 预览 / 待生成”。
- 校验热修复：首次接入时误将 `bodyChangeVisible` 强制用于没有数值体脂目标的三选一，导致三张各重试一次后全部失败。现改为三选一只校验身份与肤色；仅阶段图强制身体差异，且校验置信度达到 0.65 才拒绝，避免低置信视觉判断误杀。Backend 重建并重启 Demo 成功。
- 强壮版失败修复：真实任务证据显示 `lean/athletic` 完成、`strong` 初次和纠错重试均被身份/肤色门禁拒绝。强壮 Prompt 收敛为在原身体骨架上适度增加肩臂腿围，禁止换身体和大幅增肌；前端部分失败卡片改为明确“生成失败”，不再无限显示加载动画。身份和肤色校验门禁保持不变。
- 肤色与首阶段补充：视觉校验改为严格肤色/色温判断，肉眼明显变深、变浅、偏红、偏黄、晒黑或美白均拒绝；strong 两次不合格时第三卡明确显示第二张“运动体型备选”，确认仍使用 athletic 任务，不伪造 strong 结果。理想态确认成功后立即异步触发 Stage 1 预览，解决首次进化路径第二阶段长期“待生成”。
- 三选一稳定性调整：按产品反馈移除备选来源标注；任一后位 variant 失败时由相邻已成功结果补位，确保三卡可操作。三套 Prompt 重写为同一身份/场景硬约束下的 LEAN/ATHLETIC/STRONG 连续梯度，strong 增肌限制约 5-10%。肤色校验允许曝光、白平衡和轻微色温差异，只在高置信明显美白/晒黑或基础肤色大幅改变时拒绝；身份门禁继续保持。
- Prompt 肤色约束增强：三套 variant 的共享 Prompt 明确锁定肤色亮度、底色、饱和度、冷暖、晒黑程度、曝光、白平衡和光源颜色；健身变化只能改变身体形态，禁止通过肤色或光照变化表现“更健美”。校验失败后的纠错 Prompt 同步使用相同硬约束。
- Stage 1 待生成修复：任务证据显示选中理想图宽度 4160px，超过图片编辑接口 reference 最大宽度 4096px，供应商直接拒绝。Backend 图片边界新增 Sharp 归一化，current/reference 和生成结果统一限制最长边 2048px 后再调用、校验和保存，避免后续阶段反复触发尺寸错误。
- 异步等待体验：三选一生成中新增“先进入 APP，生成完成后提醒我”；Backend 任务继续执行，App 每 5 秒读取三个 variant 最新状态，全部结束且至少一张成功后显示“理想身材已生成 / 去选择”。重新进入时恢复最新任务结果并按相邻成功图补位，不重复发起三次生成。Stage 1 身体变化校验仅在置信度达到 0.9 时拒绝，减少低置信误杀。
- 异步提示热修复：原轮询 effect 只依赖登录用户，点击跳过仅写 localStorage，未触发轮询重启。新增 React `imageGenerationPending` 状态并纳入 effect 依赖，点击后立即轮询。首页取消 `userFaceImage/userImage` 冒充理想背景，Stage 6 取消照片时间线末图 fallback；只有用户确认的 `idealBodyImage` 或 Backend Stage 6 图片才显示最终状态。
- Stage 1 写回修复：尺寸归一化后模型任务已 completed，但后台 `saveBase64Image` 因 `backend/uploads` 不存在而 ENOENT，导致 `previewImageUrl` 未写回。保存前现显式递归创建 uploads；`GET /evolution-stage` 自动补生成前先检查同用户无 variant 的 processing 任务，避免刷新页面并发重复创建。
- Stage 1 断点恢复：若 Stage 1 缺图但已有同用户最近 completed 的阶段生图任务，`GET /evolution-stage` 优先将该任务结果保存到 uploads 并补写 `previewImageUrl`/digest，而不是再次消耗模型请求；当前请求响应同步返回恢复后的 URL。
- Stage 1 展示与提示修复：Stage 1 URL 已写回 `/uploads/...`，但 Vite preview 未配置 uploads 代理，5173 请求图片失败。`server` 与 `preview` 现共享 `/api`、`/uploads` proxy。生成通知轮询增加 cancelled 竞态保护，且已存在确认理想图时强制隐藏顶部提示，避免选择后旧轮询结果重新悬浮。
- 顶部提示条件修正：不能以账户是否存在历史 `idealBodyImage` 判断当前批次提示，否则重新生成的新批次会被旧理想图隐藏。提示现仅由当前批次 `imageGenerationPending && idealImagesReady` 控制；确认当前批次后两者清零，旧轮询由 cancelled 保护不能重新显示。
## Wave 4D 理想图批次状态与跨标签页恢复修复（2026-07-13）

- 为 `EvolutionImageProfile` 增加 `activeBatchId/selectedBatchId`，为 `ImageGenTask` 增加 `batchId`；当前批次未选择时，旧选择保留为历史但不再进入主页或 Stage 6 展示。
- 三图生成先由 Backend 创建批次；任务创建、轮询、恢复和选择均限定同一批次，选择接口拒绝非当前批次任务。
- App 每 5 秒从 Backend 同步 profile 与当前批次任务，解决多标签页和刷新后的 React/localStorage 状态漂移；顶部提示仅在已登录的 APP 页面出现，选择后立即消失。
- `EvolutionEngine` 不再依赖本地 pending 标记恢复结果，直接按 Backend `activeBatchId` 恢复三张完成图片，修复点击“去选择”后错误重新生图并显示“待生成/服务不可用”。
- 本地迁移 `20260713113000_add_evolution_image_batches` 已应用；Prisma validate、Backend build、Frontend build、`git diff --check` 通过（仅既有大 chunk 与 CRLF 警告）。
- 真实浏览器验收：未选择当前批次时主页理想图数量为 0；批次完成后显示“理想身材已生成/去选择”；进入选择页后提示消失，三张图片均可见，页面不含“待生成”或“图片生成服务暂时不可用”。临时演示批次数据在验收后删除。

## Wave 4D 生成图片受控文件存储（2026-07-13）

- 新生成的理想图和阶段图在视觉校验后统一转换为最长边不超过 2048px 的 PNG，校验 MIME、像素和 12 MiB 上限，再以随机 UUID 文件名写入 `uploads`；图片服务对前端和阶段服务只返回 `/uploads/...` URL。
- `ImageGenTask.resultImageUrl`、`EvolutionImageProfile.selectedIdealImageUrl`、`User.idealBodyImage` 和 Stage 预览新写入均保存 URL，不再保存大型 Data URL；读取继续兼容历史 Data URL。
- `UploadAsset` 增加 SHA-256、MIME、字节数、provider、model 和 promptVersion 元数据，文件写入后若元数据事务失败会删除文件，避免静默留下无归属结果。
- 图片任务记录同步保存 provider/model；供应商失败日志和任务错误改为固定错误码，不再保存原始供应商响应、请求 ID 或凭据片段。
- 本地纯增量 migration `20260713120000_add_generated_image_asset_metadata` 已应用。Prisma generate/validate 与 Backend build 通过；Frontend build 沿用同一 API URL 契约并通过。
- 下一步：补齐 provider mock 自动化，覆盖三 variant、批次 ownership、选择幂等、Stage 6 零重生图、存储元数据与 PostgreSQL 无新增大型 Base64；随后执行 A/B 图片隔离验收。

## Wave 4D 图片流程自动化第一批（2026-07-13）

- 新增 `npm --workspace backend run test:evolution-images`，使用内存 Prisma 替身与合成 1px PNG，不调用网络、不读取真实照片、不消耗图片额度。
- 选择契约覆盖：Backend 创建 UUID 批次；仅当前批次 completed task 可选择；B 用户任务不能由 A 确认；旧批次任务被拒绝；同一 Idempotency-Key/同 payload 返回原结果；同 key/不同 task 返回冲突。
- Stage 6 覆盖：确认事务将选中 URL 精确写入 Profile、User 和 Stage 6；测试注入会抛错的图片服务并断言调用数为 0，证明确认路径不会重新生成 Stage 6。
- 存储覆盖：合成 PNG 写入随机 `/uploads/generated-<uuid>.png`，UploadAsset 包含 SHA-256、MIME、字节数、provider/model/promptVersion，元数据不含 Base64；测试结束删除生成文件。
- 隐私覆盖：API Key、429 和任意请求标识错误分别归一为固定错误码，不保留原始错误正文。
- 回归结果：`test:evolution-images`、`test:upload-prefix`、`test:account-deletion`、Backend build、Frontend build、Prisma validate 和 `git diff --check` 全部通过；Frontend 仅有既有大 chunk 警告。
- 尚未声明：三 variant provider mock 降级链、真实 PostgreSQL A/B 图片隔离、身份锚点重新校准、真实供应商生成和生产对象存储尚未验收。
- 下一步：将 provider 调用抽成可注入适配器或增加受控 fetch mock，覆盖三 variant 并行、部分失败补位、全部失败和降级链；之后使用新建 A/B 隔离用户做 PostgreSQL ownership 验收。

### Provider mock 补充

- `test:evolution-images` 现通过受控 `fetch` mock 返回合成 PNG，直接执行真实 `ImageGenService.generateIdealBody` 编排；`lean/athletic/strong` 三请求并行完成，各自创建当前批次任务、受控文件和 UploadAsset。
- 断言三个 `ImageGenTask.resultImageUrl` 与三个 API 结果均为 `/uploads/generated-<uuid>.png`，不以 `data:` 开头；任务保存 variant、batchId、completed 状态及 provider/model。
- 并行完成顺序不作为契约，测试按 variant 集合校验；所有合成文件在测试结束后删除。
- 当时仍待覆盖的 Ark/Legacy 降级和 PostgreSQL A/B 隔离已在下一批完成；前端部分/全部失败 UI 状态仍待自动化。

## Wave 4D Provider 降级与 PostgreSQL A/B 隔离（2026-07-13）

- provider mock 新增三条路径：Primary HTTP 503 后 Ark 成功、Primary HTTP 503 后 Legacy 成功、Primary/Ark/Legacy 全部失败。
- 测试发现并修复真实缺陷：供应商同时返回 HTTP 503 和错误正文时，旧异常只保留正文，降级判断看不到状态码并提前终止。内部异常现保留 HTTP status 供策略判断，外部日志和任务表仍只记录固定错误码。
- Ark/Legacy 成功路径断言最终 `ImageGenTask` 与 `UploadAsset` 的 provider/model 对应实际成功层；全失败路径断言任务为 failed、错误为 `IMAGE_PROVIDER_UNAVAILABLE`、零 UploadAsset、零原始请求标识残留。
- 新增 `test:evolution-image-isolation`，连接本地真实 PostgreSQL，创建两名随机 `.invalid` 隔离用户和虚构图片 URL；验证 A/B task list/detail/update、Profile、选择和 Stage ownership。
- A 无法读取、更新或确认 B 的图片任务；A 确认后仅 A 初始化七阶段并绑定 Stage 6，B Profile 保持未选择且 Stage 行数为 0。测试不调用模型、不创建图片文件，`finally` 级联删除两名临时用户。
- 验证结果：provider 降级自动化和真实 PostgreSQL A/B 隔离均通过。
- 下一步：补身份锚点首次提取/重复幂等/显式重新校准与敏感字段过滤测试；随后覆盖前端部分失败补位和全部失败状态。

## Wave 4D 身份锚点生命周期与安全边界（2026-07-13）

- `POST /evolution-stage/image-profile/prepare` 新增显式 `recalibrate=true` 契约；普通重复调用直接返回现有版本且不调用视觉模型，只有显式重新校准才重新提取并将 `identityAnchorVersion` 加一。
- 提取前验证 `startImage` ownership：只接受当前用户的 `userImage`、`userFaceImage`、既有 Profile startImage 或当前用户 UploadAsset URL；任意 URL 和其他用户资产在模型调用前返回 404。
- AI 输出继续只保留六个允许字段，并新增敏感内容过滤；允许字段字符串中若包含种族、民族、国籍、健康、疾病、诊断、体脂、体重、年龄或性格等中英文描述，整项丢弃。控制字符和重复空白被清理，单项最多 160 字符。
- 畸形模型 JSON 统一转换为身份锚点域错误，不向上层暴露解析器细节。
- `test:evolution-images` 覆盖首次提取、普通重复幂等、显式重新校准、ownership 前置拒绝、允许字段、额外字段、敏感内容、控制字符和畸形 JSON。
- `test:evolution-image-isolation` 使用真实 PostgreSQL UploadAsset 验证 A 可提取自己的资产、不能以 B 的 URL 重新校准，且被拒绝时 AI 调用计数不变；测试数据最终级联清理。
- 下一步：把三卡部分失败补位逻辑抽成可测试纯函数，覆盖首卡失败、中卡失败、末卡失败和全部失败；随后运行 Wave 4D 最终门禁清单。

## Wave 4D 三卡部分失败状态自动化（2026-07-13）

- 新增 `fillIdealBodyResultSlots` 纯函数并统一用于首次生成完成和刷新恢复，移除两处不一致的手写补位逻辑。
- 补位规则为最近成功结果，等距优先左侧；首卡、中卡、末卡、两卡失败均能稳定展示，三卡全失败保持全空并进入整体失败状态。
- 补位复用完整成功结果对象，不改写 `taskId` 或 `variant`；用户点击补位卡确认时仍提交实际成功任务身份，不伪造失败 variant。
- 新增 `npm --workspace frontend run test:ideal-body-results`，覆盖三卡成功、首/中/末单卡失败、仅中卡成功、全部失败及真实任务身份保留。
- 本轮回归：前端纯函数测试、图片服务/身份锚点/provider 降级测试、真实 PostgreSQL A/B 隔离、Frontend build、Prisma validate 和 `git diff --check` 全部通过。
- 下一步：运行 Wave 4D 最终门禁清单和源码/数据库 Base64、凭据、临时文件扫描；根据结果决定是否将本地 Wave 4D 标记 completed，正式发布仍需独立 migration/release 验收。

### 最终扫描阶段性结果

- 临时 A/B 隔离用户残留为 0；合成测试文件均已删除。
- 本地数据库仍有 44 条历史 `ImageGenTask.resultImageUrl` 使用旧 Data URL；这是兼容读取范围，不能据此声称 PostgreSQL 已完成历史 Base64 清理。当前没有受控 `/uploads/generated-*` 真实供应商记录，因为自动化全部使用内存 Prisma/mock 且不消耗额度。
- 新代码路径已将后续生成结果写为受控 URL，但还需要一份可审计、可恢复、默认 dry-run 的历史迁移工具，将任务、Profile、User 和 Stage 对同一旧图片的引用一致替换后，才能关闭本地数据库存储门禁。

## Wave 4D 历史 Data URL 迁移（2026-07-13）

- 新增 `migrate:evolution-images`：默认 dry-run；`--apply` 才写入；支持 `--user-id` 分批范围和 `--restore <backup.json>` 反向恢复。命令输出仅含计数和恢复包路径，不输出图片正文。
- 迁移从 Task result/source、User ideal/current/face、ImageProfile selected/start、Stage preview/actual 和 EvolutionRecord imageUrl 收集 Data URL，按 `(userId, SHA-256)` 去重；图片规范化为最大 2048px PNG并写入随机文件名。
- 每张图先在 Git 忽略的 `.work/evolution-image-migration/` 写入权限受限恢复条目，再在单个 PostgreSQL 事务中创建 UploadAsset 并替换同用户全部精确引用。事务失败会删除新文件；restore 只恢复仍指向该迁移 URL 的字段，避免覆盖迁移后的新数据。
- 新增 `test:evolution-image-migration`，使用隔离用户验证 scoped dry-run、跨 Task/User/Profile/Stage/Record 的事务一致替换、文件与 Asset、完整 restore 和最终级联清理。
- 本地第一批迁移 44 个历史 Task 结果；恢复包：`.work/evolution-image-migration/2026-07-13T03-25-54-603Z-f8d0c4f2-9cf7-4326-a8e4-d19b9a3f76ae.json`。
- 扩展全引用扫描后第二批迁移 16 个按用户去重的资料/起始/阶段图片；恢复包：`.work/evolution-image-migration/2026-07-13T03-28-13-098Z-6cb961c2-2214-4234-bd42-90deb0836702.json`。
- 迁移后 Task result/source、User ideal/current/face、Profile selected/start、Stage preview/actual、EvolutionRecord 的 Data URL 计数全部为 0；迁移 Asset 共 60 个，缺失文件为 0；再次 dry-run 为 0。
- 读取冒烟：随机迁移 PNG 经 Backend `:5000/uploads/...` 和 Frontend `:5173/uploads/...` 均返回 200 `image/png`。
- 下一步：执行 Wave 4D 汇总门禁与 Git/日志敏感信息扫描；本地完成不代表生产迁移或对象存储发布完成，生产仍需独立备份、dry-run、release 和回滚验收。

## Wave 4D 本地汇总门禁（2026-07-13）

- 状态：completed_local；生产 migration/release 仍为 pending，不能据此声称生产已发布。
- 通过命令：`test:ideal-body-results`、`test:evolution-images`、`test:evolution-image-isolation`、`test:evolution-image-migration`、Backend build、Frontend build、Prisma validate、`git diff --check`。
- 数据门禁：全部目标图片字段 Data URL 为 0；迁移 Asset 60、缺失文件 0；全库 migration dry-run 为 0；隔离测试用户残留 0。
- 静态读取门禁：Backend 与 Frontend `/uploads` 均返回 200 `image/png`。
- 隐私门禁：Git 跟踪文件 `sk-<20+>` 模式命中 0；错误日志/任务只使用固定错误码。恢复包和 uploads 位于 Git 忽略目录。
- 工作区仍有 29 行未提交状态，包含 Wave 4D 源码、四份 additive migration、自动化和文档；尚未整理 Git commit。
- 剩余发布工作：审查并拆分 Git commit；生产数据库/文件备份；生产 migration dry-run；发布 Backend/Frontend；迁移历史图片到生产对象存储或受控持久目录；验证 Nginx 静态路径、回滚和账户删除 Worker 对新增 UploadAsset/文件的处理。

## Wave 4E Upload quarantine 原语（2026-07-13）

- 状态：completed_local（仅文件隔离原语；账户删除 Worker、Provisioner 串联和 DB purge 尚未完成）。
- 新增 `UploadQuarantineService`：operation ID 固定为 `account-delete-<uuid>`；quarantine root 仅由服务端环境变量决定且必须位于 active uploads 外部；资产路径只由当前用户 UploadAsset URL 解析。
- 只接受 uploads 根内普通非符号链接文件；外部对象存储 URL、越界路径、非法 operation、目标冲突和恢复源冲突均安全失败。
- manifest 先于移动写入并在每次 rename 后原子更新，不包含图片正文；中途失败按逆序恢复已移动文件。相同 operation 重复 quarantine/restore 均幂等。
- 新增 `test:upload-quarantine`，覆盖两文件隔离、重复调用、完整恢复、重复恢复、第二目标冲突后的第一文件回滚、非法 operation 和 manifest 正文隔离；`test:account-deletion` 冻结回归继续通过。
- 环境模板新增 `ACCOUNT_DELETION_UPLOAD_QUARANTINE_ROOT`；生产建议 `/var/lib/rightnow/upload-quarantine`，且必须与 uploads 同盘以保证原子 rename。
- 下一步：为 Backend `OpenClawProvisioningService` 增加认证反注册调用；实现单 worker claim/状态转换，将 Provisioner quarantine 与 Upload quarantine 串行完成后才进入 DB purge。任何外部阶段失败必须恢复 uploads 并保留 User 为 DELETION_PENDING。

## Wave 4E 账户删除 Worker（2026-07-13）

- 状态：completed_local；生产 Provisioner/真实 workspace/uploads E2E 与 purge 保留期策略仍为 pending。
- `OpenClawProvisioningService.deprovisionUserAgent` 新增认证 DELETE：Agent ID 只能由 Backend userId 推导；operation 必须匹配 `account-delete-<uuid>`；固定发送 `{ operationId, reason: account-deletion }`；严格校验 JSON、agentId、operationId、configured=false 和 gatewayReady=true。
- Worker 默认关闭；显式启用后单进程 busy gate 串行处理，每次通过状态与 `updatedAt` 原子 claim 一个 Job。崩溃超过 5 分钟的 `EXTERNAL_CLEANUP` 可重领。
- 固定执行顺序：OpenClaw quarantine -> Upload quarantine -> 标记 `EXTERNAL_QUARANTINED` -> `DB_PURGE` -> 审计匿名化 -> 非 FK 绑定码删除 -> User 级联删除 -> `FINALIZING` -> `COMPLETED`。
- Provisioner 和 Upload 使用同一 `externalOperationId`，重试保持幂等；`externalCompletedAt` 已存在时跳过两个外部步骤，`dbPurgedAt` 已存在时只完成 finalization。任一步失败进入 `FAILED_RETRYABLE`，仅保存固定错误码。
- DB purge 事务同时完成 AgentAudit 的 `userId/channelUserId/argsDigest=null`、WechatBindCode 显式删除、User 级联删除和 Job `FINALIZING/dbPurgedAt`，避免 User 已消失而 Job 仍停在 purge 前。
- 自动化：OpenClaw provisioning 测试覆盖 Bearer DELETE、固定 body、非法 operation 和错误响应；Worker 内存测试覆盖严格顺序、外部失败不触发 uploads/DB、DB 失败重试且外部步骤只执行一次；真实 PostgreSQL 测试覆盖 User/UploadAsset/ImageGenTask 级联、WechatBindCode 清理、审计匿名化和 Job 持久完成。
- 环境模板新增 `ACCOUNT_DELETION_WORKER_ENABLED=false` 与 `ACCOUNT_DELETION_WORKER_INTERVAL_MS=5000`。生产发布必须先部署并验证 Provisioner DELETE，保持 Worker 关闭；完成隔离测试用户 E2E 后才允许启用。
- 下一步：使用新建隔离用户在生产候选环境执行真实 Provisioner + Upload quarantine + DB purge 演练，核对 B 用户、Personal workspace 和非目标 uploads 不变；随后定义 quarantine 保留期与离线 purge 运维命令。

### 本地完整 E2E 补充

- 新增 `test:account-deletion-e2e`，启动仅监听随机 loopback 端口的测试 Provisioner HTTP 服务，使用真实 Bearer DELETE 契约、真实 PostgreSQL、真实 uploads 文件和真实 Upload quarantine；不连接生产 OpenClaw。
- 测试创建 A/B 两名随机 `.invalid` 用户、A/B 独立文件和一个不属于任何 UploadAsset 的非目标哨兵。Worker 完成后 A User/Asset 消失且 A 文件进入 operation quarantine，Job 为 COMPLETED，A 审计匿名化。
- B User、B UploadAsset、B 文件及非目标哨兵内容全部保持不变；Provisioner 只收到一次目标 A Agent DELETE。测试结束清理 A/B、Job、匿名审计、文件和 quarantine 目录。
- 结果：本地端到端顺序 `OpenClaw HTTP quarantine -> Upload rename quarantine -> DB purge -> audit anonymization -> COMPLETED` 通过。

## Wave 4E Upload quarantine 离线 purge（2026-07-13）

- 新增 nullable `AccountDeletionJob.quarantinePurgedAt` 和 additive migration `20260713123000_add_deletion_quarantine_purge_time`，本地已应用并通过 Prisma validate。
- 新增 `purge:account-deletion-quarantine`，默认 dry-run；`--apply --retention-days <1-3650>` 才执行。仅处理已 COMPLETED、超过保留期且尚未记录 purge 的 Job。
- 每个候选必须通过 operation ID、根目录边界、普通非 symlink 目录和 manifest 身份/状态校验。目录先原子改名为 `<operation>.purging`，随后写入 `_purged/<operation>.json` tombstone，再删除目录并更新 `quarantinePurgedAt`。
- tombstone 解决“目录已删除但数据库时间戳尚未写回”的崩溃窗口；重试可根据 tombstone 完成数据库标记。目录和 tombstone 同时缺失时安全失败，不能误报已清理。
- 新增 `test:account-deletion-quarantine-purge`：45 天 Job 可被 dry-run 发现并 apply；5 天 Job 保持不变；旧 Job 目录删除、tombstone 和时间戳存在；重复 apply 为 0。测试使用 `.work` 临时目录并清理 Job/文件。
- 本命令只清理 Backend upload quarantine。OpenClaw Agent/workspace/session quarantine 的最终 purge 尚无 Backend 权限，必须由 Provisioner 增加独立认证运维接口并设置单独保留期。
- 下一步：实现 Provisioner quarantine list/purge 的只读 dry-run 与认证 apply 契约；在生产候选环境先对全新隔离用户执行完整删除与恢复期观察，再批准不可逆 purge。

## Wave 4E OpenClaw quarantine 运维接口（2026-07-13）

- Provisioner 新增认证 `GET /quarantine`：扫描固定 quarantine root，校验普通非 symlink operation 目录及 manifest，返回安全摘要；不返回 workspace/session 路径、文件名或正文。新 manifest 写入 `quarantinedAt`，旧 manifest 兼容使用文件 mtime。
- 新增认证 `POST /quarantine/purge`：body 只允许 `operationId/retentionDays/dryRun`；保留期限制 1-3650 天。未到期时即使 apply 也返回 eligible=false 且不修改目录。
- 达到保留期后，apply 将 operation 原子改名为 `.purging`，写入 `_purged/<operation>.json` tombstone，再递归删除。重复调用返回 alreadyPurged；所有路径由服务端 quarantine root 推导。
- Backend `OpenClawProvisioningService` 增加 `listQuarantines()` 和 `purgeQuarantine()`，使用现有 admin URL/token，严格校验响应；不暴露浏览器 Controller。
- Provisioner 测试覆盖未认证 401、安全列表无路径、近期 apply 不删除、31 天 dry-run、31 天 apply、tombstone、重复 purge，并继续验证 B Agent 与 Personal workspace 哨兵不变。全套结果 9 pass、0 fail、1 Windows symlink 权限 skip。
- 下一步：增加 Backend 离线协调命令，只从已完成且超过保留期的 AccountDeletionJob 生成 OpenClaw dry-run/apply 请求，并持久记录 `openClawQuarantinePurgedAt`；生产首次 apply 必须人工核对 operation/agent 映射。

## Wave 4E 账户删除链路检修（2026-07-13）

- 状态：completed_local；本轮只使用本地 PostgreSQL、loopback fake Provisioner 和临时文件，没有连接生产 OpenClaw，也没有处理真实用户。
- 修复多 Backend 实例 claim 竞态：处理中状态不再被其他实例立即领取，只能在 5 分钟租约过期后接管；持有 Worker 每 30 秒刷新 `updatedAt`。`REQUESTED/FAILED_RETRYABLE` 仍可立即领取，单实例 busy gate 继续串行执行。
- 修复 OpenClaw 反注册崩溃窗口：Provisioner 先写 `moving` manifest，再移动 workspace/state，最后标记 `quarantined`；重试可继续部分移动状态，也可重建旧实现留下的“目录已创建或资源已移动但 manifest 尚未写入” orphan operation。
- 修复 OpenClaw purge 崩溃窗口：仅有 `<operation>.purging` 时可继续写 tombstone 并删除；已有 tombstone 但 `.purging` 数据仍存在时继续删除，不能误报 alreadyPurged；active、purging、tombstone 冲突状态安全失败。
- 加强 Upload quarantine：目标文件名加入源路径摘要；manifest 恢复/续跑前重新校验 source、destination、普通文件与非 symlink 边界，兼容旧版 basename manifest。E2E 改为依据 manifest 验证服务端目标路径，不依赖文件名实现细节。
- 新增 Provisioner 回归：部分资源已移动、旧 orphan operation、rename 后未写 tombstone、tombstone 后未删除目录。Provisioner 结果为 12 pass、0 fail、1 Windows symlink 权限 skip。
- 通过：`test:account-deletion`、`test:account-deletion-worker`、`test:account-deletion-worker-db`、`test:account-deletion-e2e`、`test:upload-quarantine`、`test:account-deletion-quarantine-purge`、`test:openclaw-provisioning`、Backend build、Prisma validate 和 `git diff --check`。
- 仍未开放生产 Worker。下一步保持不变：增加 Backend OpenClaw quarantine 离线协调命令及 `openClawQuarantinePurgedAt`，先 dry-run 并人工核对 operation/agent 映射；生产 apply 仍需新建隔离用户和独立审批。

## 本地 Demo 三项交付收尾（2026-07-13）

- 已将账户删除链路检修整理为独立提交 `c73b687 fix(account): harden deletion recovery`。
- 新增 `npm run demo:reset`：固定重建 `test7@qq.com`，恢复当天 TODO、饮食、训练、体重和计划基线；只允许回环地址的 `rightnow_fitness` 数据库，要求删除 Worker 关闭和固定邮箱确认。旧 UploadAsset 文件仅在无其他用户引用时删除。
- reset dry-run 命中固定演示账号和 4 个旧本地文件；实际 apply 成功删除 4 个旧文件并重建演示账号；缺少确认邮箱的 apply 按预期以 `DEMO_RESET_CONFIRM_EMAIL_REQUIRED` 拒绝。
- 修复 Demo 启动器环境加载：Backend 改为 `node --env-file=.env dist/main.js`，避免 preview 子进程只加载部分配置导致聊天 provider 被误判为未配置。
- 修复完整图片冒烟输入：旧 64x64 蓝色方块会被身份一致性门禁正确拒绝；现改用仓库固定 Demo 人物素材 `frontend/public/assets/ori.png`，真实调用图片编辑 provider 且不降低身份/肤色校验。
- 最终结果：Backend/Frontend production build 与 Chat 回归通过；`demo:start` readiness 为 Backend 401、Frontend 200；`demo:smoke:full` 的前端、小爪入口、登录、聊天、TODO、饮食、训练和真实图片编辑 8/8 通过。验收后再次 stop/reset，删除冒烟生成的 1 个文件并恢复干净基线，Demo 已重新启动。

## 前端生产路径构建重构（2026-07-15）

- 负责人：ROOT
- 状态：completed_local
- 修改文件：`frontend/vite.config.ts`、`frontend/api/client.ts`、`frontend/package.json`、`frontend/production.env.example`、`frontend/scripts/verify-production-build.mjs`。
- 变更内容：production mode 默认 base 为 `/rightnow/`、API 为 `/rightnow-api`；development mode 保持 `/`、`/api`。构建脚本增加产物路径门禁，仍允许环境变量覆盖为独立子域名根路径部署。
- 测试结果：`npm run build:frontend` 成功，门禁输出 `production frontend paths: OK (/rightnow/, /rightnow-api)`；`dist/index.html` 的 JS/CSS 均使用 `/rightnow/assets/`；临时 development mode 在 `127.0.0.1:5174/` 正常启动并已停止；`git diff --check` 通过。
- 证据摘要：此前线上 HTML 使用根 `/assets/`，该路径落入 Personal OpenClaw server 并返回 404。此次将正确路径变成生产默认值，不再依赖人工设置变量或错误命名的示例 env 文件。
- 阻塞项：尚未发布到云端；域名购买、ICP备案、DNS、Nginx server_name 与 HTTPS 仍需用户确定域名后执行。
- 下一步：购买域名后优先采用 `app.<domain>` 独立子域名；确定最终是否保留 `/rightnow/`，再按对应 base 构建、发布和进行真实浏览器验收。
## 本地网站启动恢复（2026-07-17）

- 状态：completed_local。定位到微信桌面端 `Weixin.exe` 以 TCP `Bound` 状态占用 `0.0.0.0:5000`；该状态不会出现在仅筛选 `Listen` 的检查中，但会导致 Nest 启动时报 `EADDRINUSE`。
- 未关闭或修改微信进程。本地 Demo 后端改用 `127.0.0.1:5001`，前端继续使用 `127.0.0.1:5173` 并通过 `/api` 代理到 5001。
- `demo:start` 现在会先显式生成 `/ + /api` 的本地预览构建，避免误用云端 `/rightnow/ + /rightnow-api` 产物导致首页路径或 API 代理 404。
- 验证：`npm run demo:start` 成功完成本地路径构建并启动两端；浏览器重载后正常渲染 RightNow 登录页且无应用控制台错误；`GET :5173/` 为 200，`GET :5173/api/auth/me` 经代理为预期 401，`GET :5001/api/auth/me` 直连也为预期 401；5173/5001 均只监听 loopback。未运行会向既有演示用户写入 ChatMessage 的完整 smoke。

## 图片生成完成后前端误报恢复（2026-07-17）

- 状态：completed_local。Provider 配置、密钥认证和 `step-image-edit-2` 模型均正常；本机到 `api.stepfun.com:443` 可达。故障窗口内 7 个任务全部完成，单张耗时约 14-35 秒，不是图片 Provider 停服。
- 根因：前端请求中断时直接显示“图片生成服务暂时不可用”；页面恢复时若当前批次尚在处理，又会立即创建新批次，使旧请求的结果难以恢复并可能重复消费额度。
- 修复：新增持久批次解析器；当前批次处理中时最长轮询 120 秒，完成后从 PostgreSQL 任务恢复三张结果；请求异常时优先回查当前批次；处理超时只提示稍后刷新，不自动开启新批次。
- 验证：`test:ideal-body-results` 覆盖 missing/processing/terminal、部分失败及真实 taskId/variant 保留；本地 `/ + /api` 完整前端构建和路径门禁通过。未额外调用真实图片生成，避免重复计费。

## 云端前端白屏恢复（2026-08-04）

- 状态：completed_prod。云端 `/rightnow/index.html` 错误引用 `/assets/index-*.js` 和 `/assets/index-*.css`，两项均为 404，导致 React 未启动；Backend、RAG、Provisioner 和 Nginx 本身均为 active。
- 使用当前工作副本执行 `npm run build:frontend`，生产路径门禁确认 `/rightnow/ + /rightnow-api`；构建产物先上传到独立暂存目录并校验入口、JS、CSS 后，原子替换 `/var/www/rightnow`。
- 回滚备份：`/var/www/rightnow.backup-20260804-white-screen-v2`。本次只替换前端静态目录，未修改数据库、Backend release、OpenClaw、RAG 数据或 Nginx 配置。
- 验证：公网 HTML 已引用 `/rightnow/assets/index-DZHioQu3.js` 与 `/rightnow/assets/index-BopDRGR_.css`；两项分别返回 200 `application/javascript` 和 200 `text/css`；未认证 API 为预期 401。两个已打开的云端浏览器页面刷新后均正常渲染登录页，控制台错误为 0。

## 云端 SPA 缓存治理（2026-08-06）

- 状态：completed_prod。服务端与静态资源始终正常，但已打开标签页可能继续使用旧 HTML；原 Nginx 响应只有 ETag/Last-Modified，没有明确的 HTML 禁缓存策略。
- `location /rightnow/` 新增 `expires -1` 和 `Cache-Control: no-cache, no-store, must-revalidate`；更具体的 `/rightnow/assets/` 继续使用一年 `public, immutable`，避免降低哈希资源缓存效率。
- 模板测试新增双门禁：SPA HTML 必须禁缓存，哈希静态资源必须保持 immutable。`validate-templates.ps1`、`nginx -t` 和 `git diff --check` 均通过。
- 生产配置备份：`/etc/nginx/rightnow.locations.conf.backup-20260806`。Nginx 平滑 reload 后 active；HTML=200 且 no-store，入口 JS=200 且一年 immutable；两个云端标签页均正常渲染登录页，控制台错误为 0。

## 换机前代码提交验收（2026-08-14）

- 负责人：ROOT
- 状态：completed_local。
- 提交范围：理想身材图片批次恢复、生产 `/rightnow/` 与 `/rightnow-api` 路径门禁、SPA HTML/哈希资源分级缓存、本地 Demo Backend 端口 5001，以及对应架构和共享记忆文档。
- 安全检查：待提交列表不包含 `.env`、数据库导出、Chroma 数据、用户 workspace、证书或私钥；差异关键字检查只命中前端固定的本地存储键名 `rightnow_token`，未发现真实 Token 值。
- 测试结果：`npm run build:frontend` 通过，并输出 `production frontend paths: OK (/rightnow/, /rightnow-api)`；`npm run build:backend` 通过；`npm --workspace frontend run test:ideal-body-results` 通过；原生部署模板检查输出 `native deployment templates: OK`；`git diff --check` 通过。
- 交接说明：提交完成后将 `local-integration` 推送到 GitHub；新电脑应从该分支恢复源码，真实 `.env` 与 SSH 身份继续通过 Git 之外的安全渠道迁移。
