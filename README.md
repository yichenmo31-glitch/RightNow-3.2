# RightNow Fitness - Monorepo

React + TypeScript + Vite 健身应用，包含前端、后端和 RAG 服务。

## 项目结构

```
RightNow-Fitness/
├── frontend/          # React 前端应用
├── backend/           # NestJS 后端服务
├── rag-service/       # Python RAG 服务
├── docs/              # 共享文档
├── .claude/           # Claude 配置
└── scripts/           # 共享脚本
```

## 快速开始

### 安装依赖

```bash
npm run install:all
cd rag-service && pip install -r requirements.txt
```

### 启动服务

```bash
# 前端 (端口 3000)
npm run dev:frontend

# 后端 (端口 3100)
npm run dev:backend

# RAG 服务 (端口 8000)
npm run dev:rag
```

## 文档

- [项目规范](docs/CLAUDE.md)
- [项目记忆](docs/CLAUDE_PROJECT_MEMORY.md)
- [Git 工作流](docs/GIT_WORKFLOW.md)

## 技术栈

- **前端**: React 19, TypeScript, Vite, Three.js, Tailwind CSS
- **后端**: NestJS, Prisma, PostgreSQL
- **RAG**: Python, FastAPI, ChromaDB
