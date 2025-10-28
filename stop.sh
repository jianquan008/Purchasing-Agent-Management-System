#!/bin/bash

# 代购管理系统 - 停止脚本

echo "🛑 停止代购管理系统..."

# 停止后端服务
if [ -f "backend.pid" ]; then
    BACKEND_PID=$(cat backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo "🔧 停止后端服务 (PID: $BACKEND_PID)..."
        kill $BACKEND_PID
        echo "✅ 后端服务已停止"
    else
        echo "⚠️  后端服务进程不存在"
    fi
    rm -f backend.pid
else
    echo "⚠️  未找到后端服务 PID 文件"
fi

# 停止前端服务
if [ -f "frontend.pid" ]; then
    FRONTEND_PID=$(cat frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "🔧 停止前端服务 (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID
        echo "✅ 前端服务已停止"
    else
        echo "⚠️  前端服务进程不存在"
    fi
    rm -f frontend.pid
else
    echo "⚠️  未找到前端服务 PID 文件"
fi

# 清理可能残留的进程
echo "🧹 清理残留进程..."
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "vite.*dev" 2>/dev/null || true

echo "✅ 系统已完全停止"