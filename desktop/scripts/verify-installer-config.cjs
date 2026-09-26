const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const metadata = require(path.join(desktopRoot, 'package.json'));
const build = metadata.build;

assert.equal(build.appId, 'com.mizan.pos', 'appId must remain stable so upgrades keep the same userData');
assert.equal(build.productName, 'Mizan POS');
assert.match(metadata.version, /^\d+\.\d+\.\d+$/, 'Installer version must be semantic');
assert.equal(build.nsis.oneClick, false);
assert.equal(build.nsis.createDesktopShortcut, true);
assert.equal(build.nsis.createStartMenuShortcut, true);
assert.equal(build.nsis.deleteAppDataOnUninstall, false);
assert.equal(build.nsis.perMachine, false);
assert.equal(build.afterPack, 'scripts/after-pack.cjs');
assert.equal(build.afterAllArtifactBuild, 'scripts/after-all-artifacts.cjs');
assert.ok(build.asarUnpack.includes('node_modules/@embedded-postgres/**/*'));
for (const target of ['darwin-arm64', 'darwin-x64', 'windows-x64']) {
  assert.equal(metadata.optionalDependencies[`@embedded-postgres/${target}`], '16.14.0-beta.17');
}

const mainSource = fs.readFileSync(path.join(desktopRoot, 'src', 'main.ts'), 'utf8');
const updaterSource = fs.readFileSync(path.join(desktopRoot, 'src', 'updater.ts'), 'utf8');
assert.match(mainSource, /createPreUpgradeBackup/);
assert.match(updaterSource, /autoInstallOnAppQuit = false/);
console.log('Installer identity, shortcuts, uninstall retention, runtime targets, and controlled upgrade policy verified.');
