import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRankRefresh, scheduleRankRefresh } from '../pro/refresh.ts';
import { OFFICIAL_RANK_API, OFFICIAL_RANK_PAGE } from '../../src/player/pro/official.ts';
import type { OfficialQuery, OfficialRankResult } from '../../src/player/pro/official.ts';
const result = (
  query: OfficialQuery,
  cache: OfficialRankResult['cache'] = 'fresh',
): OfficialRankResult => ({
  cache,
  data: {
    source: '王者营地官方公开分享榜',
    sourceUrl: OFFICIAL_RANK_PAGE,
    endpoint: OFFICIAL_RANK_API,
    query,
    sourceUpdatedOn: '2026-10-12',
    fetchedAt: '2026-10-13T07:00:00Z',
    coverage: 'partial',
    rows: [{ heroId: 521, name: '海月', heat: 'T0', winRate: 50, pickRate: 5, banRate: 80 }],
  },
});
test('refresh checks all fifteen scopes sequentially, deduplicates overlapping runs and archives unchanged content only once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaiju-refresh-'));
  let calls = 0,
    active = 0,
    max = 0;
  const service = createRankRefresh(
    {
      get: async (q) => {
        calls++;
        max = Math.max(max, ++active);
        await Promise.resolve();
        active--;
        return result(q);
      },
    },
    dir,
  );
  try {
    const a = service.run(),
      b = service.run();
    assert.equal(a, b);
    const state = await a;
    assert.equal(calls, 15);
    assert.equal(max, 1);
    assert.equal(state.results.length, 15);
    assert.equal(new Set(state.results.map((r) => r.segment + '-' + r.position)).size, 15);
    assert.equal(state.nextCheckAt, undefined);
    assert.equal((await service.status()).automatic, false);
    assert.equal((await readdir(join(dir, '2026-10-12'))).length, 15);
    await service.run();
    assert.equal((await readdir(join(dir, '2026-10-12'))).length, 15);
    assert.equal(JSON.parse(await readFile(join(dir, 'status.json'), 'utf8')).results.length, 15);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('failed and stale scopes stay distinguishable and cannot create fresh history or replace original source dates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaiju-refresh-fail-'));
  try {
    const service = createRankRefresh(
      {
        get: async (q) => {
          if (q.position === 1) throw Error('source unavailable');
          return result(q, q.position === 2 ? 'stale' : 'fresh');
        },
      },
      dir,
    );
    service.setAutomatic(true);
    const s = await service.run();
    assert.equal(s.results.filter((r) => r.state === 'error').length, 3);
    assert.equal(s.results.filter((r) => r.state === 'stale').length, 3);
    assert(s.nextCheckAt);
    assert.equal((await readdir(join(dir, '2026-10-12'))).length, 9);
    assert(
      s.results.filter((r) => r.state !== 'error').every((r) => r.sourceDate === '2026-10-12'),
    );
    const restart = createRankRefresh({ get: async (q) => result(q) }, dir);
    const restored = await restart.status();
    assert.equal(restored.running, false);
    assert.equal(restored.automatic, false);
    assert.equal(restored.nextCheckAt, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('stopping scheduler during initial refresh cannot schedule a later run', async () => {
  let resolve!: () => void;
  let enabled = false,
    calls = 0;
  const pending = new Promise<void>((r) => {
    resolve = r;
  });
  const stop = scheduleRankRefresh({
    run: () => {
      calls++;
      return pending;
    },
    setAutomatic: (v) => {
      enabled = v;
    },
  });
  assert.equal(enabled, true);
  assert.equal(calls, 1);
  stop();
  resolve();
  await pending;
  await Promise.resolve();
  assert.equal(enabled, false);
  assert.equal(calls, 1);
});
