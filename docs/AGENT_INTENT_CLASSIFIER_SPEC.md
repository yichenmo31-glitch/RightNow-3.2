# RightNow Agent Intent Classifier Spec

This document defines the first version of the intent classifier for the RightNow AI coach. It turns a raw user message into a structured routing decision before the agent chooses tools, memory, RAG, and response style.

## 1. Goal

The classifier should answer five questions:

1. What is the user's main intent?
2. Is there a more specific sub-intent?
3. Does this turn require user context?
4. Does this turn require knowledge retrieval?
5. Does this turn require a write/action tool?

The classifier should be conservative. If uncertain, it should choose `unknown_mixed` and ask for clarification or route through a low-risk path.

## 2. Input

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

### Field Notes

| Field | Required | Description |
| --- | --- | --- |
| `message` | yes | Current user message |
| `channel` | no | `web`, `wechat`, `internal`, etc. |
| `hasImage` | no | Whether the turn includes an image |
| `imageType` | no | `food`, `body`, `unknown`, or null |
| `recentMessages` | no | Small conversation window for ambiguity resolution |
| `knownContextSummary` | no | Optional lightweight facts already available before full context loading |

## 3. Output Schema

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

### Required Fields

| Field | Type | Description |
| --- | --- | --- |
| `intent` | enum | Main routing category |
| `subIntent` | enum/string/null | More specific category |
| `confidence` | number | 0 to 1 |
| `riskLevel` | enum | `low`, `medium`, `high` |
| `requiresContext` | boolean | Whether to call `memory.context.assemble` |
| `requiresKnowledge` | boolean | Whether to call `knowledge.search` |
| `requiresWriteTool` | boolean | Whether a write/action tool may be needed |
| `suggestedTools` | string[] | Recommended tool order |
| `responseMode` | enum | Response format |
| `entities` | object | Extracted useful values |
| `clarifyingQuestion` | string/null | Only set when clarification is needed |

## 4. Main Intent Enum

| Intent | Meaning |
| --- | --- |
| `diet_log` | User records food, uploads food, or asks to log a meal |
| `training_log` | User reports training, updates a session, or marks training done |
| `body_data_update` | User updates weight, measurements, fatigue, pain, sleep, or body state |
| `fitness_advice` | User asks for training, diet, recovery, fat-loss, or fitness advice |
| `plan_adjustment` | User asks to modify an existing plan |
| `social_chat` | Motivation, emotion, casual chat, or companionship |
| `unknown_mixed` | Ambiguous or multi-intent input |

## 5. Sub-Intent Suggestions

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

## 6. Response Mode Enum

| Mode | Meaning |
| --- | --- |
| `short_confirm` | Confirmation plus at most one micro-feedback sentence |
| `short_risk` | Short conservative response for fatigue, pain, or risk |
| `medium_advice` | Practical advice with a few concrete steps |
| `plan_adjustment` | Preserve existing plan, then explain local adjustments |
| `clarify` | Ask one key clarifying question |
| `social_support` | Warm, light support |

## 7. Tool Routing Defaults

| Intent | requiresContext | requiresKnowledge | requiresWriteTool | Default Tools |
| --- | --- | --- | --- | --- |
| `diet_log` | true | false | true | `diet.analyze.text`, `diet.analyze.image`, `diet.log.create`, `diet.gap.today` |
| `training_log` | true | false | true | `training.session.current`, `training.session.update`, `training.session.complete`, `todo.complete` |
| `body_data_update` | true | risk-dependent | write-dependent | `memory.context.assemble`, body/weight update tool when available |
| `fitness_advice` | true | true | false | `memory.context.assemble`, `knowledge.search`, optional business read tools |
| `plan_adjustment` | true | usually true | optional | `memory.context.assemble`, training/diet/todo read tools |
| `social_chat` | optional | false | false | optional `memory.context.assemble` |
| `unknown_mixed` | true | case-dependent | false | `memory.context.assemble`, then clarify |

## 8. Risk Rules

Set `riskLevel` to `high` when the user mentions:

- Pain or injury: knee, waist, shoulder, joint pain
- Dizziness, fainting, chest pain, severe discomfort
- Extreme dieting, fasting, or rapid weight-loss demands
- Recovery period, chronic disease, post-surgery context

High-risk turns should:

- Prefer `short_risk` or `medium_advice`
- Use conservative wording
- Prefer L3 knowledge when advice is needed
- Avoid aggressive training recommendations

## 9. Classifier Prompt

Use this prompt for the model fallback when rules are not enough.

```text
You are the intent classifier for RightNow, an AI fitness coach product.

Classify the user's latest message into one routing decision.
Return JSON only. Do not explain.

Main intents:
- diet_log
- training_log
- body_data_update
- fitness_advice
- plan_adjustment
- social_chat
- unknown_mixed

Important rules:
1. If the user is clearly recording food, training, weight, fatigue, pain, or body state, prefer a log/update intent over advice.
2. If the user asks what to do, how to arrange, whether they should change something, or asks for a plan, prefer fitness_advice or plan_adjustment.
3. If the user refers to "my previous plan", "the plan you gave me", "adjust it", "make it lighter", prefer plan_adjustment.
4. If the user mentions pain, injury, knee, waist, shoulder, dizziness, severe fatigue, or recovery period, set riskLevel to high or medium.
5. Do not invent memory. Only use recent messages and provided known context.
6. If ambiguous, choose unknown_mixed and provide one clarifying question.

Output schema:
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

User message:
{{message}}

Recent messages:
{{recentMessagesJson}}

Known context summary:
{{knownContextJson}}

Image metadata:
{{imageMetadataJson}}
```

## 10. Rule-First Heuristics

First version should combine rules and model classification.

### Strong Rules

| Signal | Intent |
| --- | --- |
| food image uploaded | `diet_log`, `food_image_log` |
| message contains "吃了", "早餐", "午餐", "晚餐", "加餐" plus food words | `diet_log` |
| message contains "练完", "做了几组", "重量", "次数", exercise names | `training_log` |
| message is mostly a number plus "kg", "斤", "体重" | `body_data_update`, `weight_update` |
| message contains "膝盖疼", "腰疼", "肩不舒服" | `body_data_update` or `fitness_advice` with high risk |
| message contains "怎么安排", "怎么练", "要不要", "适合吗" | `fitness_advice` |
| message contains "之前的计划", "调轻", "替换动作", "改成" | `plan_adjustment` |

### Ambiguity Handling

If a message contains both a record and a question, use:

1. `body_data_update` if there is pain or safety risk
2. `plan_adjustment` if it refers to an existing plan
3. `unknown_mixed` if the next action is unclear
4. Otherwise choose the most actionable intent

Example:

```text
我今天吃多了，还没练，怎么办？
```

Recommended:

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

It can be answered as advice without forcing a write action.

## 11. Example Classifications

### Food Log

Input:

```text
我中午吃了鸡胸肉、米饭和一杯拿铁
```

Output:

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

### Training Advice

Input:

```text
新手减脂一周练几次比较合适？
```

Output:

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

### Injury Risk

Input:

```text
我膝盖不舒服，还能继续跳绳减脂吗？
```

Output:

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

### Plan Adjustment

Input:

```text
把你之前给我的训练计划调轻一点，我最近有点累
```

Output:

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

## 12. Evaluation Criteria

Evaluate the classifier separately before connecting it to agent routing.

| Metric | Target |
| --- | --- |
| Main intent accuracy | >= 90% for demo set |
| Risk detection recall | >= 95% for pain/injury/fatigue cases |
| Write-tool false positive rate | <= 5% |
| Unknown/mixed handling | Should ask at most one useful clarification |
| Red-line failures | 0 |

Red-line classifier failures:

1. Pain/injury message classified as ordinary low-risk training advice.
2. Food/training record classified as generic chat when write intent is explicit.
3. Plan adjustment classified as a fresh plan without reading existing context.
4. Classifier invents memory or entities not present in input/context.
