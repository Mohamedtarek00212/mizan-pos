#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?Set DATABASE_URL to the production PostgreSQL connection string}"
BACKUP_DIR=${BACKUP_DIR:-./backups}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}

case "$BACKUP_RETENTION_DAYS" in *[!0-9]*|'') echo "BACKUP_RETENTION_DAYS must be an integer" >&2; exit 2;; esac
mkdir -p "$BACKUP_DIR"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$BACKUP_DIR/mizan-$timestamp.dump"

umask 077
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --no-owner --no-acl --file="$backup_file"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$backup_file" | awk '{print $1}' > "$backup_file.sha256"
elif command -v openssl >/dev/null 2>&1; then
  openssl dgst -sha256 "$backup_file" | awk '{print $2}' > "$backup_file.sha256"
else
  echo "A SHA-256 tool (sha256sum or openssl) is required" >&2
  exit 1
fi
pg_restore --list "$backup_file" >/dev/null

find "$BACKUP_DIR" -type f \( -name 'mizan-*.dump' -o -name 'mizan-*.dump.sha256' \) \
  -mtime "+$BACKUP_RETENTION_DAYS" -delete

echo "Backup created and verified: $backup_file"
