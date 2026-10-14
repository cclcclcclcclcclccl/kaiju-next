import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { heroes } from '../../src/player/catalog.ts';
import { createTianyuan } from '../../server/pro/tianyuan.ts';
import { sourceDate } from '../../src/player/pro/tianyuan.ts';
const date = process.argv[2] ?? sourceDate();
const full = process.argv.includes('--full');
const directory = resolve(process.env.PLAYER_DATA_DIR ?? 'data', 'tianyuan');
const source = createTianyuan({ directory, heroIds: heroes.map((h) => h.id) });
const output = resolve('evidence/tianyuan-public-api', date);
await mkdir(output, { recursive: true });
const report = {
  requestedDate: date,
  source: 'https://tianyuanzhiyi.com',
  authentication: 'none',
  startedAt: new Date().toISOString(),
  results: [],
};
const queries = [
  ...[1, 3, 4, 5].map((mode) => ({ kind: 'stats', mode, date })),
  { kind: 'tier', date },
  ...(full
    ? heroes.flatMap((h) =>
        ['skin', 'duration', 'analysis', 'equip', 'combined'].map((kind) => ({
          kind,
          heroId: h.id,
          ...(['duration', 'analysis'].includes(kind) ? {} : { date }),
        })),
      )
    : []),
];
for (const [i, q] of queries.entries()) {
  const file = [q.kind, q.mode ?? 0, q.heroId ?? 0].join('-') + '.json';
  try {
    const packet = await source.get(q);
    if (packet.cache === 'stale') throw Error(packet.warning);
    await writeFile(resolve(output, file), JSON.stringify(packet, null, 2));
    const raw = await readFile(resolve(directory, 'raw', packet.rawSha256 + '.json'));
    await mkdir(resolve(output, 'raw'), { recursive: true });
    await writeFile(resolve(output, 'raw', packet.rawSha256 + '.json'), raw);
    report.results.push({ query: q, state: 'ok', file, rawSha256: packet.rawSha256 });
  } catch (e) {
    report.results.push({ query: q, state: 'error', message: e.message });
  }
  if (i % 25 === 0 || i === queries.length - 1) {
    await writeFile(resolve(output, 'collection.json'), JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify({
        completed: i + 1,
        total: queries.length,
        errors: report.results.filter((r) => r.state === 'error').length,
      }),
    );
  }
}
report.completedAt = new Date().toISOString();
await writeFile(resolve(output, 'collection.json'), JSON.stringify(report, null, 2));
if (report.results.some((r) => r.state === 'error')) process.exitCode = 1;
