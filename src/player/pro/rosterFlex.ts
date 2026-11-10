import { ROLES } from '../model.ts';
import type { Draft, Hero, Role } from '../model.ts';
import type { SquadMember } from './squad.ts';
import { effectivePool, mastery } from './analytics.ts';
import { inferRoles } from './flexRoles.ts';
import { styleFit } from './playstyle.ts';
import { noteFor } from '../tactics.ts';
import type { RoleInference, RoleLocks } from './flexRoles.ts';

export type Roster = Partial<Record<Role, SquadMember>>;
export type RosterContext = {
  members: Roster;
  respectPools: boolean;
  blocked?: number[];
  now?: number;
  readiness?: (role: Role, heroId: number) => number;
};

/** Assign picked heroes to players, retaining a distinct available hero for each
 * registered unfilled lane. Unregistered players remain unknown, not invented. */
export function assignRoster(
  ids: number[],
  catalog: Hero[],
  locks: RoleLocks = {},
  context: RosterContext,
): RoleInference {
  if (!Object.values(context.members).some(Boolean)) return inferRoles(ids, catalog, locks);
  if (ids.length > 5 || new Set(ids).size !== ids.length) throw Error('一方最多五位不同英雄');
  const byId = new Map(catalog.map((h) => [h.id, h]));
  if (ids.some((id) => !byId.has(id))) throw Error('英雄不在目录中');
  const relevant = Object.fromEntries(
    Object.entries(locks).filter(([id]) => ids.includes(Number(id))),
  );
  const pinned = Object.values(relevant);
  if (new Set(pinned).size !== pinned.length || pinned.some((r) => !ROLES.includes(r)))
    throw Error('手动分路重复，请解除锁定');
  const pools = new Map(
    ROLES.map((role) => [
      role,
      new Set(
        context.members[role]
          ? effectivePool(context.members[role]!.pool, context.members[role]!.profile).map(
              (p) => p.heroId,
            )
          : [],
      ),
    ]),
  );
  const eligible = (id: number, role: Role) =>
    !!byId.get(id)?.roles.includes(role) &&
    (!context.respectPools || !context.members[role] || pools.get(role)!.has(id));
  const blocked = new Set([...ids, ...(context.blocked ?? [])]);
  const pending = new Map(
    ROLES.map((role) => [
      role,
      catalog.filter((h) => !blocked.has(h.id) && eligible(h.id, role)).map((h) => h.id),
    ]),
  );
  const canComplete = (lineup: Draft['allies']) => {
    if (!context.respectPools) return true;
    const roles = ROLES.filter((r) => context.members[r] && lineup[r] === undefined).sort(
      (a, b) => pending.get(a)!.length - pending.get(b)!.length,
    );
    const owner = new Map<number, Role>();
    const match = (role: Role, seen: Set<number>): boolean => {
      for (const id of pending.get(role)!) {
        if (seen.has(id)) continue;
        seen.add(id);
        const previous = owner.get(id);
        if (!previous || match(previous, seen)) {
          owner.set(id, role);
          return true;
        }
      }
      return false;
    };
    return roles.every((role) => match(role, new Set()));
  };
  let best: Draft['allies'] | undefined,
    bestScore = -Infinity;
  const alternatives: Record<number, Role[]> = {};
  const scores = new Map<string, number>();
  const score = (role: Role, id: number) => {
    const key = role + ':' + id;
    if (!scores.has(key)) {
      const member = context.members[role];
      let ready =
        context.readiness?.(role, id) ??
        (member ? mastery(id, member.pool, member.profile, context.now).score : 50);
      if (!context.readiness && member?.profile?.habits)
        ready =
          ready * 0.85 +
          styleFit(byId.get(id)!, noteFor(byId.get(id)!).traits, member.profile).score * 0.15;
      scores.set(key, ready - byId.get(id)!.roles.indexOf(role) * 0.01);
    }
    return scores.get(key)!;
  };
  const visit = (index: number, lineup: Draft['allies'], value: number) => {
    if (index === ids.length) {
      if (!canComplete(lineup)) return;
      if (value > bestScore) {
        bestScore = value;
        best = { ...lineup };
      }
      for (const role of ROLES) {
        const id = lineup[role];
        if (id !== undefined && !alternatives[id]?.includes(role))
          (alternatives[id] ??= []).push(role);
      }
      return;
    }
    const id = ids[index],
      lock = relevant[id];
    for (const role of lock ? [lock] : ROLES) {
      if (lineup[role] !== undefined || (!lock && pinned.includes(role)) || !eligible(id, role))
        continue;
      lineup[role] = id;
      visit(index + 1, lineup, value + score(role, id));
      delete lineup[role];
    }
  };
  visit(0, {}, 0);
  if (!best)
    throw Error(
      '已选英雄、手动锁定或剩余英雄池无法满足成员分路。请调整分工、补充英雄池或关闭英雄池限制。',
    );
  return { lineup: best, alternatives, unsupported: [], locked: relevant };
}
