# RightNow 3.2 三层知识库灌库方案

依据《健身教练知识库管理方案.md》的九大类目录设计，以及当前 `rag-service` 的三层 Chroma + L4 联网架构整理。目标是把方案中的九大类映射到实际代码中的三层库，并明确每层内容、格式和灌库方式。

## 九大类到三层库映射

| 实际层 | Chroma collection | 对应方案类目 | 定位 |
| --- | --- | --- | --- |
| L1 | `kb_l1_faq` | `09-faq-cases` | FAQ 快路，问答对，秒答 |
| L2 | `kb_l2_core` | `01-comprehensive`、`02-kinesiology` 基础、`04-physiology`、`05-practical`、`06-psychology` | 核心理论 + 实战方法，日常问答主力 |
| L3 | `kb_l3_books` | `03-nutrition`、`07-special-populations`、`08-injury` 深度资料 | 深度长尾，复杂问题下沉 |
| L4 | Web | DuckDuckGo 联网 | 三层答不上的兜底 |

`00-metadata` 是索引类资料，不进入向量库。分层原则：越常问越靠上，越深度越靠下。

## L1 FAQ 快路

L1 只放高频问答对，优先覆盖平台期、减脂和增肌饮食、新手训练、时间管理、常见误区、成功或失败案例结论。

`faq.json` 格式：

```json
{
  "id": "faq-platform-001",
  "question": "减脂平台期怎么突破？",
  "answer": "先排查热量是否真的在缺口，再逐步调整饮食、训练和恢复。",
  "tags": ["平台期", "减脂"],
  "goal": "减脂",
  "source_doc": "好人松松-生活化减脂",
  "source_section": "平台期"
}
```

实现约束：`faq_ingest.py` 只嵌入 `question`，`answer` 存入 metadata，不切块。建议起步 30-50 条。

灌库命令：

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/import/faq-l1"
Invoke-RestMethod -Method Post "http://localhost:8000/import/rescan-l1?force=true"
```

## L2 核心理论与实战

L2 放“生活化减脂内核”式的可执行方法论、核心理论和博主实战，是日常问答主力层。

推荐 Markdown 格式：

```markdown
---
title: 生活化减脂：如何吃食堂外卖也能减脂
source: 好人松松 B站
author: 好人松松
date: 2023-09-27
category: [实战, 减脂]
tags: [生活化减脂, 外卖, 热量缺口, 蛋白质]
difficulty: 初级
domain: nutrition
---

## 核心要点
- ...

## 详细内容
...

## 实践应用
...

## RAG 检索关键词
生活化减脂, 外卖减脂, 热量缺口, 高蛋白
```

`domain` 建议使用 `nutrition`、`kinesiology`、`comprehensive`。代码默认 `RAG_CHUNK_SIZE=800`，`RAG_CHUNK_OVERLAP=200`，文档应尽量用 `##` 分小节。

灌库命令：

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/import/rescan-l2?force=true"
```

## L3 深度书籍

L3 放营养学书籍、特殊人群、损伤康复和研究论文等深度长尾资料。推荐使用自写摘要或要点提炼后的 Markdown，避免整书原文入库带来的版权风险。

灌库命令：

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/import/rescan-l3?force=true"
```

## 统一规范

- 命名建议：`类型-主题-子主题.md`，例如 `营养指南-减脂期饮食.md`。
- 每篇文档建议包含：核心要点、详细内容、实践应用、常见误区、来源、至少 5 个 RAG 检索关键词。
- 质量门槛：只灌 7 分及以上内容。权威源、结构完整、有案例的内容优先。

## 检索与验证

统一检索：

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/search" -ContentType "application/json" -Body '{"query":"平台期怎么办","top_k":3}'
```

指定 collection 检索：

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/search" -ContentType "application/json" -Body '{"query":"平台期怎么办","top_k":3,"collection":"kb_l1_faq"}'
Invoke-RestMethod -Method Post "http://localhost:8000/search" -ContentType "application/json" -Body '{"query":"外卖怎么吃","top_k":3,"collection":"kb_l2_core"}'
Invoke-RestMethod -Method Post "http://localhost:8000/search" -ContentType "application/json" -Body '{"query":"蛋白质摄入时机","top_k":3,"collection":"kb_l3_books"}'
```

健康检查：

```powershell
Invoke-RestMethod "http://localhost:8000/health"
```

## 分阶段实施

| 阶段 | 内容 | 层 |
| --- | --- | --- |
| P0 | 整理 30-50 条高频 FAQ | L1 |
| P1 | 好人松松视频转写 + NSCA 核心概念 | L2 |
| P1 | 营养书要点提炼 | L3 |
| P2 | 补肌动学、生理学、心理学 | L2 |
| P3 | 补特殊人群、损伤康复 | L3 |

