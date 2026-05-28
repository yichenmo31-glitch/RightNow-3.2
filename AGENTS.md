# AGENTS.md — RightNow Fitness 迭代日志

> 由 Claude Code 维护，记录每次部署、架构变更和关键操作。

---

## 2026-05-27: 首次云端部署

### 部署目标
将 RightNow Fitness 部署到炎火云 VPS，实现外网可访问。

### 服务器信息
| 项目 | 详情 |
|------|------|
| IP | 103.236.98.149 |
| SSH 端口 | 54722 |
| 系统 | CentOS 8 (x86_64) |
| 配置 | 2核 / 4GB / 10M |
| NAT 转发 | 50092 → 80 |

### 部署架构
```
用户 → 103.236.98.149:50092 (NAT) → Nginx:80 → 前端静态文件
                                    → /api/* → NestJS:5000 → PostgreSQL:5432
                                                          → RAG:8000 (ChromaDB + all-MiniLM-L6-v2)
```

### 服务清单

| 服务 | 部署方式 | 端口 | 状态 |
|------|---------|------|------|
| PostgreSQL 16 | Docker (rn-postgres) | 5432 | ✅ |
| NestJS Backend | Node.js 直跑 (nohup) | 5000 | ✅ |
| Nginx | Systemd (yum) | 80 | ✅ |
| RAG (FastAPI) | Docker (rn-rag) | 8000 | ✅ |

### 关键决策
- **不用 Docker Compose 部署全部服务**: CentOS 8 EOL + Docker Hub 被墙，改为 Node.js 直跑 + Docker 仅跑 PostgreSQL
- **npm 用了国内镜像**: `registry.npmmirror.com`
- **Python 3.11 通过 Docker 容器提供**: CentOS 8 自带 Python 3.6 太旧
- **Nginx 直接宿主机安装**: 比 Docker 内跑更稳定，配置更简单
- **自启动用 systemd + nohup 混合**: 后端用 systemd service，PostgreSQL 用 Docker restart policy

### 新增文件
- `Dockerfile.backend` — 后端 NestJS 镜像 (备用)
- `Dockerfile.frontend` — 前端 Vite + Nginx 镜像 (备用)
- `Dockerfile.rag` — RAG 服务镜像
- `docker-compose.prod.yml` — 生产环境编排 (备用)
- `nginx.conf` — Nginx 配置文件
- `AGENTS.md` — 本文件

### 账号信息
| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 | admin@admin.com | 123456 |
| 演示用户 | demo@rightnow.fit | password123 |

### 已知问题
- ~~RAG 服务 chromadb 依赖解析极慢~~ → 已解决: CPU 版 torch + 分步安装依赖 + numpy<2.0
- 前端缺失 `react-is` 依赖，已在 VPS 上手动补充并在 package.json 中修复
- CentOS 8 EOL，后续建议迁移到 Debian/Ubuntu
- RAG 知识库已导入 117 个 chunks（来自 frontend/knowledge/ 下 5 个 md 文件）

### RAG 部署踩坑记录
- **chromadb 依赖地狱**: chromadb==0.4.22 依赖约束太宽，pip 下载大量历史版本。解决: 分步安装 + `--no-deps` + 手动装直接依赖
- **torch 太大**: CUDA 版 torch 532MB + CUDA toolkit 400MB+。解决: 用 CPU 版 torch
- **numpy 版本**: chromadb 0.4.22 不兼容 numpy 2.x。解决: pip install "numpy<2.0"
- **screen 防断连**: Docker 镜像构建用 `screen -dmS` 包裹，避免 SSH 断开杀进程

---

## 迭代日志格式规范

每次迭代请按以下格式追加:

```markdown
## YYYY-MM-DD: 简短标题

### 变更内容
- 做了什么

### 影响范围
- 哪些文件/服务受影响

### 经验记录
- 遇到的问题和解决方案
```

---

## 2026-05-28: AI API 切换 — DeepSeek 对话 + Codex 生图

### 变更内容
- **AI 对话/私教**: 从 Gemini 切换到 DeepSeek (`deepseek-v4-flash`)，API: `https://api.deepseek.com/v1`
- **生图 (体型进化)**: 从 Gemini Image 切换到 Codex (`gpt-image-2`)，API: `https://code.newcli.com/codex/v1`
- 前端 `services/gemini.ts` 重构: 新增 `requestDeepSeekChat`、`generateIdealBody` 改用 Codex `/images/generations` 和 `/images/edits`
- 后端 `ai.service.ts` 新增 `requestDeepSeek` 方法，优先使用 DeepSeek，fallback 到 Gemini

### 影响范围
- `frontend/services/gemini.ts` — 核心 AI 调用逻辑
- `frontend/vite.config.ts` — 新增 VITE_CODEX_API_KEY / VITE_DEEPSEEK_API_KEY
- `backend/src/ai/ai.service.ts` — 新增 DeepSeek provider
- `backend/.env` — 新增 DEEPSEEK_BASE_URL / DEEPSEEK_API_KEY / DEEPSEEK_MODEL

### 经验记录
- **DeepSeek reasoning model 需要大 max_tokens**: `deepseek-v4-flash` 是推理模型，`reasoning_content` 会消耗大量 token，`content` 可能为空。设置 `max_tokens >= 2048`
- **Codex 生图必须用 images 端点**: `gpt-image-2` 不支持 `/chat/completions`，需用 `/images/generations`（文生图）和 `/images/edits`（图生图）
- **API Key 不再提交到仓库**: 所有第三方 key 仅在 VPS 构建时注入

---
*最后更新: 2026-05-28 09:50 UTC (Claude Code)*
