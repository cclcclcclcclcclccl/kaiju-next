import { ROLES, emptyDraft } from '../model.ts';
import type { Hero, Pool, Role, Draft } from '../model.ts';
import type { Profile } from './model.ts';
import { mastery, effectivePool } from './analytics.ts';
import { recommend, noteFor } from '../tactics.ts';
import { styleFit } from './playstyle.ts';
import { SYSTEMS } from './systems.ts';
export type SquadMember = { id: string; name: string; pool: Pool; profile?: Profile };
export type Assignment = {
  role: Role;
  heroId: number;
  memberId: string;
  memberName: string;
  readiness: number;
  confidence: string;
};
export function matchSystem(
  core: { heroId: number; role: Role }[],
  members: SquadMember[],
  includeLearning = false,
  heroCatalog: Hero[] = [],
) {
  members = members.map((m) => ({ ...m, pool: effectivePool(m.pool, m.profile) }));
  if (members.length > 5 || new Set(members.map((m) => m.id)).size !== members.length)
    throw new Error('队伍最多五人，同一成员不能重复');
  let best: Assignment[] = [];
  const visit = (index: number, chosen: Assignment[], used: Set<string>) => {
    if (index === core.length) {
      const sum = (xs: Assignment[]) => xs.reduce((s, x) => s + x.readiness, 0);
      if (chosen.length > best.length || (chosen.length === best.length && sum(chosen) > sum(best)))
        best = [...chosen];
      return;
    }
    const target = core[index];
    for (const m of members) {
      const p = m.pool.find((p) => p.heroId === target.heroId);
      if (used.has(m.id) || !p || (!includeLearning && p.level === 'learning')) continue;
      const fit = mastery(p.heroId, m.pool, m.profile);
      const hero = heroCatalog.find((h) => h.id === p.heroId);
      const style = hero ? styleFit(hero, noteFor(hero).traits, m.profile).score : 50;
      used.add(m.id);
      visit(
        index + 1,
        [
          ...chosen,
          {
            ...target,
            memberId: m.id,
            memberName: m.name,
            readiness: Math.round(m.profile?.habits ? fit.score * 0.85 + style * 0.15 : fit.score),
            confidence: fit.confidence,
          },
        ],
        used,
      );
      used.delete(m.id);
    }
    visit(index + 1, chosen, used);
  };
  visit(0, [], new Set());
  return {
    assigned: best,
    missing: core.filter((x) => !best.some((y) => y.heroId === x.heroId)),
    complete: best.length === core.length,
  };
}
export type SquadPlan = { assignments: Assignment[]; draft: Draft; score: number; weakest: number };
export function buildSquad(
  members: SquadMember[],
  heroes: Hero[],
  includeLearning = false,
): SquadPlan[] {
  members = members.map((m) => ({ ...m, pool: effectivePool(m.pool, m.profile) }));
  if (members.length !== 5 || new Set(members.map((m) => m.id)).size !== 5)
    throw new Error('需要五位不同成员的英雄池，才能生成完整五人方案');
  const eligible = (m: SquadMember) =>
    m.pool.filter((p) => includeLearning || p.level !== 'learning');
  const scarcity = (role: Role) =>
    members.reduce(
      (n, m) =>
        n +
        eligible(m).filter((p) => heroes.find((h) => h.id === p.heroId)?.roles.includes(role))
          .length,
      0,
    );
  const roles = [...ROLES].sort((a, b) => scarcity(a) - scarcity(b));
  type State = { draft: Draft; assignments: Assignment[]; score: number };
  let beam: State[] = [
    {
      draft: { ...emptyDraft(), preference: 'comfort', onlyPool: true },
      assignments: [],
      score: 0,
    },
  ];
  for (const role of roles) {
    const next: State[] = [];
    for (const state of beam)
      for (const member of members) {
        if (state.assignments.some((a) => a.memberId === member.id)) continue;
        const d = { ...state.draft, role, pool: eligible(member) };
        for (const r of recommend(d, heroes, { profile: member.profile })) {
          const m = mastery(r.hero.id, member.pool, member.profile);
          next.push({
            draft: { ...state.draft, allies: { ...state.draft.allies, [role]: r.hero.id } },
            assignments: [
              ...state.assignments,
              {
                role,
                heroId: r.hero.id,
                memberId: member.id,
                memberName: member.name,
                readiness: m.score,
                confidence: m.confidence,
              },
            ],
            score: state.score + (r.total ?? 0),
          });
        }
      }
    beam = next.sort((a, b) => b.score - a.score).slice(0, 32);
    if (!beam.length) return [];
  }
  const plans = beam
    .map((state) => {
      let total = 0;
      for (const a of state.assignments) {
        const m = members.find((m) => m.id === a.memberId)!;
        const p = m.pool.find((p) => p.heroId === a.heroId)!;
        const r = recommend({ ...state.draft, role: a.role, pool: [p] }, heroes, {
          profile: m.profile,
        })[0];
        total += r?.total ?? 0;
      }
      const weakest = Math.min(...state.assignments.map((a) => a.readiness));
      return {
        ...state,
        score: Math.round(total / 5),
        weakest,
        assignments: [...state.assignments].sort(
          (a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role),
        ),
      };
    })
    .sort((a, b) => b.score - a.score || b.weakest - a.weakest);
  const seen = new Set<string>();
  return plans
    .filter((p) => {
      const k = p.assignments.map((a) => a.role + ':' + a.memberId + ':' + a.heroId).join('|');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 3);
}

export function adaptiveSystems(
  members: SquadMember[],
  heroes: Hero[],
  includeLearning = false,
): typeof SYSTEMS {
  const available = members.map((m) => ({
    ...m,
    pool: effectivePool(m.pool, m.profile).filter((p) => includeLearning || p.level !== 'learning'),
  }));
  const patterns = [
    {
      id: 'adaptive-protect',
      name: '保核反打',
      slots: [
        { role: '发育路', traits: ['sustain'] },
        { role: '游走', traits: ['peel', 'frontline'] },
      ],
      idea: '围绕你们实际会玩的持续输出与保护英雄，先守住输出空间，再打反手。',
    },
    {
      id: 'adaptive-engage',
      name: '控制跟进',
      slots: [
        { role: '游走', traits: ['engage'] },
        { role: '中路', traits: ['magic'] },
        { role: '打野', traits: ['mobility', 'engage'] },
      ],
      idea: '用现有英雄池串起先手、控制和跟进，明确谁先交技能、谁保留收尾。',
    },
    {
      id: 'adaptive-poke',
      name: '消耗防反',
      slots: [
        { role: '中路', traits: ['poke'] },
        { role: '游走', traits: ['peel', 'frontline'] },
      ],
      idea: '先用消耗创造状态差，保护位保留反开技能，再跟兵线推进。',
    },
  ];
  return patterns.flatMap((pattern) => {
    let beam: { chosen: { hero: Hero; role: Role; memberId: string }[]; score: number }[] = [
      { chosen: [], score: 0 },
    ];
    for (const slot of pattern.slots) {
      const next: typeof beam = [];
      for (const state of beam)
        for (const member of available) {
          if (state.chosen.some((a) => a.memberId === member.id)) continue;
          for (const entry of member.pool) {
            const hero = heroes.find((h) => h.id === entry.heroId);
            if (
              !hero ||
              !hero.roles.includes(slot.role) ||
              state.chosen.some((a) => a.hero.id === hero.id) ||
              !noteFor(hero).traits.some((t) => slot.traits.includes(t))
            )
              continue;
            const readiness = mastery(hero.id, member.pool, member.profile).score;
            const style = styleFit(hero, noteFor(hero).traits, member.profile).score;
            next.push({
              chosen: [...state.chosen, { hero, role: slot.role as Role, memberId: member.id }],
              score: state.score + readiness * 0.8 + style * 0.2,
            });
          }
        }
      beam = next.sort((a, b) => b.score - a.score).slice(0, 32);
      if (!beam.length) return [];
    }
    const best = beam[0];
    return [
      {
        id: pattern.id,
        name: '自适配 · ' + pattern.name,
        roles: best.chosen.map((a) => a.role),
        heroes: best.chosen.map((a) => a.hero.name),
        difficulty: '由已选成员的真实英雄池生成',
        idea: pattern.idea,
        steps: [
          '先约定本局谁负责先手、谁负责保护和跟进。',
          '处理兵线后再行动，所有人确认同一处资源目标。',
          '每次团战只复盘一个协作断点，再调整技能顺序。',
        ],
        risk: '这是基于能力标签生成的候选组合，未验证实战胜率；特别技能交互需按当前版本实测。',
        drill: '一起打三局，分别记录先手跟进距离、关键保护技能和成功团战后的资源转化。',
      },
    ];
  });
}
export function recommendSystems(members: SquadMember[], heroes: Hero[], includeLearning = false) {
  const systems = [...adaptiveSystems(members, heroes, includeLearning), ...SYSTEMS];
  return systems
    .map((system) => {
      const core = system.heroes.map((name, i) => ({
        heroId: heroes.find((h) => h.name === name)!.id,
        role: system.roles[i] as Role,
      }));
      const match = matchSystem(core, members, includeLearning, heroes);
      const coverage = match.assigned.length / core.length;
      const readiness = match.assigned.length
        ? match.assigned.reduce((n, a) => n + a.readiness, 0) / match.assigned.length
        : 0;
      const weakest = match.assigned.length
        ? Math.min(...match.assigned.map((a) => a.readiness))
        : 0;
      const score = Math.round(coverage * 50 + readiness * 0.35 + weakest * 0.15);
      const reason = match.complete
        ? `核心位置都能由不同成员承担，平均适配准备度 ${Math.round(readiness)}`
        : `可分配 ${match.assigned.length}/${core.length} 个核心位置；还缺 ${match.missing.map((a) => heroes.find((h) => h.id === a.heroId)?.name).join('、')}`;
      const practice = match.assigned
        .filter((a) => a.readiness < 60)
        .map(
          (a) => `${a.memberName}先用${heroes.find((h) => h.id === a.heroId)?.name}稳定基础发挥`,
        );
      if (!practice.length && match.complete)
        practice.push('基础位置已覆盖，下一步重点练技能衔接和同目标沟通');
      return { system, match, score, reason, practice, weakest };
    })
    .sort(
      (a, b) =>
        Number(b.match.complete) - Number(a.match.complete) ||
        b.score - a.score ||
        b.weakest - a.weakest,
    );
}
