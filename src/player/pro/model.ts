import { z } from 'zod';
import { ROLES } from '../model.ts';
export const PLAY_STYLES = [
  '稳健发育',
  '主动游走',
  '先手开团',
  '保护队友',
  '远程消耗',
  '侧翼切入',
  '边带牵制',
] as const;
export const FOCUS_AREAS = [
  '技能命中',
  '进场时机',
  '站位生存',
  '兵线发育',
  '地图意识',
  '资源转化',
] as const;
export const habitsSchema = z
  .object({
    roles: z.array(z.enum(ROLES)).max(5),
    styles: z.array(z.enum(PLAY_STYLES)).max(7),
    mechanics: z.number().int().min(1).max(5),
    risk: z.enum(['稳健', '均衡', '主动']),
    goal: z.enum(['稳定上分', '拓展英雄池', '五排配合']),
    focus: z.array(z.enum(FOCUS_AREAS)).max(6),
    weeklyGames: z.number().int().min(0).max(300),
    notes: z.string().max(500),
  })
  .strict();
export const SEGMENTS = [
  '大众分段',
  '顶端排位',
  '巅峰1350+',
  '巅峰1800+',
  '巅峰万强',
  '巅峰千强',
] as const;
export const dateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, '日期无效');
const rate = z.number().min(0).max(100);
export const statRowSchema = z
  .object({
    heroId: z.number().int().positive(),
    role: z.enum(['对抗路', '打野', '中路', '发育路', '游走']),
    winRate: rate,
    pickRate: rate,
    banRate: rate,
    games: z.number().int().min(1).max(1e10).optional(),
    powerRank: z.number().int().min(1).max(10000000).optional(),
    opinion: rate.optional(),
    opinionSource: z.string().url().optional(),
  })
  .strict()
  .refine((r) => r.opinion === undefined || !!r.opinionSource, '评价分必须附来源');
export const snapshotSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    segment: z.enum(SEGMENTS),
    patch: z.string().trim().min(1).max(60),
    startDate: dateText,
    endDate: dateText,
    sourceName: z.string().trim().min(1).max(80),
    sourceUrl: z
      .string()
      .trim()
      .max(600)
      .refine((v) => {
        if (v.startsWith('#小程序://')) {
          const [name, token, ...rest] = v.slice(7).split('/');
          return !!name && /^[A-Za-z0-9]+$/.test(token ?? '') && rest.length === 0;
        }
        try {
          const u = new URL(v);
          return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
        } catch {
          return false;
        }
      }, '请填写有效网页链接或微信小程序分享口令'),
    denominator: z.enum(['match', 'unknown']),
    winRateScope: z.enum(['segment', 'all', 'unknown']).optional(),
    winRateWindow: z.enum(['range', 'version', 'unknown']).optional(),
    scopeNotes: z.string().trim().max(600).optional(),
    rows: z.array(statRowSchema).min(1).max(1000),
  })
  .strict()
  .refine((v) => v.startDate <= v.endDate, '起始日期不能晚于结束日期')
  .refine(
    (v) => v.denominator !== 'match' || v.rows.every((r) => r.pickRate + r.banRate <= 100.05),
    '已确认同一对局分母时，出场率与禁用率合计不能超过 100%',
  )
  .refine(
    (v) => new Set(v.rows.map((r) => r.heroId + '-' + r.role)).size === v.rows.length,
    '英雄与分路重复',
  );
export type StatSnapshot = z.infer<typeof snapshotSchema> & { id: string; importedAt: string };
export type StatRow = z.infer<typeof statRowSchema>;
export const heroMetricSchema = z
  .object({
    heroId: z.number().int().positive(),
    power: z.number().int().min(0).max(100000),
    games: z.number().int().min(0).max(100000),
    wins: z.number().int().min(0).max(100000).optional(),
    recentGames: z.number().int().min(0).max(1000),
    recentWins: z.number().int().min(0).max(1000).optional(),
    winRate: rate.optional(),
    recentWinRate: rate.optional(),
    averageRating: z.number().min(0).max(16).optional(),
    recentRating: z.number().min(0).max(16).optional(),
    seasonGames: z.number().int().min(0).max(100000).optional(),
    seasonWins: z.number().int().min(0).max(100000).optional(),
    seasonWinRate: rate.optional(),
    historicalPeakPower: z.number().int().min(0).max(100000).optional(),
    proficiencyPoints: z.number().int().min(0).max(10000000).optional(),
    performanceScore: z.number().min(0).max(100000).optional(),
    rankPerformanceScore: z.number().min(0).max(100000).optional(),
    peakPerformanceScore: z.number().min(0).max(100000).optional(),
    peakCoefficient: z.number().min(0).max(500).optional(),
    challengeCoefficient: z.number().min(0).max(500).optional(),
    inPool: z.boolean().optional(),
    dataSource: z.enum(['manual', 'file']).optional(),
    observedOn: dateText,
    evidence: z.string().max(300).default(''),
  })
  .strict()
  .refine(
    (v) =>
      (v.wins === undefined || v.wins <= v.games) &&
      (v.recentWins === undefined || v.recentWins <= v.recentGames) &&
      v.recentGames <= v.games &&
      (v.seasonGames === undefined || v.seasonGames <= v.games) &&
      (v.seasonWins === undefined ||
        (v.seasonGames !== undefined && v.seasonWins <= v.seasonGames)),
    '胜场和近期场次不能超过对应总场次',
  )
  .refine(
    (v) => v.historicalPeakPower === undefined || v.historicalPeakPower >= v.power,
    '历史最高战力不能低于当前战力',
  )
  .superRefine((v, ctx) => {
    for (const [games, wins, percentage, field] of [
      [v.games, v.wins, v.winRate, 'winRate'],
      [v.recentGames, v.recentWins, v.recentWinRate, 'recentWinRate'],
      [v.seasonGames, v.seasonWins, v.seasonWinRate, 'seasonWinRate'],
    ] as const) {
      if (
        games &&
        wins !== undefined &&
        percentage !== undefined &&
        Math.abs((wins / games) * 100 - percentage) > 0.11
      )
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: '胜率与对应场次、胜场不一致；可以只填胜场或只填胜率',
        });
    }
  });
export const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(24),
    season: z.string().trim().max(40),
    peakScore: z.number().int().min(0).max(5000),
    seasonPeakScore: z.number().int().min(0).max(5000).optional(),
    peakEnergy: z.number().min(0).max(10000).optional(),
    peakCoefficient: z.number().min(0).max(500).optional(),
    challengeCoefficient: z.number().min(0).max(500).optional(),
    habits: habitsSchema.optional(),
    sharePool: z.boolean(),
    heroes: z.array(heroMetricSchema).max(160),
  })
  .strict()
  .refine(
    (v) => new Set(v.heroes.map((h) => h.heroId)).size === v.heroes.length,
    '同一英雄不能重复录入',
  );
export type Profile = z.infer<typeof profileSchema>;
export type HeroMetric = z.infer<typeof heroMetricSchema>;
export type Habits = z.infer<typeof habitsSchema>;
export const emptyHabits = (): Habits => ({
  roles: [],
  styles: [],
  mechanics: 3,
  risk: '均衡',
  goal: '稳定上分',
  focus: [],
  weeklyGames: 10,
  notes: '',
});
export const emptyHeroMetric = (heroId: number): HeroMetric => ({
  heroId,
  power: 0,
  games: 0,
  recentGames: 0,
  observedOn: new Date().toLocaleDateString('en-CA'),
  evidence: '',
  dataSource: 'manual',
  inPool: true,
});
export const emptyProfile = (): Profile => ({
  name: '我的档案',
  season: '',
  peakScore: 1200,
  sharePool: false,
  heroes: [],
});
export const reviewEventSchema = z
  .object({
    id: z.string().uuid(),
    second: z.number().min(0).max(14400),
    label: z.string().trim().min(1).max(80),
    observation: z.string().trim().min(1).max(1200),
    decision: z.string().max(600),
    allies: z.number().int().min(0).max(5).nullable(),
    enemies: z.number().int().min(0).max(5).nullable(),
    allyGold: z.number().int().min(0).max(200000).nullable(),
    enemyGold: z.number().int().min(0).max(200000).nullable(),
    objectiveIn: z.number().int().min(0).max(600).nullable(),
    ultimateReady: z.boolean().nullable(),
    frame: z
      .string()
      .max(350000)
      .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
      .optional(),
  })
  .strict();
export const reviewSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    heroId: z.number().int().positive(),
    videoName: z.string().max(200),
    events: z.array(reviewEventSchema).min(1).max(30),
  })
  .strict()
  .refine((r) => new Set(r.events.map((e) => e.id)).size === r.events.length, '时间点 ID 重复');
export type ReviewEvent = z.infer<typeof reviewEventSchema>;
export type Review = z.infer<typeof reviewSchema> & { id: string; createdAt: string };
export const jungleSchema = z
  .object({
    heroId: z.number().int().positive(),
    route: z.enum(['red', 'blue']),
    seconds: z.number().min(30).max(600),
    patch: z.string().trim().min(1).max(40),
    conditions: z.string().trim().min(1).max(300),
  })
  .strict();
export type JungleRun = z.infer<typeof jungleSchema> & { id: string; createdAt: string };
export type ProData = {
  profile: Profile;
  snapshots: StatSnapshot[];
  reviews: Review[];
  runs: JungleRun[];
};
export const emptyPro = (): ProData => ({
  profile: emptyProfile(),
  snapshots: [],
  reviews: [],
  runs: [],
});
