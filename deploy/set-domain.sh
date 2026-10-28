#!/usr/bin/env bash
# Serves the site on a domain: Nginx config, HTTPS certificate (Let's Encrypt) and APP_URL for the Telegram bot.
# Also used later when a real domain is bought (point its A records at the server first):
#   bash /srv/atigi/deploy/set-domain.sh atigi.uz www.atigi.uz
# The first domain is the main address. Only touches Atigi's own Nginx site, so other sites keep working.
set -euo pipefail

[ $# -gt 0 ] || { echo "Usage: bash $0 <domain> [more domains]"; exit 1; }
DOMAINS=("$@")
DOMAIN="$1"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER=atigi
ENV_FILE="$APP_DIR/apps/api/.env"
PORT="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)"

[ "$(id -u)" -eq 0 ] || { echo "Run as root: sudo bash $0 $*"; exit 1; }

sed -e "s|__DOMAIN__|${DOMAINS[*]}|g" -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__PORT__|${PORT:-3000}|g" \
  "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/atigi
ln -sf /etc/nginx/sites-available/atigi /etc/nginx/sites-enabled/atigi
if ! nginx -t; then
  # Never leave a broken config enabled: it would block every later Nginx reload on the server.
  rm -f /etc/nginx/sites-enabled/atigi
  echo "❌ Nginx config check failed; Atigi's site was disabled again."
  exit 1
fi
systemctl reload nginx

# A server that already has a Let's Encrypt account needs no questions; otherwise certbot asks
# for an e-mail address and agreement to the Let's Encrypt terms.
CERTBOT_ARGS=(--nginx --redirect)
for d in "${DOMAINS[@]}"; do CERTBOT_ARGS+=(-d "$d"); done
compgen -G "/etc/letsencrypt/accounts/*/directory/*" >/dev/null && CERTBOT_ARGS+=(--non-interactive)
certbot "${CERTBOT_ARGS[@]}"

sed -i "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" "$ENV_FILE"
sudo -u "$APP_USER" -H pm2 restart atigi-api

echo "✅ https://$DOMAIN"
