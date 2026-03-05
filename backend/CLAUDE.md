# RightNow Backend

NestJS + Prisma + PostgreSQL 健身应用后端 API 服务。

## 技术栈

- NestJS 10.4.1 (TypeScript)
- Prisma 5.19.0 (ORM)
- PostgreSQL (数据库)
- JWT + Passport (认证)
- class-validator / class-transformer (DTO 验证)
- Swagger/OpenAPI (API 文档)
- Google Gemini AI (AI 功能)
- Multer (文件上传)
- bcrypt (密码加密)

## 项目结构

```
src/
├── auth/           # 认证模块（注册、登录、JWT）
├── user/           # 用户资料管理
├── weight/         # 体重记录
├── diet/           # 饮食/营养追踪
├── training/       # 训练日志
├── evolution/      # 进化照片
├── todo/           # 待办任务
├── checkin/        # 打卡签到
├── community/      # 社区（帖子、点赞、评论）
├── chat/           # 聊天消息
├── friendship/     # 好友关系
├── upload/         # 文件上传
├── common/         # 公共模块
│   ├── decorators/ # @Public, @CurrentUser
│   ├── filters/    # AllExceptionsFilter
│   ├── guards/     # JwtAuthGuard
│   ├── interceptors/ # TransformInterceptor
│   └── dto/        # 公共 DTO
├── prisma/         # Prisma 数据库服务
└── main.ts         # 应用入口
```

## 开发命令

```bash
npm run start:dev       # 开发模式启动（watch）
npm run build           # 构建生产版本
npm run start:prod      # 生产模式启动
npm run prisma:migrate  # 运行数据库迁移
npm run prisma:seed     # 填充种子数据
npm run docker:up       # 启动 Docker 容器
npm run docker:down     # 停止 Docker 容器
npm run lint            # ESLint 检查
npm run format          # Prettier 格式化
```

## 服务配置

- API 前缀：`/api`
- 端口：3100（环境变量 PORT）
- CORS：允许 `http://localhost:3000`
- Swagger 文档：`/api/docs`
- 静态文件：`/uploads/` 目录

## 数据库

- PostgreSQL 连接：`postgresql://rightnow:rightnow123@localhost:15432/rightnow?schema=public`
- Docker Compose 管理数据库容器
- 所有模型使用 UUID 主键
- 用户删除时级联删除关联数据

## 代码规范

- DTO 使用 class-validator 装饰器验证（@IsEmail, @IsString, @MinLength 等）
- 所有 DTO 添加 @ApiProperty 装饰器用于 Swagger 文档
- 公开接口使用 @Public() 装饰器跳过 JWT 验证
- 获取当前用户 ID：@CurrentUser('id')
- Controller 添加 @ApiTags, @ApiBearerAuth() 装饰器
- JWT 认证：bcrypt 10 轮加密，token 有效期 7 天

## API 响应格式

成功响应（由 TransformInterceptor 统一包装）：
```json
{ "success": true, "data": {}, "timestamp": "..." }
```

错误响应（由 AllExceptionsFilter 统一处理）：
```json
{ "success": false, "error": "...", "statusCode": 400, "timestamp": "..." }
```
