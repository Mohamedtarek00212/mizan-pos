const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(desktopRoot, 'package.json'));
const postgresVersion = packageJson.dependencies['embedded-postgres'];
const knownTargets = [
  { packageName: 'darwin-arm64', executable: 'postgres', magic: Buffer.from([0xca, 0xfe, 0xba, 0xbe]) },
  { packageName: 'darwin-x64', executable: 'postgres', magic: Buffer.from([0xca, 0xfe, 0xba, 0xbe]) },
  { packageName: 'windows-x64', executable: 'postgres.exe', magic: Buffer.from('MZ') },
];
const requested = process.argv.slice(2);
const currentPlatform = process.platform === 'win32' ? 'windows' : process.platform;
const targetNames = requested.length ? requested : [`${currentPlatform}-${process.arch}`];
const targets = targetNames.map((name) => {
  const target = knownTargets.find(({ packageName }) => packageName === name);
  if (!target) throw new Error(`Unsupported packaged runtime target: ${name}`);
  return target;
});

for (const target of targets) {
  const packageDirectory = path.join(
    desktopRoot,
    'node_modules',
    '@embedded-postgres',
    target.packageName,
  );
  const metadataPath = path.join(packageDirectory, 'package.json');
  const executablePath = path.join(packageDirectory, 'native', 'bin', target.executable);
  if (!fs.existsSync(metadataPath) || !fs.existsSync(executablePath)) {
    throw new Error(`Missing embedded PostgreSQL runtime for ${target.packageName}`);
  }
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (!String(metadata.version).startsWith('16.')) {
    throw new Error(`Expected PostgreSQL 16 for ${target.packageName}, found ${metadata.version}`);
  }
  if (packageJson.optionalDependencies[`@embedded-postgres/${target.packageName}`] !== metadata.version) {
    throw new Error(`The pinned ${target.packageName} runtime does not match package.json`);
  }
  const header = Buffer.alloc(target.magic.length);
  const descriptor = fs.openSync(executablePath, 'r');
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (!header.equals(target.magic)) {
    throw new Error(`The ${target.packageName} PostgreSQL executable has an invalid format`);
  }
}

if (!String(postgresVersion).includes('16.14.0')) {
  throw new Error(`Unexpected embedded-postgres wrapper version: ${postgresVersion}`);
}
console.log(`Embedded PostgreSQL 16 runtime(s) validated: ${targetNames.join(', ')}.`);
