import type { SourceRow } from './sourcePlus.ts';
export function playerHeroDistribution(players: SourceRow[]) {
  const counts = new Map<
    number,
    { heroId: number; players: number; powers: number[]; bestRank: number | null }
  >();
  for (const player of players) {
    const perPlayer = new Map<number, SourceRow[]>();
    for (const entry of player.heroPowerRanks ?? []) {
      if (!Number.isInteger(entry.heroId) || entry.heroId <= 0) continue;
      perPlayer.set(entry.heroId, [...(perPlayer.get(entry.heroId) ?? []), entry]);
    }
    for (const [heroId, entries] of perPlayer) {
      const row = counts.get(heroId) ?? { heroId, players: 0, powers: [], bestRank: null };
      row.players++;
      const powers = entries
        .map((e) => e.powerValue)
        .filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
      if (powers.length) row.powers.push(Math.max(...powers));
      const ranks = entries.map((e) => e.rankNo).filter((v) => Number.isInteger(v) && v > 0);
      if (ranks.length) row.bestRank = Math.min(row.bestRank ?? Infinity, ...ranks);
      counts.set(heroId, row);
    }
  }
  return [...counts.values()]
    .map((r) => ({
      heroId: r.heroId,
      players: r.players,
      percent: players.length ? (r.players / players.length) * 100 : null,
      powerSamples: r.powers.length,
      averagePower: r.powers.length ? r.powers.reduce((a, b) => a + b, 0) / r.powers.length : null,
      maxPower: r.powers.length ? Math.max(...r.powers) : null,
      bestRank: r.bestRank,
    }))
    .sort((a, b) => b.players - a.players || a.heroId - b.heroId);
}
export function skinComparison(trends: SourceRow[], ids: string[]): SourceRow[] {
  return [...trends]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((r) => ({
      date: r.date,
      ...Object.fromEntries(
        ids.map((id) => {
          const v = r.skins?.find((s: SourceRow) => String(s.id) === id)?.pickRate;
          return [id, typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null];
        }),
      ),
    }));
}
