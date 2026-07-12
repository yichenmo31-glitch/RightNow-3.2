# RightNow 3.2 知识库灌库运行说明

这份说明用于把当前已经整理好的 `L1 / L2 / L3` 内容导入到 `rag-service`。

## 当前内容概览

### L1 高频问答

- 位置：`l1-faq/faq.json`
- 当前数量：30 条
- 适合回答：高频短问答、常见误区、执行策略、基础概念

### L2 核心方法

- 位置：`l2-core/`
- 当前数量：9 篇主干文档
- 适合回答：方法论、训练安排、营养基线、平台期、恢复、外卖与执行策略

### L3 书籍与深度指南

- 位置：`l3-books/`
- 当前数量：6 篇深度文档
- 适合回答：复杂场景、个性化约束、恢复管理、动态调整、深度营养问题

## 建议灌库顺序

### 第一步：先灌 L1

原因：L1 命中最快，能先覆盖最高频问题。

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/import/faq-l1"
```

### 第二步：再灌 L2

原因：L2 是主力知识层，覆盖大部分日常对话。

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/import/rescan-l2?force=true"
```

### 第三步：最后灌 L3

原因：L3 是深度补充层，适合复杂问题下沉检索。

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/import/rescan-l3?force=true"
```

### 如果要整套重建

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/import/rescan-all?force=true"
```

## 建议验证顺序

### 1. 看健康状态

```powershell
Invoke-RestMethod "http://localhost:8000/health"
```

重点看：

- `layer1.vector_count`
- `layer2.vector_count`
- `layer3.vector_count`

### 2. 测 L1 高频问答

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/search" -ContentType "application/json" -Body '{"query":"减脂平台期怎么突破","top_k":3,"collection":"kb_l1_faq"}'
```

### 3. 测 L2 方法论

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/search" -ContentType "application/json" -Body '{"query":"外卖减脂怎么点","top_k":3,"collection":"kb_l2_core"}'
```

### 4. 测 L3 深度问题

```powershell
Invoke-RestMethod -Method Post "http://localhost:8000/search" -ContentType "application/json" -Body '{"query":"蛋白质摄入时机重要吗","top_k":3,"collection":"kb_l3_books"}'
```

## 这版库最适合覆盖的问题

### 高频基础问题

- 平台期
- 外卖减脂
- 新手训练频率
- 蛋白质摄入
- 有氧与减脂
- 训练恢复

### 中等复杂问题

- 热量缺口怎么定
- 训练模板怎么选
- 体重不降但围度变化怎么判断
- 夜班、出差、素食怎么执行

### 深度和约束场景

- 旧伤训练调整
- 慢性病管理边界
- 恢复期训练
- 减量周和疲劳管理
- 个性化计划框架

## 当前仍然建议后续补充的来源

1. 真实客服问答和工单高频问题
2. 松松视频真实转写稿
3. 更系统的 NSCA / 生理学 / 肌动学内容
4. 特殊人群和损伤专题扩展

## 推荐的下一轮扩充优先级

1. 把 L1 FAQ 从 30 条扩到 50 条
2. 用真实业务问法改写 FAQ 的提问方式
3. 补 5 到 8 篇 L2 实战专题
4. 补 3 到 5 篇 L3 特殊人群和损伤专题
