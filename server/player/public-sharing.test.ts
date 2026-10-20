import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPlayerStore } from './store.ts';
import { createPlayerApp } from './app.ts';
import { heroes } from '../../src/player/catalog.ts';

test('public sharing isolates accounts, requires login for writes and never exposes local file handoff', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kaiju-public-'));
  const store = createPlayerStore(join(directory, 'share.sqlite'));
  const origin = 'https://share.example.com';
  const server = createPlayerApp(store, heroes, {
    publicOrigin: origin,
    trustedProxy: 'cloudflare',
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const request = (
    path: string,
    body?: unknown,
    token = '',
    requestOrigin = origin,
    host = 'share.example.com',
    forwarded?: string,
  ) =>
    new Promise<{ status: number; json: () => Promise<any> }>((resolve, reject) => {
      const req = httpRequest(
        base + path,
        {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            host,
            origin: requestOrigin,
            'Content-Type': 'application/json',
            ...(forwarded ? { 'cf-connecting-ip': forwarded } : {}),
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (text += chunk));
          res.on('end', () =>
            resolve({ status: res.statusCode!, json: async () => JSON.parse(text) }),
          );
        },
      );
      req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  try {
    assert.equal((await request('/api/status')).status, 200);
    assert.equal((await (await request('/api/status')).json()).publicSharing, true);
    assert.equal(
      (await request('/api/status', undefined, '', origin, 'untrusted.example')).status,
      403,
    );
    assert.equal((await request('/api/auth/register', {}, '', 'https://evil.example')).status, 403);
    assert.equal((await request('/api/pool', [])).status, 403);
    assert.equal((await request('/api/pro/review-handoff', {})).status, 403);
    assert.equal((await request('/data/kaiju.sqlite')).status, 404);
    const a = await (
      await request('/api/auth/register', {
        username: 'share_a',
        name: 'A',
        password: 'test-only-password',
      })
    ).json();
    const b = await (
      await request('/api/auth/register', {
        username: 'share_b',
        name: 'B',
        password: 'test-only-password',
      })
    ).json();
    assert.ok(a.token && b.token);
    assert.equal(
      (await request('/api/pool', [{ heroId: 544, level: 'main' }], a.token)).status,
      200,
    );
    assert.deepEqual((await (await request('/api/workspace', undefined, b.token)).json()).pool, []);
    assert.deepEqual((await (await request('/api/workspace')).json()).pool, []);
    assert.equal(
      (await (await request('/api/workspace', undefined, a.token)).json()).pool[0].heroId,
      544,
    );
    assert.equal((await request('/api/pro/review-handoff-result', {}, a.token)).status, 403);
    assert.deepEqual(store.workspace().pool, []);
    // One visitor reaching their limit must not lock out another visitor behind the tunnel.
    for (let i = 0; i < 60; i++) {
      assert.equal(
        (
          await request(
            '/api/auth/login',
            {
              username: 'missing_' + i,
              password: 'test-only-password',
            },
            '',
            origin,
            'share.example.com',
            '198.51.100.1',
          )
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await request(
          '/api/auth/login',
          {
            username: 'missing_next',
            password: 'test-only-password',
          },
          '',
          origin,
          'share.example.com',
          '198.51.100.1',
        )
      ).status,
      429,
    );
    assert.equal(
      (
        await request(
          '/api/auth/login',
          {
            username: 'share_b',
            password: 'test-only-password',
          },
          '',
          origin,
          'share.example.com',
          '198.51.100.2',
        )
      ).status,
      200,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
