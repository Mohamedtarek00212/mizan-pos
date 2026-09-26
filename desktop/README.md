# Mizan POS Desktop

This directory contains the isolated Electron shell for Mizan POS. The web
frontend remains usable on its own, while packaged desktop builds now default
to the commercial standalone runtime.

## Standalone runtime

A packaged application requires no system Node.js, Docker, or PostgreSQL
installation. On launch it automatically:

- starts the platform-specific embedded PostgreSQL 16 binary on a random
  loopback-only port;
- keeps the database under Electron's per-user application-data directory;
- creates random database/JWT secrets with owner-only permissions;
- creates the `mizan` database, runs every versioned migration, and starts a
  self-contained bundled Backend through an Electron utility process;
- waits for `/api/health/ready` before the renderer continues; and
- shuts down the Backend and database cleanly when the application quits.

Use `MIZAN_RUNTIME_MODE=external` to retain central-server operation for a
future multi-device deployment. Development remains external by default; run
`npm run test:standalone` for an isolated real PostgreSQL + Backend lifecycle
test. The test never uses the developer database and removes its temporary data.

## Development

```bash
cd desktop
npm install
npm run dev
```

`npm run dev` starts the Vite renderer at `http://localhost:5174` and opens it inside Electron.

## First launch and data protection

A fresh standalone installation opens a bilingual four-step wizard instead of
the sign-in page. The store name, Administrator credentials, first register,
and default tax rate are validated and committed atomically; the endpoint is
permanently locked after the first account exists.

An Administrator can open **Backup & Restore** from the Management navigation.
Manual backups use the `.mizan-backup` format and briefly pause local services
to create a consistent PostgreSQL copy. Mizan also creates a backup before
startup at most once per day and retains the latest seven automatic copies.
Before an in-app update is installed, the local services stop cleanly and Mizan
creates a separate pre-upgrade backup, retaining the latest three.
Restore validates format, PostgreSQL version, operating system, architecture,
and archive paths, preserves the current database as a rollback copy, and
restarts Mizan automatically. These controls are available only in standalone
desktop mode and require a live Administrator session.

If the renderer is already running, use:

```bash
cd desktop
npm run build
ELECTRON_RENDERER_URL=http://localhost:5174 npm run start
```

## Security boundary

- Context isolation and Chromium sandbox are enabled.
- Node.js integration is disabled in the renderer.
- The preload exposes only typed app-information and window-control methods.
- New windows, untrusted navigation, webviews, and permission requests are denied.
- Window position, size, and maximized state are restored between launches.
- A second launch focuses the existing application instead of opening a duplicate.
- Safe web links open in the operating system browser; app navigation stays in Electron.
- Typed window controls are exposed without revealing raw Electron APIs.
- A bilingual recovery screen restarts failed local services with one click;
  external mode can still configure and verify a central Mizan API.
- Only the normalized server address is stored in `server-config.json` with
  owner-only file permissions; usernames, passwords, and tokens are excluded.
- Packaged builds require HTTPS for remote servers while allowing loopback
  addresses for local development.
- Startup health checks and runtime network detection provide retry and
  server-change recovery screens.
- The approved Mizan logo supplies the window/Dock PNG and macOS ICNS icon.
- A branded bilingual splash covers startup while the renderer and connection
  gate initialize.
- Native bilingual menus provide standard app/window actions plus shortcuts to
  Overview, POS, Registers, Inventory, and Reports.
- Auth sessions are encrypted through Electron `safeStorage` (Keychain on
  macOS) and written with owner-only permissions; passwords are never stored.
- Invalid/expired persisted sessions are cleared after the API returns 401.
- Redacted, size-limited rotating logs capture application and renderer
  failures without recording bearer tokens or secrets.
- Renderer-process crashes receive bounded automatic recovery, while React
  component crashes show a branded reload screen instead of a blank window.

## Production packaging

Build an unpacked application for local smoke testing:

```bash
cd desktop
npm run package:dir
```

Build an unsigned macOS DMG (run on macOS):

```bash
npm run package:mac
```

Build both Apple Silicon and Intel DMGs:

```bash
npm run package:mac:all
```

Prepare the Windows NSIS installer (run and verify on Windows):

```bash
npm run package:win
```

The packaged renderer is copied into Electron resources and served through the
private `mizan://app` protocol. It does not depend on a Vite development server.
Remote production APIs must use HTTPS; loopback HTTP remains available for
local development.

The standalone Backend is bundled into one Node entry and copied with migrations;
the PostgreSQL native runtime is unpacked outside ASAR so the operating system
can execute it. Packaging validates all supported source runtimes, retains only
the matching target runtime, and fails instead of producing an incomplete
installer. Each DMG/EXE receives a `.sha256` checksum sidecar.

The app identity (`com.mizan.pos`) must not change between releases. Customer
data is outside the installation directory under the operating system's normal
per-user app-data location (`~/Library/Application Support/Mizan POS` on macOS
or `%APPDATA%\\Mizan POS` on Windows), so replacing/upgrading the application
preserves it. The Windows uninstaller explicitly leaves this data intact; use
the in-app backup function before intentionally removing customer data.

The complete packaged lifecycle and previous-schema migration are verified on
macOS Apple Silicon. The macOS Intel and Windows artifacts are structurally
verified with their own native PostgreSQL payloads; executing installation,
upgrade, uninstall, reboot, and hardware checks on clean target machines is the
remaining Stage 15.4 acceptance work.

The Windows Stage 15.4 delivery kit is generated with
`npm run package:acceptance:win`. It keeps the 0.1.0 clean-install test, the
0.1.1 update test, and the current 0.1.1 client package separate under
`delivery/windows-15.4`, alongside Arabic instructions, acceptance evidence,
and SHA-256 manifests.

## Network cash drawer

Mizan supports the common setup where an RJ11/RJ12 cash drawer is connected to
an ESC/POS-compatible network receipt printer. Configure the desktop process
before launch:

```bash
MIZAN_CASH_DRAWER_HOST=192.168.1.50 \
MIZAN_CASH_DRAWER_PORT=9100 \
MIZAN_CASH_DRAWER_PIN=0 \
npm start
```

The port defaults to `9100` and the drawer pin defaults to `0`. The desktop app
sends only the standard ESC/POS drawer pulse after the backend has captured a
cash payment. A missing or unreachable printer never rolls back the successful
payment; the cashier receives a recovery warning and can use the physical key.

See [QA-CHECKLIST.md](./QA-CHECKLIST.md) for the verified release baseline.

## Signed releases and updates

Unsigned development packages remain available through `package:*`. Production
release commands fail before building unless every required credential and an
HTTPS update feed are present:

```bash
# macOS signing + Apple notarization (API-key credentials are recommended)
MIZAN_UPDATE_URL=https://updates.example.com/mizan \
CSC_LINK=/secure/path/developer-id.p12 \
CSC_KEY_PASSWORD=... \
APPLE_TEAM_ID=... \
APPLE_API_KEY=/secure/path/AuthKey.p8 \
APPLE_API_KEY_ID=... \
APPLE_API_ISSUER=... \
npm run release:mac

# Windows Authenticode signing
MIZAN_UPDATE_URL=https://updates.example.com/mizan \
WIN_CSC_LINK=/secure/path/windows-signing.pfx \
WIN_CSC_KEY_PASSWORD=... \
npm run release:win
```

Secrets must be provided by the release machine or CI secret store and are
never committed. Signed release builds generate update metadata for the generic
HTTPS feed. Packaged clients check after startup and every six hours, never
downgrade, ask before downloading, validate the platform signature, and ask
before restarting to install. Installation is not deferred silently to app
exit: the controlled restart first closes the database and creates a pre-upgrade
safety backup. Development builds without signed feed metadata keep updating
disabled.
