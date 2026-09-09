#!/usr/bin/env bash
# Espelhamento automático: quando algo novo é publicado (chega no GitHub),
# a VPS atualiza sozinha. Roda a cada poucos minutos via cron.
#
# Instalar (uma vez só, como root na VPS):
#   bash /var/www/alpine/scripts/auto-deploy.sh --install
#
# Rodar manualmente:
#   bash /var/www/alpine/scripts/auto-deploy.sh

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/alpine}"
APP_NAME="${APP_NAME:-alpine}"
BRANCH="${BRANCH:-main}"
LOG="/var/log/alpine-auto-deploy.log"
LOCK="/tmp/alpine-auto-deploy.lock"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

if [ "${1:-}" = "--install" ]; then
  chmod +x "$APP_DIR/scripts/auto-deploy.sh"
  CRON="*/3 * * * * bash $APP_DIR/scripts/auto-deploy.sh >> $LOG 2>&1"
  ( crontab -l 2>/dev/null | grep -v 'auto-deploy.sh' ; echo "$CRON" ) | crontab -
  log "Auto-deploy instalado: verifica atualizações a cada 3 minutos."
  exit 0
fi

exec 9>"$LOCK"
flock -n 9 || { log "Já existe um deploy em andamento; saindo."; exit 0; }

cd "$APP_DIR"
git fetch origin "$BRANCH" --quiet

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

log "Nova versão detectada ($LOCAL -> $REMOTE). Atualizando..."
git clean -fd --quiet
git reset --hard "origin/$BRANCH" --quiet

if command -v bun >/dev/null 2>&1; then
  bun install --silent
else
  npm install --no-audit --no-fund
fi

NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}" npm run build:node

if [ ! -f "$APP_DIR/dist/server/index.mjs" ]; then
  log "ERRO: build não gerou dist/server/index.mjs. Site anterior mantido no ar."
  exit 1
fi

pm2 restart "$APP_NAME" --update-env >/dev/null
sleep 3
CODE="$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || echo 000)"
log "Deploy concluído. App respondeu HTTP $CODE."
