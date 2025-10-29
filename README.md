# 🛒 代购管理系统后端 (Daigou Management System Backend)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9+-blue.svg)](https://www.typescriptlang.org/)

代购管理系统的后端API服务，集成了AWS Bedrock Claude OCR技术，支持智能收据识别、库存管理、数据分析等功能。

## 系统概述

这是代购管理系统的后端服务，提供以下主要功能：
- 🤖 AWS Bedrock Claude OCR 收据识别API
- 📦 库存管理API
- 📊 数据分析API
- 🔐 用户认证和权限管理
- 🎯 高性能数据库优化

## 技术栈

**后端:**
- Node.js + TypeScript
- Express.js
- SQLite 数据库
- AWS Bedrock Claude API
- JWT 认证

## 系统要求

- Node.js 18+ 
- npm 或 yarn
- AWS 账户（用于 Bedrock Claude OCR）

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

在 `backend` 目录下创建 `.env` 文件：

```env
# 服务器配置
PORT=4001
NODE_ENV=development

# 数据库配置
DB_PATH=./database/daigou.db
DB_MAX_CONNECTIONS=10
DB_ACQUIRE_TIMEOUT=30000
DB_IDLE_TIMEOUT=300000

# JWT 配置
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# AWS Bedrock 配置（OCR 功能需要）
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

# 文件上传配置
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# 配置加密密钥
CONFIG_ENCRYPTION_KEY=your-config-encryption-key

# 前端URL配置
FRONTEND_URL=http://localhost:3000
```

### 3. 启动后端服务

```bash
cd backend
npm run build
npm start
```

后端服务将在 `http://localhost:4001` 启动

## API 端点

### 认证
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出

### 收据管理
- `GET /api/receipts/list` - 获取收据列表
- `POST /api/receipts/ocr` - OCR识别收据
- `GET /api/receipts/stats` - 获取收据统计

### 库存管理
- `GET /api/inventory/list` - 获取库存列表
- `POST /api/inventory/add` - 添加库存
- `PUT /api/inventory/:id` - 更新库存
- `DELETE /api/inventory/:id` - 删除库存
- `GET /api/inventory/stats` - 获取库存统计

### 系统管理
- `GET /api/health` - 健康检查
- `GET /api/system/logs` - 系统日志
- `POST /api/system/aws/config` - AWS配置

## AWS Bedrock 配置

### 1. 创建 AWS 账户并配置权限

1. 登录 [AWS 控制台](https://aws.amazon.com/)
2. 创建 IAM 用户并分配以下权限：
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "bedrock:InvokeModel",
           "bedrock:ListFoundationModels"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

### 2. 申请 Bedrock 模型访问权限

1. 在 AWS 控制台搜索 "Bedrock"
2. 进入 Bedrock 服务页面
3. 点击 "Model access" 申请 Claude 模型访问权限
4. 等待审批通过（通常几分钟到几小时）

## 生产环境部署

### 1. 构建生产版本

```bash
cd backend
npm run build
```

### 2. 使用 PM2 部署（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动后端服务
cd backend
pm2 start dist/server.js --name "daigou-backend"
```

### 3. 环境变量配置

生产环境请务必修改以下配置：
- `JWT_SECRET`: 使用强密码
- `CONFIG_ENCRYPTION_KEY`: 使用强加密密钥
- `NODE_ENV=production`
- 配置合适的数据库路径和备份策略

## 项目结构

```
backend/                 # 后端代码
├── src/
│   ├── routes/         # API 路由
│   ├── services/       # 业务逻辑
│   ├── database/       # 数据库相关
│   ├── middleware/     # 中间件
│   └── utils/          # 工具函数
└── tests/              # 测试文件
```

## 开发命令

```bash
npm run dev          # 开发模式启动
npm run build        # 构建生产版本
npm run test         # 运行测试
npm start            # 启动生产版本
```

## 默认管理员账户

- 用户名: `admin`
- 密码: `password`

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 支持与反馈

- 🐛 **Bug报告**: [创建Issue](https://github.com/jianquan008/Purchasing-Agent-Management-System/issues)
- 💡 **功能建议**: [创建Issue](https://github.com/jianquan008/Purchasing-Agent-Management-System/issues)