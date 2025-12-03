#!/bin/bash
# 后端启动脚本

echo "🚀 启动机器人自然语言控制系统后端服务..."

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "📦 创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
echo "📥 安装依赖..."
pip install -r requirements.txt

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  .env 文件不存在，从 .env.example 复制..."
    cp .env.example .env
    echo "❗ 请编辑 .env 文件，填入你的 API 密钥"
    exit 1
fi

# 启动服务
echo "✅ 启动服务..."
uvicorn main:app --reload --host 0.0.0.0 --port 8020
