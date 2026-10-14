import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { AddressInfo } from 'node:net';
import { createPlayerStore } from './store.ts';
import { createPlayerApp } from './app.ts';
import { backupSchema } from '../../src/player/pro/backup.ts';
import { emptyDraft } from '../../src/player/model.ts';
import { createTianyuan } from '../pro/tianyuan.ts';
const heroes = JSON.parse(readFileSync('src/player/data/heroes.json', 'utf8')).heroes;
const frame = 'data:image/jpeg;base64,/9j/2Q=='; // Synthetic minimal bytes, not gameplay evidence.
const review = () => ({
  title: '测试复盘',
  heroId: 544,
  videoName: 'synthetic.webm',
  events: [
    {
      id: randomUUID(),
      second: 1,
      label: '测试帧',
      observation: '仅测试数据保存',
      decision: '',
      allies: null,
      enemies: null,
      allyGold: null,
      enemyGold: null,
      objectiveIn: null,
      ultimateReady: null,
      frame,
    },
  ],
});

test('personal restore protects other owners, checks stale preview and preserves a complete checkpoint', () => {
  const root = createPlayerStore(':memory:');
  try {
    const local = root,
      other = root.forUser('other');
    local.pool([{ heroId: 544, level: 'main' }]);
    other.pool([{ heroId: 190, level: 'learning' }]);
    local.addReview(review());
    local.addPlan('测试备战', emptyDraft(), 544, '测试说明');
    const saved = backupSchema.parse({
      format: 'kaiju-personal-backup-v1',
      exportedAt: new Date().toISOString(),
      data: local.personalState(),
    });
    const expected = local.stateRevision();
    local.pool([]);
    assert.equal(local.restorePersonal(expected, saved.data).conflict, true);
    assert.equal(local.restoreCheckpoint(), null);
    const pre = local.personalState();
    assert.equal(local.restorePersonal(local.stateRevision(), saved.data).conflict, false);
    assert.deepEqual(local.restoreCheckpoint(), pre);
    assert.equal(local.personalState().reviews[0].events[0].frame, frame);
    assert.deepEqual(local.workspace().pool, saved.data.pool);
    assert.equal(local.personalState().plans.length, 1);
    assert.notEqual(local.personalState().plans[0].id, saved.data.plans[0].id);
    assert.deepEqual(other.workspace().pool, [{ heroId: 190, level: 'learning' }]);
    assert.equal(local.pro().profile.sharePool, false);
  } finally {
    root.close();
  }
});

test('failed full restore rolls back records and checkpoint together', () => {
  const folder = mkdtempSync(join(tmpdir(), 'kaiju-rollback-'));
  const path = join(folder, 'db.sqlite');
  const root = createPlayerStore(path);
  try {
    root.pool([{ heroId: 544, level: 'main' }]);
    const incoming = root.personalState();
    incoming.pool = [];
    incoming.plans = [
      {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        name: '测试',
        draft: emptyDraft(),
        heroId: 544,
        summary: '测试',
      },
    ];
    const db = new DatabaseSync(path);
    db.exec(
      "CREATE TRIGGER fail_plan BEFORE INSERT ON plans BEGIN SELECT RAISE(ABORT, 'test rollback'); END",
    );
    db.close();
    const revision = root.stateRevision();
    assert.throws(() => root.restorePersonal(revision, incoming), /test rollback/);
    assert.equal(root.stateRevision(), revision);
    assert.equal(root.restoreCheckpoint(), null);
  } finally {
    root.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('review conflicts keep original frames and deleted reviews cannot be resurrected by stale saves', () => {
  const store = createPlayerStore(':memory:');
  try {
    const payload = review();
    const a = store.saveReview(payload, undefined, null);
    assert.ok(a.review);
    const b = store.saveReview({ ...payload, title: '新版' }, a.review.id, a.revision);
    assert.equal(b.conflict, false);
    assert.equal(
      store.saveReview({ ...payload, title: '旧页面' }, a.review.id, a.revision).conflict,
      true,
    );
    assert.equal(store.pro().reviews[0].events[0].frame, frame);
    store.removeReview(a.review.id);
    assert.equal(store.saveReview(payload, a.review.id, b.revision).conflict, true);
  } finally {
    store.close();
  }
});

test('backup HTTP rejects missing confirmation and invalid heroes; static gzip honors q=0 and invalidates changed files', async (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'kaiju-static-'));
  writeFileSync(join(folder, 'test.js'), 'const test=1;'.repeat(300));
  const store = createPlayerStore(':memory:');
  const app = createPlayerApp(store, heroes, { dist: folder });
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise<void>((r) => app.close(() => r()));
    store.close();
    rmSync(folder, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + (app.address() as AddressInfo).port;
  const post = (path: string, data: unknown) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  const backup = await (await fetch(base + '/api/backup')).json();
  const preview = await (await post('/api/backup/preview', { backup })).json();
  assert.equal(
    (await post('/api/backup/restore', { backup, expectedRevision: preview.revision })).status,
    400,
  );
  backup.data.pool = [{ heroId: 999999, level: 'main' }];
  assert.equal((await post('/api/backup/preview', { backup })).status, 400);
  assert.equal(
    (await fetch(base + '/api/backup', { headers: { Authorization: 'Bearer invalid' } })).status,
    401,
  );
  const input = {
    heroId: 544,
    role: '打野' as const,
    outcome: 'win' as const,
    kills: 1,
    deaths: 1,
    assists: 1,
    minutes: 15,
    focus: '兵线与发育' as const,
    note: '测试',
    nextAction: '测试目标',
    playedOn: '2026-10-14',
  };
  const match = store.addMatch(input);
  assert.equal(
    (
      await post('/api/match-update', {
        id: match.id,
        match: { ...input, nextAction: '新版目标' },
        expected: match,
      })
    ).status,
    200,
  );
  assert.equal(
    (await post('/api/match-check', { id: match.id, done: true, expected: match })).status,
    409,
  );
  assert.equal(
    (await post('/api/match-update', { id: match.id, match: input, expected: match })).status,
    409,
  );
  assert.equal(store.matchById(match.id)?.nextAction, '新版目标');
  const gzip = await fetch(base + '/test.js', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(gzip.headers.get('content-encoding'), 'gzip');
  assert.equal(await gzip.text(), 'const test=1;'.repeat(300));
  assert.ok(Number(gzip.headers.get('content-length')) < 500);
  const plain = await fetch(base + '/test.js', { headers: { 'Accept-Encoding': 'gzip;q=0' } });
  assert.equal(plain.headers.get('content-encoding'), null);
  assert.equal(await plain.text(), 'const test=1;'.repeat(300));
  writeFileSync(join(folder, 'test.js'), 'const changed=2;'.repeat(300));
  assert.equal(
    await (await fetch(base + '/test.js', { headers: { 'Accept-Encoding': 'gzip' } })).text(),
    'const changed=2;'.repeat(300),
  );
});

test('source status is read-only and distinguishes missing, cached, expired and failed refresh', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'kaiju-health-'));
  let now = Date.parse('2026-10-14T12:00:00Z'),
    calls = 0,
    fail = false;
  const fixture = JSON.parse(readFileSync('tests/fixtures/tianyuan/stats-5.json', 'utf8'));
  const source = createTianyuan({
    directory: folder,
    heroIds: heroes.map((h: { id: number }) => h.id),
    now: () => now,
    delayMs: 0,
    fetcher: async () => {
      calls++;
      if (fail) throw Error('test source unavailable');
      return new Response(JSON.stringify(fixture));
    },
  });
  try {
    assert.ok((await source.status()).rows.every((r) => r.state === 'missing'));
    assert.equal(calls, 0);
    await source.get({ kind: 'stats', date: '2026-10-13', mode: 5 });
    assert.equal((await source.status()).rows.find((r) => r.mode === 5)!.state, 'cached');
    assert.equal(calls, 1);
    now += 3600001;
    assert.equal((await source.status()).rows.find((r) => r.mode === 5)!.state, 'expired');
    fail = true;
    await source.get({ kind: 'stats', date: '2026-10-13', mode: 5 });
    assert.equal((await source.status()).rows.find((r) => r.mode === 5)!.state, 'stale');
    assert.equal(calls, 2);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('oversized full backups are rejected before preview and existing oversized data cannot lose its checkpoint', async (t) => {
  const store = createPlayerStore(':memory:');
  const app = createPlayerApp(store, heroes);
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise<void>((r) => app.close(() => r()));
    store.close();
  });
  const base = 'http://127.0.0.1:' + (app.address() as AddressInfo).port;
  const post = (path: string, data: unknown) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  const empty = await (await fetch(base + '/api/backup')).json();
  const oversized = structuredClone(empty);
  const largeFrame = 'data:image/jpeg;base64,' + 'A'.repeat(321000);
  oversized.data.reviews = Array.from({ length: 7 }, () => ({
    ...review(),
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    events: Array.from({ length: 30 }, () => ({ ...review().events[0], frame: largeFrame })),
  }));
  const valid = backupSchema.parse(oversized);
  const bytes = Buffer.byteLength(JSON.stringify(valid));
  assert.ok(bytes > 64 * 1024 * 1024 && bytes < 65 * 1024 * 1024);
  assert.equal((await post('/api/backup/preview', { backup: valid })).status, 413);
  // Simulate accumulated saved reviews, which can exceed the single-file export limit.
  store.restorePersonal(store.stateRevision(), valid.data);
  const revision = store.stateRevision();
  const checkpoint = store.restoreCheckpoint();
  assert.equal((await fetch(base + '/api/backup')).status, 413);
  assert.equal(
    (
      await post('/api/backup/restore', {
        backup: empty,
        expectedRevision: revision,
        confirmed: true,
      })
    ).status,
    413,
  );
  assert.equal(store.stateRevision(), revision);
  assert.deepEqual(store.restoreCheckpoint(), checkpoint);
});
