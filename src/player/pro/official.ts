import { z } from 'zod';

export const OFFICIAL_RANK_PAGE = 'https://camp.qq.com/h5/webdist/hero-rank/index.html';
export const OFFICIAL_RANK_API =
  'https://kohcamp.qq.com/gametoolbox/hero/getsharepagedetailranklistbyid';
export const OFFICIAL_SEGMENTS: Record<string, number> = {
  大众分段: 1,
  '巅峰1350+': 3,
  顶端排位: 4,
};
export const OFFICIAL_POSITIONS: Record<string, number> = {
  全部分路: 0,
  对抗路: 1,
  中路: 2,
  发育路: 3,
  游走: 4,
  打野: 5,
};
export const officialQuerySchema = z
  .object({
    segment: z.coerce.number().refine((v) => [1, 3, 4].includes(v)),
    position: z.coerce.number().int().min(0).max(5),
  })
  .strict();
export type OfficialQuery = z.infer<typeof officialQuerySchema>;
const percent = z.number().min(0).max(100);
export const officialRankSchema = z.object({
  source: z.literal('王者营地官方公开分享榜'),
  sourceUrl: z.literal(OFFICIAL_RANK_PAGE),
  endpoint: z.literal(OFFICIAL_RANK_API),
  query: officialQuerySchema,
  sourceUpdatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fetchedAt: z.string().datetime(),
  coverage: z.literal('partial'),
  rows: z
    .array(
      z.object({
        heroId: z.number().int().positive(),
        name: z.string().min(1).max(80),
        heat: z.string().regex(/^T[0-9]$/),
        winRate: percent,
        pickRate: percent,
        banRate: percent,
      }),
    )
    .min(1)
    .max(10),
});
export type OfficialRank = z.infer<typeof officialRankSchema>;
export type OfficialRankResult = {
  data: OfficialRank;
  cache: 'fresh' | 'cached' | 'stale';
  warning?: string;
};
