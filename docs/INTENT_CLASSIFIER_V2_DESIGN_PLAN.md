# RightNow Intent Classifier V2 设计计划

状态：Phase 1 Implemented / Phase 2 Shadow Available / Phase 3-4 Planned
日期：2026-07-12  
适用范围：Web、飞书私聊以及后续受支持的外部通道

## 1. 背景

当前 Chat 主链路使用确定性正则分类，并显式设置 `useModelFallback=false`。该方案对高风险、明确写入和领域边界具有良好的可预测性，但对自然语言同义表达、简短问句和多轮指代覆盖不足。

典型缺口：

```text
今天计划是啥
今天练什么
今天干嘛
给我看看今天安排
还有什么没完成
那明天呢
```

这些输入目前容易进入 `unknown_mixed`，不会确定性查询今日计划或 TODO，最终依赖聊天模型从历史中推测。

V2 不以模型替代所有规则，而是采用：

```text
输入规范化
  -> 安全与高置信规则
  -> 语义分类器
  -> Backend 策略门禁
  -> 确定性读取/写入
  -> 可选的自然语言表达
```

## 2. 设计目标

1. 支持计划、TODO、训练、饮食、体重和进度的自然语言查询。
2. 同义表达不需要逐句增加正则。
3. 只读查询不因模型服务不可用而完全失败。
4. 模型不能单独授权业务写入、身份变更或敏感操作。
5. 高风险、领域外、绑定码、删除和通道身份继续由确定性规则保护。
6. Web 与飞书使用同一分类契约，但保留通道和事件幂等信息。
7. 分类决策可测试、可审计、可灰度和可回滚。

## 3. 非目标

- V2 不允许分类模型直接调用工具。
- V2 不把完整聊天历史发送给分类器。
- V2 不把 PostgreSQL 业务事实写入长期 Memory。
- V2 不通过模型输出决定 userId、Agent ID、Session 或飞书身份。
- V2 第一阶段不删除现有 `intent` 字段或旧规则。

## 4. 目标分类契约

保留现有一级 `intent` 作为兼容字段，同时新增正交维度：

```ts
interface IntentDecisionV2 {
  version: 'v2';
  legacyIntent: Intent;
  resource:
    | 'plan'
    | 'todo'
    | 'training'
    | 'diet'
    | 'weight'
    | 'progress'
    | 'memory'
    | 'social'
    | 'general';
  operation:
    | 'query'
    | 'analyze'
    | 'advise'
    | 'create'
    | 'update'
    | 'complete'
    | 'delete'
    | 'clarify';
  scope: 'today' | 'tomorrow' | 'week' | 'current' | 'latest' | 'history' | null;
  subIntent: string | null;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  requiresContext: boolean;
  requiresKnowledge: boolean;
  requestedWrite: boolean;
  explicitWriteEvidence: string[];
  suggestedTools: string[];
  entities: Record<string, unknown>;
  clarifyingQuestion: string | null;
  classifier: 'rule' | 'model' | 'hybrid' | 'fallback';
  matchedRuleIds: string[];
  contextProfile:
    | 'none'
    | 'current_plan'
    | 'fitness_state'
    | 'nutrition_state'
    | 'progress_review'
    | 'memory_preferences';
  selectedReadSet: string[];
}
```

`requestedWrite` 只描述用户意图，不代表写入授权。Backend 仍需根据明确措辞、资源权限、状态、幂等键和策略白名单作最终决定。

`contextProfile` 与用户意图正交，用于复用上下文装配。分类器不能指定数据库表、文件路径或任意工具；Backend 将白名单 profile 展开为 `selectedReadSet`。例如 `plan/query/today` 使用 `current_plan`，饮食建议使用 `nutrition_state`，阶段分析使用 `progress_review`。

```text
current_plan       -> active_plan + today_todos
fitness_state      -> plans + recent training/diet summaries + weight/progress + preferences
nutrition_state    -> meal plan + diet summary + training load + weight/goal + preferences
progress_review    -> training/diet summaries + weight trend + TODO completion + progress
memory_preferences -> confirmed preferences only
```

业务读取集合代表 PostgreSQL 查询能力，不代表 OpenClaw workspace 文件。动态计划、饮食、训练和体重仍以 PostgreSQL 为权威。

## 5. 首批只读意图

| 用户表达 | resource | operation | scope | subIntent | 数据来源 |
| --- | --- | --- | --- | --- | --- |
| 今天计划是啥 | plan | query | today | today_plan | ActivePlan + Todo |
| 这周怎么练 | plan | query | week | weekly_plan | AiCoachProfile/Progress |
| 今天有哪些任务 | todo | query | today | today_todos | Todo |
| 还有什么没完成 | todo | query | today | pending_todos | Todo |
| 今天吃了多少 | diet | query | today | today_diet | DietRecord |
| 最近练了什么 | training | query | history | training_history | TrainingRecord |
| 我现在多少斤 | weight | query | latest | latest_weight | User + WeightRecord |
| 最近进展怎么样 | progress | query | current | current_progress | Profile + Evolution |

第一阶段至少实现 `today_plan`、`weekly_plan`、`today_todos` 和 `pending_todos`。

## 6. 分类层级

### 6.1 输入规范化

- Unicode/空白规范化。
- 中英文标点统一。
- 日期词映射：今天、明天、本周、最近。
- 常见口语映射只用于特征，不修改原始消息：`干嘛 -> 安排`、`啥 -> 什么`、`还剩啥 -> 未完成`。
- 原始消息不得写入审计摘要；只记录必要的分类元数据。

### 6.2 确定性安全规则

以下规则优先于模型：

- 飞书/Web 绑定码和通道控制命令。
- `out_of_domain` 明确领域边界。
- 胸痛、昏厥、头晕、受伤、术后、极端节食等高风险。
- 明确饮食、训练、体重等业务写入表达。
- 账户删除、换绑、授权和隐私操作。
- Agent/Session/userId ownership 和 Event ID/业务幂等。

规则应使用稳定 ID，例如 `risk.chest-pain.v1`、`write.diet-explicit.v1`，而不是只输出最终 intent。

### 6.3 语义分类器

仅在高置信规则未给出完整路由时调用。输入限制为：

- 当前用户消息。
- 最近 2-4 条必要消息。
- 上一轮分类摘要。
- 当前页面/通道。
- 是否存在 active plan、今日 TODO 等布尔状态。
- 不发送完整 Profile、Memory、Token 或私密业务明细。

模型必须按 JSON Schema 返回 `resource/operation/scope/confidence`，不能返回工具执行结果。

### 6.4 Backend 策略门禁

Backend 根据分类结果执行最终策略：

```text
只读查询
  -> 允许的 repository/service 查询
  -> 结构化结果
  -> 模型可选解释

写入请求
  -> 明确写入证据
  -> 用户/资源权限
  -> 状态门禁
  -> 幂等键
  -> 确定性事务
```

任何模型输出都不能绕过该门禁。

## 7. 置信度策略

只读请求：

```text
confidence >= 0.80
  -> 直接执行白名单只读路由

0.55 <= confidence < 0.80
  -> 与规则、上一轮意图和资源存在性组合判断

confidence < 0.55
  -> 澄清，不调用业务写工具
```

写入请求不使用单一置信度阈值。必须同时满足：

```text
分类为写入
+ 用户存在明确写入表达
+ Backend 白名单允许
+ ownership 通过
+ 幂等键有效
= 才执行写入
```

## 8. `today_plan` 确定性路由

```text
plan/query/today
  -> TodoService.listExisting(today)
  -> AiCoachProgress.activePlan
  -> 今日训练安排
  -> 饮食/饮水目标摘要
  -> TodayPlanViewModel
```

返回结构示例：

```ts
interface TodayPlanViewModel {
  date: string;
  training: Array<{ title: string; completed: boolean }>;
  nutrition: Array<{ title: string; completed: boolean }>;
  hydration: Array<{ title: string; completed: boolean }>;
  source: 'active_plan' | 'todo' | 'fallback';
}
```

如果表达模型不可用，Backend 直接使用模板返回结构化结果。只读计划查询不得因为 LLM、RAG 或 OpenClaw 暂时不可用而返回 500。

## 9. 多轮指代

分类器只接收有限上下文。例如：

```text
用户：这周安排三次力量训练
用户：那今天呢？
```

第二句可使用上一轮摘要：

```json
{
  "resource": "plan",
  "operation": "query",
  "scope": "week"
}
```

从而得到 `plan/query/today`。不得仅依赖 Session transcript 猜测业务事实；最终内容仍从 PostgreSQL 读取。

## 10. RAG 与 Memory 边界

- `query`：默认不调用 RAG，读取用户自己的 PostgreSQL 事实。
- `advise`：按 `requiresKnowledge` 调用 RAG。
- `memory/query`：读取确认的 Profile/Memory，不读取其他用户数据。
- 动态计划、TODO、饮食、训练和体重不写入 `MEMORY.md`。
- 高风险建议固定走安全约束，RAG 失败也不能移除安全前缀。

## 11. Web 与飞书通道

两种通道使用同一分类器，但飞书额外携带：

```text
channel=feishu
eventId
tenantKey
binding-resolved userId
conversationId
```

分类器不能看到 App Secret、Token 或可覆盖身份的模型参数。飞书 Event ID 去重在分类前完成；业务写入的 `(feishu, eventId, actionType)` 幂等门禁在执行前完成。

## 12. 可观测性

每次分类记录最小化诊断信息：

```text
requestId / eventId
classifierVersion
classifier = rule | model | hybrid | fallback
legacyIntent
resource / operation / scope
confidence / riskLevel
matchedRuleIds
selectedRoute
durationMs
```

不得记录 Token、绑定码、完整用户消息、完整 Profile、Memory 或模型原始 prompt。模型失败只记录安全错误类型和状态码。

## 13. 测试计划

扩展 `docs/AGENT_INTENT_CLASSIFIER_TESTS.csv` 到至少 100-150 条，覆盖：

- 同义表达和口语。
- 错别字、短句和省略句。
- 多轮指代。
- 计划查询与计划调整对比。
- TODO 查询与 TODO 创建对比。
- 查询、分析和写入对比。
- 饮食/训练混合意图。
- 高风险和中风险。
- 领域外夹带健身关键词。
- Web/飞书通道一致性。
- Event ID 重放和业务幂等。
- 模型超时、429、5xx、空 JSON 和低置信度。

每个案例至少断言：

```text
resource / operation / scope
riskLevel
requiresKnowledge
requestedWrite
selectedRoute
DB read/write count
RAG/OpenClaw call count
business record count
clarification behavior
```

核心回归必须包含：

```text
今天计划是啥 -> plan/query/today -> 只读
今天练什么 -> plan/query/today -> 只读
今天有哪些 TODO -> todo/query/today -> 只读
还有什么没完成 -> todo/query/today + pending -> 只读
把今天深蹲换成腿举 -> plan/update/today -> 需要确认/写门禁
今天练完腿了 -> training/complete/today -> 幂等写入
```

## 14. 灰度与兼容策略

新增配置：

```env
INTENT_CLASSIFIER_VERSION=v1|v2-shadow|v2
INTENT_MODEL_FALLBACK_READ_ONLY=true|false
INTENT_MODEL_MIN_CONFIDENCE=0.80
INTENT_MODEL_BASE_URL=
INTENT_MODEL_API_KEY=
INTENT_MODEL_NAME=
INTENT_MODEL_TIMEOUT_MS=7000
INTENT_MODEL_MAX_ATTEMPTS=2
```

分类模型使用独立 provider 配置；只有未设置 `INTENT_MODEL_*` 时才兼容回退到聊天 provider。密钥只存在于环境文件，不能写入 Git、日志或观测报告。`scope` 和稳定冲突边界由 Backend 规范化，模型主要提供 `resource/operation` 候选。

阶段：

1. `v1`：保持现状。
2. `v2-shadow`：V1 继续执行，V2 只记录分类差异，不调用工具。
3. `v2` 只读灰度：仅 `operation=query` 使用 V2 路由。
4. 扩大到建议类；写入仍保持确定性门禁。
5. 回归稳定后再评估旧正则的精简，不立即删除。

灰度指标：

- V1/V2 分类一致率。
- `unknown_mixed` 比例。
- 澄清比例。
- 错误只读路由率。
- 写入误触发必须为 0。
- 高风险漏判必须为 0。
- P95 分类延迟和模型失败率。

## 15. 实施阶段

### Phase 1：契约与只读计划查询

- 增加 V2 类型，不删除 V1。
- 实现 `today_plan`、`weekly_plan`、`today_todos`、`pending_todos`。
- 增加只读聚合服务和无模型模板回复。
- 扩展黄金测试集。

通过标准：上述只读表达不进入 `unknown_mixed`；模型不可用时仍返回数据库计划。

### Phase 2：语义分类 Shadow

- 对未命中完整规则的请求调用结构化分类模型。
- 只记录 V1/V2 差异，不改变执行路径。
- 收集误判并调整 Schema、prompt 和测试集。

通过标准：无额外业务写入；日志不含正文；高风险和领域外无回归。

### Phase 3：只读 V2 灰度

- 开放 plan/todo/diet/training/weight/progress 查询。
- 增加有限多轮指代。
- 对低置信度请求澄清。

通过标准：只读路由准确、零写入副作用、模型失败可降级。

### Phase 4：建议类与跨通道

- 将 advice 与 RAG 路由迁移到 V2。
- Web/飞书使用同一分类契约。
- 验证 Event ID、Session、A/B 隔离和账户冻结门禁。

通过标准：Web/飞书同输入得到一致业务路由；通道重试不重复写入。

## 16. 文件变更建议

```text
backend/src/agent/intent/
  intent-classifier.types.ts        V2 类型与兼容映射
  intent-normalizer.ts              输入规范化
  intent-rules.ts                   安全/高置信规则
  intent-semantic.service.ts        结构化语义分类
  intent-policy.service.ts          Backend 执行门禁
  intent-classifier.service.ts      分层编排与灰度

backend/src/chat/
  chat.service.ts                   使用 selectedRoute
  today-plan-query.service.ts       计划/TODO 只读聚合

docs/
  AGENT_INTENT_CLASSIFIER_TESTS.csv 扩展黄金集
  INTENT_CLASSIFIER_V2_DESIGN_PLAN.md
```

## 17. 完成定义

V2 只有同时满足以下条件才能标记完成：

- V1 兼容测试全部通过。
- V2 黄金集和多轮集通过。
- `today_plan/todo_query` 在模型不可用时仍可返回。
- 写入误触发为 0。
- 高风险漏判为 0。
- `out_of_domain` 不读取用户业务上下文。
- Web/飞书身份与用户隔离通过。
- 日志不含 Token、绑定码、完整消息或 Memory。
- 构建、Prisma、Intent、Chat、Memory 和端到端门禁全部通过。

## 18. 与现有文档的关系

- `AGENT_INTENT_CLASSIFIER_SPEC.md`：保留为 V1 行为规范。
- `AGENT_INTENT_ROUTING_STRATEGY.md`：保留为领域路由背景，后续按 V2 结构更新。
- `AGENT_INTENT_CLASSIFIER_TESTS.csv`：作为 V1/V2 共用黄金测试集扩展。
- `docs/development-runbook/architecture.md`：V2 进入执行阶段后写入稳定跨模块契约。
- `docs/development-runbook/progress.md`：逐 Phase 记录实现、测试和灰度证据。

截至 2026-07-12，Phase 1 已实现并启用四个确定性只读路由：`today_plan`、`weekly_plan`、`today_todos`、`pending_todos`。它们在 Chat 主链路中先于 OpenClaw、RAG 和聊天模型短路执行，仅读取 PostgreSQL 并使用 Backend 模板回复；其他意图继续使用 V1 规则和既有门禁。

Phase 2 的结构化语义分类与异步 Shadow 比较能力已经实现，但默认配置保持 `INTENT_CLASSIFIER_VERSION=v2`，尚未在生产或本地 Demo 持续灰度。显式设置 `v2-shadow` 后，仅未形成完整 V2 路由的低风险、非写入请求进入旁路；V1 结果立即照常执行，Shadow 结果不会调用工具或改变响应。诊断日志只包含分类枚举、置信度、差异、阈值结果、错误类型和耗时，不记录消息正文、prompt、Profile 或 Token。Phase 2 仍需积累真实样本差异率后才能完成灰度验收；Phase 3-4 尚未实现。
