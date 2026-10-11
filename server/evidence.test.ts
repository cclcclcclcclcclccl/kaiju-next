import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './store.ts';
import { verifyEvidence } from './evidence.ts';
import { search } from '../src/core/engine.ts';
import { scenarios } from '../src/core/scenarios.ts';

test('portable evidence replays independently and rejects altered rules, trace and playtest results', () => {
  const store = createStore(':memory:');
  try {
    const run = store.saveRun(scenarios[0].model, search(scenarios[0].model));
    const evidence = { format: 'hengju-evidence', formatVersion: 1, run };
    const result = verifyEvidence(evidence);
    assert.equal(result.witnessReplayed, true);
    assert.equal(result.boundedConclusionReproduced, true);
    for (const mutate of [
      (e: any) => (e.run.model.actions[0].cost.gold = 1),
      (e: any) => (e.run.result.trace.at(-1).inventory.gold = 1000),
      (e: any) => (e.run.playtests[0].status = 'blocked'),
      (e: any) => (e.run.result.actions = ['sell']),
      (e: any) => e.run.result.actions.push(...Array(128).fill('buy')),
    ]) {
      const altered = structuredClone(evidence);
      mutate(altered);
      assert.throws(() => verifyEvidence(altered));
    }
    const clear = store.saveRun(scenarios[2].model, search(scenarios[2].model));
    assert.equal(verifyEvidence({ ...evidence, run: clear }).boundedConclusionReproduced, true);
    const partial = store.saveRun(scenarios[0].model, search(scenarios[0].model, { maxStates: 1 }));
    assert.equal(verifyEvidence({ ...evidence, run: partial }).boundedConclusionReproduced, null);
  } finally {
    store.close();
  }
});
