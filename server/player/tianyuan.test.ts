import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { heroes } from '../../src/player/catalog.ts';
import {
  parseTianyuan,
  tianyuanStatsSchema,
  tianyuanQuerySchema,
  sourceDate,
} from '../../src/player/pro/tianyuan.ts';
import { createTianyuan, scheduleTianyuan } from '../pro/tianyuan.ts';
const fixture = (name: string) =>
  JSON.parse(readFileSync('tests/fixtures/tianyuan/' + name + '.json', 'utf8'));
const date = '2026-10-13',
  q = { kind: 'stats' as const, date, mode: 5 };
const options = (directory: string) => ({
  directory,
  heroIds: heroes.map((h) => h.id),
  delayMs: 0,
  now: () => Date.parse('2026-10-14T05:00:00Z'),
});

test('actual four-segment responses cover 133 base heroes and preserve Li Xin forms and missing values', () => {
  for (const mode of [1, 3, 4, 5]) {
    const rows = tianyuanStatsSchema.parse(parseTianyuan(fixture('stats-' + mode), { ...q, mode }));
    assert.equal(rows.length, mode === 5 ? 133 : 135);
    assert.deepEqual(
      [...new Set(rows.map((r) => r.baseHeroId ?? r.heroId))].sort((a, b) => a - b),
      heroes.map((h) => h.id).sort((a, b) => a - b),
    );
    if (mode !== 5) {
      assert.equal(rows.find((r) => r.heroId === 50701)?.baseHeroId, 507);
      assert(rows.some((r) => r.heroId === 50702));
    }
  }
  const before = tianyuanStatsSchema.parse(fixture('stats-5-20261012'));
  assert.equal(before.find((r) => r.heroId === 501)?.winRate, null);
  assert.equal(
    tianyuanStatsSchema.parse(fixture('stats-5')).find((r) => r.heroId === 501)?.winRate,
    42.06,
  );
  assert.throws(() => parseTianyuan([...before, before[0]], q), /重复/);
  assert.throws(() => parseTianyuan([{ ...before[0], winRate: 101 }], q));
  assert.throws(() => tianyuanQuerySchema.parse({ kind: 'stats', date: '2026-02-30', mode: 5 }));
  assert.equal(sourceDate(Date.parse('2026-10-13T18:00:00Z')), '2026-10-13');
});

test('public reads are anonymous, serialized, coalesced and archive exact raw bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaiju-ty-'));
  let concurrent = 0,
    max = 0,
    calls = 0;
  const raw = JSON.stringify(fixture('stats-5'));
  const fetcher = (async (url, init) => {
    assert(String(url).startsWith('https://tianyuanzhiyi.com/api/herostats?'));
    assert.deepEqual(init?.headers, { Accept: 'application/json' });
    assert.equal(init?.redirect, 'error');
    calls++;
    max = Math.max(max, ++concurrent);
    await new Promise((r) => setTimeout(r, 5));
    concurrent--;
    return new Response(raw);
  }) as typeof fetch;
  try {
    const source = createTianyuan({ ...options(dir), fetcher });
    const a = source.get(q),
      b = source.get(q);
    assert.equal(a, b);
    const [packet] = await Promise.all([a, source.get({ ...q, mode: 3 })]);
    assert.equal(max, 1);
    assert.equal(calls, 2);
    assert.equal(packet.rawSha256, createHash('sha256').update(raw).digest('hex'));
    assert.equal(await readFile(join(dir, 'raw', packet.rawSha256 + '.json'), 'utf8'), raw);
    assert.equal((await readdir(join(dir, 'raw'))).length, 1);
    assert.equal(packet.sourceClass, 'third-party-public');
    assert.equal((await source.get(q)).cache, 'cached');
    assert.equal(calls, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('expired failure keeps exact dated cache through restart, cooldown does not postpone recovery, and dates never substitute', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaiju-ty-fail-'));
  let now = Date.parse('2026-10-14T05:00:00Z'),
    fail = false,
    calls = 0;
  const fetcher = (async () => {
    calls++;
    if (fail) throw Error('offline');
    return new Response(JSON.stringify(fixture('stats-5')));
  }) as typeof fetch;
  try {
    const source = createTianyuan({ ...options(dir), now: () => now, fetcher });
    const saved = await source.get(q);
    now += 3600001;
    fail = true;
    const stale = await source.get(q);
    assert.equal(stale.cache, 'stale');
    assert.equal(stale.fetchedAt, saved.fetchedAt);
    assert.equal(stale.rawSha256, saved.rawSha256);
    now += 30000;
    await source.get(q);
    assert.equal(calls, 2);
    now += 30001;
    fail = false;
    assert.equal((await source.get(q)).cache, 'fresh');
    assert.equal(calls, 3);
    now += 3600001;
    fail = true;
    const restart = createTianyuan({ ...options(dir), now: () => now, fetcher });
    assert.equal((await restart.get(q)).cache, 'stale');
    await assert.rejects(restart.get({ ...q, date: '2026-10-12' }));
    assert.throws(() => source.get({ ...q, date: '2099-01-01' }), /未来/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('hero responses reject wrong dates and identity; undated statistics do not acquire selected-page dates', async () => {
  assert.throws(
    () => parseTianyuan(fixture('skin-521'), { kind: 'skin', date: '2026-10-12', heroId: 521 }),
    /日期/,
  );
  assert.throws(
    () => parseTianyuan(fixture('duration-521'), { kind: 'duration', heroId: 109 }),
    /身份/,
  );
  const dir = await mkdtemp(join(tmpdir(), 'kaiju-ty-undated-'));
  try {
    const source = createTianyuan({
      ...options(dir),
      fetcher: (async (url) => {
        assert(!String(url).includes('date='));
        return new Response(JSON.stringify(fixture('duration-521')));
      }) as typeof fetch,
    });
    const p = await source.get({ kind: 'duration', heroId: 521, date });
    assert.equal(p.requestedDate, undefined);
    assert.equal(p.sourceUpdatedAt, undefined);
    assert.equal(p.query.date, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('stopping public scheduler during first read prevents more scopes and later scheduling', async () => {
  let release!: () => void,
    calls = 0;
  const pending = new Promise<void>((r) => (release = r));
  const stop = scheduleTianyuan({
    get: async () => {
      calls++;
      await pending;
      throw Error('fixture failure');
    },
  });
  stop();
  release();
  await pending;
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls, 1);
});
