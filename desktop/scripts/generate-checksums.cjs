const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const releaseDirectory = path.resolve(__dirname, '..', 'release');
const artifacts = fs.readdirSync(releaseDirectory)
  .filter((name) => /\.(dmg|zip|exe)$/i.test(name))
  .sort();
if (artifacts.length === 0) throw new Error('No installer artifacts were found');

for (const name of artifacts) {
  const artifact = path.join(releaseDirectory, name);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
  fs.writeFileSync(`${artifact}.sha256`, `${digest}  ${name}\n`, 'utf8');
}
console.log(`Generated SHA-256 sidecars for ${artifacts.length} release artifact(s).`);
