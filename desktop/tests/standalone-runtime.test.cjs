const assert = require('node:assert/strict');
const test = require('node:test');

test('standalone runtime reserves a loopback-only TCP port', async () => {
  const { reserveLoopbackPort } = require('../dist/standalone-runtime.js');
  const port = await reserveLoopbackPort();
  assert.equal(Number.isSafeInteger(port), true);
  assert.equal(port > 0 && port <= 65535, true);
});
