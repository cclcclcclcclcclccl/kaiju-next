import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOfficialRanks, parseOfficialRank } from '../pro/official.ts';

const epoch = Date.parse('2026-10-12T09:00:00Z');
const query = { segment: 3, position: 2 };
const fixture = () => ({
  returnCode: 0,
  data: {
    updateTime: '20261011',
    list: [
      {
        heroId: 521,
        heroInfo: { heroName: '海月' },
        tRank: 'T0',
        winRate: 0.4988,
        showRate: 0.059,
        banRate: 0.8006,
      },
    ],
  },
});

test('official fractions keep their source date and partial coverage without inventing samples or BP rates', () => {
  const result = parseOfficialRank(fixture(), query, epoch);
  assert.deepEqual(result.rows[0], {
    heroId: 521,
    name: '海月',
    heat: 'T0',
    winRate: 49.88,
    pickRate: 5.9,
    banRate: 80.06,
  });
  assert.equal(result.sourceUpdatedOn, '2026-10-11');
  assert.equal(result.fetchedAt, '2026-10-12T09:00:00.000Z');
  assert.equal(result.coverage, 'partial');
  for (const mutate of [
    (r: any) => {
      r.returnCode = -30314;
    },
    (r: any) => {
      r.data.updateTime = '20260230';
    },
    (r: any) => {
      r.data.updateTime = '20261020';
    },
    (r: any) => {
      r.data.list[0].winRate = 49.88;
    },
    (r: any) => {
      r.data.list[0].showRate = null;
    },
    (r: any) => {
      r.data.list.push(r.data.list[0]);
    },
    (r: any) => {
      r.data.list = [];
    },
  ]) {
    const raw = fixture();
    mutate(raw);
    assert.throws(() => parseOfficialRank(raw, query, epoch));
  }
});

test('concurrent public requests share one anonymous fetch and distinct segments keep separate caches', async () => {
  let calls = 0;
  const service = createOfficialRanks({
    now: () => epoch,
    fetcher: async (url, init) => {
      calls++;
      assert.equal(
        String(url),
        'https://kohcamp.qq.com/gametoolbox/hero/getsharepagedetailranklistbyid',
      );
      assert.deepEqual(init?.headers, { 'Content-Type': 'application/json', kohDimGender: '2' });
      assert.equal(init?.redirect, 'error');
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(Object.keys(body).sort(), [
        'cSystem',
        'eId',
        'h5Get',
        'position',
        'rankId',
        'segment',
      ]);
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json(fixture());
    },
  });
  const results = await Promise.all(Array.from({ length: 8 }, () => service.get(query)));
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.data.query.segment === 3));
  assert.equal((await service.get(query)).cache, 'cached');
  await service.get({ ...query, segment: 4 });
  assert.equal(calls, 2);
  assert.throws(() => service.get({ ...query, segment: 6 }));
  assert.throws(() => service.get({ ...query, position: -1 }));
});

test('expired cache survives network or schema failures, including process restart, without changing its timestamp', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaiju-official-test-'));
  try {
    const first = createOfficialRanks({
      cacheDir: dir,
      now: () => epoch,
      fetcher: async () => Response.json(fixture()),
    });
    const original = (await first.get(query)).data;
    let calls = 0;
    let currentTime = epoch + 3600000;
    const restarted = createOfficialRanks({
      cacheDir: dir,
      now: () => currentTime,
      fetcher: async () => {
        calls++;
        return Response.json(
          calls === 1 ? { returnCode: -30314, returnMsg: '登录态参数不全' } : fixture(),
        );
      },
    });
    const result = await restarted.get(query);
    assert.equal(result.cache, 'stale');
    assert.ok(result.warning);
    assert.deepEqual(result.data, original);
    assert.deepEqual(JSON.parse(await readFile(join(dir, '3-2.json'), 'utf8')), original);
    await restarted.get(query);
    assert.equal(calls, 1);
    currentTime += 30000;
    assert.equal((await restarted.get(query)).cache, 'stale');
    assert.equal(calls, 1);
    currentTime += 31000;
    assert.equal((await restarted.get(query)).cache, 'fresh');
    assert.equal(calls, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a failed first request never fabricates a public leaderboard; older upstream dates do not replace good data', async () => {
  const failed = createOfficialRanks({
    fetcher: async () => new Response('unavailable', { status: 503 }),
  });
  await assert.rejects(failed.get(query), /没有用示例数据代替/);
  let now = epoch;
  const service = createOfficialRanks({
    now: () => now,
    fetcher: async () => {
      const raw = fixture();
      if (now !== epoch) raw.data.updateTime = '20261010';
      return Response.json(raw);
    },
  });
  await service.get(query);
  now += 3600000;
  const result = await service.get(query);
  assert.equal(result.cache, 'stale');
  assert.equal(result.data.sourceUpdatedOn, '2026-10-11');
});
