import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { clientAddress, createAuthLimiter, proxyMode } from './access.ts';

test('only explicitly trusted loopback proxy headers identify individual public visitors', () => {
  const request = (peer: string, value: string | string[], header = 'cf-connecting-ip') =>
    ({
      socket: { remoteAddress: peer },
      headers: { [header]: value },
    }) as unknown as IncomingMessage;
  assert.equal(clientAddress(request('127.0.0.1', '203.0.113.1'), 'cloudflare'), '203.0.113.1');
  assert.equal(clientAddress(request('127.0.0.1', '203.0.113.1'), 'none'), '127.0.0.1');
  assert.equal(clientAddress(request('192.0.2.1', '203.0.113.1'), 'cloudflare'), '192.0.2.1');
  for (const value of ['bad', '203.0.113.1, 203.0.113.2', ['203.0.113.1']])
    assert.equal(clientAddress(request('127.0.0.1', value), 'cloudflare'), '127.0.0.1');
  assert.equal(
    clientAddress(request('::1', '203.0.113.2', 'x-forwarded-for'), 'caddy'),
    '203.0.113.2',
  );
  assert.equal(clientAddress(request('::1', '2001:0db8::0001'), 'cloudflare'), '[2001:db8::1]');
  assert.throws(() => proxyMode('yes'));
});

test('login quotas separate visitors, cap one account across addresses and expire without extending lockout', () => {
  let time = 1000;
  const limit = createAuthLimiter(() => time);
  for (let i = 0; i < 60; i++) assert.equal(limit('visitor-a', 'account-' + i), 0);
  assert.equal(limit('visitor-a', 'next'), 60);
  assert.equal(limit('visitor-b', 'next'), 0);
  for (let i = 0; i < 20; i++) assert.equal(limit('other-' + i, 'target'), 0);
  assert.equal(limit('different', 'target'), 60);
  time += 31000;
  assert.equal(limit('different', 'target'), 29);
  time += 29000;
  assert.equal(limit('different', 'target'), 0);
  assert.equal(limit('visitor-a', 'next'), 0);
  assert.equal(createAuthLimiter(() => time)('visitor-a', 'next'), 0);
});
