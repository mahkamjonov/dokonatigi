#!/usr/bin/env bash
# Serves the site on a domain: Nginx config, HTTPS certificate (Let's Encrypt) and APP_URL for the Telegram bot.
# Also used later when a real domain is bought (point its A record at the server first):
#   bash /srv/atigi/deploy/set-domain.sh atigi.uz
set -euo pipefail

DOMAIN="${1:?Usage: bash $0 <domain>}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER=atigi
ENV_FILE="$APP_DIR/apps/api/.env"

[ "$(id -u)" -eq 0 ] || { echo "Run as root: sudo bash $0 $DOMAIN"; exit 1; }

sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__APP_DIR__|$APP_DIR|g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/atigi
ln -sf /etc/nginx/sites-available/atigi /etc/nginx/sites-enabled/atigi
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# The first time, certbot asks for an e-mail address and for agreement to the Let's Encrypt terms.
certbot --nginx -d "$DOMAIN" --redirect

sed -i "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" "$ENV_FILE"
sudo -u "$APP_USER" -H pm2 restart atigi-api

echo "✅ https://$DOMAIN"
