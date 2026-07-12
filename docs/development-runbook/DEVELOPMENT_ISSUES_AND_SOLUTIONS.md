# RightNow 3.2 开发问题与解决方案

更新时间：2026-07-12  
适用分支：`local-integration`

本文记录 RightNow 3.2 开发、联调和本地 Demo 阶段实际遇到的问题，以及已经采用的解决方案。内容来自 `progress.md`、架构决策、测试结果和 Git 提交，不包含密钥、Token、真实用户数据或 workspace 正文。

## 1. 意图识别 V2 准确率和延迟未同时达标

**遇到的问题**

V2 语义分类器首轮受控观测中存在供应商错误、结构化响应错误，以及 `progress/analyze`、训练建议、训练历史 scope 等混淆。扩展到 120 条黄金集后准确率达到 `99.17%`，但并发测试 P95 约 `10779ms`，超过 `5000ms` 门禁。若直接将所有请求同步交给分类模型，会显著增加聊天等待时间，并使只读查询受外部服务限流影响。

**解决方案**

- 将分类契约拆成 `resource / operation / scope`，由 Backend 将结果映射到固定路由和固定读取集合。
- 先以 Shadow 模式观察，不让模型结果改变业务执行。
- 八条高频只读查询优先使用本地确定性规则，在 OpenClaw、RAG、Memory 和远程模型之前短路。
- 仅开放受控的 `v2-readonly`：单次尝试、`4500ms` 上限，只接受低风险、高置信、无写入且能映射到白名单的请求。
- 连续 5 次失败后熔断 60 秒，熔断期间直接回退旧链路。
- 语义模型永远不能批准写入；写入仍由 Backend 确定性规则授权。

**验证结果**

120 条黄金集有效响应 `120/120`，三字段匹配 `119/120`；八条高频只读路由可在约 `11-70ms` 内从 PostgreSQL 返回。长尾进展查询在 `4500ms` 门限内完成时可进入只读路由，超时则安全回退。

**当前限制**

语义分类仍依赖外部模型，不能保证每次低延迟；因此同步语义写入保持关闭。

## 2. “今天吃了多少”被误判为饮食写入

**遇到的问题**

旧规则看到“吃了”便判断为饮食记录，导致查询“今天吃了多少”错误创建 `DietRecord`。

**解决方案**

- 给饮食写入规则增加查询词否决条件，包括“多少、什么、哪些、查看、查询、有没有、了吗”。
- 明确区分 `diet/query`、`diet/analyze` 和 `diet/create`。
- 保持语义模型无权触发写入，避免概率分类直接产生业务副作用。
- 删除隔离测试用户中由该缺陷产生的误记录。

**验证结果**

修复后“今天吃了多少”走 `today_diet` 只读路由，数据库饮食记录数保持不变；相关提交为 `7c838cf`。

## 3. 饮食记录回复暴露内部记录 ID，表达不自然

**遇到的问题**

写入成功回复包含括号和内部 record ID，例如“已按估算写入饮食记录（记录 ID：...）”，不适合面向普通用户，也暴露无用的内部实现信息。

**解决方案**

- 回复先给出大致热量估算，再确认写入。
- 移除 record ID 和括号内容。
- 保留“份量不准确可以纠正”和“常见份量估算”的必要说明。
- 将只分析与确认写入拆成不同模板。

**验证结果**

写入模板调整为“大致估算约 520 千卡。已写入饮食记录，如份量不准确可以纠正。营养数据来自常见份量估算。”

## 4. 相对时间缺少统一上下文

**遇到的问题**

模型和确定性规则无法稳定理解“今晚、明早、周末、刚才”等表达；不同进程或 UTC 日期边界可能导致“今天”不一致。

**解决方案**

- Backend 统一使用 `Asia/Shanghai` 解释相对时间。
- 给 Chat/OpenClaw system prompt 注入当前上海日期、时间、星期和时区。
- 给语义分类器传入固定的本地日期时间、星期和时区字段。
- 业务记录时间仍由 Backend 和数据库生成，模型时间只作为理解上下文。

**验证结果**

已覆盖“今晚/今早 -> today”“明早/明晚 -> tomorrow”“周末 -> week”“刚才/刚刚 -> current”；相关提交为 `3f95a6e`。

## 5. 本地聊天偶发 Internal server error

**遇到的问题**

本地 Demo 未运行 OpenClaw Gateway，聊天通过阶跃直连降级。外部模型曾出现瞬时网络错误、429、5xx 或空回复，用户页面只显示 `Internal server error`。

**解决方案**

- 本地启用 `CHAT_DIRECT_FALLBACK=true`，生产禁止使用该降级配置。
- 将直连超时由 12 秒提高到 30 秒。
- 对网络错误、429、5xx 和空回复最多重试一次。
- 前端将 5xx 转换为可理解、可重试的中文提示。
- 冒烟测试固定覆盖真实聊天请求。

**验证结果**

重启后连续三轮聊天冒烟通过；完整 Demo 冒烟的聊天步骤通过。

## 6. OpenClaw Agent 列表探测契约不兼容

**遇到的问题**

Gateway 2026.3.24 的认证 `/v1/models` 返回 `200 text/html` 管理页面，而 Backend 按 Agent JSON 列表解析，导致 `agentExists()` 返回 false，`waitForAgent()` 必然超时。重启 Gateway 无法解决契约错误。

**解决方案**

- 停止使用 `/v1/models` 作为 Agent 列表。
- 在 Provisioner 增加认证状态接口 `GET /agents/<agentId>`。
- 状态接口仅返回 `agentId`、`configured` 和 `workspaceReady`，不返回 workspace 内容。
- Backend 严格校验 JSON、Agent ID 和必需字段；非 JSON 或不完整响应安全失败。

**验证结果**

Agent 配置与 workspace 就绪状态可被 Backend 正确确认，重建链路不再因 HTML 响应误判。

## 7. Agent 重建后 MEMORY.md 只恢复默认模板

**遇到的问题**

删除隔离测试 Agent/workspace 后，Provisioner 能重建目录和模板，但稳定偏好没有从 PostgreSQL `AgentMemoryProfile` 恢复，新的 `MEMORY.md` 只有默认内容。

**解决方案**

- 以 PostgreSQL Profile 作为可恢复权威来源。
- 在 `ensureAgent` 后由 `MemorySyncService` 确定性序列化 Profile。
- 通过 Provisioner 的 `PUT /agents/<agentId>/memory` 原子写入服务端推导的 workspace。
- 拒绝调用方路径、符号链接、非普通文件、非法格式和超过 64 KiB 的内容。
- 外部同步失败时保留 PostgreSQL 事实，并返回 `workspaceSynced=false`。

**验证结果**

Profile 可以重建 `MEMORY.md`，且不会修改 Personal workspace。

**当前限制**

OpenClaw Memory provider 仍为 `none`。当前只证明 PostgreSQL Profile 和 `MEMORY.md` 恢复，不能声称向量索引或 `memory_search` 召回通过。

## 8. OpenClaw 插件生产兼容问题

**遇到的问题**

生产 Gateway 加载插件时出现两项兼容问题：`@sinclair/typebox` 运行时依赖缺失/导入错误；当前 OpenClaw 版本缺少可选的 `registerMemoryPromptSupplement` API。

**解决方案**

- 将 `@sinclair/typebox` 固化为插件运行时依赖并修正 import。
- 将 Prompt Supplement 注册视为版本相关的可选能力：存在则注册，不存在则跳过。
- 数据工具、身份隔离和 RAG 工具不得因可选 Prompt API 缺失而停止加载。

**验证结果**

Gateway 日志最终显示 RightNow 插件成功 loaded。

## 9. 插件备份目录导致 Gateway 502

**遇到的问题**

一次发布将旧插件备份放在 OpenClaw `extensions` 自动发现目录中，Gateway 扫描到重复 plugin ID，重启后公网短暂返回 502。

**解决方案**

- 立即将备份移出 `extensions`，统一放入 `/root/backups/` 的发布快照。
- 将“插件备份禁止位于自动发现目录”写入架构和发布规则。
- 发布门禁增加 Gateway 健康检查和自动回滚。

**验证结果**

移走备份后 Gateway 恢复 200，Personal OpenClaw 入口和 workspace 未被修改。

## 10. RAG 生产主机无法访问 Hugging Face

**遇到的问题**

云主机无法直接访问 `huggingface.co`，embedding 模型不能按默认方式下载；若服务启动时依赖外网，重启可靠性也不可接受。

**解决方案**

- 通过可达镜像一次性下载同一个 `BAAI/bge-small-zh-v1.5` 模型。
- 模型缓存固定到 `/var/lib/rightnow/models/hf`。
- 运行时设置 `HF_HUB_OFFLINE=1`，服务启动不再依赖外网。
- L1/L2/L3 Chroma 分目录持久化，索引可由仓库知识源重建。

**验证结果**

L1/L2/L3 持久数量为 `30/16/14`，进程重启后保持；风险问题能命中 L3，空 query 返回 422。

## 11. Windows Vite 开发模式不稳定

**遇到的问题**

当前 Windows/Node 环境中，Vite HMR/esbuild 偶发 `Invalid loader value` 和 IPC 异常；旧 watch 进程还可能残留并占用 `5000/5173`。

**解决方案**

- Demo 使用 Backend production build 和 `vite preview`，不依赖 HMR。
- 构建与启动分离：先执行 Backend/Frontend build，再运行一键启动器。
- 启动器只终止命令行属于当前仓库的监听进程；外部进程占用端口时停止并报告，不强杀。
- PID 和日志写入被 Git 忽略的 `.work/local-demo/`。

**验证结果**

`demo:stop` 能释放端口，`demo:start` 能稳定恢复 Backend 401 readiness 和 Frontend 200 readiness。

## 12. 小爪头像视觉上可见但无法进入聊天

**遇到的问题**

首页小爪头像最初只有拖动交互，点击区域或事件链没有稳定触发聊天导航，用户多次点击仍无法进入教练对话页。

**解决方案**

- 给头像建立明确的 `openChat()` 点击路径。
- 区分点击和拖动，只有实际拖动时抑制导航。
- 从 `FloatingAdvisor` 向应用层传递 `onChatClick`。
- 增加可访问的按钮标签和冒烟中的代码契约检查。

**验证结果**

普通点击进入聊天，拖动不会误触；完整冒烟验证小爪入口契约通过。

## 13. 图片模型端点和能力理解错误

**遇到的问题**

曾尝试使用不匹配的第三方端点和模型。最终选择的阶跃模型 `step-image-edit-2` 是图片编辑模型，必须提供输入图片，不能当作纯文生图接口使用；图片尺寸过小也会失败。

**解决方案**

- 固定 `IMAGE_GEN_BASE_URL=https://api.stepfun.com/v1` 和模型 `step-image-edit-2`。
- 前端要求上传当前照片，并在提交前校验图片存在。
- 测试图片宽高至少 64px。
- 将真实图片调用放入显式的 `demo:smoke:full`，默认冒烟不消耗图片额度。

**验证结果**

完整冒烟使用本地生成的无隐私测试图，真实图片编辑步骤通过。

## 14. 本地前端 API 地址和 CORS 不一致

**遇到的问题**

浏览器可能从 `localhost:5173` 或 `127.0.0.1:5173` 打开，两者是不同 Origin。前端若直连错误 API 地址或 CORS 只允许其中一个，会导致登录或请求失败。

**解决方案**

- 本地前端统一通过 Vite `/api` 代理访问 Backend。
- CORS 同时允许 `localhost` 和 `127.0.0.1` 的 5173/5174。
- 端口 5000 明确只提供 API，不提供前端 HTML。

**验证结果**

代理登录返回成功，并带正确 `Access-Control-Allow-Origin`；浏览器可进入已认证仪表板。

## 15. 用户隔离缺少可重复的本地门禁

**遇到的问题**

虽然生产 Wave 3D 已做过 A/B 隔离验收，但本地 Web Demo 缺少一个可重复运行的测试来证明八条查询不会把 A 用户数据返回给 B 用户。

**解决方案**

- 新增 `test:read-route-isolation`。
- 测试只允许连接 localhost 且数据库名不得包含 `prod`。
- 每次创建两个一次性 `.invalid` 用户，为八类路由写入不同标记并双向断言。
- 使用 `finally` 级联清理；种子失败也清理已创建用户。

**验证结果**

`today_plan`、`weekly_plan`、`today_todos`、`pending_todos`、`today_diet`、`training_history`、`latest_weight` 和 `current_progress` 共 8/8 A/B 隔离通过。

## 16. 生产发布不能把数据库和文件系统当作一个事务

**遇到的问题**

Agent 配置、workspace、uploads 和 PostgreSQL 分属不同存储系统。账户删除或 Agent 删除若直接递归删除，任何中途失败都可能留下不可恢复的半完成状态；多个代理同时修改 OpenClaw 配置还会产生并发风险。

**解决方案**

- OpenClaw 配置写入、删除和恢复只允许主代理串行执行。
- Provisioner 采用锁、备份、临时文件、fsync 和原子 rename。
- 反注册先将 workspace/state 原子移动到 quarantine，不直接永久删除。
- 账户删除设计为持久状态机：冻结账号、撤销入口、外部隔离、数据库清理、审计匿名化、最终完成。
- 每阶段可重试，失败时保留明确状态和恢复路径。

**当前状态**

Provisioner 反注册原语和账户冻结/Job 已完成设计与部分实现；正式账户删除 Worker 仍是开放注册前门禁，不能标记为全部完成。

## 17. 开发命令和实际仓库脚本不一致

**遇到的问题**

联调中曾误用不存在的 `test:memory`，以及从错误工作目录执行 Prisma validate，造成看似测试失败但实际是命令或路径错误。

**解决方案**

- 以根目录和各 workspace 的 `package.json` 为命令权威来源。
- Memory 测试改用 `npm --workspace backend run test:agent-memory`。
- Prisma 校验显式指定 `--schema backend/prisma/schema.prisma`，或先进入 backend。
- 将已验证命令写入开发指南，减少口头命令漂移。

**验证结果**

使用真实脚本后 Memory、Prisma、Backend 和 Frontend 门禁均通过。

## 18. 仍未解决或不应过度声明的事项

以下项目不是已解决能力，测试和演示时必须明确说明：

- OpenClaw Memory provider 为 `none`，尚无向量记忆召回证明。
- 飞书文本私聊、绑定码和 Event ID 幂等目前是架构设计，尚未完成产品实现。
- 账户删除 Worker 尚未全部完成，是正式开放前门禁。
- 本地 Web Demo 使用 direct model fallback，与生产 OpenClaw 完整链路不同。
- 语义分类器在高并发下 P95 仍可能超过门禁，因此只开放受限只读能力，不开放语义写入。

## 19. 当前推荐验证命令

```powershell
npm run build:backend
npm run build:frontend
npm run test:read-route-isolation
npm run demo:stop
npm run demo:start
npm run demo:smoke
npm run demo:smoke:full
```

`demo:smoke:full` 会消费一次真实图片编辑请求。所有命令必须使用本地测试数据库和开发者自己的本地环境变量，禁止连接生产数据库或提交密钥。
