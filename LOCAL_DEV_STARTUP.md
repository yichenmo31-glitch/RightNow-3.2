# 本地开发环境启动指南

适用项目：`rightnow-fitness`

当前本地服务约定：

- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:3000`
- PostgreSQL：`localhost:15433`

## 一次性准备

1. 确保已安装并启动 Docker Desktop
2. 确保项目依赖已安装：

```powershell
npm install
npm --prefix ./rightnow-api install
```

## 标准启动顺序

建议按这个顺序启动。

### 1. 启动数据库容器

```powershell
npm run db:up
```

如果 Docker Desktop 没开，先手动打开 Docker Desktop，再执行上面的命令。

### 2. 初始化数据库（Prisma + Seed）

```powershell
npm run db:init
```

如果 PowerShell 对 `npm` 有执行策略限制，改用：

```powershell
npm.cmd run db:init
```

### 3. 启动后端

开发模式（推荐，支持 watch）：

```powershell
npm run dev:api
```

如果你只想稳定启动一个常驻后端，不需要 watch：

```powershell
npm run build:api
cd .\rightnow-api
node .\dist\main.js
```

### 4. 启动前端

```powershell
npm run dev
```

如果 PowerShell 对 `npm` 有执行策略限制，改用：

```powershell
npm.cmd run dev
```

## 启动成功后的检查

打开下面两个地址：

- 前端首页：`http://localhost:5173`
- 后端鉴权接口：`http://localhost:3000/api/auth/me`

说明：

- 前端返回 `200` 即正常
- 后端在未登录时返回 `401` 是正常现象，这说明 API 已经启动成功

## 当前这次会话的状态

我已经完成了以下检查和处理：

- Docker Desktop 已启动
- 数据库容器已运行
- `db:init` 已执行完成
- 前端 `5173` 已可访问
- 后端 `3000` 已可访问（`/api/auth/me` 返回 `401`，属正常未登录响应）

## 常见问题

### 1. 注册/登录提示

```text
Service unavailable. Start the backend API and initialize the database first.
```

这通常表示：

- 后端没启动
- 数据库没初始化
- Docker Desktop 没打开

直接重新按“标准启动顺序”执行即可。

### 2. 控制台反复出现

```text
WebSocket connection to ws://localhost:5173 failed
```

这通常表示 Vite 前端开发服务没在运行，或者浏览器标签页连的是一个已经失效的旧 dev server。

处理方式：

```powershell
npm.cmd run dev
```

然后浏览器强制刷新（`Ctrl + F5`）。

### 3. Prisma 报 `spawn EPERM`

这通常是当前终端环境限制导致 Prisma 引擎进程无法拉起。

优先尝试：

```powershell
npm.cmd run db:init
```

如果仍有问题，换一个普通本地终端（不是受限沙箱）执行。

## 停止服务

停止前端/后端：

- 在各自运行的终端里按 `Ctrl + C`

停止数据库容器：

```powershell
npm run db:down
```
