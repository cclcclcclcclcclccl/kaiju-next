import { reviewConfig } from '../reviewMode.ts';
import { z } from 'zod';
export const TIANYUAN_ORIGIN = 'https://tianyuanzhiyi.com';
export const TIANYUAN_MODES: Record<string, number> = {
  大众分段: 1,
  '巅峰1350+': 3,
  顶端排位: 4,
  巅峰千强: 5,
};
// Source page states 09:00 Beijing publication of the preceding day. Before
// publication use the prior completed day; this is a default, never silent fallback.
export const sourceDate = (now = Date.now()) => {
  const beijing = now + 8 * 3600000;
  const lag = new Date(beijing).getUTCHours() < 9 ? 2 : 1;
  return new Date(beijing - lag * 86400000).toISOString().slice(0, 10);
};
export const defaultSourceDate = () => reviewConfig?.statsDate ?? sourceDate();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
export const tianyuanQuerySchema = z
  .object({
    kind: z.enum(['stats', 'tier', 'skin', 'duration', 'analysis', 'equip', 'combined']),
    date: date.optional(),
    mode: z.coerce
      .number()
      .refine((n) => [1, 3, 4, 5].includes(n))
      .optional(),
    heroId: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (['skin', 'duration', 'analysis', 'equip', 'combined'].includes(q.kind) && !q.heroId)
      ctx.addIssue({ code: 'custom', message: '需要英雄ID' });
    if (['stats', 'tier', 'skin', 'equip', 'combined'].includes(q.kind) && !q.date)
      ctx.addIssue({ code: 'custom', message: '需要来源日期' });
    if (q.kind === 'stats' && !q.mode) ctx.addIssue({ code: 'custom', message: '需要公开分段' });
  });
export type TianyuanQuery = z.infer<typeof tianyuanQuerySchema>;
const rate = z.number().min(0).max(100),
  optionalRate = rate.nullable().optional();
// Only image hosts observed in the public source are accepted. Invalid optional
// images must not hide otherwise valid statistics.
const sourceImage = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ['img.pvp.mcxssg.net', 'game.gtimg.cn'].includes(url.hostname)
    );
  })
  .optional()
  .catch(undefined);
export const tianyuanStatsSchema = z
  .array(
    z.object({
      heroId: z.number().int().positive(),
      baseHeroId: z.number().int().positive().optional(),
      heroName: z.string().min(1),
      roles: z.string(),
      winRate: rate.nullable(),
      pickRate: rate,
      banRate: rate,
      dbUpdatedAt: z.string().datetime(),
      qAreaTop10Power: z.number().nonnegative().nullable().optional(),
      qAreaTop100Power: z.number().nonnegative().nullable().optional(),
      earlyWinRate: optionalRate,
      midWinRate: optionalRate,
      lateWinRate: optionalRate,
      kda: z.number().nonnegative().nullable().optional(),
      avgDamagePerMinute: z.number().nonnegative().nullable().optional(),
      avgEconomyPerMinute: z.number().nonnegative().nullable().optional(),
      avgJoinGamePercent: z.number().min(0).max(1).nullable().optional(),
    }),
  )
  .min(1)
  .max(500);
export type TianyuanStat = z.infer<typeof tianyuanStatsSchema>[number];
export const tianyuanTierSchema = z.object({
  queryDate: date,
  tiers: z
    .array(
      z.object({
        heroId: z.number().int().positive(),
        heroName: z.string(),
        date,
        role: z.string(),
        finalNormalizedTierScore: rate,
        tierInRole: z.string().regex(/^T\d(?:\.5)?$/),
        rankInRole: z.number().int().positive(),
        trueHeroPowerInRole: z.number().finite(),
        lowPick: z.boolean(),
        highBan: z.boolean(),
      }),
    )
    .min(1)
    .max(500),
});
export const tianyuanSkinSchema = z.object({
  heroId: z.number(),
  queryDate: date,
  skinDistribution: z
    .array(z.object({ skinName: z.string(), skinIcon: sourceImage, pickRate: rate.nullable() }))
    .max(100),
});
export const tianyuanDurationSchema = z.object({
  heroId: z.number(),
  avgWinDurationSeconds: z.number().nonnegative().nullable().optional(),
  avgLossDurationSeconds: z.number().nonnegative().nullable().optional(),
  winRateByDuration: z
    .array(
      z.object({
        winRate: rate.nullable(),
        intervalRate: rate.nullable(),
        durationRange: z.string(),
      }),
    )
    .max(100),
});
const relation = z.object({
  heroName: z.string(),
  totalMatches: z.number().int().nonnegative(),
  advantageIndex: z.number().finite().optional(),
  synergyIndex: z.number().finite().optional(),
});
export const tianyuanAnalysisSchema = z.object({
  heroId: z.number(),
  counters: z.array(relation),
  counteredBy: z.array(relation),
  goodSynergies: z.array(relation),
  badSynergies: z.array(relation),
});
export const tianyuanEquipSchema = z.object({
  heroId: z.number(),
  queryEndDate: z.string().datetime(),
  topItemsBySlot: z
    .array(
      z.object({
        slot: z.number().int().min(1).max(6),
        baseWinRate: optionalRate,
        topItems: z
          .array(
            z.object({
              equipId: z.number().int().positive(),
              equipName: z.string(),
              equipIcon: sourceImage,
              pickRate: rate.nullable(),
              winRate: rate.nullable(),
              deltaWinRate: z.number().finite().nullable().optional(),
            }),
          )
          .max(100),
      }),
    )
    .max(6)
    .optional(),
  topFullBuilds: z
    .array(
      z.object({
        build: z
          .array(
            z.object({
              equipId: z.number().int().positive(),
              equipName: z.string(),
              equipIcon: sourceImage,
            }),
          )
          .max(6),
        frequency: rate.nullable(),
        summonerSkill: z
          .object({ skillId: z.number().optional(), skillName: z.string(), skillIcon: sourceImage })
          .nullable()
          .optional(),
      }),
    )
    .max(100)
    .optional(),
  equipmentWinRates: z
    .array(
      z.object({
        equipmentId: z.number(),
        equipmentName: z.string(),
        equipmentIcon: sourceImage,
        pickRate: rate.nullable(),
        winRate: rate.nullable(),
      }),
    )
    .max(500),
});
export const tianyuanCombinedSchema = z.object({
  heroId: z.number(),
  positions: z.record(
    z.string(),
    z.object({ pickRate: rate.nullable(), winRate: rate.nullable() }),
  ),
  summonerSkills: z.array(
    z.object({
      skillName: z.string(),
      skillIcon: sourceImage,
      pickRate: rate.nullable(),
      winRate: rate.nullable(),
    }),
  ),
});
export function parseTianyuan(raw: unknown, q: TianyuanQuery) {
  if (raw && typeof raw === 'object' && 'error' in raw && typeof raw.error === 'string')
    throw Error('来源提示：' + raw.error.slice(0, 240));
  const schemas = {
    stats: tianyuanStatsSchema,
    tier: tianyuanTierSchema,
    skin: tianyuanSkinSchema,
    duration: tianyuanDurationSchema,
    analysis: tianyuanAnalysisSchema,
    equip: tianyuanEquipSchema,
    combined: tianyuanCombinedSchema,
  };
  const data = schemas[q.kind].parse(raw);
  if (q.kind === 'stats') {
    const rows = data as TianyuanStat[];
    if (new Set(rows.map((r) => r.heroId)).size !== rows.length) throw Error('来源重复英雄ID');
  } else {
    const value = data as {
      heroId?: number;
      queryDate?: string;
      tiers?: { heroId: number; date: string; role: string }[];
    };
    if (q.heroId && value.heroId !== q.heroId) throw Error('来源英雄身份不匹配');
    if (value.queryDate && value.queryDate !== q.date) throw Error('来源返回日期不匹配');
    if (
      value.tiers &&
      (value.tiers.some((r) => r.date !== q.date) ||
        new Set(value.tiers.map((r) => r.heroId + ':' + r.role)).size !== value.tiers.length)
    )
      throw Error('梯度日期或身份不一致');
  }
  return data;
}
export function tianyuanUrl(q: TianyuanQuery) {
  const url = new URL(
    '/api/' +
      {
        stats: 'herostats',
        tier: 'global/tier',
        skin: 'herostats/skin',
        duration: 'detail/specifyheroperiod',
        analysis: 'hero/analysis',
        equip: 'hero/equip',
        combined: 'herostats/combined',
      }[q.kind],
    TIANYUAN_ORIGIN,
  );
  if (q.date && !['duration', 'analysis'].includes(q.kind)) url.searchParams.set('date', q.date);
  if (q.kind === 'stats') url.searchParams.set('gameMode', String(q.mode));
  if (q.heroId) url.searchParams.set('heroId', String(q.heroId));
  return url.href;
}
export type TianyuanPacket<T = unknown> = {
  source: '天元之弈数据站';
  sourceClass: 'third-party-public';
  url: string;
  query: TianyuanQuery;
  requestedDate?: string;
  sourceUpdatedAt?: string;
  fetchedAt: string;
  rawSha256: string;
  cache: 'fresh' | 'cached' | 'stale';
  warning?: string;
  data: T;
};
