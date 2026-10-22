import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'dist-review';
const manifest = JSON.parse(await readFile(root + '/review-data/manifest.json', 'utf8'));
assert.equal(manifest.format, 'zizai-public-review-v1');
const forbidden = ['workspace', 'personal', 'account', 'password', 'token'];
for (const [key, entry] of Object.entries(manifest.entries)) {
  assert.ok(!forbidden.some((word) => key.includes(word)));
  assert.match(entry.file, /^[a-f0-9]{64}\.json$/);
  const text = await readFile(root + '/review-data/' + entry.file, 'utf8');
  assert.equal(createHash('sha256').update(text).digest('hex'), entry.sha256);
  const packet = JSON.parse(text);
  if (packet.query?.date) assert.ok(/^2026-\d{2}-\d{2}$/.test(packet.query.date));
  if (packet.rawSha256) assert.match(packet.rawSha256, /^[a-f0-9]{64}$/);
}
const top = await readdir(root);
assert.ok(!top.some((p) => ['data', 'private', '.env', '.git', 'node_modules'].includes(p)));
const html = await readFile(root + '/index.html', 'utf8');
assert.ok(html.includes('/kaiju-next/assets/'));
assert.ok(!html.includes('127.0.0.1'));
console.log(
  JSON.stringify({
    passed: true,
    entries: Object.keys(manifest.entries).length,
    defaultDate: manifest.defaultDate,
    checks: [
      'all archived payload hashes',
      'explicit public data keys',
      'no personal database directories',
      'repository subpath assets',
    ],
  }),
);
