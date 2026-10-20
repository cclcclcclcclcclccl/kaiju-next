import { ROLES } from '../model.ts';
import type { Hero, Role, Draft } from '../model.ts';
export type RoleLocks = Record<string, Role>;
export type RoleInference = {
  lineup: Draft['allies'];
  alternatives: Record<number, Role[]>;
  unsupported: number[];
  locked: RoleLocks;
};
// At most 5! assignments per side. Catalog roles are eligibility evidence, not
// measured lane probabilities. Prefer supported assignments, then catalog order.
export function inferRoles(ids: number[], catalog: Hero[], locks: RoleLocks = {}): RoleInference {
  if (ids.length > 5 || new Set(ids).size !== ids.length) throw Error('一方最多五位不同英雄');
  const entries = ids.map((id) => {
    const hero = catalog.find((h) => h.id === id);
    if (!hero) throw Error('英雄不在目录中');
    return hero;
  });
  const relevant = Object.fromEntries(
    Object.entries(locks).filter(([id]) => ids.includes(Number(id))),
  ) as RoleLocks;
  const pinned = Object.values(relevant);
  if (pinned.some((r) => !ROLES.includes(r)) || new Set(pinned).size !== pinned.length)
    throw Error('手动分路重复，请交换位置或先解除锁定');
  let bestCost = Infinity,
    bestPreference = Infinity,
    best: Draft['allies'] = {};
  let alternatives: Record<number, Role[]> = {};
  const walk = (index: number, lineup: Draft['allies'], cost: number, preference: number) => {
    if (cost > bestCost) return;
    if (index === entries.length) {
      if (cost < bestCost) {
        bestCost = cost;
        bestPreference = Infinity;
        alternatives = {};
      }
      if (preference < bestPreference) {
        bestPreference = preference;
        best = { ...lineup };
      }
      for (const role of ROLES) {
        const id = lineup[role];
        // Emergency off-catalog placement must never be advertised as a supported flex lane.
        if (
          id !== undefined &&
          entries.find((h) => h.id === id)!.roles.includes(role) &&
          !alternatives[id]?.includes(role)
        )
          (alternatives[id] ??= []).push(role);
      }
      return;
    }
    const h = entries[index],
      locked = relevant[h.id];
    const choices = locked
      ? [locked]
      : [...ROLES].sort((a, b) => {
          const rank = (r: Role) =>
            h.roles.includes(r) ? h.roles.indexOf(r) : 100 + ROLES.indexOf(r);
          return rank(a) - rank(b);
        });
    for (const role of choices) {
      if (lineup[role] !== undefined || (!locked && pinned.includes(role))) continue;
      const supported = h.roles.includes(role);
      lineup[role] = h.id;
      walk(
        index + 1,
        lineup,
        cost + (supported ? 0 : 1),
        preference + (supported ? h.roles.indexOf(role) : 10),
      );
      delete lineup[role];
    }
  };
  walk(0, {}, 0, 0);
  if (!Number.isFinite(bestCost)) throw Error('分路约束无法组成阵容，请解除冲突的锁定');
  return {
    lineup: best,
    alternatives,
    locked: relevant,
    unsupported: ROLES.flatMap((r) =>
      best[r] !== undefined && !catalog.find((h) => h.id === best[r])!.roles.includes(r)
        ? [best[r]!]
        : [],
    ),
  };
}
export function changeRoleLock(
  ids: number[],
  catalog: Hero[],
  locks: RoleLocks,
  heroId: number,
  role: Role | 'auto',
): RoleLocks {
  if (!ids.includes(heroId)) throw Error('只能调整已选英雄');
  const next = { ...locks };
  if (role === 'auto') {
    delete next[heroId];
    return next;
  }
  const current = inferRoles(ids, catalog, locks).lineup;
  const previous = ROLES.find((r) => current[r] === heroId)!;
  const occupant = current[role];
  // Moving into an occupied slot is an explicit swap, including manually pinned players.
  if (occupant !== undefined && occupant !== heroId) next[occupant] = previous;
  next[heroId] = role;
  inferRoles(ids, catalog, next);
  return next;
}
