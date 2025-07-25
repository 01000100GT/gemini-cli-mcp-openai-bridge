#!/bin/bash

# Gemini CLI Bridge Server 启动脚本

echo "🚀 启动 Gemini CLI Bridge Server"
echo "================================="

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误: Node.js 未安装"
    echo "请先安装 Node.js (版本 >= 14.0.0)"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 检查 Gemini CLI 是否安装
if ! command -v gemini &> /dev/null; then
    echo "❌ 错误: Gemini CLI 未安装"
    echo "请运行: npm install -g @google/generative-ai-cli"
    exit 1
fi

echo "✅ Gemini CLI 已安装"

# 检查依赖是否安装
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
fi

echo "✅ 依赖已安装"

# 检查轮换配置文件
if [ ! -f "rotation-state.json" ]; then
    echo "⚠️  警告: rotation-state.json 不存在"
    echo "📋 创建示例配置文件..."
    cp rotation-state.json.example rotation-state.json
    echo "✅ 已创建 rotation-state.json"
    echo "🔧 请编辑 rotation-state.json 添加你的 API Keys"
    echo ""
    echo "示例配置:"
    echo "{"
    echo '  "currentIndex": 0,'
    echo '  "lastUsed": "2025-01-25T08:00:00.000Z",'
    echo '  "totalRequests": 0,'
    echo '  "apiKeys": ['
    echo '    {'
    echo '      "key": "AIzaSyA_your_actual_api_key_here",'
    echo '      "status": "active",'
    echo '      "requestCount": 0,'
    echo '      "successCount": 0,'
    echo '      "failureCount": 0'
    echo '    }'
    echo '  ]'
    echo '}'
    echo ""
    read -p "按 Enter 继续启动服务..."
fi

echo "✅ 配置文件已就绪"

# 设置环境变量
export ENHANCED_CLI_SERVER_PORT=${ENHANCED_CLI_SERVER_PORT:-8765}

echo "🌐 服务端口: $ENHANCED_CLI_SERVER_PORT"
echo "📁 工作目录: $(pwd)"
echo ""
echo "🚀 启动服务..."
echo "================================="

# 启动服务
node enhanced-api-server.cjs