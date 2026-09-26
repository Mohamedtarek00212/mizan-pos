const fs = require('node:fs');
const path = require('node:path');
const { Arch } = require('builder-util');

module.exports = async function afterPack(context) {
  const arch = Arch[context.arch];
  const platform = context.electronPlatformName === 'win32' ? 'windows' : context.electronPlatformName;
  const targetPackage = `${platform}-${arch}`;
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  const runtimeRoot = path.join(
    resources,
    'app.asar.unpacked',
    'node_modules',
    '@embedded-postgres',
  );
  const executable = path.join(
    runtimeRoot,
    targetPackage,
    'native',
    'bin',
    context.electronPlatformName === 'win32' ? 'postgres.exe' : 'postgres',
  );
  if (!fs.existsSync(executable)) {
    throw new Error(`Packaged PostgreSQL runtime is missing for ${targetPackage}: ${executable}`);
  }

  for (const entry of fs.readdirSync(runtimeRoot)) {
    if (entry !== targetPackage) {
      fs.rmSync(path.join(runtimeRoot, entry), { recursive: true, force: true });
    }
  }
  for (const required of [
    path.join(resources, 'backend', 'dist', 'server.js'),
    path.join(resources, 'backend', 'migrations', '0020_create_store_settings.sql'),
    path.join(resources, 'renderer', 'index.html'),
  ]) {
    if (!fs.existsSync(required)) throw new Error(`Required packaged resource is missing: ${required}`);
  }
  console.log(`Validated and retained only the ${targetPackage} PostgreSQL runtime.`);
};
