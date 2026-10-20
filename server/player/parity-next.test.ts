import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroes } from '../../src/player/catalog.ts';
import { appendSessionMove, roundsFor, replaySession } from '../../src/player/pro/bpSession.ts';
import {
  seedSeriesGame,
  finishSeriesGame,
  nextSeriesGame,
  parseSeries,
  reviseSeriesGame,
} from '../../src/player/pro/seriesBp.ts';
import type { Series } from '../../src/player/pro/seriesBp.ts';
import { playerHeroDistribution, skinComparison } from '../../src/player/pro/sourceComparisons.ts';
import { suggestScreenshotLayout } from '../../src/player/pro/screenshotLayout.ts';
import type { OcrData } from '../../src/player/pro/screenshot.ts';
import { createPlayerStore } from './store.ts';
function complete(s: Series) {
  let session = s.games.at(-1)!.session;
  while (session.moves.length < roundsFor(session.format).length) {
    const pos = replaySession(session),
      turn = roundsFor(session.format)[session.moves.length];
    const used = [...pos.banned, ...Object.values(pos.allies), ...Object.values(pos.enemies)];
    const h = heroes.find(
      (h) =>
        !used.includes(h.id) &&
        (turn.kind === 'ban' || !session.unavailable?.[turn.team].includes(h.id)),
    )!;
    session = appendSessionMove(session, h.id);
  }
  return { ...s, games: s.games.map((g, i) => (i === s.games.length - 1 ? { ...g, session } : g)) };
}
function start(rule: 'reset' | 'global' = 'global'): Series {
  const s: Series = { version: 1, bestOf: 3, names: ['A', 'B'], decidingRule: rule, games: [] };
  s.games.push({ blue: 0, session: seedSeriesGame(s, 0) });
  return s;
}
test('deciding reset is only the last possible game, import preserves old global rules', () => {
  let s = nextSeriesGame(finishSeriesGame(complete(start('reset')), 0));
  assert.equal(s.games[1].session.unavailable?.allies.length, 5);
  s = nextSeriesGame(finishSeriesGame(complete(s), 1));
  assert.deepEqual(s.games[2].session.unavailable, { allies: [], enemies: [] });
  assert.deepEqual(parseSeries(s), s);
  const old = start();
  delete old.decidingRule;
  assert.equal(parseSeries(old).decidingRule, undefined);
  assert.throws(() => parseSeries({ ...s, decidingRule: 'global' }), /限制/);
});
test('history edit preserves later games, rejects invalid earlier outcomes and branches without mutating original', () => {
  let s = nextSeriesGame(finishSeriesGame(complete(start()), 0));
  s = nextSeriesGame(finishSeriesGame(complete(s), 1));
  const original = JSON.stringify(s);
  const valid = reviseSeriesGame(s, 0, {
    ...s.games[0],
    session: { ...s.games[0].session, mode: 'blue' },
  });
  assert.equal(valid.games.length, 3);
  assert.throws(() => reviseSeriesGame(s, 0, { ...s.games[0], winner: 1 }), /第 3 局/);
  const branch = reviseSeriesGame(s, 0, { ...s.games[0], winner: 1 }, true);
  assert.equal(branch.games.length, 1);
  assert.equal(JSON.stringify(s), original);
  assert.throws(
    () => reviseSeriesGame(s, 0, { ...s.games[0], winner: undefined }),
    /历史比赛尚未确认/,
  );
});
test('history edit rebases hero restrictions and refuses a newly conflicting later pick', () => {
  const s = complete(nextSeriesGame(finishSeriesGame(complete(start()), 0)));
  const nextPick = s.games[1].session.moves.find(
    (m, i) => roundsFor('staged')[i].kind === 'pick' && roundsFor('staged')[i].team === 'enemies',
  )!.heroId;
  const moves = s.games[0].session.moves.map((m) => ({ ...m }));
  const pickIndex = roundsFor('staged').findIndex((t) => t.kind === 'pick' && t.team === 'allies');
  // Swap if the later pick was already a ban in game one; preserve uniqueness.
  const priorIndex = moves.findIndex((m) => m.heroId === nextPick);
  if (priorIndex >= 0) moves[priorIndex].heroId = moves[pickIndex].heroId;
  moves[pickIndex].heroId = nextPick;
  assert.throws(
    () => reviseSeriesGame(s, 0, { ...s.games[0], session: { ...s.games[0].session, moves } }),
    /第 2 局.*使用过/,
  );
});
test('player distribution uses returned records, deduplicates per-player heroes and excludes missing power from averages', () => {
  const rows = playerHeroDistribution([
    {
      heroPowerRanks: [
        { heroId: 190, powerValue: 100, rankNo: 5 },
        { heroId: 190, powerValue: 200, rankNo: 3 },
      ],
    },
    { heroPowerRanks: [{ heroId: 190, powerValue: null }] },
    {},
  ]);
  assert.equal(rows[0].players, 2);
  assert.equal(rows[0].percent, (2 / 3) * 100);
  assert.equal(rows[0].averagePower, 200);
  assert.equal(rows[0].powerSamples, 1);
  assert.equal(rows[0].bestRank, 3);
  const real = JSON.parse(readFileSync('tests/fixtures/source-plus/players.json', 'utf8'));
  for (const row of playerHeroDistribution(real.players))
    assert.ok(row.players <= real.players.length);
});
test('skin comparison sorts dates, keeps missing values null and does not mutate captured source', () => {
  const rows = [
    { date: '2026-10-02', skins: [] },
    {
      date: '2026-10-01',
      skins: [
        { id: 1, pickRate: 0 },
        { id: 2, pickRate: 50 },
      ],
    },
  ];
  const before = JSON.stringify(rows),
    out = skinComparison(rows, ['1', '2']);
  assert.equal(out[0]['1'], 0);
  assert.equal(out[1]['1'], null);
  assert.equal(out[0]['2'], 50);
  assert.equal(JSON.stringify(rows), before);
});
test('synthetic OCR coordinate test suggests two sides but refuses duplicates and low confidence', () => {
  const line = (text: string, x: number) => ({
    text,
    confidence: 0.95,
    box: [
      [x, 100],
      [x + 50, 100],
      [x + 50, 120],
      [x, 120],
    ],
  });
  const ocr: OcrData = {
    width: 1000,
    height: 600,
    sha256: 'test-only',
    engine: 'synthetic-test',
    lines: [line('诸葛亮', 100), line('赵怀真', 700)],
  };
  const picks = suggestScreenshotLayout(ocr, 'lr');
  assert.equal(picks.length, 2);
  assert.ok(picks.find((p) => p.heroId === 190)?.key.startsWith('1:'));
  assert.ok(picks.find((p) => p.heroId === 544)?.key.startsWith('2:'));
  assert.throws(
    () => suggestScreenshotLayout({ ...ocr, lines: [...ocr.lines, line('诸葛亮', 200)] }, 'lr'),
    /重复/,
  );
  assert.throws(
    () =>
      suggestScreenshotLayout(
        { ...ocr, lines: ocr.lines.map((l) => ({ ...l, confidence: 0.1 })) },
        'lr',
      ),
    /清晰/,
  );
});
test('server BP storage isolates account spaces and rejects stale writes', () => {
  const root = createPlayerStore(':memory:');
  try {
    const a = root.forUser('test-a'),
      b = root.forUser('test-b'),
      s = start();
    assert.equal(a.saveBpSeries(s, 0).conflict, false);
    assert.equal(a.saveBpSeries({ ...s, names: ['C', 'D'] }, 0).conflict, true);
    assert.equal(a.bpSeries().series?.names[0], 'A');
    assert.equal(b.bpSeries().series, null);
    assert.equal(root.bpSeries().series, null);
    assert.equal(a.saveBpSeries({ ...s, names: ['C', 'D'] }, 1).revision, 2);
  } finally {
    root.close();
  }
});
