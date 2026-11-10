import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPlayerApp } from './app.ts';
import { createPlayerStore } from './store.ts';
import { heroes } from '../../src/player/catalog.ts';

test('oversized chunked upload receives JSON 413 instead of a reset connection', async (t) => {
  const store = createPlayerStore(':memory:'),
    app = createPlayerApp(store, heroes);
  let aborted = false;
  app.on('request', (req) =>
    req.on('aborted', () => {
      aborted = true;
    }),
  );
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  t.after(async () => {
    app.closeAllConnections();
    await new Promise<void>((r) => app.close(() => r()));
    store.close();
  });
  const port = (app.address() as AddressInfo).port;
  const result = await new Promise<{ status: number | undefined; body: string }>(
    (accept, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/pool',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => accept({ status: res.statusCode, body }));
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.setTimeout(5000, () => req.destroy(Error('test request timed out')));
      // Unknown total length: exceed the default 128 KiB limit before the request ends.
      req.write('{"padding":"' + 'x'.repeat(160 * 1024));
      const end = setTimeout(() => req.end('"}'), 50);
      t.after(() => clearTimeout(end));
    },
  );
  assert.equal(result.status, 413);
  assert.match(JSON.parse(result.body).error, /过大/);
  assert.equal(
    aborted,
    false,
    'size-limit rejection must not abort the incoming stream before its response',
  );
});
