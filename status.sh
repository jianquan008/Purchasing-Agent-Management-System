#!/bin/bash

echo "🔍 代购管理系统状态检查"
echo "=========================="

# 检查后端状态
echo "📡 后端服务状态:"
if curl -s http://localhost:4001/api/health > /dev/null; then
    echo "✅ 后端服务运行正常 (http://localhost:4001)"
    backend_status=$(curl -s http://localhost:4001/api/health | jq -r '.status')
    echo "   状态: $backend_status"
else
    echo "❌ 后端服务未运行"
fi

echo ""

# 检查前端状态
echo "🌐 前端服务状态:"
if curl -s http://localhost:4000 > /dev/null; then
    echo "✅ 前端服务运行正常 (http://localhost:4000)"
else
    echo "❌ 前端服务未运行"
fi

echo ""

# 检查进程
echo "🔧 运行进程:"
backend_pid=$(ps aux | grep "node dist/server.js" | grep -v grep | awk '{print $2}')
frontend_pid=$(ps aux | grep "react-scripts start" | grep -v grep | awk '{print $2}')

if [ ! -z "$backend_pid" ]; then
    echo "✅ 后端进程: PID $backend_pid"
else
    echo "❌ 后端进程未找到"
fi

if [ ! -z "$frontend_pid" ]; then
    echo "✅ 前端进程: PID $frontend_pid"
else
    echo "❌ 前端进程未找到"
fi

echo ""
echo "🔑 默认登录信息:"
echo "   用户名: admin"
echo "   密码: password"
echo ""
echo "🌐 访问地址:"
echo "   前端: http://localhost:4000"
echo "   后端API: http://localhost:4001"
