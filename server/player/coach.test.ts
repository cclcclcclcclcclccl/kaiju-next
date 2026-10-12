import test from 'node:test';
import assert from 'node:assert/strict';
import { heroes, heroByName } from '../../src/player/catalog.ts';
import { emptyDraft, ROLES } from '../../src/player/model.ts';
import type { Hero, Draft } from '../../src/player/model.ts';
import {
  emptyProfile,
  emptyHeroMetric,
  emptyHabits,
  profileSchema,
} from '../../src/player/pro/model.ts';
import { mastery, effectivePool } from '../../src/player/pro/analytics.ts';
import { personalizedHeroes } from '../../src/player/pro/personalization.ts';
import { adaptiveSystems, recommendSystems } from '../../src/player/pro/squad.ts';
import { searchCoach, applyCoachMove, coachTurns } from '../../src/player/pro/coach.ts';
import type { CoachInput, CoachSettings } from '../../src/player/pro/coach.ts';
const id = (name: string) => heroByName(name).id;
const settings: CoachSettings = {
  depth: 4,
  width: 6,
  strategy: 'robust',
  firstPick: 'allies',
  nextSide: 'auto',
  action: 'pick',
  respectPools: true,
};
const input = (): CoachInput => ({
  draft: emptyDraft(),
  settings: { ...settings },
  members: {},
  opponentPool: [],
});
const observedOn = '2026-10-12',
  now = Date.parse(observedOn);

test('rich profile accepts rate-only records without fabricating wins and rejects contradictory data', () => {
  const profile = {
    ...emptyProfile(),
    seasonPeakScore: 1900,
    peakScore: 1800,
    peakEnergy: 40,
    peakCoefficient: 30,
    challengeCoefficient: 10,
    habits: emptyHabits(),
    heroes: [
      {
        ...emptyHeroMetric(id('李白')),
        games: 230,
        winRate: 57.83,
        power: 9500,
        historicalPeakPower: 12000,
        averageRating: 9.1,
        seasonGames: 80,
        seasonWinRate: 60,
        recentGames: 20,
        recentWinRate: 65,
        recentRating: 9.5,
        performanceScore: 4000,
        rankPerformanceScore: 1800,
        peakPerformanceScore: 2200,
      },
    ],
  };
  const parsed = profileSchema.parse(profile);
  assert.equal(parsed.heroes[0].wins, undefined);
  assert.equal(parsed.heroes[0].recentWins, undefined);
  for (const patch of [
    { historicalPeakPower: 9000 },
    { seasonGames: 400 },
    { wins: 5 },
    { recentWins: 21 },
    { averageRating: 17 },
  ])
    assert.equal(
      profileSchema.safeParse({ ...profile, heroes: [{ ...profile.heroes[0], ...patch }] }).success,
      false,
    );
  assert.equal(profileSchema.safeParse(emptyProfile()).success, true);
});

test('readiness uses performance, preserves unknown values, ages out and ignores energy as an ability bonus', () => {
  const profile = {
    ...emptyProfile(),
    heroes: [
      {
        ...emptyHeroMetric(id('李白')),
        games: 200,
        recentGames: 40,
        recentWinRate: 60,
        power: 8000,
        observedOn,
        averageRating: 9,
      },
    ],
  };
  const good = mastery(id('李白'), [], profile, now);
  const poor = {
    ...profile,
    heroes: [{ ...profile.heroes[0], recentWinRate: 35, averageRating: 5 }],
  };
  assert.ok(good.score > mastery(id('李白'), [], poor, now).score);
  assert.equal(good.score, mastery(id('李白'), [], { ...profile, peakEnergy: 999 }, now).score);
  assert.ok(mastery(id('李白'), [], profile, now + 365 * 86400000).trust < good.trust);
  assert.equal(
    mastery(
      id('李白'),
      [],
      { ...profile, heroes: [{ ...emptyHeroMetric(id('李白')), power: 30000 }] },
      now,
    ).score,
    20,
  );
  assert.equal(effectivePool([], profile)[0].heroId, id('李白'));
  assert.deepEqual(
    effectivePool([{ heroId: id('李白'), level: 'main' }], {
      ...profile,
      heroes: [{ ...profile.heroes[0], inPool: false }],
    }),
    [],
  );
});

test('changing player habits changes hero recommendations and the displayed score order', () => {
  const candidates = [heroByName('牛魔'), heroByName('李白')];
  const support = {
    ...emptyProfile(),
    habits: {
      ...emptyHabits(),
      roles: ['游走' as const],
      styles: ['保护队友' as const],
      risk: '稳健' as const,
    },
  };
  const jungle = {
    ...emptyProfile(),
    habits: {
      ...emptyHabits(),
      roles: ['打野' as const],
      styles: ['侧翼切入' as const],
      risk: '主动' as const,
      mechanics: 5,
    },
  };
  assert.equal(personalizedHeroes(candidates, [], support)[0].hero.id, id('牛魔'));
  assert.equal(personalizedHeroes(candidates, [], jungle)[0].hero.id, id('李白'));
});

test('turn planning preserves blue and red paired picks, overrides one turn and respects remaining slots', () => {
  const expected = [
    'allies',
    'enemies',
    'enemies',
    'allies',
    'allies',
    'enemies',
    'enemies',
    'allies',
    'allies',
    'enemies',
  ];
  assert.deepEqual(coachTurns(emptyDraft(), settings), expected);
  assert.deepEqual(
    coachTurns(emptyDraft(), { ...settings, firstPick: 'enemies' }),
    expected.map((s) => (s === 'allies' ? 'enemies' : 'allies')),
  );
  const partial = emptyDraft();
  partial.allies.中路 = 1;
  partial.enemies.中路 = 2;
  partial.enemies.游走 = 3;
  assert.deepEqual(coachTurns(partial, settings), expected.slice(3));
  const manual = coachTurns(partial, { ...settings, nextSide: 'enemies' });
  assert.equal(manual[0], 'enemies');
  assert.equal(manual.filter((s) => s === 'allies').length, 4);
  assert.equal(manual.filter((s) => s === 'enemies').length, 3);
  assert.deepEqual(coachTurns(partial, { ...settings, action: 'ban', nextSide: 'enemies' }), [
    'enemies',
    ...expected.slice(3),
  ]);
});

const synthetic = (id: number, classes: string[], tags: string[] = []): Hero => ({
  id,
  name: '测试英雄' + id,
  slug: String(id),
  title: '合成算法测试',
  roles: ['中路'],
  classes,
  portrait: '',
  cover: '',
  source: 'https://example.invalid',
  skills: [],
  mechanics: { survival: null, attack: null, skill: null, tags },
});
const small = [
  synthetic(9001, ['法师'], ['控制']),
  synthetic(9002, ['法师']),
  synthetic(9003, ['战士', '坦克']),
];
small[0].relations = [
  { type: 'counteredBy', heroId: 9003, reason: '测试针对', source: 'https://example.invalid' },
];
small[2].relations = [
  { type: 'counters', heroId: 9001, reason: '测试针对', source: 'https://example.invalid' },
];
const smallInput = (): CoachInput => ({
  ...input(),
  settings: { ...settings, depth: 2, width: 6 },
  members: {
    中路: {
      id: 'self',
      name: '测试',
      pool: [
        { heroId: 9001, level: 'comfortable' },
        { heroId: 9002, level: 'comfortable' },
      ],
    },
  },
});

test('anticipating the opponent changes a greedy pick and matches an independently enumerated two-ply game', () => {
  const req = smallInput();
  const greedy = searchCoach(small, { ...req, settings: { ...req.settings, depth: 1 } });
  const searched = searchCoach(small, req);
  assert.equal(greedy.candidates[0].move.heroId, 9001);
  assert.equal(searched.candidates[0].move.heroId, 9002);
  // Manually derived independent payoffs: preparation +3, magic/control=8 or magic=4;
  // enemies have unknown skill (0 bonus), physical/frontline=8, counter swing=7.
  const exhaustive = new Map([
    [9001, Math.min(3 + 8 - 4, 3 + 8 - 8 - 7)],
    [9002, Math.min(3 + 4 - 8, 3 + 4 - 8)],
  ]);
  for (const candidate of searched.candidates)
    assert.equal(candidate.value, exhaustive.get(candidate.move.heroId));
  assert.equal(searched.completedDepth, 2);
  assert.ok(searched.candidates[0].line.some((m) => m.team === 'enemies'));
  assert.ok(searched.evaluatedPositions > searched.searchedNodes);
});

test('coach respects personal pools, unique assignments and picks, and returns a completed layer under budget', () => {
  const req = input();
  req.members.中路 = { id: 'self', name: '本人', pool: [{ heroId: id('小乔'), level: 'main' }] };
  req.settings.depth = 4;
  req.settings.width = 4;
  const result = searchCoach(heroes, req, { maxMs: 10000 });
  assert.ok(result.completedDepth >= 2);
  for (const c of result.candidates) {
    let state: Draft = req.draft;
    for (const m of c.line) {
      state = applyCoachMove(state, m);
      if (m.team === 'allies' && m.role === '中路') assert.equal(m.heroId, id('小乔'));
    }
    const picks = [...Object.values(state.allies), ...Object.values(state.enemies)];
    assert.equal(picks.length, new Set(picks).size);
  }
  assert.throws(
    () =>
      searchCoach(heroes, { ...req, members: { 中路: req.members.中路, 打野: req.members.中路 } }),
    /一位选手/,
  );
  assert.throws(
    () =>
      searchCoach(heroes, { ...req, members: { 中路: { id: 'self', name: '本人', pool: [] } } }),
    /没有可用/,
  );
  const bounded = searchCoach(heroes, req, { maxNodes: 1, maxMs: 10000 });
  assert.equal(bounded.completedDepth, 1);
  assert.equal(bounded.bounded, true);
  assert.ok(bounded.candidates.every((c) => c.line.length === 1));
});

test('opponent preference changes tendency weights without creating an ability record; bans are legal', () => {
  const req = smallInput();
  req.settings.strategy = 'tendency';
  const a = searchCoach(small, req),
    b = searchCoach(small, { ...req, opponentPool: [9003] });
  assert.equal(
    a.candidates.find((c) => c.move.heroId === 9001)!.immediateValue,
    b.candidates.find((c) => c.move.heroId === 9001)!.immediateValue,
  );
  assert.ok(
    b.candidates.find((c) => c.move.heroId === 9001)!.value <
      a.candidates.find((c) => c.move.heroId === 9001)!.value,
  );
  const banned = searchCoach(small, {
    ...req,
    settings: { ...req.settings, action: 'ban', depth: 2 },
  });
  for (const candidate of banned.candidates) {
    assert.equal(candidate.move.kind, 'ban');
    assert.equal(candidate.line.filter((m) => m.heroId === candidate.move.heroId).length, 1);
    assert.equal(applyCoachMove(req.draft, candidate.move).banned.length, 1);
  }
});

test('adaptive systems use distinct actual players including profile-only heroes and vanish when coverage is revoked', () => {
  const members = [
    {
      id: 'a',
      name: '输出',
      pool: [],
      profile: {
        ...emptyProfile(),
        heroes: [
          {
            ...emptyHeroMetric(id('后羿')),
            games: 100,
            winRate: 60,
            recentGames: 20,
            recentWinRate: 60,
          },
        ],
      },
    },
    { id: 'b', name: '保护', pool: [{ heroId: id('张飞'), level: 'main' as const }] },
  ];
  const adaptive = adaptiveSystems(members, heroes, true);
  assert.ok(adaptive.length > 0);
  const ranked = recommendSystems(members, heroes, true);
  assert.ok(ranked[0].match.complete);
  for (const r of ranked) {
    const people = r.match.assigned.map((a) => a.memberId);
    assert.equal(people.length, new Set(people).size);
    for (const a of r.match.assigned)
      assert.ok(
        effectivePool(
          members.find((m) => m.id === a.memberId)!.pool,
          members.find((m) => m.id === a.memberId)!.profile,
        ).some((p) => p.heroId === a.heroId),
      );
  }
  assert.deepEqual(adaptiveSystems(members.slice(0, 1), heroes, true), []);
  assert.ok(ranked.some((r) => r.system.id.startsWith('adaptive-')));
});

test('official roster build and rune references contain resolved readable names and never invented counts', () => {
  assert.equal(heroes.length, 133);
  assert.ok(heroes.filter((h) => h.builds?.length).length > 120);
  assert.ok(heroes.filter((h) => h.runes?.length).length > 120);
  for (const h of heroes) {
    for (const b of h.builds ?? [])
      for (const i of b.items) {
        assert.ok(i.name.length);
        assert.ok(i.price >= 0);
      }
    for (const rune of h.runes ?? []) assert.ok(rune.name && rune.description);
  }
});
