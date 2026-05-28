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
                                    → RAG 服务 (待启动)
```

### 服务清单

| 服务 | 部署方式 | 端口 | 状态 |
|------|---------|------|------|
| PostgreSQL 16 | Docker (rn-postgres) | 5432 | ✅ |
| NestJS Backend | Node.js 直跑 (nohup) | 5000 | ✅ |
| Nginx | Systemd (yum) | 80 | ✅ |
| RAG (FastAPI) | Docker 镜像构建中 | 8000 | 🔧 |

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
- RAG 服务 chromadb 依赖解析极慢，需优化 pip install 策略
- 前端缺失 `react-is` 依赖，已在 VPS 上手动补充
- CentOS 8 EOL，后续建议迁移到 Debian/Ubuntu

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

*最后更新: 2026-05-28 01:30 UTC (Claude Code)*
