#!/usr/bin/env bash
# Daily mysqldump backup for the tamarind_court database (Linux/cron).
# Usage: ./backup.sh  (reads DB credentials from backend/.env)
# Cron example (2 AM daily, keep 14 days):
#   0 2 * * * /path/to/tamarind-court/database/backup.sh >> /var/log/tamarind-court-backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../backend/.env"
BACKUP_DIR="$SCRIPT_DIR/backups"
RETENTION_DAYS=14

if [ ! -f "$ENV_FILE" ]; then
  echo "backend/.env not found at $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC2046
export $(grep -E '^DB_(HOST|PORT|DATABASE|USERNAME|PASSWORD)=' "$ENV_FILE" | xargs)

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/tamarind_court_${TIMESTAMP}.sql.gz"

mysqldump \
  --host="${DB_HOST:-127.0.0.1}" \
  --port="${DB_PORT:-3306}" \
  --user="${DB_USERNAME:-root}" \
  --password="${DB_PASSWORD:-}" \
  --single-transaction \
  --routines \
  --triggers \
  "${DB_DATABASE:-tamarind_court}" | gzip > "$OUT_FILE"

echo "Backup written to $OUT_FILE"

# Prune backups older than RETENTION_DAYS.
find "$BACKUP_DIR" -name 'tamarind_court_*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete

echo "Pruned backups older than ${RETENTION_DAYS} days."
