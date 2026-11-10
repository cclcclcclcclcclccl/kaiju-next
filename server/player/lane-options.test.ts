import test from 'node:test';
import assert from 'node:assert/strict';
import { heroes, heroByName } from '../../src/player/catalog.ts';
import { emptyDraft } from '../../src/player/model.ts';
import { emptyProfile, emptyHeroMetric } from '../../src/player/pro/model.ts';
import * as options from '../../src/player/pro/laneOptions.ts';

const id = (name: string) => heroByName(name).id;
test('lane summary separates wrong lane, bans, opponent picks, teammate picks and series exclusions', () => {
  const member = {
    id: 'self',
    name: '我',
    pool: ['妲己', '诸葛亮', '王昭君', '小乔', '安琪拉', '李白'].map((n) => ({
      heroId: id(n),
      level: 'main' as const,
    })),
  };
  const draft = {
    ...emptyDraft(),
    banned: [id('妲己')],
    allies: { 打野: id('诸葛亮') },
    enemies: { 中路: id('王昭君') },
  };
  const result = options.laneOptions(draft, heroes, '中路', member, 'allies', [id('小乔')]);
  assert.deepEqual(
    result.available.map((h) => h.id),
    [id('安琪拉')],
  );
  assert.equal(result.registered, 6);
  assert.equal(result.supported, 5);
  assert.deepEqual(
    new Set(result.blocked.map((h) => h.reason)),
    new Set(['已禁用', '对方已选', '本方其他分路已选', '本队前局已用']),
  );
});
test('profile-only hero and current own pick are recognized without fabricating stats', () => {
  const profile = emptyProfile();
  profile.heroes = [{ ...emptyHeroMetric(id('妲己')), games: 50, winRate: 60 }];
  const result = options.laneOptions(
    { ...emptyDraft(), enemies: { 中路: id('妲己') } },
    heroes,
    '中路',
    { id: 'p', name: 'p', pool: [], profile },
    'enemies',
  );
  assert.equal(result.assigned?.id, id('妲己'));
  assert.equal(result.available.length, 0);
  assert.equal(result.registered, 1);
  assert.equal(result.blocked.length, 0);
});
test('empty or wrong-lane pool never implies usable heroes', () => {
  for (const pool of [[], [{ heroId: id('李白'), level: 'main' as const }]]) {
    const result = options.laneOptions(
      emptyDraft(),
      heroes,
      '中路',
      { id: 'p', name: 'p', pool },
      'allies',
    );
    assert.equal(result.available.length, 0);
    assert.equal(result.supported, 0);
  }
});
