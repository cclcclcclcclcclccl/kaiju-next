import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceBoard, sourceTierDate, sourceTierLabel } from '../../src/player/pro/publicBoard.ts';
import { parseTianyuan } from '../../src/player/pro/tianyuan.ts';
import type { SourceTier } from '../../src/player/pro/publicBoard.ts';
const tiers: SourceTier[] = JSON.parse(
  readFileSync('tests/fixtures/tianyuan/tier-20261014.json', 'utf8'),
).tiers;

test('published tier scores preserve actual Jing, Garo, Xiahou and Lianpo rankings across stats cohorts', () => {
  const ranking = sourceBoard(tiers, []);
  assert.equal(ranking.length, 133);
  for (const [id, label, score] of [
    [531, 'T0', 86.71],
    [508, 'T4', 13.14],
    [126, 'T2', 35.49],
    [105, 'T3', 28.89],
  ] as const) {
    const r = ranking.find((x) => x.tier.heroId === id)!;
    assert.equal(r.label, label);
    assert.equal(r.tier.finalNormalizedTierScore, score);
    assert.equal(r.stat, undefined);
  }
  assert(
    ranking.findIndex((x) => x.tier.heroId === 531) <
      ranking.findIndex((x) => x.tier.heroId === 508),
  );
  for (const mode of [1, 3, 4, 5]) {
    const stats = JSON.parse(
      readFileSync('tests/fixtures/tianyuan/stats-' + mode + '.json', 'utf8'),
    );
    const board = sourceBoard(tiers, stats);
    assert.deepEqual(
      board.map((x) => [x.tier.heroId, x.label, x.tier.finalNormalizedTierScore]),
      ranking.map((x) => [x.tier.heroId, x.label, x.tier.finalNormalizedTierScore]),
    );
    for (const row of board)
      assert.equal(
        row.stat?.winRate,
        stats.find((s: { heroId: number }) => s.heroId === row.tier.heroId)?.winRate,
      );
  }
});

test('source role selection respects secondary roles and explicit source thresholds without our v2 cutoffs', () => {
  assert.equal(sourceTierLabel(61), 'T0.5');
  assert.equal(sourceTierLabel(45), 'T1');
  assert.equal(sourceTierLabel(30), 'T2');
  const first = tiers[0];
  const input = [
    { ...first, role: '对抗路/游走(次分路)', finalNormalizedTierScore: 90 },
    { ...first, role: '游走', finalNormalizedTierScore: 50 },
  ];
  assert.equal(sourceBoard(input, [], '游走')[0].tier.finalNormalizedTierScore, 50);
  assert.equal(sourceBoard(input, [])[0].tier.finalNormalizedTierScore, 90);
  assert.doesNotThrow(() =>
    parseTianyuan({ queryDate: first.date, tiers: input }, { kind: 'tier', date: first.date }),
  );
  assert.throws(
    () =>
      parseTianyuan(
        { queryDate: first.date, tiers: [input[0], input[0]] },
        { kind: 'tier', date: first.date },
      ),
    /身份/,
  );
  assert.equal(sourceTierDate(Date.parse('2026-10-14T00:59:00Z')), '2026-10-13');
  assert.equal(sourceTierDate(Date.parse('2026-10-14T01:00:00Z')), '2026-10-14');
  assert.throws(
    () => parseTianyuan({ error: '仅开放昨日数据' }, { kind: 'stats', date: first.date, mode: 5 }),
    /仅开放昨日/,
  );
});
