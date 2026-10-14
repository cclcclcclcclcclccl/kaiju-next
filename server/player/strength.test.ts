import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strengthRanks } from '../../src/player/pro/strength.ts';
import { tianyuanStatsSchema } from '../../src/player/pro/tianyuan.ts';
import { reviewEvidence } from '../../src/player/pro/reviewEvidence.ts';
const data = (mode: number) =>
  tianyuanStatsSchema.parse(
    JSON.parse(readFileSync(`tests/fixtures/tianyuan/stats-${mode}.json`, 'utf8')),
  );

test('own strength covers 133 base heroes and is invariant to input order and publisher tier fields', () => {
  for (const mode of [1, 3, 4, 5]) {
    const input = data(mode),
      top = data(4),
      r = strengthRanks(input, mode, '全部', top);
    assert.equal(r.rows.length, 133);
    assert.deepEqual(
      strengthRanks([...input].reverse(), mode, '全部', [...top].reverse()).rows,
      r.rows,
    );
    assert.deepEqual(
      strengthRanks(
        input.map((x) => ({ ...x, tierInRole: 'T9', finalNormalizedTierScore: 999 })),
        mode,
        '全部',
        top,
      ).rows,
      r.rows,
    );
    for (const row of r.rows) {
      assert(row.score !== null && row.rank !== null && row.range && row.rankRange);
      assert(row.range[0] <= row.score && row.range[1] >= row.score);
      assert(row.rankRange[0] <= row.rank && row.rankRange[1] >= row.rank);
      assert(row.score >= 0 && row.score <= 100);
    }
  }
});
test('identical observations share ranks and do not manufacture a top tier; low-use outlier is attenuated', () => {
  // Controlled perturbations of real fixtures for behavior tests, never product data.
  const equal = data(4)
    .slice(0, 10)
    .map((r) => ({ ...r, baseHeroId: undefined, winRate: 50, pickRate: 10, banRate: 1 }));
  const ranked = strengthRanks(equal, 4).rows;
  assert(ranked.every((r) => r.score === 50 && r.rank === 1 && r.tier === 'T2'));
  equal[0].winRate = 55;
  equal[0].pickRate = 0.01;
  equal[1].winRate = 55;
  equal[1].pickRate = 10;
  const rows = strengthRanks(equal, 4).rows;
  assert(
    rows.find((r) => r.row.heroId === equal[1].heroId)!.score! >
      rows.find((r) => r.row.heroId === equal[0].heroId)!.score!,
  );
});
test('at equal usage and bans stronger observed win rate ranks higher; missing win rate stays unrated', () => {
  const input = data(4)
    .slice(0, 10)
    .map((r, i) => ({ ...r, baseHeroId: undefined, winRate: 45 + i, pickRate: 10, banRate: 1 }));
  const ranked = strengthRanks(input, 4).rows;
  assert.deepEqual(
    ranked.map((r) => r.row.heroId),
    [...input].reverse().map((r) => r.heroId),
  );
  input[9].winRate = null as unknown as number;
  const missing = strengthRanks(input, 4).rows.find((r) => r.row.heroId === input[9].heroId)!;
  assert.equal(missing.score, null);
  assert.equal(missing.rank, null);
  assert.equal(missing.tier, '待评估');
});
test('top-thousand strength never treats mixed-population wins as own-segment wins and fails closed without proxy', () => {
  const thousand = data(5),
    top = data(4);
  assert.deepEqual(
    strengthRanks(thousand, 5, '全部', top).rows,
    strengthRanks(
      thousand.map((r) => ({ ...r, winRate: 100 })),
      5,
      '全部',
      top,
    ).rows.map((r, i) => ({ ...r, row: strengthRanks(thousand, 5, '全部', top).rows[i].row })),
  );
  assert(strengthRanks(thousand, 5).rows.every((r) => r.score === null));
  const r = strengthRanks(thousand, 5, '中路', top);
  assert(r.rows.every((r) => r.row.roles.includes('中路') && r.winMode === 4));
  assert.throws(() => strengthRanks([...top, top[0]], 4), /重复/);
  assert.throws(() => strengthRanks(top, 6), /不支持/);
});
test('local replay inventory distinguishes frames, unobserved gaps and unknown inputs', () => {
  const event = {
    id: 'a',
    second: 10,
    label: 'test',
    observation: '',
    decision: '',
    allies: null,
    enemies: null,
    allyGold: null,
    enemyGold: null,
    objectiveIn: null,
    ultimateReady: null,
    frame: 'data:image/jpeg;base64,/9j/2Q==',
  };
  const r = reviewEvidence([event, { ...event, id: 'b', second: 65, observation: '受控测试' }]);
  assert.equal(r.frames, 2);
  assert.equal(r.largestGap, 55);
  assert.equal(r.unknownFields, 12);
  assert(r.issues.some((s) => s.includes('超过30秒')));
  assert.equal(reviewEvidence([]).firstSecond, null);
});
