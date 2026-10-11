import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { makeModel, search, replay } from './core.mjs';

const start = performance.now();
const before = search(makeModel(5), { maxDepth: 12, maxStates: 10000 });
const after = search(makeModel(4), { maxDepth: 12, maxStates: 10000 });
const oldTraceOnPatch = replay(makeModel(4), before.actions);
const report = {
  kind: 'synthetic technical feasibility experiment, not a real user study',
  nodeVersion: process.version,
  contract: 'Closed inventory trade/craft sequences must not increase gold without an external reward.',
  before, after, oldTraceOnPatch,
  elapsedMs: Number((performance.now() - start).toFixed(3)),
  limitations: [
    'Rules and the defect are intentionally constructed, not discovered in a real project.',
    'Only memoryless integer resource rules are modeled; no cooldowns, randomness or simultaneous players.',
    'No counterexample within a bound is not a proof of general safety or game balance.',
    'Economic profit is only a violation when the designer explicitly forbids it.',
    'No natural-language parsing, model API, full application, or novelty validation has been completed.',
  ],
};
writeFileSync(new URL('./result.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
