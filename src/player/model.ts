import { z } from 'zod';
export const ROLES = ['对抗路', '打野', '中路', '发育路', '游走'] as const;
export type Role = (typeof ROLES)[number];
export type Hero = {
  id: number;
  name: string;
  slug: string;
  title: string;
  roles: string[];
  classes: string[];
  portrait: string;
  cover: string;
  source: string;
  skills: { name: string; description: string; tip?: string; cooldown?: string; cost?: string }[];
  difficulty?: number | null;
  mechanics?: {
    survival: number | null;
    attack: number | null;
    skill: number | null;
    tags: string[];
  };
  builds?: {
    items: { id: number; name: string; price: number; description: string }[];
    unresolvedItemIds?: number[];
    note: string;
  }[];
  runes?: { id: number; name: string; color: string; description: string }[];
  runeNote?: string;
  relations?: { type: string; heroId: number; reason: string; source: string }[];
  guide?: {
    play: string;
    against: string;
    teamfight: string;
    leveling: string;
    buildNotes: string[];
    source: string;
  } | null;
};
const heroId = z.number().int().positive().max(10000);
export const poolSchema = z
  .array(z.object({ heroId, level: z.enum(['learning', 'comfortable', 'main']) }).strict())
  .max(150)
  .refine((p) => new Set(p.map((x) => x.heroId)).size === p.length, '英雄池不能重复');
export type Pool = z.infer<typeof poolSchema>;
const side = z
  .object(
    Object.fromEntries(ROLES.map((r) => [r, heroId.optional()])) as Record<
      Role,
      z.ZodOptional<typeof heroId>
    >,
  )
  .strict();
export const draftSchema = z
  .object({
    role: z.enum(ROLES),
    preference: z.enum(['comfort', 'balanced', 'meta']).optional(),
    segment: z
      .enum(['大众分段', '顶端排位', '巅峰1350+', '巅峰1800+', '巅峰万强', '巅峰千强'])
      .optional(),
    memberId: z.string().uuid().optional(),
    allies: side,
    enemies: side,
    banned: z.array(heroId).max(10),
    onlyPool: z.boolean(),
    pool: poolSchema,
  })
  .strict()
  .superRefine((d, ctx) => {
    const ids = [...Object.values(d.allies), ...Object.values(d.enemies), ...d.banned].filter(
      (x) => x !== undefined,
    );
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: '双方阵容与禁用英雄不能重复' });
  });
export type Draft = z.infer<typeof draftSchema>;
export const emptyDraft = (): Draft => ({
  role: '中路',
  allies: {},
  enemies: {},
  banned: [],
  onlyPool: false,
  pool: [],
});
export const matchSchema = z
  .object({
    heroId,
    role: z.enum(ROLES),
    outcome: z.enum(['win', 'loss']),
    kills: z.number().int().min(0).max(100),
    deaths: z.number().int().min(0).max(100),
    assists: z.number().int().min(0).max(100),
    minutes: z.number().int().min(1).max(120),
    focus: z.enum(['站位与生存', '兵线与发育', '支援与转线', '开团与配合', '资源与推塔']),
    note: z.string().trim().max(1200),
    nextAction: z.string().trim().min(1).max(240),
    playedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => {
        const d = new Date(v + 'T00:00:00Z');
        return !isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
      }, '日期无效'),
  })
  .strict();
export type MatchInput = z.infer<typeof matchSchema>;
export type Match = MatchInput & { id: string; createdAt: string; done: boolean };
export type SavedPlan = {
  id: string;
  name: string;
  createdAt: string;
  draft: Draft;
  heroId: number;
  summary: string;
};
export const levelNames = { learning: '正在练', comfortable: '熟练', main: '本命' };
