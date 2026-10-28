#!/usr/bin/env bash
# Pulls the latest code, builds it, updates the database schema and restarts the API.
# Run on the server as the app user:   sudo -u atigi -H bash /srv/atigi/deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
npm ci

npm run build --workspace=packages/database
# The Prisma CLI reads DATABASE_URL / DIRECT_URL from the environment. Loaded in a subshell only:
# PM2 must not inherit them, or a later .env change (e.g. a new APP_URL) would be shadowed on restart.
# prisma db push refuses schema changes that would delete data.
(set -a; . apps/api/.env; set +a; npm run push --workspace=packages/database)
npm run build --workspace=apps/web
npm run build --workspace=apps/api

pm2 startOrReload deploy/ecosystem.config.cjs
pm2 save

PORT="$(grep -E '^PORT=' apps/api/.env | cut -d= -f2)"
for _ in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT:-3000}/api/v1/health/ping" >/dev/null; then
    echo "✅ API is up"
    exit 0
  fi
  sleep 2
done
echo "❌ API did not answer. Check the logs: pm2 logs atigi-api"
exit 1
