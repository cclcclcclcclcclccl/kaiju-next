import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKplCases } from '../pro/kpl.ts';
test('official replay index uses anonymous read requests, preserves exact sources and retains dated cache on failure', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'kaiju-kpl-'));
  const original = JSON.parse(await readFile('tests/fixtures/kpl/schedule.json', 'utf8'));
  const schedule = {
    ...original,
    data: {
      ...original.data,
      list: original.data.list
        .filter((s: { schedule_status: number }) => s.schedule_status === 4)
        .slice(0, 1),
    },
  };
  const detail = await readFile('tests/fixtures/kpl/detail.json', 'utf8');
  let now = Date.parse('2026-10-14T15:00:00Z'),
    calls = 0,
    failed = false;
  const source = createKplCases(
    folder,
    (async (url, init) => {
      calls++;
      assert.equal(init?.method, 'POST');
      assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
      if (failed) throw Error('controlled failure');
      if (String(url).endsWith('getScheduleDetail'))
        assert.deepEqual(JSON.parse(String(init?.body)), {
          seasonid: schedule.data.list[0].seasonid,
          scheduleid: schedule.data.list[0].scheduleid,
        });
      return new Response(
        String(url).endsWith('getScheduleList') ? JSON.stringify(schedule) : detail,
      );
    }) as typeof fetch,
    () => now,
  );
  try {
    const [a, b] = await Promise.all([source.get(), source.get()]);
    assert.deepEqual(a, b);
    assert.equal(calls, 2);
    assert.equal(a.trained, false);
    assert.equal(a.matches[0].rounds.length, 5);
    assert(a.matches[0].rounds[0].url.startsWith('https://kpl.qq.com/PlayBack?'));
    assert.equal(a.matches[0].rounds[0].heroes.length, 10);
    assert.equal(
      await readFile(join(folder, 'raw', a.sources[1].rawSha256 + '.json'), 'utf8'),
      detail,
    );
    assert.equal((await source.get()).cache, 'cached');
    assert.equal(calls, 2);
    now += 3600001;
    failed = true;
    const stale = await source.get();
    assert.equal(stale.cache, 'stale');
    assert.equal(stale.fetchedAt, a.fetchedAt);
    assert.deepEqual(stale.matches, a.matches);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
