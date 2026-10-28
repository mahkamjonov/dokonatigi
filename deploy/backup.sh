#!/usr/bin/env bash
# Daily database backup: keeps 14 days on the server and, as the owner chose, sends a copy to the owner's
# Telegram chat so the data survives even if the server is lost. Run by cron as the app user (see setup.sh).
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

DB_NAME=atigi
BACKUP_DIR=/var/backups/atigi
FILE="$BACKUP_DIR/$DB_NAME-$(date +%F).dump"

umask 077
cd "$BACKUP_DIR"

# The app user connects through the local socket (peer authentication): no password needed.
pg_dump --format=custom --file="$FILE" "$DB_NAME"
pg_restore --list "$FILE" >/dev/null  # fails if the dump is unreadable
find "$BACKUP_DIR" -name '*.dump' -mtime +14 -delete

# Off-server copy: the owner's own chat with the bot (set once the owner opens the app from the bot).
BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$APP_DIR/apps/api/.env" | cut -d= -f2-)"
CHAT_ID="$(psql -d "$DB_NAME" -tAc "SELECT telegram_chat_id FROM users WHERE role = 'owner' AND telegram_chat_id IS NOT NULL LIMIT 1")"
if [ -n "$BOT_TOKEN" ] && [ -n "$CHAT_ID" ]; then
  curl -fsS -o /dev/null \
    -F chat_id="$CHAT_ID" \
    -F document=@"$FILE" \
    -F caption="🗄 Atigi zaxira nusxasi — $(date +%F)" \
    -F disable_notification=true \
    "https://api.telegram.org/bot$BOT_TOKEN/sendDocument"
  echo "$(date '+%F %T') backup ok, copy sent to the owner's Telegram: $FILE"
else
  echo "$(date '+%F %T') backup ok (no Telegram copy yet: the owner has not opened the app from the bot): $FILE"
fi
