# RightNow 3.2 本地 Demo 开发者测试指南

更新时间：2026-07-12

## 1. 文件位置

当前完整代码仓库：

```text
C:\Users\maggie mo\Documents\Codex\2026-07-11\rightnow-local-development-runbook-md\work\RightNow-3.2
```

主要目录：

```text
RightNow-3.2/
├─ frontend/                    React/Vite Web 前端
├─ backend/                     NestJS/Prisma 后端
├─ backend/prisma/              数据库 Schema 与 migration
├─ openclaw/extensions/rightnow RightNow OpenClaw 扩展
├─ infra/provisioner/           Agent/workspace Provisioner
├─ rag-service/                 RAG 服务
├─ docs/development-runbook/    开发记录与架构文档
└─ AGENTS.md                    Agent 协作及安全约束
```

长期维护文档：

- `AGENTS.md`
- `docs/development-runbook/RIGHTNOW_DEVELOPMENT_STEP_BY_STEP.md`
- `docs/development-runbook/progress.md`
- `docs/development-runbook/architecture.md`

本轮本机运行日志（临时诊断文件，不属于产品源码）：

```text
C:\Users\maggie mo\Documents\Codex\2026-07-12\agents-md-development-runbook-progress-md\work
```

常用日志：

- `backend-stable.out.log`
- `backend-stable.err.log`
- `frontend-preview.out.log`
- `frontend-preview.err.log`

## 2. 当前交付状态

- 前端地址：`http://127.0.0.1:5173/`
- 后端地址：`http://127.0.0.1:5000/api`
- 演示账号：`test7@qq.com`
- 演示密码：`123456`
- 图片编辑模型：阶跃 `step-image-edit-2`
- 聊天模型：阶跃 `step-3.7-flash`
- 本地没有运行 OpenClaw Gateway，已通过 `CHAT_DIRECT_FALLBACK=true` 启用本地聊天降级。
- 生产环境不应开启 `CHAT_DIRECT_FALLBACK`；生产聊天仍应经过 OpenClaw。
- 当前 Git 工作树包含未提交的 Wave 3、Wave 4 和 Demo 调整，不能假设重新 clone 的仓库已包含这些变更。

## 3. 环境要求

- Node.js（当前本机为 Node 24；团队环境建议使用项目验证过的 LTS 版本）
- npm
- PostgreSQL
- 可访问阶跃 API 的网络
- Windows PowerShell（本指南命令按 Windows 编写）

先进入仓库：

```powershell
Set-Location 'C:\Users\maggie mo\Documents\Codex\2026-07-11\rightnow-local-development-runbook-md\work\RightNow-3.2'
npm install
```

## 4. 配置后端

从模板创建本地配置：

```powershell
Copy-Item backend\.env.example backend\.env
```

至少配置：

```env
DATABASE_URL=postgresql://postgres:<password>@localhost:15433/rightnow_fitness
JWT_SECRET=<local-random-secret>
PORT=5000
STEPFUN_BASE_URL=https://api.stepfun.com/v1
STEPFUN_API_KEY=<developer-owned-key>
STEPFUN_CHAT_MODEL=step-3.7-flash
CHAT_DIRECT_FALLBACK=true
IMAGE_GEN_BASE_URL=https://api.stepfun.com/v1
IMAGE_GEN_MODEL=step-image-edit-2
IMAGE_GEN_API_KEY=<developer-owned-key>
```

注意：

- 不要提交 `backend/.env`。
- 不要在测试报告、截图、日志或聊天中粘贴 API Key、JWT 或 OpenClaw Token。
- `CHAT_DIRECT_FALLBACK=true` 仅用于没有 OpenClaw Gateway 的本地 Demo。
- `step-image-edit-2` 是图片编辑模型，用户必须上传当前照片，不能把它当纯文生图模型使用。

## 5. 初始化数据库

确认 PostgreSQL 已创建 `rightnow_fitness` 数据库，然后执行：

```powershell
npm --workspace backend run prisma:generate
npm --workspace backend run prisma:migrate
npm --workspace backend run prisma:seed
```

如果数据库已有历史数据，先备份再执行 migration。禁止为了测试删除真实用户数据。

## 6. 一键启动服务

推荐使用仓库脚本。先在独立进程完成构建，避免当前 Windows 环境的 Vite/esbuild IPC 问题影响启动器：

```powershell
npm run build:backend
npm run build:frontend
```

启动脚本会启动本机 PostgreSQL 16；本机没有该服务时尝试 Docker Compose。它只清理属于当前仓库且占用 `5000/5173` 的残留进程，并以 Backend 单进程和 Vite preview 启动：

```powershell
npm run demo:start
```

停止 Demo：

```powershell
npm run demo:stop
```

PID 和日志写入被 Git 忽略的 `.work/local-demo/`。如果端口被其他项目占用，脚本会停止并报告 PID，不会终止外部进程。

需要重新安装依赖时，先单独执行：

```powershell
npm install
```

### 手工启动后端

为避免开发监听器残留多个 Nest 进程，测试 Demo 推荐使用构建产物：

```powershell
npm --workspace backend run build
npm --workspace backend run start:prod
```

### 手工启动前端

当前 Windows 环境的 Vite HMR/esbuild 曾出现随机 `Invalid loader value`，Demo 推荐生产预览模式：

```powershell
npm --workspace frontend run build
npm --workspace frontend run preview -- --host 127.0.0.1 --port 5173
```

浏览器打开：

```text
http://127.0.0.1:5173/
```

## 7. 建议测试顺序

1. 点击“使用演示账号”，确认账号和密码被填入并可登录。
2. 确认首页、数据、饮食和社区底部导航可切换。
3. 点击首页右下角绿色“小爪”悬浮头像，确认直接进入 AI 教练对话页。
4. 发送“你好”，确认出现阶跃回复，不显示 `Internal server error`。
5. 拖动小爪头像，确认拖动不会误进入聊天；普通点击仍可进入。
6. 上传尺寸不小于 64px 的当前身体照片，进入理想身材流程。
7. 确认生成三个图片版本；先选中一张，再点击“这就是理想的我！”。
8. 确认 TODO、训练记录、饮食记录和体重页面能读取现有演示数据。
9. 刷新页面并重新登录，确认历史聊天和业务数据仍存在。

### 自动化冒烟

先启动 Demo，再运行不消耗图片额度的最小冒烟：

```powershell
npm run demo:smoke
```

它会验证前端入口、小爪进入聊天的代码契约、演示账号登录、真实聊天回复，以及 TODO、饮食和训练读取。

需要验证真实阶跃图片编辑时，显式运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-local-demo.ps1 -IncludeImageEdit
```

该命令会消费一次真实 `step-image-edit-2` 请求。测试图仅为本地生成的 64x64 图形，不包含用户照片。

## 8. 构建与专项测试

```powershell
npm --workspace frontend run build
npm --workspace backend run build
npm --workspace backend run test:intent
npm --workspace backend run test:chat-conversations
npm --workspace backend run test:agent-memory
npm --workspace backend run test:openclaw-identity
npm --workspace backend run test:openclaw-provisioning
```

涉及 OpenClaw、Provisioner 或生产写操作的测试，必须先阅读 `AGENTS.md` 和 development runbook。生产配置写入、Agent 删除及恢复必须串行执行，不能由多个测试人员或子代理同时操作。

## 9. 已知限制

- 本地 Demo 当前不验证真实 OpenClaw Gateway、Agent provisioning 或多通道会话。
- OpenClaw Memory provider 当前为 `none`，只能验证 PostgreSQL Memory Profile 和 `MEMORY.md` 同步，不能声称向量召回通过。
- 图片模型只支持基于输入图片编辑；无照片场景应显示提示或允许跳过。
- Vite 开发模式在当前 Windows/Node 环境出现过 esbuild IPC 异常，稳定演示应使用 `vite preview`。
- 当前改动尚未形成干净的 Git release，测试人员应记录所测试的 commit、补丁包或目录快照。

## 10. 常见故障

### `Invalid loader value: "xxxx"`

停止 Vite dev，重新构建并使用 preview：

```powershell
npm --workspace frontend run build
npm --workspace frontend run preview -- --host 127.0.0.1 --port 5173
```

### 聊天返回 `Internal server error`

检查：

- `STEPFUN_API_KEY` 是否非空且有效。
- 本地无 OpenClaw 时，`CHAT_DIRECT_FALLBACK=true` 是否配置。
- `5000` 是否被旧的 `nest start --watch` 进程占用。
- `backend-stable.err.log` 和 `backend-stable.out.log`。

### 图片生成失败

检查：

- 模型是否为 `step-image-edit-2`。
- 是否上传了有效图片，宽高均至少 64px。
- `IMAGE_GEN_BASE_URL` 是否为 `https://api.stepfun.com/v1`。
- API Key 是否拥有 `step-image-edit-2` 权限。

## 11. 测试报告模板

```text
测试时间：
测试人员：
代码版本/目录快照：
操作系统与 Node 版本：
数据库版本：

前端构建：通过/失败
后端构建：通过/失败
登录：通过/失败
小爪入口：通过/失败
聊天：通过/失败
图片编辑：通过/失败
TODO/训练/饮食/体重：通过/失败
数据持久化：通过/失败

失败步骤：
实际结果：
预期结果：
HTTP 状态码：
相关日志时间：
截图：
```
