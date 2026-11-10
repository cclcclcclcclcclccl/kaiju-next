import test from 'node:test';
import assert from 'node:assert/strict';
import { heroes, heroByName } from '../../src/player/catalog.ts';
import { emptyDraft } from '../../src/player/model.ts';
import type { Role } from '../../src/player/model.ts';
import type { SquadMember } from '../../src/player/pro/squad.ts';
import { searchCoach } from '../../src/player/pro/coach.ts';
import type { CoachInput } from '../../src/player/pro/coach.ts';

const id = (name: string) => heroByName(name).id;
const member = (name: string, names: string[]): SquadMember => ({
  id: name,
  name,
  pool: names.map((n) => ({ heroId: id(n), level: 'main' as const })),
});
const base = (): CoachInput => ({
  draft: { ...emptyDraft(), allies: { 中路: id('诸葛亮') } },
  settings: {
    depth: 1,
    width: 10,
    strategy: 'robust',
    firstPick: 'allies',
    nextSide: 'allies',
    action: 'pick',
    respectPools: true,
  },
  members: { 中路: member('中路选手', ['妲己']), 打野: member('打野选手', ['诸葛亮']) },
  opponentPool: [],
  flexibleRoles: { locks: {} },
});
test('registered players and flex roles work together; Zhuge can release mid for Daji', () => {
  const result = searchCoach(heroes, base(), { maxMs: 10000 });
  const pick = result.candidates.find((c) => c.move.heroId === id('妲己'));
  assert.ok(pick, 'the mid pick should remain available after a legal jungle reassignment');
  assert.equal(pick.lineup?.打野, id('诸葛亮'));
  assert.equal(pick.lineup?.中路, id('妲己'));
  assert.ok(result.candidates.every((c) => c.move.role !== '打野'));
});
test('manual lock cannot silently override registered player eligibility', () => {
  const input = base();
  input.flexibleRoles = { locks: { [id('诸葛亮')]: '中路' } };
  assert.throws(() => searchCoach(heroes, input), /英雄池|分路|锁定/);
});
test('future roster feasibility prevents taking another players only remaining hero', () => {
  const input = base();
  input.draft = emptyDraft();
  input.members = { 中路: member('中单', ['诸葛亮', '妲己']), 打野: member('打野', ['诸葛亮']) };
  const result = searchCoach(heroes, input, { maxMs: 10000 });
  assert.ok(
    !result.candidates.some((c) => c.move.heroId === id('诸葛亮') && c.move.role === '中路'),
  );
  assert.ok(
    result.candidates.some((c) => c.move.heroId === id('诸葛亮') && c.move.role === '打野'),
  );
});
test('red-side personal pool is enforced independently of blue-side identity', () => {
  const input = base();
  input.draft = emptyDraft();
  input.members = {};
  input.settings.nextSide = 'enemies';
  input.sideMembers = { enemies: { 中路: member('红方中单', ['妲己']) } };
  const result = searchCoach(heroes, input, { maxMs: 10000 });
  assert.ok(
    result.candidates
      .filter((c) => c.move.role === '中路')
      .every((c) => c.move.heroId === id('妲己')),
  );
  assert.ok(result.candidates.some((c) => c.move.heroId === id('妲己')));
});
test('banned unique pool hero produces an actionable infeasibility error', () => {
  const input = base();
  input.draft = { ...emptyDraft(), banned: [id('诸葛亮')] };
  assert.throws(() => searchCoach(heroes, input), /英雄池|可用|分路/);
});
test('one player cannot occupy two lanes on the same side', () => {
  const input = base();
  const p = member('我', ['诸葛亮', '妲己']);
  input.members = { 中路: p, 打野: p };
  assert.throws(() => searchCoach(heroes, input), /一个位置|重复/);
});

test('red-side analysis calls blue responses the opponent, not its own following pick', () => {
  const input = base();
  input.draft = emptyDraft();
  input.members = {};
  input.settings = { ...input.settings, nextSide: 'enemies', depth: 3 };
  input.sequence = [
    { team: 'enemies', kind: 'pick' },
    { team: 'allies', kind: 'pick' },
    { team: 'enemies', kind: 'pick' },
  ];
  const result = searchCoach(heroes, input, { maxMs: 15000, maxNodes: 5000 });
  assert.ok(result.candidates[0].opponentReplies.length);
  assert.ok(
    result.candidates.every((c) => c.opponentReplies.every((r) => r.move.team === 'allies')),
  );
});
