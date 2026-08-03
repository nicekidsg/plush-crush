#!/bin/bash
# Plush Crush 一键发布：构建 → 发布 gh-pages → 线上自动更新
# 通过 GitHub API 发布（不依赖 github.com 域名直连）
set -e
cd "$(dirname "$0")"

echo "🔨 构建中..."
npm run build

python3 deploy_api.py dist
