#!/bin/bash

# 代购管理系统 - 快速部署脚本

set -e

echo "🚀 开始部署代购管理系统..."

# 检查 Node.js 版本
echo "📋 检查系统要求..."
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
    echo "❌ 错误: 需要 Node.js 18 或更高版本，当前版本: $(node -v)"
    exit 1
fi
echo "✅ Node.js 版本检查通过: $(node -v)"

# 安装后端依赖
echo "📦 安装后端依赖..."
cd backend
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 未找到 backend/package.json"
    exit 1
fi
npm install
echo "✅ 后端依赖安装完成"

# 构建后端
echo "🔨 构建后端..."
npm run build
echo "✅ 后端构建完成"

# 安装前端依赖
echo "📦 安装前端依赖..."
cd ../frontend
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 未找到 frontend/package.json"
    exit 1
fi
npm install
echo "✅ 前端依赖安装完成"

# 构建前端
echo "🔨 构建前端..."
npm run build
echo "✅ 前端构建完成"

# 创建必要的目录
echo "📁 创建必要的目录..."
cd ../backend
mkdir -p database uploads logs config
echo "✅ 目录创建完成"

# 检查环境变量文件
echo "⚙️  检查配置文件..."
if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件，创建示例配置..."
    cat > .env << EOF
# 服务器配置
PORT=3001
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
EOF
    echo "📝 已创建示例 .env 文件，请根据需要修改配置"
else
    echo "✅ 找到现有 .env 配置文件"
fi

# 初始化数据库
echo "🗄️  初始化数据库..."
node -e "
const { initDatabase } = require('./dist/database/init.js');
initDatabase().then(() => {
    console.log('✅ 数据库初始化完成');
    process.exit(0);
}).catch(err => {
    console.error('❌ 数据库初始化失败:', err);
    process.exit(1);
});
"

echo ""
echo "🎉 部署完成！"
echo ""
echo "📋 下一步操作："
echo "1. 修改 backend/.env 文件中的配置（特别是 AWS 凭据）"
echo "2. 启动后端服务: cd backend && npm start"
echo "3. 启动前端服务: cd frontend && npm run dev"
echo "4. 访问系统: http://localhost:5173"
echo ""
echo "🔑 默认管理员账户:"
echo "   用户名: admin"
echo "   密码: password"
echo ""
echo "📚 更多信息请查看 README.md"