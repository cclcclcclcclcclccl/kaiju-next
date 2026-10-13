import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import {
  currentEnvironment,
  aggregateObservation,
  ENVIRONMENT_VERSION,
  ENVIRONMENT_THRESHOLDS,
} from '../../src/player/pro/environment.ts';
import { heroById } from '../../src/player/catalog.ts';

const report = {
  algorithm: ENVIRONMENT_VERSION,
  date: aggregateObservation.dataDate,
  thresholds: ENVIRONMENT_THRESHOLDS,
  interpretation:
    'Observed pick/ban environment with bounded overall-win modifier; not validated strength or a confidence interval.',
  heroCount: currentEnvironment.length,
  missingWin: currentEnvironment
    .filter((r) => r.winMissing)
    .map((r) => heroById(r.row.heroId).name),
  tiers: Object.fromEntries(
    ['T0', 'T1', 'T2', 'T3', 'T4'].map((t) => [
      t,
      currentEnvironment.filter((r) => r.tier === t).length,
    ]),
  ),
  sensitiveCount: currentEnvironment.filter((r) => r.sensitive).length,
  rankings: currentEnvironment.map((r) => ({
    heroId: r.row.heroId,
    name: heroById(r.row.heroId).name,
    score: r.score,
    tier: r.tier,
    range: r.range,
    possibleTiers: r.possibleTiers,
    pickPercentile: r.pickPercentile,
    banPercentile: r.banPercentile,
    winModifier: r.winModifier,
  })),
};
const output = resolve(process.argv[2] ?? 'evidence/data-continuity/environment-evaluation.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      output,
      heroCount: report.heroCount,
      tiers: report.tiers,
      sensitiveCount: report.sensitiveCount,
    },
    null,
    2,
  ),
);
