import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Hero, Role } from '../../src/player/model.ts';
import { parsePastedStats, parseStatEntries } from '../../src/player/pro/importers.ts';
import { snapshotSchema } from '../../src/player/pro/model.ts';
import { matchSystem, buildSquad } from '../../src/player/pro/squad.ts';
import type { SquadMember } from '../../src/player/pro/squad.ts';
const heroes = JSON.parse(
  readFileSync(new URL('../../src/player/data/heroes.json', import.meta.url), 'utf8'),
).heroes as Hero[];
const id = (name: string) => heroes.find((h) => h.name === name)!.id;
const member = (name: string, names: string[]): SquadMember => ({
  id: name,
  name,
  pool: names.map((n) => ({ heroId: id(n), level: 'main' })),
});
test('table import accepts copied percentages, preserves unknown samples and rejects invented values', () => {
  const rows = parseStatEntries(
    parsePastedStats(
      '英雄\t分路\t胜率\t出场率\t禁用率\t场次\n王昭君\t中路\t51.2%\t12％\t5.1%\t\n小乔\t中路\t49.8\t20\t1\t1500',
    ),
    heroes,
  );
  assert.equal(rows[0].winRate, 51.2);
  assert.equal(rows[0].games, undefined);
  assert.equal(rows[1].games, 1500);
  assert.throws(() => parseStatEntries(parsePastedStats('小乔,中路,,20,1'), heroes), /胜率/);
  assert.throws(
    () => parseStatEntries(parsePastedStats('不存在的英雄,中路,50,20,1'), heroes),
    /英雄/,
  );
  assert.throws(() => parseStatEntries(parsePastedStats('小乔,打野,50,20,1'), heroes), /分路/);
  assert.throws(() => parseStatEntries(parsePastedStats('小乔,中路,101,80,30'), heroes));
});
test('source provenance accepts the actual WeChat share token while rejecting executable links', () => {
  const input = {
    title: '来源格式测试',
    segment: '大众分段',
    patch: 'TEST',
    startDate: '2026-10-01',
    endDate: '2026-10-07',
    sourceName: '测试来源',
    sourceUrl: '#小程序://天元之弈/u6nCjaHUkuIRe6u',
    denominator: 'match',
    rows: parseStatEntries(parsePastedStats('王昭君,中路,50,10,1'), heroes),
  };
  assert.equal(snapshotSchema.safeParse(input).success, true);
  for (const sourceUrl of [
    'javascript:alert(1)',
    'https://user:secret@example.invalid/data',
    '#小程序://天元之弈/',
    'file:///C:/secret',
  ])
    assert.equal(snapshotSchema.safeParse({ ...input, sourceUrl }).success, false);
});
test('system coverage assigns each player once and resolves competing hero pools', () => {
  const core = [
    { heroId: id('孙膑'), role: '游走' as Role },
    { heroId: id('白起'), role: '对抗路' as Role },
    { heroId: id('杨玉环'), role: '中路' as Role },
  ];
  const alone = member('甲', ['孙膑', '白起', '杨玉环']);
  assert.equal(matchSystem(core, [alone]).assigned.length, 1);
  const party = [member('甲', ['孙膑', '白起']), member('乙', ['孙膑']), member('丙', ['杨玉环'])];
  const matched = matchSystem(core, party);
  assert.equal(matched.complete, true);
  assert.equal(matched.assigned.find((x) => x.heroId === id('白起'))?.memberId, '甲');
  party[0].pool[1].level = 'learning';
  assert.equal(matchSystem(core, party).complete, false);
  assert.equal(matchSystem(core, party, true).complete, true);
  assert.throws(() => matchSystem(core, [alone, alone]), /不能重复/);
});
test('five-player suggestions cover all roles without repeating people or heroes and cannot invent missing pools', () => {
  const party = [
    member('边路', ['吕布']),
    member('打野', ['李白']),
    member('法师', ['王昭君']),
    member('射手', ['后羿']),
    member('辅助', ['张飞']),
  ];
  const plans = buildSquad(party, heroes);
  assert.ok(plans.length > 0);
  for (const p of plans) {
    assert.equal(new Set(p.assignments.map((a) => a.heroId)).size, 5);
    assert.equal(new Set(p.assignments.map((a) => a.memberId)).size, 5);
    assert.equal(new Set(p.assignments.map((a) => a.role)).size, 5);
    for (const a of p.assignments)
      assert.ok(party.find((m) => m.id === a.memberId)!.pool.some((x) => x.heroId === a.heroId));
  }
  assert.throws(() => buildSquad(party.slice(0, 4), heroes), /五位/);
  party[4].pool = [];
  assert.deepEqual(buildSquad(party, heroes), []);
});
