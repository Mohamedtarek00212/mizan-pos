#!/usr/bin/env sh
set -eu

: "${BACKUP_FILE:?Set BACKUP_FILE to a .dump file}"
[ -f "$BACKUP_FILE" ] || { echo "Backup not found: $BACKUP_FILE" >&2; exit 2; }
[ -f "$BACKUP_FILE.sha256" ] || { echo "Checksum not found: $BACKUP_FILE.sha256" >&2; exit 2; }

expected=$(awk '{print $1}' "$BACKUP_FILE.sha256")
case "$expected" in
  ''|*[!0-9a-fA-F]*) echo "Stored checksum is invalid" >&2; exit 1;;
esac
[ "${#expected}" -eq 64 ] || { echo "Stored checksum is invalid" >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
elif command -v openssl >/dev/null 2>&1; then
  actual=$(openssl dgst -sha256 "$BACKUP_FILE" | awk '{print $2}')
else
  echo "A SHA-256 tool (sha256sum or openssl) is required" >&2
  exit 1
fi
[ "$expected" = "$actual" ] || { echo "Checksum mismatch" >&2; exit 1; }
pg_restore --list "$BACKUP_FILE" >/dev/null
echo "Backup checksum and archive structure are valid: $BACKUP_FILE"
