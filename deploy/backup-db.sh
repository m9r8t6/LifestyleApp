#!/usr/bin/env bash
# Nightly dump of the LifeOS database. Runs on the server.
# Install once:  (crontab -l; echo "30 3 * * * $HOME/ai-backend/cron/lifestyle/backup-db.sh") | crontab -
set -euo pipefail
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
umask 077

BACKUP_DIR="${HOME}/ai-backend/backups/lifestyle"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

docker exec shared_postgres_db pg_dump -U postgres lifestyle_db | gzip > "$BACKUP_DIR/lifestyle_db_$(date +%Y-%m-%d_%H%M).sql.gz"
find "$BACKUP_DIR" -name 'lifestyle_db_*.sql.gz' -mtime "+${KEEP_DAYS}" -delete
