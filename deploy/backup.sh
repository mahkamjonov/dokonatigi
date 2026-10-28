#!/usr/bin/env bash
# Daily database backup, kept 14 days on the server. Run by cron as the app user (see setup.sh).
set -euo pipefail

DB_NAME=atigi
BACKUP_DIR=/var/backups/atigi
FILE="$BACKUP_DIR/$DB_NAME-$(date +%F).dump"

# The app user connects through the local socket (peer authentication): no password needed.
pg_dump --format=custom --file="$FILE" "$DB_NAME"
pg_restore --list "$FILE" >/dev/null  # fails if the dump is unreadable
find "$BACKUP_DIR" -name '*.dump' -mtime +14 -delete

echo "$(date '+%F %T') backup ok: $FILE"
