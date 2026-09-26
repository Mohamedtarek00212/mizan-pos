const target = process.argv[2];

const missing = (names) => names.filter((name) => !process.env[name]?.trim());
let required = ['MIZAN_UPDATE_URL'];

if (target === 'mac') {
  required = required.concat(['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_TEAM_ID']);
  const hasApiKey = missing(['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']).length === 0;
  const hasAppleId = missing(['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD']).length === 0;
  if (!hasApiKey && !hasAppleId) {
    console.error('Missing Apple notarization credentials: configure an API key or Apple ID app password.');
    process.exit(1);
  }
} else if (target === 'win') {
  required = required.concat(['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD']);
} else {
  console.error('Expected release target: mac or win.');
  process.exit(1);
}

const absent = missing(required);
if (absent.length) {
  console.error(`Missing release environment variables: ${absent.join(', ')}`);
  process.exit(1);
}

let updateUrl;
try {
  updateUrl = new URL(process.env.MIZAN_UPDATE_URL);
} catch {
  console.error('MIZAN_UPDATE_URL must be a valid HTTPS URL.');
  process.exit(1);
}
if (updateUrl.protocol !== 'https:') {
  console.error('MIZAN_UPDATE_URL must use HTTPS.');
  process.exit(1);
}

console.log(`Release prerequisites validated for ${target}; secrets were not printed.`);
