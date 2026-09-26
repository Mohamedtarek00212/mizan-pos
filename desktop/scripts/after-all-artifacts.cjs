const crypto = require('node:crypto');
const fs = require('node:fs');

module.exports = async function afterAllArtifactBuild(context) {
  const distributable = context.artifactPaths.filter((file) => /\.(dmg|zip|exe)$/i.test(file));
  const sidecars = [];
  for (const file of distributable) {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const checksumPath = `${file}.sha256`;
    fs.writeFileSync(checksumPath, `${digest}  ${file.split(/[\\/]/).pop()}\n`, 'utf8');
    sidecars.push(checksumPath);
  }
  return sidecars;
};
