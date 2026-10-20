import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerStore } from './store.ts';
import { backupSchema, backupHeroIds } from '../../src/player/pro/backup.ts';
import type { Series } from '../../src/player/pro/seriesBp.ts';
import { searchTasks } from '../../src/player/navigation.ts';
const series: Series = {
  version: 1,
  bestOf: 3,
  names: ['蓝', '红'],
  games: [
    {
      blue: 0,
      session: {
        version: 1,
        format: 'staged',
        mode: 'manual',
        moves: [{ heroId: 190, role: '中路' }],
        unavailable: { allies: [], enemies: [] },
      },
    },
  ],
};
test('complete backup includes server series, restores it and invalidates stale series writers', () => {
  const store = createPlayerStore(':memory:');
  try {
    store.saveBpSeries(series, 0);
    const backup = backupSchema.parse({
      format: 'kaiju-personal-backup-v1',
      exportedAt: new Date().toISOString(),
      data: store.personalState(),
    });
    assert.deepEqual(backup.data.bpSeries, series);
    assert.ok(backupHeroIds(backup.data).includes(190));
    store.saveBpSeries({ ...series, names: ['甲', '乙'] }, 1);
    const before = store.personalState();
    assert.equal(store.restorePersonal(store.stateRevision(), backup.data).conflict, false);
    assert.deepEqual(store.bpSeries().series, series);
    assert.equal(store.saveBpSeries(series, 2).conflict, true);
    assert.deepEqual(store.restoreCheckpoint(), before);
    assert.equal(store.forUser('other').bpSeries().series, null);
  } finally {
    store.close();
  }
});
test('old backup omitting series preserves it; explicit empty series restores empty; malformed BP rejected', () => {
  const store = createPlayerStore(':memory:');
  try {
    store.saveBpSeries(series, 0);
    const old = store.personalState();
    delete old.bpSeries;
    const parsed = backupSchema.parse({
      format: 'kaiju-personal-backup-v1',
      exportedAt: new Date().toISOString(),
      data: old,
    });
    store.restorePersonal(store.stateRevision(), parsed.data);
    assert.deepEqual(store.bpSeries().series, series);
    const revision = store.stateRevision();
    store.saveBpSeries({ ...series, names: ['改', '名'] }, 1);
    assert.equal(store.restorePersonal(revision, parsed.data).conflict, true);
    store.restorePersonal(store.stateRevision(), { ...old, bpSeries: null });
    assert.equal(store.bpSeries().series, null);
    assert.equal(
      backupSchema.safeParse({
        ...parsed,
        data: { ...old, bpSeries: { ...series, games: [{ ...series.games[0], winner: 0 }] } },
      }).success,
      false,
    );
  } finally {
    store.close();
  }
});
test('task search matches player intents, ignores whitespace and case, and returns only internal destinations', () => {
  assert.ok(searchTasks(' BP ').some((t) => t.page === 'draft'));
  assert.ok(searchTasks('皮肤').some((t) => t.tool === 'skins'));
  assert.ok(searchTasks('compare').some((t) => t.tool === 'compare'));
  assert.deepEqual(searchTasks('<script>'), []);
});
