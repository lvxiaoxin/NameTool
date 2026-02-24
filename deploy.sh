#!/bin/bash
# deploy.sh — 将 NameTool 部署到 Azure VM
# 用法: ./deploy.sh

set -e

# ─── 配置 ───
REMOTE_USER=""
REMOTE_HOST=""
REMOTE_DIR="/var/www/name-tool"
SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"
SITE_PATH="/name-tool"

echo "🚀 部署 NameTool 到 ${SSH_TARGET}"

# ─── 1. 远程初始化：安装 nginx（如未安装）& 创建目录 ───
echo "── 检查远程环境 ──"
ssh "${SSH_TARGET}" bash -s <<'SETUP'
set -e

# 检查并安装 nginx
if ! command -v nginx &>/dev/null; then
  echo "  📦 安装 Nginx..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq nginx
  sudo systemctl enable nginx
  sudo systemctl start nginx
  echo "  ✓ Nginx 安装完成"
else
  echo "  ✓ Nginx 已安装"
fi

# 创建站点目录
sudo mkdir -p /var/www/name-tool/data
sudo chown -R "$USER:$USER" /var/www/name-tool

# 配置 nginx location
NGINX_CONF="/etc/nginx/sites-available/default"
if ! grep -q "location /name-tool" "$NGINX_CONF" 2>/dev/null; then
  echo "  🔧 配置 Nginx /name-tool 路径..."
  # 在 default server block 中添加 location
  sudo cp "$NGINX_CONF" "${NGINX_CONF}.bak"
  sudo sed -i '/^\s*location \/ {/i \
\tlocation /name-tool {\
\t\talias /var/www/name-tool/;\
\t\tindex index.html;\
\t\ttry_files $uri $uri/ /name-tool/index.html;\
\t}\
' "$NGINX_CONF"
  sudo nginx -t
  sudo systemctl reload nginx
  echo "  ✓ Nginx 配置完成"
else
  echo "  ✓ Nginx 已配置 /name-tool"
fi

# 确保 gzip 压缩已启用（对 JSON 等静态资源）
NGINX_MAIN="/etc/nginx/nginx.conf"
if grep -q '# gzip_types' "$NGINX_MAIN" 2>/dev/null; then
  echo "  🔧 启用 gzip 压缩..."
  sudo sed -i 's/# gzip_vary on;/gzip_vary on;/' "$NGINX_MAIN"
  sudo sed -i 's/# gzip_proxied any;/gzip_proxied any;/' "$NGINX_MAIN"
  sudo sed -i 's/# gzip_comp_level 6;/gzip_comp_level 6;/' "$NGINX_MAIN"
  sudo sed -i 's/# gzip_buffers 16 8k;/gzip_buffers 16 8k;/' "$NGINX_MAIN"
  sudo sed -i 's/# gzip_http_version 1.1;/gzip_http_version 1.1;/' "$NGINX_MAIN"
  sudo sed -i 's/# gzip_types text\/plain/gzip_types text\/plain/' "$NGINX_MAIN"
  sudo nginx -t && sudo systemctl reload nginx
  echo "  ✓ gzip 压缩已启用"
else
  echo "  ✓ gzip 已启用"
fi
SETUP

# ─── 2. 同步文件 ───
echo "── 同步文件 ──"
rsync -avz \
  index.html \
  "${SSH_TARGET}:${REMOTE_DIR}/"

rsync -avz \
  data/characters.json \
  "${SSH_TARGET}:${REMOTE_DIR}/data/"

# ─── 3. 完成 ───
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   ✓ 部署完成！                                        ║"
echo "╚══════════════════════════════════════════════════════╝"
