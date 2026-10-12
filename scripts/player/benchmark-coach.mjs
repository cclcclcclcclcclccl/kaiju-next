import fs from 'node:fs';
import { heroes } from '../../src/player/catalog.ts';
import { simulateDraft } from '../../src/player/pro/arena.ts';
const seeds = [117, 218, 319, 421, 522, 623];
const results = [];
for (const seed of seeds)
  for (const policy of ['greedy', 'coverage']) {
    const r = simulateDraft(heroes, seed, policy);
    results.push({ ...r, phase: seeds.indexOf(seed) < 3 ? 'development' : 'held-out' });
    console.log(
      JSON.stringify({
        seed,
        policy,
        legal: r.legal,
        ms: r.elapsedMs,
        roles: r.meanRootRoles,
        nodes: r.nodes,
      }),
    );
  }
const report = {
  generatedAt: new Date().toISOString(),
  method:
    'Fixed seeds, paired policies, 2 practice bans and 10 legal picks; first 3 development and last 3 held-out. No learned weights, game-outcome predictor or professional replay labels.',
  summaries: ['development', 'held-out'].flatMap((phase) =>
    ['greedy', 'coverage'].map((policy) => {
      const rows = results.filter((r) => r.phase === phase && r.policy === policy);
      return {
        phase,
        policy,
        games: rows.length,
        legalGames: rows.filter((r) => r.legal).length,
        completeRoles: rows.every((r) => r.coverage === 5),
        meanRootRoles: rows.reduce((s, r) => s + r.meanRootRoles, 0) / rows.length,
        meanMs: Math.round(rows.reduce((s, r) => s + r.elapsedMs, 0) / rows.length),
      };
    }),
  ),
  results,
};
fs.mkdirSync('evidence/data-upgrade', { recursive: true });
fs.writeFileSync('evidence/data-upgrade/bp-evaluation.json', JSON.stringify(report, null, 2));
if (results.some((r) => !r.legal || r.coverage !== 5)) process.exitCode = 1;
