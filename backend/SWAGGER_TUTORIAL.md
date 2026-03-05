# Swagger API 测试教程（小白版）

## 背景
后端已开发完成，运行在 http://localhost:3100，Swagger 文档在 http://localhost:3100/api/docs。
本教程教你如何用 Swagger UI 一步步测试所有 API。

---

## 第一步：启动后端服务

```bash
cd D:/rightnow-backend
npm run start:dev
```

确认终端输出：
```
RightNow API running on http://localhost:3100
Swagger docs: http://localhost:3100/api/docs
```

---

## 第二步：登录拿 Token

1. 打开 http://localhost:3100/api/docs
2. 找到 Auth 分组，展开 `POST /api/auth/login`
3. 点右边 "Try it out" 按钮
4. 在 Request body 里输入：
```json
{
  "email": "test@rightnow.com",
  "password": "password123"
}
```
5. 点 "Execute"
6. 在下方 Response 里找到 `access_token`，复制它（不含引号）

---

## 第三步：设置 Token（授权）

1. 滚动到页面最顶部，点右上角绿色的 "Authorize" 按钮（锁头图标）
2. 在弹窗输入框里输入：`Bearer 你复制的token`
   - 注意 Bearer 和 token 之间有一个空格
   - 例如：`Bearer eyJhbGciOiJIUzI1NiIs...`
3. 点 "Authorize"，再点 "Close"
4. 现在所有接口都带上了你的身份认证

---

## 第四步：测试各个接口

授权完成后，每个接口的测试方法都一样：
1. 展开你想测试的接口
2. 点 "Try it out"
3. 填写参数或 Request body
4. 点 "Execute"
5. 查看下方的 Response

### 推荐测试顺序：

| 顺序 | 接口 | 说明 |
|------|------|------|
| 1 | `GET /api/auth/me` | 查看当前登录用户信息 |
| 2 | `GET /api/weight` | 查看体重记录（seed 已创建 7 条） |
| 3 | `POST /api/weight` | 新增一条体重记录 |
| 4 | `GET /api/diet?date=2026-02-27` | 查看今日饮食 |
| 5 | `POST /api/diet` | 新增一条饮食记录 |
| 6 | `GET /api/todos` | 查看待办事项 |
| 7 | `POST /api/todos` | 新增待办事项 |
| 8 | `GET /api/posts` | 查看社区帖子 |
| 9 | `POST /api/posts` | 发一条帖子 |
| 10 | `POST /api/chat` | 和 AI 聊天 |

---

## 常见问题

| 错误码 | 含义 | 解决方法 |
|--------|------|----------|
| 401 Unauthorized | Token 没设置或过期了 | 重新登录拿新 Token |
| 400 Bad Request | 请求参数格式不对 | 检查 JSON 格式 |
| 404 Not Found | ID 不存在 | 先用 GET 查一下有哪些数据 |

---

## 测试账号

| 字段 | 值 |
|------|-----|
| 邮箱 | test@rightnow.com |
| 密码 | password123 |
| 姓名 | Test User |

Seed 数据包含：7 条体重记录、1 条饮食记录、3 条待办事项、1 条打卡、1 条社区帖子。
