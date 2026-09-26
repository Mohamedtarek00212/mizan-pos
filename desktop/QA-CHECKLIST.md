# Mizan POS Desktop — Phase 12.6 QA Baseline

Verified on 2026-09-14 using macOS ARM64.

## Automated gates

- Frontend lint: passed.
- Frontend tests: 15 files, 45 tests passed.
- Frontend production build: passed.
- Backend lint: passed.
- Backend tests: 14 suites, 111 tests passed.
- Backend production build: passed.
- Desktop TypeScript typecheck and build: passed.

## Packaged application smoke test

- The application starts from `Mizan POS.app` without a Vite server.
- The renderer loads through `mizan://app/`.
- Authentication/session restoration connects to the configured central API.
- Refreshing a nested route retains the route through the protocol fallback.
- POS, Registers, Returns, Inventory, and Reports were opened in the packaged app.
- Offline recovery was shown while the API was unavailable and recovered after retry.
- The packaged app retains the Electron security boundary documented in README.

## Artifact

- File: `release/Mizan-POS-0.1.0-arm64.dmg`
- Size: approximately 127 MB.
- SHA-256: `27628f143d1256fa9b7c182d416db362beb815b9aee68a1b877971902e0b731e`
- `hdiutil verify`: valid.
- Signing status: unsigned development baseline; not for public distribution.

## Phase 13 handoff

- Receipt printing foundation is implemented; verify it with the client's exact
  thermal printer model during onsite hardware acceptance.
- Barcode keyboard-wedge support is implemented and automated; verify timing
  with the client's exact USB scanner during onsite hardware acceptance.
- Network ESC/POS cash-drawer support is implemented; verify the selected pin,
  printer address, and physical fallback key with the client's exact hardware.
- Build and verify the NSIS installer on Windows.
- Supply macOS and Windows signing identities and notarization credentials.
- Publish the signed artifacts to the chosen HTTPS update channel and verify
  installation, upgrade, and uninstall on target machines.

## Phase 13.4 installer artifacts

Built and structurally verified on 2026-09-14:

- macOS Apple Silicon: `Mizan-POS-0.1.0-arm64.dmg` (127 MB), SHA-256
  `27628f143d1256fa9b7c182d416db362beb815b9aee68a1b877971902e0b731e`.
- macOS Intel: `Mizan-POS-0.1.0-x64.dmg` (131 MB), SHA-256
  `c94002846a0626f4455dec653278713fbfdfc16ff9d5ccb6422ea79f913bcda7`.
- Windows x64 NSIS: `Mizan-POS-Setup-0.1.0-x64.exe` (111 MB), SHA-256
  `0c5bd699a97570f5b2937c3b56ca995763b26802f6b1368bc3a71c73a51f7339`.

Both DMGs pass `hdiutil verify`; their contained executables report the expected
ARM64 and x86_64 architectures. The Windows installer is a valid NSIS PE
executable, its unpacked application is x86-64, and its bundled renderer and
ASAR are present. Windows installation, launch, upgrade, and uninstall must be
executed on an actual Windows machine before client delivery. These development
artifacts remain intentionally unsigned until owner credentials are supplied.

## Phase 13.5 release security

- Release preflight rejects missing certificates/notarization credentials and
  non-HTTPS update feeds without printing secrets.
- The macOS release profile enables hardened runtime, entitlements, Developer
  ID signing, notarization, and DMG/ZIP update artifacts.
- The Windows release profile requires Authenticode credentials and produces
  NSIS update metadata.
- The packaged updater is disabled when signed feed metadata is absent; release
  builds check on startup and every six hours, prohibit downgrades, require user
  consent to download/restart, and retain failure logs.
- Actual trust verification remains pending until the owner supplies Apple
  Developer and Windows code-signing credentials.

## Phase 15.1 standalone runtime

Verified on 2026-09-15 using macOS Apple Silicon:

- The packaged application starts its own isolated PostgreSQL 16 instance.
- The `mizan` database is created automatically on a first launch.
- All 20 database migrations run before the bundled Backend accepts traffic.
- The Backend and database listen only on random loopback ports.
- Device-specific database and JWT secrets are generated outside the app bundle
  with owner-only file permissions.
- The renderer waits for the local readiness endpoint and offers a bilingual
  one-click service restart if startup fails.
- A controlled quit stops the Backend and PostgreSQL cleanly.
- The lifecycle test uses a temporary application-data directory and removes it
  afterwards, so it cannot alter development or customer data.

The validated artifact is an unpacked engineering build, not the final customer
installer. Target installer delivery belongs to Phase 15.3.

## Phase 15.2 first-run setup and data management

Verified on 2026-09-15 using an isolated, empty application-data directory:

- The first launch requested store, Administrator, register, and tax details.
- Initialization created the roles, permissions, thresholds, Admin, register,
  default tax rate, store profile, and audit event in one transaction.
- The created Administrator successfully authenticated and initialization could
  not be repeated.
- A manual `.mizan-backup` archive was created from a stopped database, restored,
  restarted, and the restored Administrator authenticated successfully.
- A second application launch preserved the initialized data and generated the
  scheduled daily backup.
- Restore archives reject incompatible platforms and unsafe archive entries;
  failed restoration rolls back to the prior local database.
