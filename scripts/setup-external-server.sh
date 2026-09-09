#!/usr/bin/env bash
# Configuração completa do servidor externo (VPS) para espelhar o app do Lovable.
# Roda uma única vez como root na VPS. Idempotente.
#
# Uso:
#   bash scripts/setup-external-server.sh
#
# O script pergunta/interage o mínimo possível. Antes de rodar, você precisa
# ter colado no .env da VPS as variáveis que o Admin → Pagamentos fornece:
#   CHECKOUT_API_BASE_URL=...
#   CHECKOUT_API_TOKEN=...
#
# Também é necessário que o DNS de alpine.nextuz.com.br já aponte para o IP
# da VPS (crie o registro A no painel do domínio antes).

set -euo pipefail

DOMAIN="alpine.nextuz.com.br"
APP_DIR="/var/www/alpine"
APP_NAME="alpine"
PORT="3000"
LOG="/var/log/alpine-setup.log"

log() { echo -e "\n\033[1;32m==> $*\033[0m" | tee -a "$LOG"; }
warn() { echo -e "\n\033[1;33mAVISO: $*\033[0m" | tee -a "$LOG"; }
fail() { echo -e "\n\033[1;31mERRO: $*\033[0m" >&2 | tee -a "$LOG"; exit 1; }

mkdir -p "$(dirname "$LOG")"

[ "$(id -u)" -eq 0 ] || fail "Rode como root (sudo -i)."
[ -d "$APP_DIR" ] || fail "Pasta $APP_DIR não existe. Clone o repositório antes."
[ -f "$APP_DIR/.env" ] || fail "Arquivo $APP_DIR/.env não encontrado. Crie-o com as variáveis do Admin → Pagamentos."

log "Verificando variáveis de conexão no .env"
if ! grep -qE '^CHECKOUT_API_BASE_URL=' "$APP_DIR/.env"; then
  fail "CHECKOUT_API_BASE_URL não encontrado no .env. Copie do Admin → Pagamentos."
fi
if ! grep -qE '^CHECKOUT_API_TOKEN=' "$APP_DIR/.env"; then
  fail "CHECKOUT_API_TOKEN não encontrado no .env. Copie do Admin → Pagamentos."
fi

log "Instalando dependências do sistema (se faltarem)"
export DEBIAN_FRONTEND=noninteractive
apt update
apt install -y curl git build-essential ufw nginx certbot python3-certbot-nginx dnsutils
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash - ; apt install -y nodejs; }
command -v pm2 >/dev/null || npm install -g pm2

log "Configurando firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable || true

log "Conferindo DNS de $DOMAIN"
SERVER_IP="$(curl -fsS https://api.ipify.org || true)"
DNS_IP="$(dig +short "$DOMAIN" | tail -n1 || true)"
echo "IP da VPS : ${SERVER_IP:-desconhecido}"
echo "IP do DNS : ${DNS_IP:-nenhum}"
if [ -z "$DNS_IP" ]; then
  warn "$DOMAIN ainda não resolve. Crie no DNS de nextuz.com.br:  A  alpine  ->  ${SERVER_IP:-SEU_IP}"
fi
if [ -n "$SERVER_IP" ] && [ -n "$DNS_IP" ] && [ "$DNS_IP" != "$SERVER_IP" ]; then
  warn "$DOMAIN aponta para $DNS_IP, e não para $SERVER_IP. Corrija o registro A antes do SSL."
fi

log "Instalando dependências do projeto e gerando build"
cd "$APP_DIR"
chmod 600 "$APP_DIR/.env"
npm install
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}" npm run build:node
[ -f "$APP_DIR/dist/server/index.mjs" ] || fail "Build não gerou dist/server/index.mjs."

log "Subindo/reiniciando o app no PM2"
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

log "Configurando Nginx para $DOMAIN"
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

log "Instalando SSL (HTTPS) com Let's Encrypt"
if [ -n "$SERVER_IP" ] && [ "$DNS_IP" = "$SERVER_IP" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect || \
    warn "Certbot falhou. Rode de novo depois que o DNS propagar."
else
  warn "Pulou SSL: DNS ainda não aponta para esta VPS."
fi

log "Ativando deploy automático"
bash "$APP_DIR/scripts/auto-deploy.sh" --install

log "Verificação final"
pm2 status
systemctl is-active nginx && echo "nginx ativo"
curl -sSI "http://$DOMAIN/" | head -n 1 || true
curl -sSI "https://$DOMAIN/" | head -n 1 || true

cat <<FIM

=== SERVIDOR CONFIGURADO ===
Domínio: $DOMAIN
App:     http://127.0.0.1:$PORT

Próximos passos:
1. DNS (painel do nextuz.com.br): A alpine -> ${SERVER_IP:-SEU_IP} TTL 3600
2. Mercado Pago -> Webhooks: https://$DOMAIN/api/public/webhooks/mercadopago
3. Acompanhe deploys: tail -f /var/log/alpine-auto-deploy.log

O site na VPS atualiza sozinho a cada publicação no Lovable (até 3 min).
FIM
