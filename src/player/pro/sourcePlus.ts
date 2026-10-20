import { z } from 'zod';
export const PLUS_ROUTES = {
  heroEquip: '/api/hero/equip',
  allStats: '/api/herostats',
  peakTrends: '/api/global/masterscore/trends',
  overview: '/api/global/winrate',
  topban: '/api/global/topban',
  power: '/api/global/toppower',
  peaks: '/api/global/masterscore',
  players: '/api/global/masterscore/player',
  skills: '/api/skill/global',
  equipment: '/api/equipment/global',
  equipmentHistory: '/api/equipment/trends',
  equipmentUsage: '/api/equipment/usage',
  movements: '/api/equipment/movements',
  equipmentTrends: '/api/equipment/list-trends',
  skins: '/api/skins',
  votes: '/api/skin-votes/trend',
  codes: '/api/xiaomagao/realtime',
  trends: '/api/herostats/trends',
  skinTrends: '/api/herostats/skin/trends',
  adjustments: '/api/hero/adjustments',
  highlights: '/api/hero/highlights',
  behavior: '/api/hero/behavior',
  heroBp: '/api/hero/bp',
  heroPower: '/api/hero/power',
  jungle: '/api/jungle-route',
  matches: '/api/match/find',
  match: '/api/match/detail',
  recommend: '/api/hero/analysis/recommend',
} as const;
export type PlusKind = keyof typeof PLUS_ROUTES;
export type SourceRow = Record<string, any>;
export type PlusPacket = {
  source: string;
  sourceClass: 'third-party-public';
  url: string;
  query: PlusQuery;
  fetchedAt: string;
  rawSha256: string;
  cache: 'fresh' | 'cached' | 'stale';
  warning?: string;
  data: SourceRow;
};
const str = z.string().max(1000);
export const plusQuerySchema = z
  .object({
    kind: z.enum(Object.keys(PLUS_ROUTES) as [PlusKind, ...PlusKind[]]),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s)
      .optional(),
    id: z.coerce.number().int().positive().max(100000).optional(),
    equipmentId: z.coerce.number().int().positive().max(100000).optional(),
    position: z.coerce.number().int().min(0).max(4).optional(),
    chain: z.coerce.number().int().min(1).max(1).optional(),
    chainOnly: z.coerce.number().int().min(1).max(1).optional(),
    ...Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((n) => [
        's' + n,
        z.coerce.number().int().positive().max(100000).optional(),
      ]),
    ),
    heroId: z.coerce.number().int().positive().max(10000).optional(),
    areaId: z.coerce.number().int().min(1).max(10).optional(),
    areaType: z.coerce.number().int().min(1).max(4).optional(),
    rankNo: z.coerce.number().int().min(1).max(10000).optional(),
    gameMode: z.coerce
      .number()
      .refine((n) => [1, 3, 4, 5, 6, 7, 8].includes(n))
      .optional(),
    days: z.coerce.number().int().min(0).max(1000).optional(),
    hours: z.coerce.number().int().min(0).max(1000).optional(),
    pickOrder: z
      .string()
      .regex(/^[1-5](,[1-5]){0,4}$/)
      .optional(),
    banOrder: z
      .string()
      .regex(/^[1-5](,[1-5]){0,4}$/)
      .optional(),
    camp: z.enum(['blue', 'red']).optional(),
    metric: z.enum(['ban', 'pick']).optional(),
    branchType: z.coerce.number().int().min(0).max(7).optional(),
    camp1Heroes: str.optional(),
    camp2Heroes: str.optional(),
    camp1ExcludeHeroes: str.optional(),
    camp2ExcludeHeroes: str.optional(),
    heroIds: str.optional(),
    gameId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,100}$/)
      .optional(),
  })
  .strict();
export type PlusQuery = z.infer<typeof plusQuerySchema>;
const allowed: Record<PlusKind, string[]> = {
  heroEquip: [
    'heroId',
    'date',
    'position',
    'chain',
    'chainOnly',
    's1',
    's2',
    's3',
    's4',
    's5',
    's6',
  ],
  allStats: ['date', 'gameMode'],
  peakTrends: ['days', 'areaType', 'branchType', 'rankNo'],
  overview: ['date'],
  topban: ['date', 'camp', 'metric', 'pickOrder', 'banOrder'],
  power: ['date', 'areaId', 'rankNo'],
  peaks: ['date', 'areaType'],
  players: ['date', 'areaId', 'rankNo', 'branchType'],
  skills: ['date'],
  equipment: ['date', 'days'],
  equipmentHistory: ['id', 'days'],
  equipmentUsage: ['equipmentId', 'date', 'days'],
  movements: ['date'],
  equipmentTrends: [],
  skins: [],
  votes: ['hours'],
  codes: [],
  trends: ['heroId', 'gameMode', 'days'],
  skinTrends: ['heroId', 'days'],
  adjustments: ['heroId'],
  highlights: ['heroId'],
  behavior: ['heroId'],
  heroBp: ['heroId', 'date'],
  heroPower: ['heroId', 'areaId'],
  jungle: ['heroId'],
  matches: ['camp1Heroes', 'camp2Heroes', 'camp1ExcludeHeroes', 'camp2ExcludeHeroes', 'days'],
  match: ['gameId'],
  recommend: ['heroIds'],
};
export function plusUrl(input: PlusQuery) {
  const q = plusQuerySchema.parse(input),
    keys = allowed[q.kind];
  for (const key of Object.keys(q))
    if (key !== 'kind' && !keys.includes(key)) throw Error('该查询不支持参数 ' + key);
  if (keys.includes('heroId') && !q.heroId) throw Error('请选择英雄');
  if (keys.includes('date') && !q.date) throw Error('请选择统计日期');
  if (q.kind === 'match' && !q.gameId) throw Error('缺少对局ID');
  if (q.kind === 'recommend') {
    const ids = z
      .array(z.number().int().positive().max(10000))
      .min(1)
      .max(5)
      .parse(JSON.parse(q.heroIds ?? '[]'));
    if (new Set(ids).size !== ids.length) throw Error('推荐英雄不能重复');
  }
  if (q.kind === 'matches') {
    let required = 0,
      total = 0;
    const selected: number[] = [];
    for (const key of keys.filter((k) => k !== 'days')) {
      const value = (q as Record<string, unknown>)[key];
      const row = z
        .record(z.string().regex(/^[0-4]$/), z.number().int().positive().max(10000))
        .parse(JSON.parse(String(value ?? '{}')));
      total += Object.keys(row).length;
      if (!key.includes('Exclude')) {
        required += Object.keys(row).length;
        selected.push(...Object.values(row));
      }
    }
    if (!required || total < 2) throw Error('至少一个必选英雄，必选与排除合计至少两个条件');
    if (new Set(selected).size !== selected.length) throw Error('必选英雄不能重复');
  }
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = (q as Record<string, unknown>)[key];
    if (value !== undefined) params.set(key, String(value));
  }
  if (q.kind === 'power') params.set('showAll', 'true');
  if (q.kind === 'jungle') params.set('heroRoutes', '1');
  return 'https://tianyuanzhiyi.com' + PLUS_ROUTES[q.kind] + (params.size ? '?' + params : '');
}
export function parsePlus(raw: unknown, kind: PlusKind): SourceRow {
  if (kind === 'allStats')
    return {
      rows: z
        .array(z.record(z.string(), z.unknown()))
        .max(500)
        .parse(Array.isArray(raw) ? raw : (raw as { rows?: unknown } | null)?.rows),
    };
  const row = z.record(z.string(), z.unknown()).parse(raw);
  if (row.error || row.success === false)
    throw Error(String(row.error ?? row.message ?? '来源没有返回有效数据'));
  const arrays: Partial<Record<PlusKind, string>> = {
    topban: 'heroes',
    power: 'heroes',
    peaks: 'branchRankings',
    skills: 'skillStats',
    equipment: 'equipmentStats',
    equipmentTrends: 'data',
    equipmentHistory: 'trends',
    equipmentUsage: 'heroUsageStats',
    skins: 'skins',
    votes: 'series',
    codes: 'items',
    trends: 'trends',
    peakTrends: 'trends',
    skinTrends: 'skinTrends',
    adjustments: 'adjustments',
    highlights: 'highlights',
    behavior: 'categories',
    heroBp: 'pickOrderStats',
    heroPower: 'rankDetails',
    matches: 'matchIds',
  };
  if (
    kind === 'heroEquip' &&
    !Array.isArray(row.topItemsBySlot) &&
    !Array.isArray(row.chainedTopItemsBySlot)
  )
    throw Error('来源缺少装备栏位');
  if (kind === 'match' && (!row.playerPerformances || !row.teamSummary))
    throw Error('来源缺少对局详情');
  if (kind === 'players' && !Array.isArray(row.players)) throw Error('来源缺少玩家列表');
  if (arrays[kind] && !Array.isArray(row[arrays[kind]!]))
    throw Error('来源字段结构变化：' + arrays[kind]);
  if (kind === 'overview')
    z.object({
      blueTeamWinRate: z.number().min(0).max(100),
      redTeamWinRate: z.number().min(0).max(100),
      averageDurationInSeconds: z.number().nonnegative(),
    }).parse(row);
  if (kind === 'matches')
    z.object({
      totalMatchesFound: z.number().int().nonnegative(),
      camp1WinRate: z.number().min(0).max(1).nullable(),
      camp2WinRate: z.number().min(0).max(1).nullable(),
    }).parse(row);
  if (kind === 'equipment')
    z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        pickRate: z.number().nonnegative().nullable(),
        winRate: z.number().min(0).max(100).nullable(),
      }),
    ).parse(row.equipmentStats);
  const records = z.array(z.record(z.string(), z.unknown())).max(10000);
  if (kind === 'skins') {
    z.array(z.array(z.unknown()).min(3)).max(500).parse(row.heroes);
    z.array(
      z
        .tuple([z.number(), z.number(), z.string(), z.string(), z.string(), z.number().nullable()])
        .rest(z.unknown()),
    )
      .max(5000)
      .parse(row.skins);
  }
  if (kind === 'votes') {
    z.array(z.string()).max(10000).parse(row.times);
    z.array(
      z.object({
        skinId: z.number(),
        skinName: z.string(),
        votes: z.array(z.number().nullable()),
        ranks: z.array(z.number().nullable()),
        addNums: z.array(z.number().nullable()),
      }),
    ).parse(row.series);
  }
  if (kind === 'highlights') z.array(z.string()).parse(row.highlights);
  if (kind === 'skinTrends')
    z.array(z.object({ date: z.string(), skins: records })).parse(row.skinTrends);
  if (kind === 'behavior')
    z.array(z.object({ title: z.string(), dataCounts: records })).parse(row.categories);
  if (kind === 'heroEquip') {
    const slots = z.array(z.object({ slot: z.number().int().min(1).max(6), topItems: records }));
    if (row.topItemsBySlot) slots.parse(row.topItemsBySlot);
    if (row.chainedTopItemsBySlot) slots.parse(row.chainedTopItemsBySlot);
  }
  if (kind === 'jungle')
    z.object({ blue: z.object({ patterns: records }), red: z.object({ patterns: records }) }).parse(
      row,
    );
  if (kind === 'match') z.object({ camp1: records, camp2: records }).parse(row.playerPerformances);
  if (kind === 'recommend' && !row.recommendations) throw Error('缺少推荐结果');
  if (kind === 'jungle' && (!row.blue || !row.red)) throw Error('缺少分边路线');
  return row;
}
export function publicImage(value: unknown, host = 'https://img.pvp.mcxssg.net') {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const u = new URL(value, host);
    return u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      ['img.pvp.mcxssg.net', 'game.gtimg.cn', 'game-1255653016.file.myqcloud.com'].includes(
        u.hostname,
      )
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
