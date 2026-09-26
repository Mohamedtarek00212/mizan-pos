const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(desktopRoot, '..');
const backendRoot = path.join(repositoryRoot, 'backend');
const destination = path.join(desktopRoot, 'runtime', 'backend');
const expectedDestination = path.join(desktopRoot, 'runtime', 'backend');

if (destination !== expectedDestination || !destination.startsWith(`${desktopRoot}${path.sep}`)) {
  throw new Error('Refusing to prepare an unexpected runtime destination');
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(path.join(destination, 'dist'), { recursive: true });
execFileSync(path.join(backendRoot, 'node_modules', '.bin', 'esbuild'), [
  path.join(backendRoot, 'src', 'server.ts'),
  '--bundle',
  '--platform=node',
  '--target=node20',
  '--format=cjs',
  `--outfile=${path.join(destination, 'dist', 'server.js')}`,
  '--sourcemap',
], {
  cwd: backendRoot,
  stdio: 'inherit',
});
fs.cpSync(path.join(backendRoot, 'migrations'), path.join(destination, 'migrations'), { recursive: true });
fs.copyFileSync(path.join(backendRoot, 'package.json'), path.join(destination, 'package.json'));
console.log(`Standalone backend prepared at ${destination}`);
