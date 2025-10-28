#!/bin/bash

# 代购管理系统 - 快速启动脚本

set -e

echo "🚀 启动代购管理系统..."

# 检查是否已构建
if [ ! -d "backend/dist" ]; then
    echo "❌ 后端未构建，请先运行 ./deploy.sh"
    exit 1
fi

if [ ! -d "frontend/dist" ]; then
    echo "❌ 前端未构建，请先运行 ./deploy.sh"
    exit 1
fi

# 检查环境变量文件
if [ ! -f "backend/.env" ]; then
    echo "❌ 未找到 backend/.env 文件"
    echo "请复制 .env.example 为 backend/.env 并配置相关参数"
    exit 1
fi

# 启动后端服务
echo "🔧 启动后端服务..."
cd backend
npm start &
BACKEND_PID=$!
echo "✅ 后端服务已启动 (PID: $BACKEND_PID)"

# 等待后端启动
echo "⏳ 等待后端服务启动..."
sleep 5

# 检查后端是否正常运行
if ! curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "❌ 后端服务启动失败"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo "✅ 后端服务运行正常"

# 启动前端开发服务器
echo "🔧 启动前端开发服务器..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!
echo "✅ 前端服务已启动 (PID: $FRONTEND_PID)"

# 保存进程 ID
echo $BACKEND_PID > ../backend.pid
echo $FRONTEND_PID > ../frontend.pid

echo ""
echo "🎉 系统启动完成！"
echo ""
echo "📋 服务信息："
echo "   后端服务: http://localhost:3001"
echo "   前端服务: http://localhost:5173"
echo ""
echo "🔑 默认管理员账户:"
echo "   用户名: admin"
echo "   密码: password"
echo ""
echo "⚠️  注意: 请确保已配置 AWS Bedrock 凭据以使用 OCR 功能"
echo ""
echo "🛑 停止服务: ./stop.sh"

# 等待用户中断
trap 'echo ""; echo "🛑 正在停止服务..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true; rm -f backend.pid frontend.pid; exit 0' INT

echo "按 Ctrl+C 停止服务"
wait