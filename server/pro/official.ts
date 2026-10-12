import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  OFFICIAL_RANK_API,
  OFFICIAL_RANK_PAGE,
  officialQuerySchema,
  officialRankSchema,
} from '../../src/player/pro/official.ts';
import type {
  OfficialQuery,
  OfficialRank,
  OfficialRankResult,
} from '../../src/player/pro/official.ts';

const fraction = z.number().min(0).max(1);
const responseSchema = z.object({
  returnCode: z.union([z.literal(0), z.literal('0')]),
  data: z.object({
    updateTime: z.string().regex(/^\d{8}$/),
    list: z
      .array(
        z.object({
          heroId: z.number().int().positive(),
          heroInfo: z.object({ heroName: z.string().min(1).max(80) }),
          tRank: z.string().regex(/^T[0-9]$/),
          winRate: fraction,
          showRate: fraction,
          banRate: fraction,
        }),
      )
      .min(1)
      .max(10),
  }),
});
export function parseOfficialRank(raw: unknown, query: OfficialQuery, now: number): OfficialRank {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new Error('官方响应不是有效的公开英雄榜，未覆盖已有数据');
  const { updateTime, list } = parsed.data.data;
  const date = `${updateTime.slice(0, 4)}-${updateTime.slice(4, 6)}-${updateTime.slice(6)}`;
  const timestamp = Date.parse(date);
  const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== date ||
    date > today
  )
    throw new Error('官方数据日期异常，未覆盖已有数据');
  if (new Set(list.map((r) => r.heroId)).size !== list.length)
    throw new Error('官方数据含重复英雄，未覆盖已有数据');
  const percent = (n: number) => Math.round(n * 10000) / 100;
  return officialRankSchema.parse({
    source: '王者营地官方公开分享榜',
    sourceUrl: OFFICIAL_RANK_PAGE,
    endpoint: OFFICIAL_RANK_API,
    query,
    sourceUpdatedOn: date,
    fetchedAt: new Date(now).toISOString(),
    coverage: 'partial',
    rows: list.map((r) => ({
      heroId: r.heroId,
      name: r.heroInfo.heroName,
      heat: r.tRank,
      winRate: percent(r.winRate),
      pickRate: percent(r.showRate),
      banRate: percent(r.banRate),
    })),
  });
}

export function createOfficialRanks(
  options: {
    cacheDir?: string;
    fetcher?: typeof fetch;
    now?: () => number;
  } = {},
) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const ttl = 30 * 60 * 1000;
  const memory = new Map<string, OfficialRank>();
  const inFlight = new Map<string, Promise<OfficialRankResult>>();
  const retryAfter = new Map<string, number>();
  async function read(query: OfficialQuery, key: string): Promise<OfficialRankResult> {
    let saved = memory.get(key);
    const file = options.cacheDir ? join(options.cacheDir, key + '.json') : undefined;
    if (!saved && file) {
      try {
        const candidate = officialRankSchema.parse(JSON.parse(await readFile(file, 'utf8')));
        if (
          candidate.query.segment === query.segment &&
          candidate.query.position === query.position
        ) {
          saved = candidate;
          memory.set(key, saved);
        }
      } catch {
        /* Missing or invalid cache: fetch the public source. */
      }
    }
    const age = saved ? now() - Date.parse(saved.fetchedAt) : Infinity;
    if (saved && age >= 0 && age < ttl) return { data: saved, cache: 'cached' };
    try {
      if ((retryAfter.get(key) ?? 0) > now()) throw new Error('稍后重试');
      const response = await fetcher(OFFICIAL_RANK_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', kohDimGender: '2' },
        body: JSON.stringify({ cSystem: null, h5Get: 1, rankId: 0, ...query, eId: null }),
        signal: AbortSignal.timeout(12000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('官方服务暂不可用');
      const text = await response.text();
      if (text.length > 256000) throw new Error('官方响应格式变化');
      const data = parseOfficialRank(JSON.parse(text), query, now());
      if (saved && data.sourceUpdatedOn < saved.sourceUpdatedOn)
        throw new Error('上游数据日期回退');
      if (file) {
        await mkdir(options.cacheDir!, { recursive: true });
        const temp = file + '.' + randomUUID() + '.tmp';
        await writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
        await rename(temp, file);
      }
      memory.set(key, data);
      retryAfter.delete(key);
      return { data, cache: 'fresh' };
    } catch {
      if ((retryAfter.get(key) ?? 0) <= now()) retryAfter.set(key, now() + 60000);
      if (saved)
        return {
          data: saved,
          cache: 'stale',
          warning: '本次未能更新官方数据，正在展示上次成功获取的记录。请核对下方日期。',
        };
      throw new Error('暂时无法读取官方公开榜，请稍后重试；没有用示例数据代替。');
    }
  }
  return {
    get(input: OfficialQuery): Promise<OfficialRankResult> {
      const query = officialQuerySchema.parse(input);
      const key = `${query.segment}-${query.position}`;
      let pending = inFlight.get(key);
      if (!pending) {
        pending = read(query, key).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      return pending;
    },
  };
}
