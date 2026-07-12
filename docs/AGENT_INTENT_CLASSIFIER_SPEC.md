# RightNow Agent 意图分类器规范

本文定义 RightNow AI 教练第一版意图分类器。分类器在 Agent 选择工具、Memory、RAG 和回复风格之前，将用户原始消息转换为结构化路由决策。

> 本文描述 V1 分类契约。V2 的 `resource / operation / scope` 设计及安全门禁见 `INTENT_CLASSIFIER_V2_DESIGN_PLAN.md`。

## 1. 目标

分类器需要回答五个问题：

1. 用户的主要意图是什么？
2. 是否存在更具体的子意图？
3. 当前轮次是否需要用户上下文？
4. 当前轮次是否需要知识检索？
5. 当前轮次是否需要写入或动作工具？

分类器应采用保守策略。无法确定时，应选择 `unknown_mixed` 并请求澄清，或进入低风险路径。

## 2. 输入

```json
{
  "message": "我今天练完腿了，深蹲60kg做了4组",
  "channel": "web",
  "hasImage": false,
  "imageType": null,
  "recentMessages": [
    {
      "role": "assistant",
      "content": "今天是腿部训练日，先按中等强度完成即可。"
    }
  ],
  "knownContextSummary": {
    "goal": "fat_loss",
    "trainingFrequency": "3 days/week",
    "riskFlags": []
  }
}
```

### 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `message` | 是 | 用户当前消息 |
| `channel` | 否 | `web`、`wechat`、`internal` 等通道 |
| `hasImage` | 否 | 当前轮次是否包含图片 |
| `imageType` | 否 | `food`、`body`、`unknown` 或 null |
| `recentMessages` | 否 | 用于消解歧义的小型对话窗口 |
| `knownContextSummary` | 否 | 加载完整上下文前已经可用的轻量事实 |

## 3. 输出结构

```json
{
  "intent": "training_log",
  "subIntent": "complete_training",
  "confidence": 0.88,
  "riskLevel": "low",
  "requiresContext": true,
  "requiresKnowledge": false,
  "requiresWriteTool": true,
  "suggestedTools": [
    "training.session.current",
    "training.session.update",
    "training.session.complete"
  ],
  "responseMode": "short_confirm",
  "entities": {
    "exercise": "深蹲",
    "weightKg": 60,
    "sets": 4
  },
  "clarifyingQuestion": null
}
```

### 必需字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `intent` | enum | 主路由类别 |
| `subIntent` | enum/string/null | 更具体的类别 |
| `confidence` | number | 取值范围 0 到 1 |
| `riskLevel` | enum | `low`、`medium` 或 `high` |
| `requiresContext` | boolean | 是否调用 `memory.context.assemble` |
| `requiresKnowledge` | boolean | 是否调用 `knowledge.search` |
| `requiresWriteTool` | boolean | 是否可能需要写入或动作工具 |
| `suggestedTools` | string[] | 建议的工具调用顺序 |
| `responseMode` | enum | 回复格式 |
| `entities` | object | 提取出的有用值 |
| `clarifyingQuestion` | string/null | 仅在需要澄清时设置 |

## 4. 主意图枚举

| 意图 | 含义 |
| --- | --- |
| `diet_log` | 用户记录食物、上传食物图片或要求记录一餐 |
| `training_log` | 用户汇报训练、更新训练过程或标记训练完成 |
| `body_data_update` | 用户更新体重、围度、疲劳、疼痛、睡眠或身体状态 |
| `fitness_advice` | 用户咨询训练、饮食、恢复、减脂或健身建议 |
| `plan_adjustment` | 用户要求修改现有计划 |
| `social_chat` | 激励、情绪、闲聊或陪伴 |
| `unknown_mixed` | 含义模糊或包含多个意图的输入 |

## 5. 子意图建议

### `diet_log`

- `food_text_log`
- `food_image_log`
- `food_analysis_only`
- `diet_gap_check`

### `training_log`

- `start_training`
- `update_training`
- `complete_training`
- `training_summary`

### `body_data_update`

- `weight_update`
- `measurement_update`
- `fatigue_update`
- `pain_or_injury_update`
- `sleep_recovery_update`

### `fitness_advice`

- `training_advice`
- `diet_advice`
- `recovery_advice`
- `injury_risk_advice`
- `plateau_advice`
- `mixed_advice`

### `plan_adjustment`

- `reduce_intensity`
- `change_frequency`
- `replace_exercise`
- `adjust_diet_plan`
- `adjust_due_to_risk`

### `social_chat`

- `motivation`
- `emotion_support`
- `casual`
- `accountability`

## 6. 回复模式枚举

| 模式 | 含义 |
| --- | --- |
| `short_confirm` | 确认结果，最多附加一句简短反馈 |
| `short_risk` | 面向疲劳、疼痛或风险场景的简短保守回复 |
| `medium_advice` | 提供少量可执行步骤的实用建议 |
| `plan_adjustment` | 保留现有计划，再说明局部调整 |
| `clarify` | 只询问一个关键澄清问题 |
| `social_support` | 温和、轻量的支持性回复 |

## 7. 默认工具路由

| 意图 | 需要上下文 | 需要知识 | 需要写工具 | 默认工具 |
| --- | --- | --- | --- | --- |
| `diet_log` | 是 | 否 | 是 | `diet.analyze.text`、`diet.analyze.image`、`diet.log.create`、`diet.gap.today` |
| `training_log` | 是 | 否 | 是 | `training.session.current`、`training.session.update`、`training.session.complete`、`todo.complete` |
| `body_data_update` | 是 | 取决于风险 | 取决于是否写入 | `memory.context.assemble`，以及可用的身体/体重更新工具 |
| `fitness_advice` | 是 | 是 | 否 | `memory.context.assemble`、`knowledge.search`，以及可选业务只读工具 |
| `plan_adjustment` | 是 | 通常需要 | 可选 | `memory.context.assemble`、训练/饮食/TODO 只读工具 |
| `social_chat` | 可选 | 否 | 否 | 可选 `memory.context.assemble` |
| `unknown_mixed` | 是 | 取决于场景 | 否 | `memory.context.assemble`，然后澄清 |

## 8. 风险规则

用户提到以下情况时，将 `riskLevel` 设为 `high`：

- 疼痛或受伤：膝、腰、肩、关节疼痛。
- 头晕、昏厥、胸痛或严重不适。
- 极端节食、禁食或要求快速减重。
- 康复期、慢性病或术后场景。

高风险轮次应：

- 优先使用 `short_risk` 或 `medium_advice`。
- 使用保守措辞。
- 需要建议时优先使用 L3 知识。
- 避免激进的训练建议。

## 9. 分类器提示词

当规则不足时，使用以下提示词作为模型降级分类器：

```text
你是 RightNow AI 健身教练产品的意图分类器。

将用户最新消息分类为一个路由决策。
只返回 JSON，不要解释。

主意图：
- diet_log
- training_log
- body_data_update
- fitness_advice
- plan_adjustment
- social_chat
- unknown_mixed

重要规则：
1. 如果用户明确在记录饮食、训练、体重、疲劳、疼痛或身体状态，优先选择记录/更新意图，而不是建议意图。
2. 如果用户询问应该做什么、如何安排、是否应改变某项内容或要求计划，优先选择 fitness_advice 或 plan_adjustment。
3. 如果用户提到“我之前的计划”“你给我的计划”“调整它”“调轻一点”，优先选择 plan_adjustment。
4. 如果用户提到疼痛、受伤、膝、腰、肩、头晕、严重疲劳或康复期，将 riskLevel 设为 high 或 medium。
5. 不得编造记忆，只能使用最近消息和给定的已知上下文。
6. 如果存在歧义，选择 unknown_mixed，并给出一个澄清问题。

输出结构：
{
  "intent": "...",
  "subIntent": "...",
  "confidence": 0.0,
  "riskLevel": "low|medium|high",
  "requiresContext": true,
  "requiresKnowledge": false,
  "requiresWriteTool": false,
  "suggestedTools": [],
  "responseMode": "...",
  "entities": {},
  "clarifyingQuestion": null
}

用户消息：
{{message}}

最近消息：
{{recentMessagesJson}}

已知上下文摘要：
{{knownContextJson}}

图片元数据：
{{imageMetadataJson}}
```

## 10. 规则优先启发式

第一版应组合确定性规则和模型分类。

### 强规则

| 信号 | 意图 |
| --- | --- |
| 上传食物图片 | `diet_log`、`food_image_log` |
| 消息包含“吃了、早餐、午餐、晚餐、加餐”及食物词 | `diet_log` |
| 消息包含“练完、做了几组、重量、次数”或动作名称 | `training_log` |
| 消息主要是数字加“kg、斤、体重” | `body_data_update`、`weight_update` |
| 消息包含“膝盖疼、腰疼、肩不舒服” | 高风险 `body_data_update` 或 `fitness_advice` |
| 消息包含“怎么安排、怎么练、要不要、适合吗” | `fitness_advice` |
| 消息包含“之前的计划、调轻、替换动作、改成” | `plan_adjustment` |

### 歧义处理

如果消息同时包含记录和问题，使用以下优先级：

1. 存在疼痛或安全风险时选择 `body_data_update`。
2. 引用现有计划时选择 `plan_adjustment`。
3. 下一步动作不清楚时选择 `unknown_mixed`。
4. 否则选择最可执行的意图。

示例：

```text
我今天吃多了，还没练，怎么办？
```

建议结果：

```json
{
  "intent": "unknown_mixed",
  "subIntent": "diet_and_training_advice",
  "requiresContext": true,
  "requiresKnowledge": true,
  "requiresWriteTool": false,
  "responseMode": "medium_advice",
  "clarifyingQuestion": null
}
```

该输入可以作为建议回答，不应强制产生写入动作。

## 11. 分类示例

### 饮食记录

输入：

```text
我中午吃了鸡胸肉、米饭和一杯拿铁
```

输出：

```json
{
  "intent": "diet_log",
  "subIntent": "food_text_log",
  "confidence": 0.92,
  "riskLevel": "low",
  "requiresContext": true,
  "requiresKnowledge": false,
  "requiresWriteTool": true,
  "suggestedTools": ["diet.analyze.text", "diet.log.create", "diet.gap.today"],
  "responseMode": "short_confirm",
  "entities": {
    "foods": ["鸡胸肉", "米饭", "拿铁"]
  },
  "clarifyingQuestion": null
}
```

### 训练建议

输入：

```text
新手减脂一周练几次比较合适？
```

输出：

```json
{
  "intent": "fitness_advice",
  "subIntent": "training_advice",
  "confidence": 0.95,
  "riskLevel": "low",
  "requiresContext": true,
  "requiresKnowledge": true,
  "requiresWriteTool": false,
  "suggestedTools": ["memory.context.assemble", "knowledge.search"],
  "responseMode": "medium_advice",
  "entities": {
    "goal": "fat_loss",
    "level": "beginner"
  },
  "clarifyingQuestion": null
}
```

### 受伤风险

输入：

```text
我膝盖不舒服，还能继续跳绳减脂吗？
```

输出：

```json
{
  "intent": "fitness_advice",
  "subIntent": "injury_risk_advice",
  "confidence": 0.96,
  "riskLevel": "high",
  "requiresContext": true,
  "requiresKnowledge": true,
  "requiresWriteTool": false,
  "suggestedTools": ["memory.context.assemble", "knowledge.search"],
  "responseMode": "short_risk",
  "entities": {
    "bodyPart": "膝盖",
    "activity": "跳绳",
    "goal": "fat_loss"
  },
  "clarifyingQuestion": null
}
```

### 计划调整

输入：

```text
把你之前给我的训练计划调轻一点，我最近有点累
```

输出：

```json
{
  "intent": "plan_adjustment",
  "subIntent": "reduce_intensity",
  "confidence": 0.94,
  "riskLevel": "medium",
  "requiresContext": true,
  "requiresKnowledge": true,
  "requiresWriteTool": false,
  "suggestedTools": ["memory.context.assemble", "training.recent.by_muscle", "knowledge.search"],
  "responseMode": "plan_adjustment",
  "entities": {
    "adjustment": "reduce_intensity",
    "state": "fatigue"
  },
  "clarifyingQuestion": null
}
```

## 12. 评估标准

在连接 Agent 路由前，应单独评估分类器。

| 指标 | 目标 |
| --- | --- |
| 主意图准确率 | 演示测试集 >= 90% |
| 风险检测召回率 | 疼痛/受伤/疲劳场景 >= 95% |
| 写工具误触发率 | <= 5% |
| 未知/混合意图处理 | 最多询问一个有用的澄清问题 |
| 红线失败 | 0 |

分类器红线失败包括：

1. 将疼痛或受伤消息分类为普通低风险训练建议。
2. 在写入意图明确时，将饮食或训练记录分类为普通聊天。
3. 未读取现有上下文便将计划调整分类为新计划。
4. 分类器编造输入或上下文中不存在的记忆或实体。
