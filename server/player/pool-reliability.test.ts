import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Hero } from '../../src/player/model.ts';
import { createPlayerStore } from './store.ts';
import { createPlayerApp } from './app.ts';
import { emptyProfile } from '../../src/player/pro/model.ts';

test('profile compare-and-save rejects stale manual or screenshot writes and isolates owners', () => {
  const store = createPlayerStore(':memory:');
  try {
    const expected = emptyProfile();
    assert.equal(store.saveProfile(expected, { ...expected, peakScore: 1800 }).conflict, false);
    assert.equal(store.saveProfile(expected, { ...expected, peakEnergy: 30 }).conflict, true);
    assert.equal(store.pro().profile.peakScore, 1800);
    assert.equal(store.pro().profile.peakEnergy, undefined);
    assert.equal(
      store.forUser('other').saveProfile(expected, { ...expected, peakScore: 1600 }).conflict,
      false,
    );
    assert.equal(store.pro().profile.peakScore, 1800);
    const latest = store.pro().profile;
    assert.equal(store.saveProfile(latest, { ...latest, peakEnergy: 30 }).conflict, false);
    assert.equal(store.pro().profile.peakEnergy, 30);
  } finally {
    store.close();
  }
});

test('independent hero edits survive stale clients and reopen; same-hero conflicts are atomic and audited', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaiju-pool-'));
  const path = join(dir, 'pool.sqlite');
  let store = createPlayerStore(path);
  try {
    store.pool([{ heroId: 544, level: 'main' }]);
    assert.equal(
      store.poolEdit([{ heroId: 190, expected: null, level: 'learning' }]).conflict,
      false,
    );
    assert.equal(
      store.poolEdit([{ heroId: 107, expected: null, level: 'comfortable' }]).conflict,
      false,
    );
    const before = store.workspace().pool;
    const history = store.poolHistory();
    assert.equal(
      store.poolEdit([
        { heroId: 544, expected: 'learning', level: null },
        { heroId: 190, expected: 'learning', level: null },
      ]).conflict,
      true,
    );
    assert.deepEqual(store.workspace().pool, before);
    assert.deepEqual(store.poolHistory(), history);
    store.close();
    store = createPlayerStore(path);
    assert.deepEqual(store.workspace().pool, before);
    assert.equal(store.poolHistory().length, 3);
    assert.deepEqual(store.poolHistory()[0].before, [
      { heroId: 544, level: 'main' },
      { heroId: 190, level: 'learning' },
    ]);
    assert.deepEqual(store.poolHistory()[0].after, before);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pool API isolates accounts and history, merges guest records once, and rejects conflicting or invalid edits', async (t) => {
  const store = createPlayerStore(':memory:');
  const heroes = JSON.parse(
    readFileSync(new URL('../../src/player/data/heroes.json', import.meta.url), 'utf8'),
  ).heroes as Hero[];
  const app = createPlayerApp(store, heroes);
  await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise<void>((resolve) => app.close(() => resolve()));
    store.close();
  });
  const base = 'http://127.0.0.1:' + (app.address() as AddressInfo).port;
  const post = (path: string, data: unknown, token?: string) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify(data),
    });
  const get = (token?: string) =>
    fetch(base + '/api/pool-status', {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    }).then((r) => r.json());
  store.pool([
    { heroId: 544, level: 'main' },
    { heroId: 190, level: 'learning' },
  ]);
  const auth = await (
    await post('/api/auth/register', {
      username: 'pooltest',
      name: '测试账号',
      password: 'pool-test-password',
    })
  ).json();
  assert.ok(auth.token);
  assert.equal((await get(auth.token)).mode, 'account');
  assert.deepEqual((await get(auth.token)).pool, []);
  assert.deepEqual((await get(auth.token)).history, []);
  assert.equal(
    (
      await post(
        '/api/pool-edit',
        { changes: [{ heroId: 544, expected: null, level: 'comfortable' }] },
        auth.token,
      )
    ).status,
    200,
  );
  assert.equal((await post('/api/pool-import-guest', {}, auth.token)).status, 200);
  const merged = await get(auth.token);
  assert.deepEqual(merged.pool, [
    { heroId: 544, level: 'comfortable' },
    { heroId: 190, level: 'learning' },
  ]);
  assert.deepEqual((await get()).pool, [
    { heroId: 544, level: 'main' },
    { heroId: 190, level: 'learning' },
  ]);
  await post('/api/pool-import-guest', {}, auth.token);
  assert.deepEqual((await get(auth.token)).history, merged.history);
  assert.equal(
    (
      await post(
        '/api/pool-edit',
        { changes: [{ heroId: 544, expected: null, level: 'main' }] },
        auth.token,
      )
    ).status,
    409,
  );
  for (const changes of [
    [],
    [{ heroId: 999999, expected: null, level: 'main' }],
    [{ heroId: 544, expected: 'comfortable', level: 'invalid' }],
    [
      { heroId: 544, expected: null, level: 'main' },
      { heroId: 544, expected: null, level: null },
    ],
  ]) {
    assert.equal((await post('/api/pool-edit', { changes }, auth.token)).status, 400);
  }
  assert.equal((await post('/api/pool-import-guest', {})).status, 400);
  assert.equal(
    (await fetch(base + '/api/pool-status', { headers: { Authorization: 'Bearer expired-token' } }))
      .status,
    401,
  );
  assert.deepEqual((await get(auth.token)).pool, merged.pool);
  const profile = emptyProfile();
  assert.equal(
    (
      await post(
        '/api/pro/profile-save',
        { expected: profile, profile: { ...profile, peakScore: 1900 } },
        auth.token,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await post(
        '/api/pro/profile-save',
        { expected: profile, profile: { ...profile, peakScore: 1800 } },
        auth.token,
      )
    ).status,
    409,
  );
  assert.equal((await post('/api/pro/profile-save', { profile }, auth.token)).status, 400);
  assert.equal(store.pro().profile.peakScore, profile.peakScore);
  assert.equal(
    (
      await post(
        '/api/pool-restore',
        {
          pool: [
            { heroId: 544, level: 'main' },
            { heroId: 107, level: 'learning' },
          ],
        },
        auth.token,
      )
    ).status,
    200,
  );
  assert.deepEqual((await get(auth.token)).pool, [
    ...merged.pool,
    { heroId: 107, level: 'learning' },
  ]);
  assert.equal(
    (await post('/api/pool-restore', { pool: [{ heroId: 999999, level: 'main' }] }, auth.token))
      .status,
    400,
  );
  assert.deepEqual((await get()).pool, [
    { heroId: 544, level: 'main' },
    { heroId: 190, level: 'learning' },
  ]);
});
