# Mizan production operations

## Deploy

1. Copy `.env.production.example` to `.env.production` and replace every
   `REPLACE_*` value with a unique secret. Keep that file outside source control.
2. Put an HTTPS reverse proxy/load balancer in front of port 4000. The compose
   file binds the API to loopback by default so it is not exposed directly.
3. Run `docker compose --env-file .env.production -f docker-compose.production.yml up -d --build`.
   The one-shot `migrate` service must finish successfully before the API starts.
4. Check `/api/health/live` and `/api/health/ready`, then connect one pilot till.

Never run the development seed in production. Create the first administrator
through an approved bootstrap procedure and immediately change temporary credentials.

## Backup

Install PostgreSQL client tools matching the server's major version, plus
`sha256sum` or `openssl`, and schedule `backup-postgres.sh` daily. Store
one encrypted copy off the server and restrict access to the operations owner.

```bash
DATABASE_URL='postgres://...' BACKUP_DIR=/srv/mizan-backups ./ops/backup-postgres.sh
```

The script creates a compressed custom-format dump, SHA-256 checksum, validates
the archive, and removes local copies older than `BACKUP_RETENTION_DAYS` (30 by default).

## Restore drill

Test restoration monthly into an empty, isolated database—not the live database:

```bash
DATABASE_URL='postgres://.../mizan_restore_test' \
BACKUP_FILE=/srv/mizan-backups/mizan-YYYYMMDDTHHMMSSZ.dump \
CONFIRM_RESTORE=YES ./ops/restore-postgres.sh
```

After restoration, run migrations, check readiness, compare critical record
counts, and complete a sale/return/report smoke test. Record the recovery time.
