import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strengthRanks } from '../../src/player/pro/strength.ts';
import { ROLES } from '../../src/player/model.ts';
const date = process.argv[2] ?? '2026-10-13';
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('Invalid date');
const directory = 'evidence/tianyuan-public-api/' + date;
const packets = [1, 3, 4, 5].map((mode) =>
  JSON.parse(readFileSync(`${directory}/stats-${mode}-0.json`, 'utf8')),
);
for (const p of packets) {
  if (p.query.date !== date) throw Error('Mismatched input date');
  const raw = readFileSync(`${directory}/raw/${p.rawSha256}.json`);
  if (createHash('sha256').update(raw).digest('hex') !== p.rawSha256)
    throw Error('Input hash mismatch');
}
const sourceTier = JSON.parse(readFileSync(directory + '/tier-0-0.json', 'utf8'));
const results = packets.flatMap((p) =>
  ['全部', ...ROLES].map((role) =>
    strengthRanks(p.data, p.query.mode, role, packets.find((p) => p.query.mode === 4).data),
  ),
);
const own = results.find((r) => r.mode === 5 && r.role === '全部');
const reference = new Map(sourceTier.data.tiers.map((r) => [r.heroId, r]));
const differences = own.rows
  .filter((r) => r.tier !== reference.get(r.row.heroId)?.tierInRole)
  .map((r) => ({
    heroId: r.row.heroId,
    name: r.row.heroName,
    ours: r.tier,
    publisher: reference.get(r.row.heroId)?.tierInRole,
  }));
const report = {
  version: own.version,
  evaluatedAt: new Date().toISOString(),
  sourceDate: date,
  inputs: packets.map((p) => ({ query: p.query, url: p.url, rawSha256: p.rawSha256 })),
  scope:
    'Numerical behavior and parameter stability; not match-outcome accuracy or professional validation.',
  boards: results.map((r) => ({
    ...r,
    summary: {
      rated: r.rows.filter((x) => x.score !== null).length,
      sensitive: r.rows.filter((x) => x.sensitive).length,
      buckets: r.rows.reduce((a, x) => ((a[x.tier] = (a[x.tier] ?? 0) + 1), a), {}),
    },
  })),
  publisherComparison: {
    note: 'Different algorithms/cohorts; differences do not prove ours is better. Publisher labels are not inputs or training targets.',
    count: differences.length,
    differences,
  },
};
mkdirSync('evidence/strength-v2', { recursive: true });
writeFileSync('evidence/strength-v2/evaluation.json', JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      boards: results.length,
      publisherTierDifferences: differences.length,
      global: results
        .filter((r) => r.role === '全部')
        .map((r) => ({
          mode: r.mode,
          heroes: r.rows.length,
          sensitive: r.rows.filter((x) => x.sensitive).length,
          top: r.rows[0].row.heroName,
        })),
    },
    null,
    2,
  ),
);
