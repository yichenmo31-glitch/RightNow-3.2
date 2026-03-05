#!/bin/bash

# RightNow Fitness 本地开发环境启动脚本

echo "🚀 启动 RightNow Fitness 开发环境..."

# 检查依赖
check_dependencies() {
    echo "📦 检查依赖..."

    if ! command -v node &> /dev/null; then
        echo "❌ Node.js 未安装"
        exit 1
    fi

    if ! command -v python &> /dev/null; then
        echo "❌ Python 未安装"
        exit 1
    fi

    echo "✅ 依赖检查通过"
}

# 启动后端
start_backend() {
    echo "🔧 启动后端服务 (端口 5000)..."
    cd backend
    npm run start:dev &
    BACKEND_PID=$!
    cd ..
    echo "✅ 后端启动 PID: $BACKEND_PID"
}

# 启动前端
start_frontend() {
    echo "🎨 启动前端服务 (端口 5173)..."
    cd frontend
    npm run dev &
    FRONTEND_PID=$!
    cd ..
    echo "✅ 前端启动 PID: $FRONTEND_PID"
}

# 启动 RAG 服务
start_rag() {
    echo "🤖 启动 RAG 服务 (端口 8000)..."
    cd rag-service
    python main.py &
    RAG_PID=$!
    cd ..
    echo "✅ RAG 服务启动 PID: $RAG_PID"
}

# 主函数
main() {
    check_dependencies

    echo ""
    start_backend
    sleep 3

    start_frontend
    sleep 2

    start_rag

    echo ""
    echo "✨ 所有服务已启动！"
    echo "📱 前端: http://localhost:5173"
    echo "🔧 后端: http://localhost:5000"
    echo "🤖 RAG: http://localhost:8000"
    echo ""
    echo "按 Ctrl+C 停止所有服务"

    # 等待用户中断
    wait
}

# 清理函数
cleanup() {
    echo ""
    echo "🛑 停止所有服务..."
    pkill -P $$
    exit 0
}

trap cleanup SIGINT SIGTERM

main
