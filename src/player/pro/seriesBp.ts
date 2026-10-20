import { z } from 'zod';
import { sessionSchema, replaySession, roundsFor } from './bpSession.ts';
import type { BpSession } from './bpSession.ts';
const team = z.union([z.literal(0), z.literal(1)]);
export const seriesSchema = z.object({
  version: z.literal(1),
  bestOf: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(9)]),
  decidingRule: z.enum(['global', 'reset']).optional(),
  names: z.tuple([z.string().min(1).max(40), z.string().min(1).max(40)]),
  games: z
    .array(z.object({ blue: team, session: sessionSchema, winner: team.optional() }))
    .min(1)
    .max(9),
});
export type Series = z.infer<typeof seriesSchema>;
export function usedByTeam(series: Series) {
  const used: [number[], number[]] = [[], []];
  for (const g of series.games) {
    if (g.winner === undefined) continue;
    const d = replaySession(g.session);
    used[g.blue].push(...(Object.values(d.allies) as number[]));
    used[1 - g.blue].push(...(Object.values(d.enemies) as number[]));
  }
  return used;
}
export function seedSeriesGame(series: Series, blue: 0 | 1): BpSession {
  const used = usedByTeam(series);
  const reset = series.decidingRule === 'reset' && series.games.length === series.bestOf - 1;
  return {
    version: 1,
    format: 'staged',
    mode: 'manual',
    moves: [],
    unavailable: { allies: reset ? [] : used[blue], enemies: reset ? [] : used[1 - blue] },
  };
}
export function seriesScore(series: Series) {
  return [0, 1].map((team) => series.games.filter((g) => g.winner === team).length);
}
export function finishSeriesGame(series: Series, winner: 0 | 1): Series {
  const last = series.games.at(-1)!;
  if (last.winner !== undefined) throw Error('本局已记录结果');
  if (last.session.moves.length !== roundsFor(last.session.format).length)
    throw Error('请先完成本局 BP');
  replaySession(last.session);
  return {
    ...series,
    games: series.games.map((g, i) => (i === series.games.length - 1 ? { ...g, winner } : g)),
  };
}
export function nextSeriesGame(series: Series): Series {
  if (series.games.at(-1)!.winner === undefined) throw Error('请先记录本局结果');
  if (
    seriesScore(series).some((s) => s > series.bestOf / 2) ||
    series.games.length >= series.bestOf
  )
    throw Error('系列赛已经结束');
  const blue = (1 - series.games.at(-1)!.blue) as 0 | 1;
  return { ...series, games: [...series.games, { blue, session: seedSeriesGame(series, blue) }] };
}
export function parseSeries(raw: unknown): Series {
  const s = seriesSchema.parse(raw);
  if (s.games.length > s.bestOf) throw Error('系列赛局数超限');
  for (let i = 0; i < s.games.length; i++) {
    const g = s.games[i];
    if (g.session.format !== 'staged') throw Error('系列赛使用分阶段 20 手规则');
    if (i < s.games.length - 1 && g.winner === undefined) throw Error('历史比赛尚未确认');
    if (i && seriesScore({ ...s, games: s.games.slice(0, i) }).some((n) => n > s.bestOf / 2))
      throw Error('系列赛胜负已决');
    const prior = { ...s, games: s.games.slice(0, i) };
    const expected = seedSeriesGame(prior, g.blue).unavailable!;
    for (const side of ['allies', 'enemies'] as const)
      if (
        JSON.stringify([...(g.session.unavailable?.[side] ?? [])].sort((a, b) => a - b)) !==
        JSON.stringify([...expected[side]].sort((a, b) => a - b))
      )
        throw Error('跨局英雄限制不一致');
    replaySession(g.session);
    if (g.winner !== undefined && g.session.moves.length !== roundsFor(g.session.format).length)
      throw Error('历史 BP 不完整');
  }
  return s;
}

// Rebase every later game's restrictions; never silently drop a conflicting game.
export function reviseSeriesGame(
  series: Series,
  index: number,
  game: Series['games'][number],
  branch = false,
): Series {
  if (!Number.isInteger(index) || index < 0 || index >= series.games.length)
    throw Error('无效局数');
  const next: Series = { ...series, games: [] };
  const games = branch ? series.games.slice(0, index + 1) : series.games;
  for (let i = 0; i < games.length; i++) {
    const g = i === index ? game : games[i];
    const unavailable = seedSeriesGame(next, g.blue).unavailable;
    next.games.push({ ...g, session: { ...g.session, unavailable } });
    try {
      parseSeries(next);
    } catch (e) {
      throw Error(`第 ${i + 1} 局校验失败：${(e as Error).message}。原系列赛未修改。`);
    }
  }
  return parseSeries(next);
}
