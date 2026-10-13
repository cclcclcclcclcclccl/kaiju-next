import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { heroes } from '../../src/player/catalog.ts';
import {
  aggregateObservation,
  currentEnvironment,
  environmentRanks,
  midrank,
} from '../../src/player/pro/environment.ts';
import type { ObservationRow } from '../../src/player/pro/environment.ts';
const row = (
  heroId: number,
  pickRate: number,
  banRate: number,
  winRate: number | null = 50,
): ObservationRow => ({
  heroId,
  pickRate,
  banRate,
  winRate,
  sourceRoles: ['中路'],
  evidence: ['fixture'],
  review: 'manual-visual',
});

test('complete observation covers every catalog hero once, retains missing win and traceable identity evidence', () => {
  assert.deepEqual(
    aggregateObservation.rows.map((r) => r.heroId).sort((a, b) => a - b),
    heroes.map((h) => h.id).sort((a, b) => a - b),
  );
  assert.deepEqual(
    aggregateObservation.rows.filter((r) => r.winRate === null).map((r) => r.heroId),
    [501],
  );
  assert.equal(aggregateObservation.rows.find((r) => r.heroId === 501)?.pickRate, 0.4);
  for (const r of aggregateObservation.rows)
    for (const file of r.evidence) assert(existsSync('evidence/data-continuity/' + file), file);
  for (const id of [581, 582, 583, 584, 585])
    assert(
      aggregateObservation.rows
        .find((r) => r.heroId === id)
        ?.evidence.some((e) => e.includes('identity-' + id)),
    );
  assert.deepEqual(aggregateObservation.rows.find((r) => r.heroId === 138)?.sourceRoles, ['中路']);
  assert(
    currentEnvironment.every((r) => Number.isFinite(r.score) && r.score >= 0 && r.score <= 100),
  );
});

test('equal observations tie, input order cannot break ties, and rank calculation leaves input untouched', () => {
  const rows = [row(3, 10, 5), row(1, 10, 5), row(2, 10, 5)];
  const before = structuredClone(rows);
  const ranking = environmentRanks(rows);
  assert(ranking.every((r) => r.score === 50));
  assert.deepEqual(
    ranking.map((r) => r.row.heroId),
    [1, 2, 3],
  );
  assert.deepEqual(ranking, environmentRanks([...rows].reverse()));
  assert.deepEqual(rows, before);
  assert.equal(midrank(0, [0, 0, 0, 1]), 100 / 3);
  assert.equal(environmentRanks([row(1, 0, 0, null)])[0].score, 50);
  assert.deepEqual(environmentRanks([]), []);
});

test('increased observed pick or ban priority cannot lower a neutral-win hero and win influence stays bounded', () => {
  const rows = [row(1, 2, 2), row(2, 5, 5), row(3, 10, 10)];
  const score = (r: ObservationRow[]) => environmentRanks(r).find((x) => x.row.heroId === 1)!.score;
  assert(score([{ ...rows[0], pickRate: 12 }, ...rows.slice(1)]) > score(rows));
  assert(score([{ ...rows[0], banRate: 12 }, ...rows.slice(1)]) > score(rows));
  for (const win of [0, 50, 100, null])
    for (const pick of [0, 0.1, 10, 100]) {
      const result = environmentRanks([row(1, pick, 10, win)])[0];
      assert(Math.abs(result.winModifier) <= 5);
      if (win === null) {
        assert.equal(result.winModifier, 0);
        assert.equal(result.row.winRate, null);
        assert(result.winMissing);
      }
      if (win === 0 && pick > 0) assert(result.winModifier < 0);
    }
  assert(Math.abs(environmentRanks([row(1, 0.1, 10, 100)])[0].winModifier) < 0.2);
});

test('parameter sensitivity includes nominal scores and exposes real cross-tier boundaries without confidence claims', () => {
  assert(currentEnvironment.some((r) => r.sensitive));
  for (const r of currentEnvironment) {
    assert(r.range[0] <= r.score && r.score <= r.range[1]);
    assert(r.possibleTiers.some((tier) => tier === r.tier));
    assert.equal(r.sensitive, r.possibleTiers.length > 1);
    assert(!('confidence' in r));
  }
  assert.throws(() => environmentRanks([row(1, 2, 3), row(1, 3, 4)]), /Duplicate/);
  assert.throws(() => environmentRanks([row(1, -1, 3)]));
  assert.throws(() => environmentRanks([row(1, 3, NaN)]));
});
