const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tar = require('tar');

const desktopRoot = path.resolve(__dirname, '..');
const metadata = require(path.join(desktopRoot, 'package.json'));
const currentPlatform = process.platform === 'win32' ? 'windows' : process.platform;
const requested = process.argv.slice(2);
const targets = requested.length ? requested : [`${currentPlatform}-${process.arch}`];
const supported = new Set(['darwin-arm64', 'darwin-x64', 'windows-x64']);

async function ensureRuntime(target) {
  if (!supported.has(target)) throw new Error(`Unsupported packaged runtime target: ${target}`);
  const version = metadata.optionalDependencies[`@embedded-postgres/${target}`];
  if (!version) throw new Error(`No pinned embedded PostgreSQL version for ${target}`);
  const destination = path.join(desktopRoot, 'node_modules', '@embedded-postgres', target);
  try {
    const installed = JSON.parse(fs.readFileSync(path.join(destination, 'package.json'), 'utf8'));
    if (installed.version === version) return;
  } catch {
    // Download the exact pinned target below.
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-postgres-runtime-'));
  try {
    const result = JSON.parse(execFileSync('npm', [
      'pack', `@embedded-postgres/${target}@${version}`, '--pack-destination', temporary, '--json',
    ], { cwd: desktopRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
    const archive = path.join(temporary, result[0].filename);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });
    await tar.extract({ file: archive, cwd: destination, strip: 1 });
    const hydrationScript = path.join(destination, 'scripts', 'hydrate-symlinks.js');
    if (fs.existsSync(hydrationScript) && process.platform !== 'win32') {
      execFileSync(process.execPath, [hydrationScript], { cwd: destination, stdio: 'inherit' });
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

Promise.all(targets.map(ensureRuntime)).then(() => {
  console.log(`Prepared embedded PostgreSQL runtime(s): ${targets.join(', ')}`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
