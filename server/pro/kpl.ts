import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { kplCasesSchema } from '../../src/player/pro/kpl.ts';
import type { KplCases } from '../../src/player/pro/kpl.ts';
const origin = 'https://kplshop-op.timi-esports.qq.com/kplow/';
const scheduleSchema = z.object({
  result: z.literal(0),
  data: z.object({
    list: z.array(
      z.object({
        scheduleid: z.string().min(1),
        seasonid: z.string().min(1),
        start_timestamp: z.string(),
        team_a_name: z.string(),
        team_b_name: z.string(),
        schedule_status: z.number(),
      }),
    ),
  }),
});
const detailSchema = z.object({
  result: z.literal(0),
  data: z.object({
    title: z.string(),
    round_details: z.array(
      z.object({
        round: z.number().int().positive(),
        vid: z.string(),
        players: z.array(
          z.object({
            hero_id: z.number().int().positive(),
            hero_name: z.string(),
            playerid: z.string(),
            vid: z.string(),
          }),
        ),
      }),
    ),
  }),
});
export function createKplCases(directory: string, fetcher: typeof fetch = fetch, now = Date.now) {
  let pending: Promise<KplCases> | undefined;
  const file = join(directory, 'cases.json');
  async function read(): Promise<KplCases> {
    let saved: KplCases | undefined;
    try {
      saved = kplCasesSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    } catch {}
    const age = saved ? now() - Date.parse(saved.fetchedAt) : Infinity;
    if (saved && age >= 0 && age < 3600000) return { ...saved, cache: 'cached' };
    const sources: KplCases['sources'] = [];
    async function request(name: string, body: Record<string, unknown>) {
      const url = origin + name;
      const response = await fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Error('KPL来源HTTP ' + response.status);
      const raw = await response.text();
      if (raw.length > 2 * 1024 * 1024) throw Error('KPL响应过大');
      const rawSha256 = createHash('sha256').update(raw).digest('hex');
      await mkdir(join(directory, 'raw'), { recursive: true });
      await writeFile(join(directory, 'raw', rawSha256 + '.json'), raw);
      sources.push({ url, request: body, rawSha256 });
      return JSON.parse(raw);
    }
    try {
      const schedules = scheduleSchema.parse(
        await request('getScheduleList', { direction: 1, pivot_scheduleid: '', page_size: 15 }),
      ).data.list;
      const selected = schedules
        .filter((s) => s.schedule_status === 4)
        .sort((a, b) => Number(b.start_timestamp) - Number(a.start_timestamp))
        .slice(0, 3);
      const matches: KplCases['matches'] = [];
      for (const match of selected) {
        const detail = detailSchema.parse(
          await request('getScheduleDetail', {
            seasonid: match.seasonid,
            scheduleid: match.scheduleid,
          }),
        ).data;
        matches.push({
          id: match.scheduleid,
          season: match.seasonid,
          title: detail.title || match.team_a_name + ' vs ' + match.team_b_name,
          startedAt: new Date(Number(match.start_timestamp) * 1000).toISOString(),
          rounds: detail.round_details
            .filter((r) => r.vid)
            .map((r) => ({
              round: r.round,
              url:
                'https://kpl.qq.com/PlayBack?' +
                new URLSearchParams({
                  seasonid: match.seasonid,
                  scheduleid: match.scheduleid,
                  round: String(r.round),
                  vid: r.vid,
                }).toString(),
              heroes: r.players.map((p) => ({
                id: p.hero_id,
                name: p.hero_name,
                playerId: p.playerid,
                hasPlayerView: !!p.vid,
              })),
            })),
        });
      }
      if (!matches.length) throw Error('本批次没有可用的已结束比赛');
      const packet = kplCasesSchema.parse({
        source: 'KPL 官方赛事网站',
        sourceUrl: 'https://kpl.qq.com/',
        fetchedAt: new Date(now()).toISOString(),
        cache: 'fresh',
        trained: false,
        sources,
        matches,
      });
      await mkdir(directory, { recursive: true });
      const temp = file + '.' + randomUUID() + '.tmp';
      await writeFile(temp, JSON.stringify(packet, null, 2));
      await rename(temp, file);
      return packet;
    } catch (error) {
      if (saved)
        return {
          ...saved,
          cache: 'stale',
          warning: '官方赛事更新失败，保留此前取得的素材索引；不是已训练样本。',
        };
      throw error;
    }
  }
  return {
    get: () =>
      pending ??
      (pending = read().finally(() => {
        pending = undefined;
      })),
  };
}
