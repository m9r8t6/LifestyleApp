#!/usr/bin/env bash
# Deploys LifeOS to the home server and rebuilds its two containers.
#   ./deploy/deploy.sh
set -euo pipefail

SERVER="${LIFESTYLE_SERVER:-first_automation@claudebotlocal}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ssh "$SERVER" 'bash -s' < "$ROOT/deploy/server-setup.sh"

rsync -az --delete --exclude 'node_modules' --exclude 'test' --exclude '.env' \
    "$ROOT/api/" "$SERVER:~/ai-backend/apps/lifestyle-api/"
rsync -az --delete "$ROOT/web/" "$SERVER:~/ai-backend/apps/lifestyle-web/"
rsync -az "$ROOT/deploy/docker-compose.lifestyle.yml" "$SERVER:~/ai-backend/docker-compose.lifestyle.yml"
rsync -az "$ROOT/deploy/backup-db.sh" "$SERVER:~/ai-backend/cron/lifestyle/"

ssh "$SERVER" 'cd ~/ai-backend && docker compose -p lifestyle -f docker-compose.lifestyle.yml up -d --build'
echo "LifeOS is running at http://claudebotlocal.fritz.box:3110"
