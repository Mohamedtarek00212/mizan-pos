const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const testData = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-standalone-test-'));
const electron = process.env.MIZAN_TEST_EXECUTABLE || require('electron');
const executableArgs = process.env.MIZAN_TEST_EXECUTABLE ? [] : ['.'];
function runApplication(extraEnv = {}) {
  return spawnSync(electron, executableArgs, {
    cwd: desktopRoot,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      MIZAN_RUNTIME_MODE: 'standalone',
      MIZAN_STANDALONE_SELF_TEST: '1',
      MIZAN_USER_DATA_DIR: testData,
      ...extraEnv,
    },
  });
}

function assertSuccessful(result, label) {
  if (result.error) throw result.error;
  if (result.status !== 0 || !result.stdout.includes('MIZAN_STANDALONE_READY')) {
    const logPath = path.join(testData, 'logs', 'main.log');
    const logs = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '(no desktop log)';
    throw new Error(`${label} failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}\nLOGS:\n${logs}`);
  }
}

try {
  const firstLaunch = runApplication({ MIZAN_SIMULATE_PREVIOUS_SCHEMA: '1' });
  assertSuccessful(firstLaunch, 'Fresh standalone setup test');
  const secondLaunch = runApplication();
  assertSuccessful(secondLaunch, 'Persistent standalone restart test');
  const backups = fs.readdirSync(path.join(testData, 'backups')).filter((name) => name.endsWith('.mizan-backup'));
  if (backups.length !== 1) throw new Error('Automatic startup backup was not created');
  const preUpgradeBackups = fs.readdirSync(path.join(testData, 'backups', 'pre-upgrade'))
    .filter((name) => name.endsWith('.mizan-backup'));
  if (preUpgradeBackups.length !== 2) throw new Error('Pre-upgrade safety backups were not created');
  console.log(secondLaunch.stdout.trim());
  console.log('Standalone setup, upgrade migration, persistence, login, manual backup/restore, and automatic-backup lifecycle test passed.');
} finally {
  fs.rmSync(testData, { recursive: true, force: true });
}
