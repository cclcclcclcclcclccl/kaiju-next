import type { z } from 'zod';
import type { TianyuanStat, tianyuanTierSchema } from './tianyuan.ts';

export type SourceTier = z.infer<typeof tianyuanTierSchema>['tiers'][number];
// Public /tier page thresholds, verified 2026-10-14. This is the publisher's
// display rule, not our experimental strength model.
export const SOURCE_TIERS = ['T0', 'T0.5', 'T1', 'T2', 'T3', 'T4'] as const;
export function sourceTierLabel(score: number) {
  return SOURCE_TIERS[[70, 60, 45, 30, 15, 0].findIndex((min) => score >= min)] ?? 'T4';
}
export const sourceTierDate = (now = Date.now()) => {
  const china = new Date(now + 8 * 3600000);
  return new Date(china.getTime() - (china.getUTCHours() < 9 ? 86400000 : 0))
    .toISOString()
    .slice(0, 10);
};
export function sourceRoles(role: string) {
  return role.split('/').map((value) => ({
    name: value.replace('(次分路)', '').trim(),
    secondary: value.includes('(次分路)'),
  }));
}
export function sourceBoard(tiers: SourceTier[], stats: TianyuanStat[], role = '全部') {
  const selected = new Map<number, SourceTier>();
  for (const tier of tiers) {
    const roleEntry = sourceRoles(tier.role).find((r) => r.name === role);
    if (role !== '全部' && !roleEntry) continue;
    const old = selected.get(tier.heroId);
    const oldSecondary = old && sourceRoles(old.role).find((r) => r.name === role)?.secondary;
    if (
      !old ||
      (oldSecondary && !roleEntry?.secondary) ||
      (Boolean(oldSecondary) === Boolean(roleEntry?.secondary) &&
        (tier.finalNormalizedTierScore > old.finalNormalizedTierScore ||
          (tier.finalNormalizedTierScore === old.finalNormalizedTierScore &&
            tier.trueHeroPowerInRole > old.trueHeroPowerInRole)))
    )
      selected.set(tier.heroId, tier);
  }
  return [...selected.values()]
    .map((tier) => ({
      tier,
      label: sourceTierLabel(tier.finalNormalizedTierScore),
      stat: stats.find((r) => r.heroId === tier.heroId),
      secondary:
        role !== '全部' && !!sourceRoles(tier.role).find((r) => r.name === role)?.secondary,
    }))
    .sort(
      (a, b) =>
        Number(a.secondary) - Number(b.secondary) ||
        b.tier.finalNormalizedTierScore - a.tier.finalNormalizedTierScore ||
        b.tier.trueHeroPowerInRole - a.tier.trueHeroPowerInRole ||
        a.tier.heroId - b.tier.heroId,
    );
}
