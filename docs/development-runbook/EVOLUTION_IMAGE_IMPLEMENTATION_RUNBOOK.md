# 身材图与进化路径开发 Runbook

版本：1.0
状态：completed_local（生产 migration/release 门禁待完成）
设计事实源：`docs/EVOLUTION_IMAGE_GENERATION_DESIGN.md`

## 1. 范围与停止条件

本 Runbook 将首次三选一与七阶段进化路径连接起来。第一批交付包含身份锚点、三种可信体型、理想态确认、Stage 6 绑定和下一阶段参考图调整；存储迁移和完整内容降级可作为第二批交付。

以下情况立即停止写操作并保留现状：

- Prisma migration 包含非预期删除表、删除列或批量清空。
- 现有 `EvolutionRecord`、`EvolutionStage`、`EvolutionAssessment` 或 `ImageGenTask` 无法无损兼容。
- 图片任务 ownership 无法由 JWT userId 确定。
- 任何请求允许客户端设置 userId、解锁状态或任意结果 URL。
- 测试或日志出现 API Key、用户原始图片正文或大型 Base64。

## 2. 变更范围

主要文件预计包括：

```text
backend/prisma/schema.prisma
backend/src/image-gen/image-gen.module.ts
backend/src/evolution-stage/evolution-stage.controller.ts
backend/src/evolution-stage/evolution-stage.service.ts
frontend/services/gemini.ts
frontend/api/evolution-stage.ts
frontend/views/EvolutionEngine.tsx
frontend/App.tsx
```

开始前必须阅读根 `AGENTS.md`；修改前端前还必须阅读 `frontend/AGENTS.md` 和 `frontend/CLAUDE_PROJECT_MEMORY.md`。

## 3. 第 0 步：建立基线

```powershell
git status --short --branch
npm run build:backend
npm run build:frontend
Set-Location backend
npx prisma validate
Set-Location ..
```

记录现有三选一成功流程、一次真实图片编辑结果和七阶段 API 响应。不得把真实用户照片加入测试资产；使用隔离测试用户和合成的最小合法图片。

通过标准：两个构建和 Prisma validate 成功，现有未提交改动已记录且不被覆盖。

## 4. 第 1 步：Schema 与 migration

### 4.1 数据结构

新增 `EvolutionImageProfile` 或与现有模型等价的一对一结构，至少包含：

```text
userId unique
identityAnchors Json
identityAnchorVersion Int
startImageUrl String
startBodyFat Float
targetBodyFat Float
selectedIdealTaskId String?
selectedIdealImageUrl String?
selectedIdealVariant String?
promptVersion String
strategyVersion String
createdAt / updatedAt
```

扩展 `ImageGenTask`，记录 provider/model/promptVersion/inputDigest/variant。增加阶段预览生成指纹唯一约束或等价的任务 claim 约束。

### 4.2 迁移规则

- 新字段先允许为空或提供兼容默认值。
- 既有用户不得自动生成虚假身份锚点。
- 已有 `idealBodyImage` 可作为 legacy 展示，但不能伪造 `selectedIdealTaskId`。
- migration 不迁移 Base64 内容到日志或 SQL 文本。

验证：

```powershell
Set-Location backend
npx prisma format
npx prisma validate
npm run prisma:generate
npm run build
Set-Location ..
```

生产发布前必须生成并人工审查 migration SQL；禁止在生产使用临时 `prisma db push`。

## 5. 第 2 步：身份锚点服务

实现首次提取和显式重新校准：

1. 输入只能来自当前用户拥有的上传资源。
2. 输出经过 JSON schema 校验、长度限制和允许字段过滤。
3. 不保存体脂、体重、健康判断、种族定论或其他不必要敏感推断。
4. 已存在锚点时普通上传直接复用。
5. 只有显式重新校准才递增 `identityAnchorVersion`。

测试至少覆盖：首次提取、重复调用幂等、畸形模型 JSON、跨用户图片、重新校准版本递增和敏感字段过滤。

## 6. 第 3 步：重构三选一

将前端硬编码的三套概念化 Prompt 移到 Backend 固化模板，版本设为类似 `ideal-v2`。三个 variant 固定为：

```text
lean
athletic
strong
```

前端只提交上传资源标识和 variant，不提交最终 Prompt。Backend 注入身份锚点、目标体脂和允许的体型描述。

三次生成可以继续并行，但必须满足：

- 每个任务独立记录状态和 variant。
- 单个失败不覆盖其他成功结果。
- 三个全部失败才显示整体失败。
- 限流时有界重试，不无限并发。
- 结果属于当前 JWT 用户。

测试：三个任务 variant 正确、至少一个成功可选择、全部失败可重试、跨用户任务不可见。

## 7. 第 4 步：理想态确认接口

新增：

```http
POST /api/evolution-stage/ideal-selection
Idempotency-Key: <16-128 chars>
```

Backend 校验：

- `imageTaskId` 属于当前 JWT 用户。
- 任务状态为 `completed`。
- task variant 与请求 variant 一致。
- 结果已经保存到受控存储。
- Idempotency-Key 对同一用户重复请求返回同一结果；不同 payload 使用同一 key 返回冲突。

单事务完成 Profile 选择、Stage 0、Stage 6 和七阶段初始化。不得接受客户端传入的图片 URL、userId、stageIndex、targetBodyFat 或 `isUnlocked`。

测试：正常确认、重复确认幂等、同 key 不同 payload、未完成任务、跨用户任务、伪造 URL 字段、Stage 6 精确绑定。

## 8. 第 5 步：下一阶段预览

修改 `generateNextStagePreview`：

```text
base = 最新真实进展照
reference = selectedIdealImageUrl
optional reference = startImageUrl
target = 下一未解锁阶段的 targetBodyFat
```

行为约束：

- Stage 6 不生成，直接使用选中的理想图。
- 没有确认理想态的 legacy 用户继续走现有“最新照 + 起始照”兼容路径。
- 生成前计算 input digest；相同 digest 已成功时直接复用。
- 评估和解锁事务先完成，图片生成继续异步执行。
- 图片生成失败只记录受控错误码，不回滚业务数据。

测试：选定理想图成为 reference、legacy 回退、重复评估不重复生成、变更最新照片后允许重建、Stage 6 零模型调用、供应商失败不影响 assessment。

## 9. 第 6 步：前端接线

`EvolutionEngine` 保留三张卡片。用户确认后先调用 `ideal-selection`，成功后再更新本地展示和导航。禁止仅依赖 `localStorage` 把流程标记为完成。

页面需要处理：

- 三张全部生成中。
- 部分成功、部分失败。
- 确认请求进行中，防止重复点击。
- 幂等重试后返回原选择。
- 确认失败时保留当前选择，允许重试。
- 已确认用户刷新后从 Backend 恢复选择。

测试桌面和移动端，确认卡片、按钮和错误文本不重叠。

## 10. 第 7 步：存储迁移

第二批将 Base64 结果迁移到受控文件或对象存储：

1. 校验 MIME、图片像素和大小上限。
2. 使用随机对象键，不使用用户提供的文件名。
3. 保存 hash、URL、provider、model 和版本。
4. PostgreSQL 用户资料和任务表不再保存大型 Data URL。
5. 删除账户时纳入现有 quarantine/deletion worker。

迁移期间需要兼容读取旧 Data URL；新写入不得继续产生大型数据库字段。

## 11. 第 8 步：降级与可观测性

模型链继续使用当前 `Primary -> Ark -> Legacy`，再增加内容降级：

```text
最近一次有效阶段预览
  -> 最新真实照片
  -> 进度环、目标体脂和明确的稍后重试状态
```

日志只记录 requestId、taskId、provider label、model、variant、promptVersion、digest 前缀、耗时和错误码。不得记录 Key、Authorization、完整 Base64、完整身份锚点或用户照片。

## 12. 自动化与验收门禁

最小自动化矩阵：

| 场景 | 必须断言 |
| --- | --- |
| 三选一 | 三个 variant，至少一个成功可选 |
| 选择确认 | Stage 6 等于选中任务结果 |
| 身份隔离 | B 不能读取或确认 A 的图片任务 |
| 幂等 | 同 key/digest 不产生重复有效任务 |
| 阶段预览 | 使用最新照和选定理想图 |
| Legacy | 未确认理想态仍可查看进化路径 |
| 模型失败 | assessment 和解锁数据不回滚 |
| Stage 6 | 不再次调用图片模型 |
| 隐私 | 日志、Git diff 和数据库元数据不含 Key/Base64 |

最终执行：

```powershell
npm run build:backend
npm run build:frontend
Set-Location backend
npx prisma validate
Set-Location ..
git diff --check
git status --short
```

真实图片测试必须显式开启并限制为隔离测试用户。默认 CI 使用 provider mock，不消耗真实额度。

## 13. 发布顺序与回滚

1. 先发布兼容旧数据的 migration。
2. 发布 Backend，保持旧前端仍可使用。
3. 验证 legacy 用户和新测试用户。
4. 发布 Frontend 三选一确认接线。
5. 开启阶段图新策略 feature flag。
6. 观测任务成功率、P95、供应商降级率和重复任务率。

建议 feature flag：

```env
EVOLUTION_IMAGE_STRATEGY=v2-selected-ideal
EVOLUTION_IMAGE_STORAGE=local
```

回滚时先关闭策略 flag 回到 legacy 参考图链路，不回滚已确认的 Stage 6 和用户选择数据。Schema 采用向前兼容方式保留，不能通过删除新表或清空选择完成回滚。

## 14. 完成定义

只有以下条件全部满足才可标记 completed：

- 三选一仍可用，选中结果由 Backend 权威确认。
- Stage 0 是起始真实照，Stage 6 是选中理想态。
- 下一阶段图以最新照和选中理想态为主要输入。
- 身份锚点持久化、版本化且不会被普通上传覆盖。
- 重复确认和重复生成均幂等。
- 图片失败不影响体脂评估、阶段判断或数据入库。
- A/B 图片任务和阶段数据零串读。
- Backend/Frontend build、Prisma validate、自动化矩阵和 `git diff --check` 全部通过。
