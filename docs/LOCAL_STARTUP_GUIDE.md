# RightNow Fitness 本地启动指南

## 快速启动

### 一键启动（推荐）

```bash
cd /e/RightNow-Fitness
./scripts/start-dev.sh
```

按 `Ctrl+C` 停止所有服务。

---

## 手动启动

### 1. 启动后端（端口 5000）

```bash
cd /e/RightNow-Fitness/backend
npm run start:dev
```

### 2. 启动前端（端口 5173）

```bash
cd /e/RightNow-Fitness/frontend
npm run dev
```

### 3. 启动 RAG 服务（端口 8000）

```bash
cd /e/RightNow-Fitness/rag-service
python main.py
```

---

## 访问地址

- **前端**: http://localhost:5173
- **后端 API**: http://localhost:5000
- **RAG 服务**: http://localhost:8000
- **后端 Swagger 文档**: http://localhost:5000/api

---

## 首次启动

### 安装依赖

```bash
cd /e/RightNow-Fitness

# 安装所有依赖
npm run install:all

# 或分别安装
cd frontend && npm install
cd ../backend && npm install
cd ../rag-service && pip install -r requirements.txt
```

### 配置环境变量

后端 `.env` 文件已存在于 `backend/.env`，默认配置：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:15433/rightnow_fitness?schema=public"
JWT_SECRET="rightnow-dev-secret"
PORT=3000
CORS_ORIGIN="http://localhost:5173"
```

### 数据库迁移

```bash
cd /e/RightNow-Fitness/backend
npx prisma migrate dev
npx prisma db seed
```

---

## 常见问题

### 端口被占用

如果端口被占用，可以修改配置：

- **前端**: 修改 `frontend/vite.config.ts` 中的 `port`
- **后端**: 修改 `backend/.env` 中的 `PORT`
- **RAG**: 修改 `rag-service/app/main.py` 中的端口

### Python 依赖安装失败

建议使用虚拟环境：

```bash
cd /e/RightNow-Fitness/rag-service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

---

## 开发命令

```bash
# 根目录快捷命令
npm run dev:frontend   # 启动前端
npm run dev:backend    # 启动后端
npm run dev:rag        # 启动 RAG 服务
```
