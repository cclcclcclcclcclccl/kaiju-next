import { ROLES, emptyDraft } from '../model.ts';
import type { Hero, Pool, Role, Draft } from '../model.ts';
import type { Profile } from './model.ts';
import { mastery } from './analytics.ts';
import { recommend } from '../tactics.ts';
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
) {
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
      used.add(m.id);
      visit(
        index + 1,
        [
          ...chosen,
          {
            ...target,
            memberId: m.id,
            memberName: m.name,
            readiness: fit.score,
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
