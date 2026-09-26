# Mizan POS — Production runbook

## Release sequence

1. Freeze the release candidate and run `./ops/release-check.sh`.
2. Back up production and verify the archive before database changes.
3. Build signed/notarized desktop installers and record SHA-256 hashes.
4. Deploy the API/database stack from `docker-compose.production.yml` behind TLS.
5. Confirm `health/live`, `health/ready`, migrations, logs, disk space, and backup job.
6. Install on one pilot till; execute the critical UAT set before adding tills.

## Security baseline

- Unique secrets in a protected environment file; no sample passwords or seeds.
- TLS at the reverse proxy, explicit CORS allowlist, firewall-restricted database,
  least-privilege OS/database users, and security updates on a defined cadence.
- Named POS accounts, immediate deactivation for leavers, periodic access review,
  log retention/access policy, and protected signing credentials.
- Rate limiting exists in the API; if multiple API replicas are used, add a
  shared rate limiter at the proxy or Redis layer.

## Monitoring and incident response

Alert on readiness failures, repeated restarts, database/disk pressure, backup
failure, spikes in login rejection, ambiguous card payments, and drawer/print
errors. For incidents: stop risky actions, preserve logs and IDs, assign an
owner, communicate impact, restore service, reconcile financial operations, and
record root cause/prevention. Never resolve an uncertain payment by blind retry.

## Rollback

Application rollback means redeploying the previous signed API/desktop version.
Database migrations are forward-only: restore only after explicit incident-owner
approval and verified backup, because restoration replaces newer transactions.
