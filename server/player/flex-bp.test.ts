import test from 'node:test';
import assert from 'node:assert/strict';
import { heroes, heroByName } from '../../src/player/catalog.ts';
import { emptyDraft, ROLES } from '../../src/player/model.ts';
import { inferRoles, changeRoleLock } from '../../src/player/pro/flexRoles.ts';
import {
  appendSessionMove,
  replaySession,
  sessionInference,
  setSessionRole,
  undoSession,
  sessionSchema,
} from '../../src/player/pro/bpSession.ts';
import type { BpSession } from '../../src/player/pro/bpSession.ts';
import { searchCoach } from '../../src/player/pro/coach.ts';
const id = (name: string) => heroByName(name).id;
const z = id('诸葛亮'),
  mage = id('妲己'),
  jungle = id('李白');
const opening = () =>
  ['廉颇', '小乔', '赵云', '墨子'].reduce((s, n) => appendSessionMove(s, id(n)), {
    version: 1,
    format: 'staged',
    mode: 'manual',
    moves: [],
  } as BpSession);
test('flex inference keeps both Zhuge lanes open and resolves them from subsequent teammates', () => {
  assert.deepEqual(new Set(inferRoles([z], heroes).alternatives[z]), new Set(['中路', '打野']));
  const mid = inferRoles([z, jungle], heroes),
    jg = inferRoles([z, mage], heroes);
  assert.equal(mid.lineup['中路'], z);
  assert.equal(mid.lineup['打野'], jungle);
  assert.equal(jg.lineup['打野'], z);
  assert.equal(jg.lineup['中路'], mage);
  assert.deepEqual(jg.alternatives[z], ['打野']);
  assert.deepEqual(inferRoles([mage, z], heroes).lineup, jg.lineup);
  assert.deepEqual(jg.unsupported, []);
});
test('manual occupied-lane change swaps and pins both heroes, without silently discarding picks', () => {
  const ids = [z, jungle];
  const locks = changeRoleLock(ids, heroes, {}, z, '打野');
  assert.deepEqual(locks, { [z]: '打野', [jungle]: '中路' });
  const result = inferRoles(ids, heroes, locks);
  assert.equal(result.lineup['打野'], z);
  assert.deepEqual(result.unsupported, [jungle]);
  const auto = changeRoleLock(
    ids,
    heroes,
    changeRoleLock(ids, heroes, locks, z, 'auto'),
    jungle,
    'auto',
  );
  assert.deepEqual(inferRoles(ids, heroes, auto).unsupported, []);
  assert.equal(inferRoles(ids, heroes, auto).lineup['中路'], z);
  assert.throws(() => inferRoles(ids, heroes, { [z]: '打野', [jungle]: '打野' }));
});
test('incompatible preferred roles remain selectable, but unsupported assignment is disclosed', () => {
  const ids = ['妲己', '小乔', '嬴政'].map(id),
    r = inferRoles(ids, heroes);
  assert.deepEqual(new Set(Object.values(r.lineup)), new Set(ids));
  assert.equal(r.unsupported.length, 2);
  for (const heroId of ids) assert.deepEqual(r.alternatives[heroId], ['中路']);
  assert.throws(() => inferRoles([z, z], heroes));
  assert.throws(() => inferRoles([999999], heroes));
});
test('actual staged sequence allows cross-lane replies and resolves only its own side', () => {
  let s = appendSessionMove(opening(), z);
  assert.equal(sessionInference(s, 'allies').alternatives[z].length, 2);
  s = appendSessionMove(s, id('孙尚香'));
  s = appendSessionMove(s, id('刘禅'));
  assert.equal(sessionInference(s, 'allies').alternatives[z].length, 2);
  s = appendSessionMove(s, mage);
  assert.equal(replaySession(s).allies['打野'], z);
  assert.equal(replaySession(s).enemies['发育路'], id('孙尚香'));
  assert.equal(replaySession(s).enemies['游走'], id('刘禅'));
  assert.throws(() => appendSessionMove(s, z));
});
test('saved role locks survive replay and undo removes only removed hero locks; old role metadata can flex', () => {
  let s = appendSessionMove(opening(), z);
  s = setSessionRole(s, 'allies', z, '打野');
  s = appendSessionMove(s, id('孙尚香'));
  s = setSessionRole(s, 'enemies', id('孙尚香'), '发育路');
  const restored = sessionSchema.parse(JSON.parse(JSON.stringify(s)));
  assert.equal(replaySession(restored).allies['打野'], z);
  const undo = undoSession(restored);
  assert.deepEqual(undo.locks, { [z]: '打野' });
  assert.equal(sessionInference(undoSession(undo), 'allies').locked[z], undefined);
  const legacy = { ...s, locks: undefined };
  assert.equal(sessionInference(legacy, 'allies').alternatives[z].length, 2);
  assert.throws(() => replaySession({ ...s, locks: { 999999: '中路' } }));
});
test('coach can choose a new mid mage with Zhuge already provisionally mid, and respects explicit locks', () => {
  const catalog = ['诸葛亮', '妲己', '孙尚香', '刘禅', '李白', '吕布'].map(heroByName);
  const draft = { ...emptyDraft(), allies: { 中路: z } };
  const input = {
    draft,
    members: {},
    opponentPool: [],
    flexibleRoles: { locks: {} },
    settings: {
      depth: 2,
      width: 10,
      strategy: 'robust' as const,
      firstPick: 'allies' as const,
      nextSide: 'allies' as const,
      action: 'pick' as const,
      respectPools: false,
    },
  };
  const result = searchCoach(catalog, input, { maxMs: 10000 });
  assert.ok(result.candidates.some((c) => c.move.heroId === mage && c.move.role === '中路'));
  assert.ok(result.candidates.some((c) => c.move.role === '发育路'));
  assert.equal(result.completedDepth, 2);
  const locked = searchCoach(
    catalog,
    { ...input, flexibleRoles: { locks: { [z]: '中路' } } },
    { maxMs: 10000 },
  );
  assert.ok(!locked.candidates.some((c) => c.move.heroId === mage));
  assert.ok(locked.candidates.some((c) => c.move.heroId === jungle));
});
test('all catalog heroes keep a legal unique lane across supported five-hero samples', () => {
  for (const hero of heroes) {
    const picked = [hero.id];
    for (const r of ROLES) {
      if (picked.length === 5) break;
      const next = heroes.find(
        (h) =>
          !picked.includes(h.id) &&
          h.roles.includes(r) &&
          inferRoles([...picked, h.id], heroes).unsupported.length === 0,
      );
      if (next) picked.push(next.id);
    }
    const result = inferRoles(picked, heroes);
    assert.deepEqual(new Set(Object.values(result.lineup)), new Set(picked));
    assert.deepEqual(result.unsupported, []);
    assert.equal(result.locked[hero.id], undefined);
  }
});
