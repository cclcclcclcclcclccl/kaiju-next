import { resolve } from 'node:path';
import { createOfficialRanks } from '../../server/pro/official.ts';
import { createRankRefresh } from '../../server/pro/refresh.ts';
const base = resolve(process.env.PLAYER_DATA_DIR ?? 'data');
const report = await createRankRefresh(
  createOfficialRanks({ cacheDir: resolve(base, 'official-ranks') }),
  resolve(base, 'official-rank-history'),
).run();
console.log(JSON.stringify(report, null, 2));
if (
  report.results.some((r) => r.state === 'error' || r.state === 'stale') ||
  report.persistenceError
)
  process.exitCode = 1;
