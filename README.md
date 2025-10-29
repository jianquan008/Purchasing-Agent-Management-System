# 🛒 代购管理系统前端 (Daigou Management System Frontend)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)

代购管理系统的前端应用，连接到远程EC2后端服务，支持智能收据识别、库存管理、数据分析等功能。

## 系统概述

这是一个全栈代购管理系统，包含以下主要功能：
- 🤖 AWS Bedrock Claude OCR 收据识别
- 📦 智能库存管理
- 📊 数据分析和可视化
- 📱 PWA 移动端支持
- 🔐 用户权限管理
- 🎯 高性能数据库优化

## 技术栈

- React + TypeScript
- Vite 构建工具
- Tailwind CSS
- ECharts 图表库
- PWA 支持
- 连接远程EC2后端API

## 系统要求

- Node.js 18+ 
- npm 或 yarn
- 远程EC2后端服务运行中

## 快速开始

### 1. 克隆项目并安装依赖

```bash
# 安装前端依赖
npm install
```

### 2. 配置环境变量

前端会自动连接到远程EC2后端：`http://54.204.91.227:4001`

### 3. 启动前端服务

```bash
npm start
```

前端服务将在 `http://localhost:3000` 启动

### 4. 访问系统

打开浏览器访问 `http://localhost:3000`

**默认管理员账户:**
- 用户名: `admin`
- 密码: `password`

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

### 3. 在系统中配置 AWS

1. 登录系统后，进入 "系统管理" 页面
2. 点击 "AWS 配置" 选项卡
3. 输入您的 AWS 凭据和区域信息
4. 点击 "测试配置" 验证连接
5. 保存配置

## 生产环境部署

### 1. 构建生产版本

```bash
# 构建后端
cd backend
npm run build

# 构建前端
cd ../frontend
npm run build
```

### 2. 使用 PM2 部署（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动后端服务
cd backend
pm2 start dist/server.js --name "daigou-backend"

# 使用 nginx 或其他 web 服务器托管前端静态文件
```

### 3. 环境变量配置

生产环境请务必修改以下配置：
- `JWT_SECRET`: 使用强密码
- `CONFIG_ENCRYPTION_KEY`: 使用强加密密钥
- `NODE_ENV=production`
- 配置合适的数据库路径和备份策略

## 功能特性

### 🤖 OCR 收据识别
- 支持多种收据格式
- 智能商品信息提取
- 可编辑识别结果
- 批量处理支持

### 📦 库存管理
- 实时库存跟踪
- 低库存警告
- 批量操作
- 搜索和过滤

### 📊 数据分析
- 采购趋势分析
- 商品统计图表
- 时间段对比
- 数据导出功能

### 📱 移动端支持
- 响应式设计
- PWA 离线支持
- 触摸手势优化
- 应用安装提示

### 🔐 安全特性
- JWT 身份认证
- 角色权限管理
- 操作日志记录
- 数据加密存储

## 故障排除

### 常见问题

**1. 后端启动失败**
- 检查 Node.js 版本是否 18+
- 确认端口 3001 未被占用
- 检查环境变量配置

**2. OCR 功能不工作**
- 验证 AWS 凭据配置
- 确认 Bedrock 模型访问权限
- 检查网络连接

**3. 数据库错误**
- 确认数据库目录有写入权限
- 检查磁盘空间
- 查看错误日志

**4. 前端无法连接后端**
- 确认后端服务正常运行
- 检查 CORS 配置
- 验证 API 端点地址

### 日志查看

```bash
# 查看后端日志
cd backend
npm run logs

# 使用 PM2 查看日志
pm2 logs daigou-backend
```

## 开发指南

### 项目结构

```
├── backend/                 # 后端代码
│   ├── src/
│   │   ├── routes/         # API 路由
│   │   ├── services/       # 业务逻辑
│   │   ├── database/       # 数据库相关
│   │   ├── middleware/     # 中间件
│   │   └── utils/          # 工具函数
│   └── tests/              # 测试文件
├── frontend/               # 前端代码
│   ├── src/
│   │   ├── components/     # React 组件
│   │   ├── pages/          # 页面组件
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── services/       # API 服务
│   │   └── utils/          # 工具函数
│   └── public/             # 静态资源
└── README.md               # 本文件
```

### 开发命令

```bash
# 后端开发
cd backend
npm run dev          # 开发模式启动
npm run build        # 构建生产版本
npm run test         # 运行测试

# 前端开发
cd frontend
npm run dev          # 开发服务器
npm run build        # 构建生产版本
npm run preview      # 预览构建结果
```

## 📸 系统截图

### 主界面
![主界面](docs/images/dashboard.png)

### OCR收据识别
![OCR识别](docs/images/ocr.png)

### 库存管理
![库存管理](docs/images/inventory.png)

### 数据分析
![数据分析](docs/images/analytics.png)

## 🚀 在线演示

- **演示地址**: [https://your-demo-site.com](https://your-demo-site.com)
- **用户名**: `demo`
- **密码**: `demo123`

## 📋 更新日志

### v1.0.0 (2024-01-XX)
- ✨ 初始版本发布
- 🤖 集成AWS Bedrock Claude OCR
- 📦 完整的库存管理功能
- 📊 数据分析和可视化
- 📱 PWA移动端支持
- 🔐 用户权限管理系统

## 🤝 贡献指南

我们欢迎所有形式的贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详细信息。

### 开发流程
1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 代码规范
- 使用 TypeScript
- 遵循 ESLint 规则
- 编写单元测试
- 更新相关文档

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [AWS Bedrock](https://aws.amazon.com/bedrock/) - AI模型服务
- [React](https://reactjs.org/) - 前端框架
- [Express.js](https://expressjs.com/) - 后端框架
- [ECharts](https://echarts.apache.org/) - 图表库
- [Tailwind CSS](https://tailwindcss.com/) - CSS框架

## 📞 支持与反馈

- 🐛 **Bug报告**: [创建Issue](https://github.com/your-username/daigou-management-system/issues)
- 💡 **功能建议**: [创建Issue](https://github.com/your-username/daigou-management-system/issues)
- 📧 **邮件联系**: your-email@example.com
- 💬 **讨论**: [GitHub Discussions](https://github.com/your-username/daigou-management-system/discussions)

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=your-username/daigou-management-system&type=Date)](https://star-history.com/#your-username/daigou-management-system&Date)