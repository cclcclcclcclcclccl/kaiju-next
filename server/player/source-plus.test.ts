import { sourceDate } from '../../src/player/pro/tianyuan.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  PLUS_ROUTES,
  parsePlus,
  plusUrl,
  plusQuerySchema,
  publicImage,
} from '../../src/player/pro/sourcePlus.ts';
import type { PlusKind } from '../../src/player/pro/sourcePlus.ts';
import { createSourcePlus } from '../pro/sourcePlus.ts';
import { referencePower } from '../../src/player/pro/powerFormula.ts';
import { heroes } from '../../src/player/catalog.ts';
import { appendSessionMove, replaySession, roundsFor } from '../../src/player/pro/bpSession.ts';
import {
  parseSeries,
  seedSeriesGame,
  finishSeriesGame,
  nextSeriesGame,
  usedByTeam,
  seriesScore,
} from '../../src/player/pro/seriesBp.ts';
import type { Series } from '../../src/player/pro/seriesBp.ts';
const fixture = async (kind: string) =>
  JSON.parse(await readFile('tests/fixtures/source-plus/' + kind + '.json', 'utf8'));
test('captured source fixtures retain source values including global rates above 100 and unknown timings', async () => {
  const manifest = await fixture('manifest');
  for (const kind of Object.keys(manifest) as PlusKind[]) {
    const raw = await fixture(kind),
      data = parsePlus(raw, kind);
    assert.ok(data);
    assert.deepEqual(parsePlus(data, kind), data);
  }
  const equip = parsePlus(await fixture('equipment'), 'equipment');
  assert.ok(equip.equipmentStats.some((r: any) => r.pickRate > 100));
  const jungle = parsePlus(await fixture('jungle'), 'jungle');
  assert.equal(jungle.blue.patterns[0].avgFullClear, null);
  const battle = parsePlus(await fixture('matches'), 'matches');
  assert.ok(battle.totalMatchesFound > battle.matchIds.length);
  assert.ok(battle.camp1WinRate <= 1);
  assert.throws(() =>
    parsePlus(
      { equipmentStats: [{ id: 1, name: 'invalid', pickRate: 4, winRate: 101 }] },
      'equipment',
    ),
  );
  assert.throws(() => parsePlus({ success: false, error: 'denied' }, 'votes'));
});
test('source query allowlist rejects injected hosts, extra keys, incomplete matches, bad dates and duplicate recommendations', () => {
  assert.equal(plusQuerySchema.safeParse({ kind: 'overview', date: '2026-02-30' }).success, false);
  assert.throws(() => plusUrl({ kind: 'match', gameId: 'https://example.com' }));
  assert.throws(() => plusUrl({ kind: 'skins', heroId: 190 }));
  assert.throws(() => plusUrl({ kind: 'matches', camp1Heroes: '{"1":190}', camp2Heroes: '{}' }));
  assert.throws(() => plusUrl({ kind: 'recommend', heroIds: '[190,190]' }));
  assert.throws(() =>
    plusUrl({ kind: 'matches', camp1Heroes: '{"6":190}', camp2Heroes: '{"1":521}' }),
  );
  assert.equal(publicImage('javascript:alert(1)'), undefined);
  assert.equal(publicImage('https://evil.test/icon.png'), undefined);
  assert.ok(
    plusUrl({ kind: 'matches', camp1Heroes: '{"1":190}', camp2Heroes: '{"1":521}' }).startsWith(
      'https://tianyuanzhiyi.com/api/match/find?',
    ),
  );
});
test('source fetch deduplicates, persists raw hash, survives restart and reports same-query stale cache on outage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaiju-plus-'));
  let calls = 0;
  const data = await fixture('allStats'),
    raw = JSON.stringify(data),
    query = { kind: 'allStats' as const, date: '2026-10-18', gameMode: 5 };
  const fetcher = async () => {
    calls++;
    return new Response(raw);
  };
  try {
    const source = createSourcePlus(dir, fetcher as typeof fetch),
      [a, b] = await Promise.all([source.get(query), source.get(query)]);
    assert.equal(calls, 1);
    assert.deepEqual(a, b);
    assert.equal(a.rawSha256, createHash('sha256').update(raw).digest('hex'));
    const restarted = createSourcePlus(dir, async () => {
      throw Error('offline');
    });
    assert.equal((await restarted.get(query)).cache, 'cached');
    const key = createHash('sha256').update(plusUrl(query)).digest('hex');
    await writeFile(
      join(dir, 'cache', key + '.json'),
      JSON.stringify({ ...a, fetchedAt: '2026-01-01T00:00:00Z' }),
    );
    const stale = await createSourcePlus(dir, async () => {
      throw Error('offline');
    }).get(query);
    assert.equal(stale.cache, 'stale');
    assert.equal(stale.fetchedAt, '2026-01-01T00:00:00Z');
    assert.deepEqual(stale.data, a.data);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('power formula reproduces observed reference inputs and rejects silently truncated user input', () => {
  assert.equal(Math.round(referencePower(6100, 2100, 0, 2100).total), 12584);
  assert.equal(referencePower(6100, 2100, 12, 2100).challengeCoefficient, 0.192);
  assert.equal(referencePower(6100, 1200, 0, 1200).total, 6100);
  assert.throws(() => referencePower(6100, 2100, 12.5, 2100));
  assert.throws(() => referencePower(6200, 2100, 0, 2100));
});
function complete(s: Series) {
  let session = s.games.at(-1)!.session;
  while (session.moves.length < roundsFor(session.format).length) {
    const pos = replaySession(session),
      turn = roundsFor(session.format)[session.moves.length],
      used = [...pos.banned, ...Object.values(pos.allies), ...Object.values(pos.enemies)];
    const h = heroes.find(
      (h) =>
        !used.includes(h.id) &&
        (turn.kind === 'ban' || !session.unavailable?.[turn.team].includes(h.id)),
    )!;
    session = appendSessionMove(session, h.id);
  }
  return { ...s, games: s.games.map((g, i) => (i === s.games.length - 1 ? { ...g, session } : g)) };
}
test('global BP binds previous picks to the real team across side swaps and rejects corrupt imports', () => {
  let s: Series = { version: 1, bestOf: 3, names: ['A', 'B'], games: [] };
  s.games.push({ blue: 0, session: seedSeriesGame(s, 0) });
  s = finishSeriesGame(complete(s), 0);
  const used = usedByTeam(s);
  assert.equal(used[0].length, 5);
  s = nextSeriesGame(s);
  assert.equal(s.games[1].blue, 1);
  assert.deepEqual(s.games[1].session.unavailable?.enemies, used[0]);
  assert.deepEqual(parseSeries(JSON.parse(JSON.stringify(s))), s);
  assert.throws(() =>
    parseSeries({
      ...s,
      games: [
        s.games[0],
        { ...s.games[1], session: { ...s.games[1].session, unavailable: undefined } },
      ],
    }),
  );
  s = finishSeriesGame(complete(s), 0);
  assert.deepEqual(seriesScore(s), [2, 0]);
  assert.throws(() => nextSeriesGame(s));
});

test('publication-day default respects Beijing midnight and 09:00 instead of asking for unpublished yesterday', () => {
  assert.equal(sourceDate(Date.parse('2026-10-19T16:20:00Z')), '2026-10-18');
  assert.equal(sourceDate(Date.parse('2026-10-20T00:59:59Z')), '2026-10-18');
  assert.equal(sourceDate(Date.parse('2026-10-20T01:00:00Z')), '2026-10-19');
});
