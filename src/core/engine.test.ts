import test from 'node:test';
import assert from 'node:assert/strict';
import { search, replay, proposePatches } from './engine.ts';
import { modelSchema } from './model.ts';
import { scenarios } from './scenarios.ts';

test('manufacturing witness uses repeated purchases and conserves protected inventory', () => {
  const model = scenarios[0].model;
  const result = search(model);
  assert.equal(result.status, 'counterexample');
  assert.equal(result.actions.length, 4);
  assert.equal(result.actions.filter(id => id === 'buy').length, 2);
  assert.deepEqual(result.trace.at(-1)!.inventory, { gold: 13, ore: 0, ingot: 0 });
  assert.equal(replay(model, result.actions).violates, true);
  assert.equal(search(model, { maxDepth: 3 }).status, 'bounded-clear');
});
test('both proposed parameter edits remove the known witness and pass bounded re-search', () => {
  const model = scenarios[0].model;
  const patches = proposePatches(model, search(model));
  assert.equal(patches.length, 2);
  for (const patch of patches) {
    assert.equal(replay(patch.model, ['buy','buy','smelt','sell']).violates, false);
    assert.equal(search(patch.model).status, 'bounded-clear');
  }
  assert.equal(model.actions[2].gain.gold, 7, 'suggestions must not mutate source model');
});
test('selling initial inventory is not treated as a closed loop', () => {
  const model = scenarios[2].model;
  assert.equal(replay(model, ['sell','sell']).profit, 4);
  assert.equal(replay(model, ['sell','sell']).violates, false);
  assert.equal(search(model).status, 'bounded-clear');
});
test('state exhaustion is inconclusive and invalid bounds are rejected', () => {
  assert.equal(search(scenarios[0].model, { maxStates: 1 }).status, 'inconclusive');
  assert.throws(() => search(scenarios[0].model, { maxDepth: 5000 }));
});
test('invalid references, duplicate identifiers, unknown fields and negative resource costs fail validation', () => {
  for (const mutate of [
    (m: any) => m.actions[0].cost.gold = -1,
    (m: any) => m.actions[0].gain.unknown = 1,
    (m: any) => m.resources[1].id = 'gold',
    (m: any) => m.contract.restore.push('gold'),
    (m: any) => m.executableCode = 'arbitrary code',
  ]) {
    const model = structuredClone(scenarios[0].model); mutate(model);
    assert.equal(modelSchema.safeParse(model).success, false);
  }
});
test('replay rejects impossible or missing actions', () => {
  assert.throws(() => replay(scenarios[0].model, ['sell']), /资源不足/);
  assert.throws(() => replay(scenarios[0].model, ['missing']), /不存在/);
});
test('allowed profit is respected and new prices change actual search results', () => {
  for (let sale = 1; sale <= 12; sale++) {
    const model = structuredClone(scenarios[0].model);
    model.actions[2].gain.gold = sale;
    assert.equal(search(model).status, sale > 6 ? 'counterexample' : 'bounded-clear');
  }
  const permitted = structuredClone(scenarios[1].model);
  permitted.contract.allowedProfit = 2;
  assert.equal(search(permitted, { maxDepth: 3 }).status, 'bounded-clear');
  assert.equal(search(permitted, { maxDepth: 6 }).profit, 4);
});
test('independent exhaustive enumeration agrees with BFS on branching economies', () => {
  // Separate test oracle enumerates action sequences, with no state deduplication.
  for (let sale = 3; sale <= 8; sale++) {
    const model = structuredClone(scenarios[0].model);
    model.actions[2].gain.gold = sale;
    let frontier = [{ gold: 12, ore: 0, ingot: 0 }];
    let shortest = 0;
    for (let depth = 1; depth <= 6 && !shortest; depth++) {
      const next: typeof frontier = [];
      for (const state of frontier) {
        if (state.gold >= 3) next.push({ ...state, gold: state.gold - 3, ore: state.ore + 1 });
        if (state.ore >= 2) next.push({ ...state, ore: state.ore - 2, ingot: state.ingot + 1 });
        if (state.ingot >= 1) next.push({ ...state, gold: state.gold + sale, ingot: state.ingot - 1 });
      }
      if (next.some(s => s.gold > 12 && s.ore === 0 && s.ingot === 0)) shortest = depth;
      frontier = next;
    }
    const actual = search(model, { maxDepth: 6 });
    assert.equal(actual.actions.length, shortest);
  }
});
