#!/bin/bash

# 墙面便签快速部署脚本
# 使用方法: chmod +x deploy.sh && ./deploy.sh

set -e

echo "=========================================="
echo "  墙面便签 - 快速部署脚本"
echo "=========================================="
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在项目根目录执行此脚本"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未安装 Node.js"
    echo "请通过宝塔面板安装 Node.js 版本管理器"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"
echo ""

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未安装 npm"
    exit 1
fi

echo "✅ npm 版本: $(npm -v)"
echo ""

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  警告: 未找到 .env 文件"
    echo "正在从 .env.example 创建 .env ..."
    cp .env.example .env
    echo ""
    echo "❗ 请编辑 .env 文件，填入正确的数据库配置："
    echo "   vi .env"
    echo ""
    echo "配置完成后，请重新运行此脚本"
    exit 0
fi

echo "✅ 配置文件 .env 已存在"
echo ""

# 创建日志目录
if [ ! -d "logs" ]; then
    echo "创建日志目录..."
    mkdir -p logs
fi

# 安装依赖
echo "=========================================="
echo "  安装依赖包"
echo "=========================================="
npm install

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "下一步："
echo ""
echo "1. 启动服务："
echo "   pm2 start ecosystem.config.json"
echo ""
echo "2. 保存 PM2 配置："
echo "   pm2 save"
echo ""
echo "3. 查看日志："
echo "   pm2 logs wallnotepad"
echo ""
echo "4. 配置 Nginx 反向代理（参考 README.md）"
echo ""
