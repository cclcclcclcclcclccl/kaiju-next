import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyDraft } from '../../src/player/model.ts';
import type { Hero } from '../../src/player/model.ts';
import { snapshotSchema } from '../../src/player/pro/model.ts';
import type { StatSnapshot } from '../../src/player/pro/model.ts';
import { tierList } from '../../src/player/pro/analytics.ts';
import { personalFit } from '../../src/player/pro/bp.ts';
import { scopeIssue, comparisonIssue, historyFor } from '../../src/player/pro/statistics.ts';
const heroes = JSON.parse(
  readFileSync(new URL('../../src/player/data/heroes.json', import.meta.url), 'utf8'),
).heroes as Hero[];
const mids = heroes.filter((h) => h.roles.includes('中路')).slice(0, 6);
const fixture = (id: string, day: string): StatSnapshot => ({
  id,
  importedAt: '2026-10-12T03:00:00Z',
  title: 'SYNTHETIC ' + id,
  segment: '巅峰千强',
  patch: 'TEST',
  startDate: day,
  endDate: day,
  sourceName: 'TEST ONLY',
  sourceUrl: 'https://example.invalid/data',
  denominator: 'match',
  winRateScope: 'segment',
  winRateWindow: 'range',
  rows: mids.map((h, i) => ({
    heroId: h.id,
    role: '中路',
    winRate: 50 + i,
    pickRate: 10,
    banRate: 5,
    games: 3000,
  })),
});

test('mixed, cumulative or legacy unknown scopes cannot acquire a tier, interval or BP strength weight', () => {
  const today = new Date().toISOString().slice(0, 10);
  const valid = fixture('valid', today);
  const draft = { ...emptyDraft(), role: '中路' as const, segment: valid.segment };
  assert.equal(scopeIssue(valid), null);
  assert.ok(personalFit(mids[0], draft, { snapshot: valid }).meta !== null);
  for (const input of [
    { ...valid, winRateScope: 'all' as const },
    { ...valid, winRateWindow: 'version' as const },
    { ...valid, winRateScope: undefined, winRateWindow: undefined },
    { ...valid, denominator: 'unknown' as const },
  ]) {
    assert.ok(scopeIssue(input));
    assert.ok(
      tierList(input, '中路').every(
        (r) => !r.tier.startsWith('T') && r.interval === null && r.parts.length === 0,
      ),
    );
    assert.equal(personalFit(mids[0], draft, { snapshot: input }).meta, null);
  }
});
test('unknown pick and ban denominators preserve raw values without inventing a BP rate', () => {
  const { id, importedAt, ...input } = fixture('x', '2026-10-11');
  input.rows[0] = { ...input.rows[0], pickRate: 80, banRate: 30 };
  assert.equal(snapshotSchema.safeParse(input).success, false);
  const parsed = snapshotSchema.parse({ ...input, denominator: 'unknown' });
  const result = tierList({ ...parsed, id, importedAt }, '中路').find(
    (r) => r.row.heroId === mids[0].id,
  )!;
  assert.equal(result.row.pickRate, 80);
  assert.equal(result.bp, null);
});
test('history does not cross versions, sources, populations, durations or unknown scopes', () => {
  const now = fixture('now', '2026-10-11');
  const old = fixture('old', '2026-10-10');
  assert.equal(comparisonIssue(now, old), null);
  for (const change of [
    { patch: 'OTHER' },
    { sourceUrl: 'https://example.invalid/other' },
    { segment: '大众分段' as const },
    { winRateScope: 'all' as const },
    { winRateWindow: undefined },
    { startDate: '2026-10-09' },
    { scopeNotes: 'different cohort' },
  ]) {
    const altered = { ...old, ...change };
    assert.ok(comparisonIssue(now, altered));
    assert.equal(historyFor([now, altered], now, mids[0].id, '中路').length, 1);
  }
});
test('history respects hero-role identity, selected same-day batch, real dates and the latest thirty observations', () => {
  const now = fixture('now', '2026-10-11');
  const old = fixture('old', '2026-10-10');
  const duplicate = { ...now, id: 'duplicate', importedAt: '2026-10-12T09:00:00Z' };
  const wrongRole = {
    ...fixture('wrong-role', '2026-10-09'),
    rows: [{ ...old.rows[0], role: '游走' as const }],
  };
  const future = fixture('future', '2026-10-12');
  assert.deepEqual(
    historyFor([future, duplicate, old, wrongRole, now], now, mids[0].id, '中路').map(
      (p) => p.snapshot.id,
    ),
    ['old', 'now'],
  );
  const many = Array.from({ length: 40 }, (_, i) =>
    fixture(String(i), new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10)),
  );
  assert.equal(historyFor([...many, now], now, mids[0].id, '中路').length, 30);
});
