#!/usr/bin/env bash
set -Eeuo pipefail

# Corrige permissões/dono que costumam causar 403 na Hostinger VPS.
# Uso recomendado:
#   sudo bash scripts/fix-permissions.sh /var/www/alpine www-data

APP_DIR="${1:-$(pwd)}"
WEB_USER_OR_GROUP="${2:-www-data}"

if [ ! -d "$APP_DIR" ]; then
  echo "❌ Pasta não encontrada: $APP_DIR"
  echo "Uso: sudo bash scripts/fix-permissions.sh /var/www/alpine www-data"
  exit 1
fi

APP_DIR="$(cd "$APP_DIR" && pwd)"
RUNNING_AS="$(id -un)"
IS_ROOT=0
[ "$(id -u)" -eq 0 ] && IS_ROOT=1

if [ "$IS_ROOT" -eq 1 ] && [ -n "${SUDO_USER:-}" ]; then
  APP_OWNER="$SUDO_USER"
else
  APP_OWNER="$RUNNING_AS"
fi

if getent group "$WEB_USER_OR_GROUP" >/dev/null 2>&1; then
  APP_GROUP="$WEB_USER_OR_GROUP"
elif id "$WEB_USER_OR_GROUP" >/dev/null 2>&1; then
  APP_GROUP="$WEB_USER_OR_GROUP"
else
  APP_GROUP="$APP_OWNER"
fi

echo "🔧 Corrigindo permissões em: $APP_DIR"
echo "Dono/grupo alvo: $APP_OWNER:$APP_GROUP"

if [ "$IS_ROOT" -eq 1 ]; then
  chown -R "$APP_OWNER:$APP_GROUP" "$APP_DIR"
else
  echo "⚠️ Sem root: pulando chown. Se o 403 continuar, rode com sudo/root."
fi

find "$APP_DIR" -path "$APP_DIR/.git" -prune -o -type d -exec chmod 755 {} \;
find "$APP_DIR" -path "$APP_DIR/.git" -prune -o -type f -exec chmod 644 {} \;

if [ -d "$APP_DIR/scripts" ]; then
  find "$APP_DIR/scripts" -type f -name "*.sh" -exec chmod 755 {} \;
fi

if [ -f "$APP_DIR/.env" ]; then
  chmod 600 "$APP_DIR/.env"
fi

if [ -d "$APP_DIR/dist/client" ]; then
  chmod -R a+rX "$APP_DIR/dist/client"
fi

echo "✅ Permissões corrigidas. Se ainda aparecer 403, rode: sudo bash scripts/fix-hostinger-403.sh $APP_DIR"
