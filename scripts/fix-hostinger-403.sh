#!/usr/bin/env bash
set -Eeuo pipefail

# Correção rápida para 403 Forbidden na Hostinger VPS.
# Uso:
#   sudo bash scripts/fix-hostinger-403.sh /var/www/alpine seudominio.com.br 3000
# O domínio é opcional. Se informado, o script também recria o proxy do Nginx.

APP_DIR="${1:-/var/www/alpine}"
DOMAIN="${2:-}"
PORT="${3:-3000}"
APP_NAME="${APP_NAME:-alpine}"
WEB_GROUP="${WEB_GROUP:-www-data}"

if [ ! -d "$APP_DIR" ]; then
  echo "❌ Pasta do app não encontrada: $APP_DIR"
  echo "Exemplo: sudo bash scripts/fix-hostinger-403.sh /var/www/alpine seudominio.com.br 3000"
  exit 1
fi

APP_DIR="$(cd "$APP_DIR" && pwd)"
OWNER="${SUDO_USER:-$(id -un)}"
GROUP="$OWNER"
if getent group "$WEB_GROUP" >/dev/null 2>&1; then
  GROUP="$WEB_GROUP"
fi

echo "🔧 Corrigindo 403 Forbidden na Hostinger"
echo "App: $APP_DIR"
echo "Porta Node: $PORT"

echo "1/7 Corrigindo dono e permissões..."
if [ "$(id -u)" -eq 0 ]; then
  chown -R "$OWNER:$GROUP" "$APP_DIR"
else
  echo "⚠️ Sem sudo/root: chown ignorado. Rode com sudo se o erro continuar."
fi
find "$APP_DIR" -path "$APP_DIR/.git" -prune -o -type d -exec chmod 755 {} \;
find "$APP_DIR" -path "$APP_DIR/.git" -prune -o -type f -exec chmod 644 {} \;
[ -d "$APP_DIR/scripts" ] && find "$APP_DIR/scripts" -type f -name "*.sh" -exec chmod 755 {} \;
[ -f "$APP_DIR/.env" ] && chmod 600 "$APP_DIR/.env"
[ -d "$APP_DIR/dist/client" ] && chmod -R a+rX "$APP_DIR/dist/client"

echo "2/7 Validando build..."
if [ ! -f "$APP_DIR/dist/server/index.mjs" ] || [ ! -d "$APP_DIR/dist/client" ]; then
  echo "⚠️ Build de produção não encontrado. Execute antes:"
  echo "   cd $APP_DIR && npm install && npm run build:node"
else
  echo "✅ Build encontrado."
fi

echo "3/7 Reiniciando app no PM2, se disponível..."
if command -v pm2 >/dev/null 2>&1 && [ -f "$APP_DIR/dist/server/index.mjs" ]; then
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
  else
    pm2 start "$APP_DIR/dist/server/index.mjs" --name "$APP_NAME" --update-env
  fi
  pm2 save || true
else
  echo "⚠️ PM2 não encontrado ou build ausente."
fi

echo "4/7 Testando servidor local..."
if command -v curl >/dev/null 2>&1; then
  if curl -fsSI "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
    echo "✅ Node respondeu em http://127.0.0.1:$PORT"
  else
    echo "⚠️ Node não respondeu na porta $PORT. Veja: pm2 logs $APP_NAME"
  fi
fi

echo "5/7 Conferindo Nginx..."
if [ -n "$DOMAIN" ] && [ "$(id -u)" -eq 0 ] && command -v nginx >/dev/null 2>&1; then
  cat > /etc/nginx/sites-available/alpine <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 25M;

    location /assets/ {
        alias $APP_DIR/dist/client/assets/;
        expires 1y;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    location /_build/ {
        alias $APP_DIR/dist/client/_build/;
        expires 1y;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
NGINX
  ln -sf /etc/nginx/sites-available/alpine /etc/nginx/sites-enabled/alpine
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  echo "✅ Nginx configurado como proxy para $DOMAIN"
else
  echo "ℹ️ Nginx não foi alterado. Para configurar automaticamente, rode com sudo e informe o domínio."
fi

echo "6/7 Checklist final para remover 403:"
echo "- O domínio precisa apontar para o IP da VPS."
echo "- O Nginx precisa usar proxy_pass http://127.0.0.1:$PORT; na rota /."
echo "- Não aponte o domínio diretamente para $APP_DIR, pois essa pasta não tem index.html na raiz."

echo "7/7 Finalizado."
echo "✅ Se o 403 continuar, rode: tail -n 80 /var/log/nginx/error.log && pm2 logs $APP_NAME --lines 80 --nostream"