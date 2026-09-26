const base = require('./package.json').build;
const mac = {
  ...base.mac,
  hardenedRuntime: true,
  gatekeeperAssess: false,
  entitlements: 'assets/entitlements.mac.plist',
  entitlementsInherit: 'assets/entitlements.mac.plist',
  notarize: true,
  target: ['dmg', 'zip'],
};
delete mac.identity;

const win = { ...base.win, target: ['nsis'] };
if (process.env.MIZAN_WINDOWS_PUBLISHER) {
  win.publisherName = process.env.MIZAN_WINDOWS_PUBLISHER;
}

module.exports = {
  ...base,
  forceCodeSigning: true,
  generateUpdatesFilesForAllChannels: true,
  publish: [{ provider: 'generic', url: process.env.MIZAN_UPDATE_URL }],
  mac,
  win,
};
