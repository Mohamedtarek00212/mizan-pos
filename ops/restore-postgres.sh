#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?Set DATABASE_URL to the destination PostgreSQL database}"
: "${BACKUP_FILE:?Set BACKUP_FILE to the verified .dump file}"
[ "${CONFIRM_RESTORE:-}" = "YES" ] || {
  echo "Restore replaces database objects. Set CONFIRM_RESTORE=YES after verifying the destination." >&2
  exit 2
}

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BACKUP_FILE="$BACKUP_FILE" "$SCRIPT_DIR/verify-backup.sh"
pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner --no-acl --exit-on-error "$BACKUP_FILE"
echo "Restore completed. Run migrations and acceptance checks before reopening tills."
