#!/bin/bash

echo "📦 打包前端项目用于本地Mac运行..."

# 创建临时目录
TEMP_DIR="/tmp/daigou-frontend-$(date +%s)"
mkdir -p "$TEMP_DIR"

# 复制前端项目
echo "📁 复制前端项目文件..."
cp -r frontend/* "$TEMP_DIR/"

# 创建README文件
cat > "$TEMP_DIR/README-MAC.md" << 'EOF'
# 代购管理系统 - Mac本地运行指南

## 环境要求
- Node.js 18+
- npm 或 yarn

## 安装和运行步骤

1. 安装依赖：
```bash
npm install
```

2. 启动开发服务器：
```bash
npm start
```

3. 访问地址：
http://localhost:3000

## 登录信息
- 用户名: admin
- 密码: password

## 后端API地址
后端运行在: http://54.204.91.227:4001

## 注意事项
- 确保EC2后端服务正在运行
- 如果遇到CORS错误，请联系管理员
EOF

# 创建压缩包
echo "🗜️  创建压缩包..."
cd /tmp
tar -czf "daigou-frontend-mac.tar.gz" -C "$TEMP_DIR" .

# 移动到项目目录
mv "daigou-frontend-mac.tar.gz" "/home/ec2-user/Purchasing-Agent-Management-System/"

# 清理临时文件
rm -rf "$TEMP_DIR"

echo "✅ 前端项目已打包完成: daigou-frontend-mac.tar.gz"
echo "📥 下载命令:"
echo "scp -i your-key.pem ec2-user@54.204.91.227:/home/ec2-user/Purchasing-Agent-Management-System/daigou-frontend-mac.tar.gz ."
