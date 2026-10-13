import observed from '../../../examples/tianyuan-complete-observation-2026-10-12.json' with { type: 'json' };
import { z } from 'zod';
import { ROLES } from '../model.ts';
const rate = z.number().min(0).max(100);
export const observationRowSchema = z.object({
  heroId: z.number().int().positive(),
  sourceRoles: z.array(z.enum(ROLES)).min(1),
  winRate: rate.nullable(),
  pickRate: rate,
  banRate: rate,
  evidence: z.array(z.string()).min(1),
  review: z.enum(['ocr-visual', 'manual-visual']),
});
export type ObservationRow = z.infer<typeof observationRowSchema>;
export const aggregateObservation = {
  ...observed,
  rows: z.array(observationRowSchema).parse(observed.rows),
};
export const ENVIRONMENT_VERSION = '环境梯度 v1.0';
export const ENVIRONMENT_THRESHOLDS = [90, 75, 55, 35] as const;
export function environmentTier(score: number) {
  return score >= 90 ? 'T0' : score >= 75 ? 'T1' : score >= 55 ? 'T2' : score >= 35 ? 'T3' : 'T4';
}
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
// Midrank percentiles preserve ties and avoid a single extreme rate dominating scale.
export function midrank(value: number, values: number[]) {
  if (values.length < 2) return 50;
  return (
    (100 *
      (values.filter((v) => v < value).length +
        (values.filter((v) => v === value).length - 1) / 2)) /
    (values.length - 1)
  );
}
export function environmentRanks(rows: ObservationRow[]) {
  rows = z.array(observationRowSchema).parse(rows);
  if (new Set(rows.map((r) => r.heroId)).size !== rows.length)
    throw Error('Duplicate hero observations');
  const picks = rows.map((r) => r.pickRate),
    bans = rows.map((r) => r.banRate);
  return rows
    .map((row) => {
      const pickPercentile = midrank(row.pickRate, picks),
        banPercentile = midrank(row.banRate, bans);
      // All-population cumulative win rate is only a bounded background modifier.
      // pick/(pick+2.5) limits niche win-rate influence, NOT a statistical sample size.
      const winSignal = row.winRate === null ? 0 : clamp((row.winRate - 50) * 10, -50, 50) / 10;
      const winModifier = (winSignal * row.pickRate) / (row.pickRate + 2.5);
      const score = clamp(0.55 * pickPercentile + 0.45 * banPercentile + winModifier);
      const scenarios = [0.45, 0.55, 0.65].flatMap((pickWeight) =>
        [0, 0.5, 1].map((winWeight) =>
          clamp(
            pickWeight * pickPercentile +
              (1 - pickWeight) * banPercentile +
              winWeight * winModifier,
          ),
        ),
      );
      const low = Math.min(...scenarios),
        high = Math.max(...scenarios),
        tiers = [...new Set(scenarios.map(environmentTier))];
      return {
        row,
        score,
        tier: environmentTier(score),
        pickPercentile,
        banPercentile,
        winModifier,
        range: [low, high] as [number, number],
        sensitive: tiers.length > 1,
        possibleTiers: tiers,
        winMissing: row.winRate === null,
      };
    })
    .sort((a, b) => b.score - a.score || a.row.heroId - b.row.heroId);
}
export const currentEnvironment = environmentRanks(aggregateObservation.rows);
