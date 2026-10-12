import type { Draft, Hero, Pool } from '../model.ts';
import type { Profile, StatSnapshot } from './model.ts';
import { mastery, tierList, usableSnapshot } from './analytics.ts';
export type DraftContext = { profile?: Profile; snapshot?: StatSnapshot };
export function personalFit(hero: Hero, draft: Draft, context: DraftContext) {
  const m = mastery(hero.id, draft.pool, context.profile);
  const stat = context.snapshot
    ? tierList(context.snapshot, draft.role).find((r) => r.row.heroId === hero.id)
    : undefined;
  const weights =
    draft.preference === 'comfort'
      ? { personal: 0.65, meta: 0.15, team: 0.2 }
      : draft.preference === 'meta'
        ? { personal: 0.25, meta: 0.45, team: 0.3 }
        : { personal: 0.45, meta: 0.25, team: 0.3 };
  // Unverified or tiny samples do not become a version-strength signal.
  const meta =
    stat &&
    context.snapshot &&
    usableSnapshot(context.snapshot) &&
    context.snapshot.segment === (draft.segment ?? '大众分段') &&
    stat.row.games &&
    stat.row.games >= 500 &&
    !['样本不足', '待验证'].includes(stat.tier)
      ? stat.score
      : null;
  return { mastery: m, meta, weights, stat };
}
