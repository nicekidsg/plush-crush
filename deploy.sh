#!/bin/bash
# Plush Crush 一键发布：构建 → 推送 gh-pages → 线上自动更新
set -e
cd "$(dirname "$0")"

echo "🔨 构建中..."
npm run build

TMP=$(mktemp -d)
cp -R dist/. "$TMP/"
touch "$TMP/.nojekyll"

cd "$TMP"
git init -q -b gh-pages
git config user.name "nicekidsg"
git config user.email "nicekidsg@users.noreply.github.com"
git add -A
git commit -qm "deploy: $(date '+%Y-%m-%d %H:%M')"
git push -q --force https://github.com/nicekidsg/plush-crush.git gh-pages

rm -rf "$TMP"
echo "✅ 已发布 https://nicekidsg.github.io/plush-crush/ （约 1 分钟后生效）"
