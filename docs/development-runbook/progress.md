# RightNow 开发进度

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
