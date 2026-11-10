import type { Draft, Hero, Role } from '../model.ts';
import type { SquadMember } from './squad.ts';
import { effectivePool } from './analytics.ts';

export function laneOptions(
  draft: Draft,
  catalog: Hero[],
  role: Role,
  member: SquadMember,
  side: 'allies' | 'enemies',
  unavailable: number[] = [],
) {
  const registered = new Set(effectivePool(member.pool, member.profile).map((p) => p.heroId));
  const supported = catalog.filter((h) => registered.has(h.id) && h.roles.includes(role));
  const available: Hero[] = [],
    blocked: { hero: Hero; reason: string }[] = [];
  let assigned: Hero | undefined;
  for (const hero of supported) {
    if (draft[side][role] === hero.id) {
      assigned = hero;
      continue;
    }
    const reason = draft.banned.includes(hero.id)
      ? '已禁用'
      : Object.values(draft[side === 'allies' ? 'enemies' : 'allies']).includes(hero.id)
        ? '对方已选'
        : Object.values(draft[side]).includes(hero.id)
          ? '本方其他分路已选'
          : unavailable.includes(hero.id)
            ? '本队前局已用'
            : '';
    if (reason) blocked.push({ hero, reason });
    else available.push(hero);
  }
  return { registered: registered.size, supported: supported.length, available, blocked, assigned };
}
