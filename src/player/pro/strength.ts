import { ROLES } from '../model.ts';
import { tianyuanStatsSchema } from './tianyuan.ts';
import type { TianyuanStat } from './tianyuan.ts';

export const STRENGTH_VERSION = '弈境强度 v2.0';
export const STRENGTH_TIERS = ['T0', 'T0.5', 'T1', 'T2', 'T3', 'T4'] as const;
export type StrengthTier = (typeof STRENGTH_TIERS)[number] | '待评估';
export const strengthTier = (score: number): StrengthTier =>
  score >= 70
    ? 'T0'
    : score >= 62
      ? 'T0.5'
      : score >= 54
        ? 'T1'
        : score >= 46
          ? 'T2'
          : score >= 38
            ? 'T3'
            : 'T4';
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function median(values: number[]) {
  if (!values.length) return 0;
  const a = [...values].sort((a, b) => a - b),
    m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function robust(values: number[], floor: number) {
  const center = median(values);
  const scale = Math.max(floor, 1.4826 * median(values.map((v) => Math.abs(v - center))));
  return { center, scale, z: (value: number) => clamp((value - center) / scale, -2.5, 2.5) };
}
function canonical(input: TianyuanStat[]) {
  const rows = tianyuanStatsSchema.parse(input);
  if (new Set(rows.map((r) => r.heroId)).size !== rows.length) throw Error('重复英雄不能参与梯度');
  // Forms are inspectable source records, never extra observations in a base-hero cohort.
  return rows.filter((r) => !r.baseHeroId || r.baseHeroId === r.heroId);
}
export function hasSourceRole(row: TianyuanStat, role: string) {
  return (
    role === '全部' || ((ROLES as readonly string[]).includes(role) && row.roles.includes(role))
  );
}
export type StrengthRow = {
  row: TianyuanStat;
  rank: number | null;
  score: number | null;
  tier: StrengthTier;
  components: { win: number; pick: number; ban: number };
  winRateUsed: number | null;
  winMode: number;
  attenuation: number;
  range: [number, number] | null;
  rankRange: [number, number] | null;
  possibleTiers: StrengthTier[];
  sensitive: boolean;
  reason: string;
};
export function strengthRanks(
  input: TianyuanStat[],
  mode: number,
  role = '全部',
  top?: TianyuanStat[],
) {
  if (![1, 3, 4, 5].includes(mode)) throw Error('不支持的统计分段');
  if (role !== '全部' && !(ROLES as readonly string[]).includes(role)) throw Error('不支持的定位');
  const rows = canonical(input).filter((r) => hasSourceRole(r, role));
  const reference = mode === 5 ? (top ? canonical(top) : []) : rows;
  const refs = new Map(reference.map((r) => [r.heroId, r]));
  const wins = rows.map((r) => refs.get(r.heroId)?.winRate).filter((v): v is number => v != null);
  const winScale = robust(wins, 1),
    pickScale = robust(
      rows.map((r) => Math.log1p(r.pickRate)),
      0.35,
    ),
    banScale = robust(
      rows.map((r) => Math.log1p(r.banRate)),
      0.5,
    );
  const k = Math.max(1, median(rows.map((r) => refs.get(r.heroId)?.pickRate ?? 0)) / 2);
  const winWeight = mode === 5 ? 0.6 : 0.7;
  const base = rows.map((row) => {
    const ref = refs.get(row.heroId);
    const attenuation = ref ? Math.sqrt(ref.pickRate / (ref.pickRate + k)) : 0;
    const zWin = ref?.winRate == null ? 0 : winScale.z(ref.winRate);
    const zPick = clamp(pickScale.z(Math.log1p(row.pickRate)), -1.5, 1.5);
    const zBan = clamp(banScale.z(Math.log1p(row.banRate)), -1.5, 1.5);
    const components = {
      win: 18 * winWeight * zWin * attenuation,
      pick: 18 * (1 - winWeight) * 0.6 * zPick,
      ban: 18 * (1 - winWeight) * 0.4 * zBan,
    };
    const eligible = rows.length >= 5 && wins.length >= 5 && ref?.winRate != null;
    const score = eligible
      ? clamp(50 + components.win + components.pick + components.ban, 0, 100)
      : null;
    const scenarios = eligible
      ? [winWeight - 0.1, winWeight, winWeight + 0.1].flatMap((w) =>
          [0.5, 0.6, 0.7].flatMap((p) =>
            [0.5, 1, 2].map((d) =>
              clamp(
                50 +
                  18 *
                    (w * zWin * Math.sqrt(ref!.pickRate / (ref!.pickRate + k * d)) +
                      (1 - w) * (p * zPick + (1 - p) * zBan)),
                0,
                100,
              ),
            ),
          ),
        )
      : [];
    const result: StrengthRow = {
      row,
      rank: null,
      score,
      tier: score === null ? '待评估' : strengthTier(score),
      components,
      winRateUsed: ref?.winRate ?? null,
      winMode: mode === 5 ? 4 : mode,
      attenuation,
      range: scenarios.length ? [Math.min(...scenarios), Math.max(...scenarios)] : null,
      rankRange: null,
      possibleTiers: [...new Set(scenarios.map(strengthTier))],
      sensitive: false,
      reason: !eligible
        ? mode === 5 && !ref
          ? '缺少同日顶端排位参考，暂不评级'
          : ref?.winRate == null
            ? '胜率缺失，暂不评级'
            : '可比英雄不足五位，暂不评级'
        : mode === 5
          ? '顶端排位胜率参考 + 千强选禁环境；跨人群代理评分'
          : '当前分段总体胜率为主，选用与禁用压力为辅',
    };
    result.sensitive = result.possibleTiers.length > 1;
    return { result, scenarios };
  });
  const ordering = (a: (typeof base)[number], b: (typeof base)[number]) =>
    (b.result.score ?? -1) - (a.result.score ?? -1) || a.result.row.heroId - b.result.row.heroId;
  base.sort(ordering);
  let previous: number | null = null,
    rank = 0;
  for (const [i, entry] of base.entries()) {
    if (entry.result.score === null) continue;
    if (entry.result.score !== previous) rank = i + 1;
    entry.result.rank = rank;
    previous = entry.result.score;
    const ranks = entry.scenarios.map(
      (score, index) =>
        1 + base.filter((other) => other.scenarios.length && other.scenarios[index] > score).length,
    );
    entry.result.rankRange = [Math.min(...ranks), Math.max(...ranks)];
  }
  return {
    version: STRENGTH_VERSION,
    mode,
    role,
    cohort: rows.length,
    eligible: wins.length,
    weights: { win: winWeight, pick: (1 - winWeight) * 0.6, ban: (1 - winWeight) * 0.4 },
    baseline: { winMedian: winScale.center, winScale: winScale.scale, damping: k },
    scenarioCount: 27,
    rows: base.map((e) => e.result),
  };
}
