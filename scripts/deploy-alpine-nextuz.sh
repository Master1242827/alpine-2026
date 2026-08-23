#!/usr/bin/env bash
# Deploy/atualização do site em alpine.nextuz.com.br (VPS Hostinger, Ubuntu/Debian)
#
# Uso (como root, dentro da VPS):
#   bash scripts/deploy-alpine-nextuz.sh seu@email.com
#
# Idempotente: pode rodar quantas vezes quiser.

set -euo pipefail

DOMAIN="alpine.nextuz.com.br"
APP_DIR="/var/www/alpine"
APP_NAME="alpine"
PORT="3000"
EMAIL="${1:-}"

log() { echo -e "\n\033[1;32m==> $*\033[0m"; }
fail() { echo -e "\n\033[1;31mERRO: $*\033[0m" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Rode como root (sudo -i)."
[ -d "$APP_DIR" ] || fail "Pasta $APP_DIR não existe. Clone o repositório antes (passo 5 do DEPLOY-HOSTINGER.md)."
[ -f "$APP_DIR/.env" ] || fail "Arquivo $APP_DIR/.env não encontrado. Crie-o antes (passo 7 do DEPLOY-HOSTINGER.md)."

log "1/7 Instalando dependências do sistema (se faltarem)"
export DEBIAN_FRONTEND=noninteractive
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash - ; apt install -y nodejs; }
command -v nginx >/dev/null || apt install -y nginx
command -v certbot >/dev/null || apt install -y certbot python3-certbot-nginx
command -v pm2 >/dev/null || npm install -g pm2
command -v dig >/dev/null || apt install -y dnsutils

log "2/7 Conferindo DNS de $DOMAIN"
SERVER_IP="$(curl -fsS https://api.ipify.org || true)"
DNS_IP="$(dig +short "$DOMAIN" | tail -n1 || true)"
echo "IP da VPS : ${SERVER_IP:-desconhecido}"
echo "IP do DNS : ${DNS_IP:-nenhum}"
if [ -z "$DNS_IP" ]; then
  echo "AVISO: $DOMAIN ainda não resolve. Crie no DNS de nextuz.com.br:  A  alpine  ->  ${SERVER_IP:-SEU_IP}"
  echo "O SSL (passo 6) será pulado até o DNS propagar."
elif [ -n "$SERVER_IP" ] && [ "$DNS_IP" != "$SERVER_IP" ]; then
  echo "AVISO: $DOMAIN aponta para $DNS_IP, e não para $SERVER_IP. Corrija o registro A antes do SSL."
fi

log "3/7 Instalando pacotes e gerando build de produção"
cd "$APP_DIR"
npm install
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}" npm run build:node
[ -f "$APP_DIR/dist/server/index.mjs" ] || fail "Build não gerou dist/server/index.mjs."

log "4/7 Subindo/reiniciando o app no PM2"
chmod 600 "$APP_DIR/.env"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start "$APP_DIR/dist/server/index.mjs" --name "$APP_NAME" --update-env
fi
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
sleep 3
curl -fsS -o /dev/null -w "app local respondeu HTTP %{http_code}\n" "http://127.0.0.1:$PORT/" \
  || fail "App não respondeu em 127.0.0.1:$PORT — veja 'pm2 logs $APP_NAME'."

log "5/7 Configurando Nginx para $DOMAIN"
cat > /etc/nginx/sites-available/alpine <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 64M;

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
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 120s;
        proxy_connect_timeout 60s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/alpine /etc/nginx/sites-enabled/alpine
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "6/7 SSL (HTTPS) com Let's Encrypt"
if [ -n "$SERVER_IP" ] && [ "$DNS_IP" = "$SERVER_IP" ]; then
  if [ -z "$EMAIL" ]; then
    echo "Pulei o SSL: informe o e-mail -> bash scripts/deploy-alpine-nextuz.sh seu@email.com"
  else
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || \
      echo "AVISO: Certbot falhou. Rode de novo depois que o DNS propagar."
  fi
else
  echo "Pulei o SSL: DNS ainda não aponta para esta VPS."
fi

log "7/7 Verificação final"
pm2 status
systemctl is-active nginx && echo "nginx ativo"
curl -sSI "http://$DOMAIN/" | head -n 1 || true
curl -sSI "https://$DOMAIN/" | head -n 1 || true

cat <<FIM

Pronto. Próximos passos manuais:
  1. DNS (painel do nextuz.com.br):  A  alpine  ->  ${SERVER_IP:-SEU_IP}   TTL 3600
  2. Mercado Pago → Webhooks: https://$DOMAIN/api/public/webhooks/mercadopago
  3. Atualizações futuras: cd $APP_DIR && git pull && bash scripts/deploy-alpine-nextuz.sh $EMAIL

FIM
