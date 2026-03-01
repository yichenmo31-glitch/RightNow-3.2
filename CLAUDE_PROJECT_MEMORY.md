# CLAUDE_PROJECT_MEMORY.md
> 本文件由 Claude 自动维护，记录项目架构决策、技术栈、开发进度和协作偏好。

---

## 技术栈

| 层级 | 技术 | 版本 | 备注 |
|------|------|------|------|
| 前端框架 | React | 19.2.4 | SPA，无 React Router |
| 语言 | TypeScript | 5.8.2 | |
| 构建工具 | Vite | 6.2.0 | 端口 5173，代理 API 到 3000 |
| 样式 | Tailwind CSS | - | 深色主题，主色 #B8FF00 |
| 3D 渲染 | Three.js + R3F + Drei | - | Hero3D 组件 |
| 图表 | Recharts | 3.7.0 | |
| AI | Google Gemini API | 1.5-flash | EvolutionEngine 对话 |
| 后端框架 | NestJS | - | rightnow-api/ 目录 |
| ORM | Prisma | 6.19.2 | |
| 数据库 | PostgreSQL | 16-alpine | Docker，端口 15433 |
| 认证 | JWT + bcrypt | - | |

---

## 前端架构 (AG)

- **路由**: 使用 `View` 枚举 + `useState<View>` 实现视图切换（非 React Router），共 17 个视图
- **状态管理**: App.tsx 提升管理用户数据（图片、性别、体型、体重等），通过 props 下传
- **API 层**: `api/client.ts` Axios 实例，自动附加 JWT token，响应信封解包；`api/index.ts` 统一导出所有模块
- **UI 语言**: 全中文（已完成 10 个模块的中英文统一）
- **图标**: Google Material Icons (Outlined & Round)
- **移动端优先**: 支持安全区域适配

---

## 后端架构 (CC)

- **框架**: NestJS，模块化结构
- **认证**: POST /auth/register, POST /auth/login, GET /auth/me；bcrypt 哈希 + JWT 签发
- **数据库**: PostgreSQL 16-alpine via Docker (端口 15433)，Prisma ORM
- **API 模块**: auth, weight, diet, training, todos, checkins, evolution, posts, friendships, chat, upload, user
- **环境**: PORT=3000, CORS_ORIGIN=http://localhost:5173

---

## 最新更新记录

| 日期 | 负责方 | 类型 | 描述 |
|------|--------|------|------|
| 2026-02-28 | 双方 | 配置 | Docker PostgreSQL 启动，Prisma schema 同步完成 |
| 2026-02-28 | 双方 | 功能 | 完成全部 10 个模块中英文统一（UI 全中文化） |
| 2026-02-28 | 双方 | 修复 | 修复 vite-env.d.ts 和 Onboarding.tsx 编码损坏问题 |
| 2026-02-28 | 双方 | 重构 | 合并重复文件（Login/LoginScreen, Register/RegisterScreen） |
| 2026-02-28 | 双方 | 功能 | Login.tsx 合并演示账号功能（demo@rightnow.fit） |

---

## 规划待办 & 关键决策

- [ ] 本地联调测试（后端 start:dev + 前端 dev）
- [ ] 注册/登录流程端到端验证
- [ ] Onboarding 数据提交到后端验证
- [ ] 各 API 模块联调（体重、饮食、打卡、进化记录等）

---

## 禁忌事项 & 偏好风格

**禁忌 (Never Do):**
- 不需要英文版 UI，所有界面文案必须中文
- 不要创建重复文件（之前已清理过 *Screen.tsx 副本）

**偏好 (Always Do):**
- 用户是开发新手，解释要简洁易懂
- 模块化推进，一个模块一个模块完成
- 保留现有改动，不要重置代码

