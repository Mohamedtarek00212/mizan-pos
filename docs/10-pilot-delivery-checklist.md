# Mizan POS — Pilot and final delivery checklist

## Pilot (recommended: one till, two business days)

- [ ] Production server/domain/TLS and monitored backup job are active.
- [ ] Owner supplied Apple/Windows signing credentials; installers show trusted publisher.
- [ ] One exact printer, scanner, drawer, and Windows/macOS target are accepted onsite.
- [ ] Admin, manager, cashier, and inventory staff complete role-based UAT.
- [ ] Opening float, one sale per payment type, receipt, return, adjustment, report,
      close/reconcile, outage recovery, and backup restore drill pass.
- [ ] Real card provider is selected, certified, and reconciled; sandbox mode is not accepted as live processing.
- [ ] Support owner, escalation contacts, business hours, and response targets are agreed.

## Go/no-go gate

Go only with zero critical/high open defects, successful latest backup, signed
UAT, approved financial reconciliation, trusted installers, and a documented
rollback decision owner. Otherwise extend the pilot and keep the current system.

## Client handover package

- [ ] Signed installers and SHA-256 manifest.
- [ ] Production configuration inventory with secrets delivered separately.
- [ ] Operator guide, UAT evidence, known limitations, architecture/data-flow docs.
- [ ] Backup/restore ownership and verified drill record.
- [ ] Source-code snapshot, dependency lockfiles, database migrations, release tag.
- [ ] Training attendance and formal acceptance signed by client and supplier.

## External items still required

These cannot be truthfully completed inside the development workspace: owner
code-signing certificates, production hosting/TLS, actual client hardware tests,
Windows installation execution, live card-provider onboarding, client UAT,
pilot observation, and formal commercial acceptance.
