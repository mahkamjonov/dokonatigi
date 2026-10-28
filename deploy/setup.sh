#!/usr/bin/env bash
# One-time setup of Atigi on an Ubuntu 22.04/24.04 VPS: Node.js, PostgreSQL, Nginx, HTTPS, PM2, firewall, backups.
# Run as root from the cloned repo:   bash /srv/atigi/deploy/setup.sh [domain]
# Without a domain the site gets a free <ip>.sslip.io address until a real domain is bought.
# Safe on a server that already hosts other projects: installed packages, Node.js, PM2 and the
# timezone are left as they are, and the API gets the first free port from 3000 up.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER=atigi
DB_NAME=atigi
DB_USER=atigi
ENV_FILE="$APP_DIR/apps/api/.env"

SERVER_IP="$(hostname -I | awk '{print $1}')"
DOMAIN="${1:-${SERVER_IP//./-}.sslip.io}"

[ "$(id -u)" -eq 0 ] || { echo "Run as root: sudo bash $0"; exit 1; }

export DEBIAN_FRONTEND=noninteractive

echo "==> System packages (missing ones only)"
apt-get update
apt-get install -y --no-upgrade curl git openssl nginx postgresql ufw certbot python3-certbot-nginx
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
elif [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "Node.js $(node -v) is too old: Atigi needs 20 or newer."; exit 1
fi
command -v pm2 >/dev/null || npm install -g pm2

# Small VPS plans run out of memory while building the web app.
if ! swapon --show | grep -q . && [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 2000000 ]; then
  echo "==> Adding 2 GB swap"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Firewall (SSH, HTTP, HTTPS only)"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw status | grep -q 'Status: active' || ufw --force enable

echo "==> App user"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "==> Database and secrets"
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN CREATE ROLE $DB_USER LOGIN; END IF;
END \$\$;
ALTER ROLE $DB_USER PASSWORD '$DB_PASS';
SQL
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
    sudo -u postgres createdb --owner="$DB_USER" --encoding=UTF8 --template=template0 "$DB_NAME"
  fi

  PORT=3000
  while ss -tlnH "sport = :$PORT" | grep -q .; do PORT=$((PORT + 1)); done

  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
PORT=$PORT
APP_URL=https://$DOMAIN
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
DIRECT_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
JWT_SECRET=$(openssl rand -hex 32)
# Telegram bot (optional): token from @BotFather, then run: sudo -u $APP_USER -H pm2 restart atigi-api
TELEGRAM_BOT_TOKEN=
ENV
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

echo "==> Build and start the app"
sudo -u "$APP_USER" -H bash "$APP_DIR/deploy/deploy.sh"
sudo -u "$APP_USER" -H pm2 install pm2-logrotate
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"

echo "==> Daily database backups (03:00, kept 14 days)"
install -d -o postgres -g postgres -m 700 /var/backups/atigi
cat > /etc/cron.d/atigi-backup <<CRON
0 3 * * * postgres pg_dump -Fc $DB_NAME > /var/backups/atigi/$DB_NAME-\$(date +\%F).dump && find /var/backups/atigi -name '*.dump' -mtime +14 -delete
CRON

echo "==> Web server and HTTPS"
bash "$APP_DIR/deploy/set-domain.sh" "$DOMAIN"

echo
echo "✅ Atigi is running: https://$DOMAIN"
echo "Next: create the owner account:"
echo "   cd $APP_DIR/apps/api && sudo -u $APP_USER node dist/scripts/createOwner.js"
