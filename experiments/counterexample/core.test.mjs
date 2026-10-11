import test from 'node:test';
import assert from 'node:assert/strict';
import { makeModel, search, replay } from './core.mjs';

test('returns a legal shortest counterexample and independently replayable resource changes', () => {
  const model = makeModel(5);
  const result = search(model);
  assert.equal(result.status, 'counterexample');
  assert.deepEqual(result.actions, ['buy', 'craft', 'sell']);
  assert.deepEqual(result.trace.map(step => step.state), [
    { gold: 4, wood: 0, blade: 0 }, { gold: 0, wood: 2, blade: 0 },
    { gold: 0, wood: 0, blade: 1 }, { gold: 5, wood: 0, blade: 0 },
  ]);
  assert.equal(replay(model, result.actions).violates, true);
  assert.equal(search(model, { maxDepth: 2 }).status, 'no-counterexample-within-bound');
});

test('the same trace stops violating after a patch, and new bounded search also finds none', () => {
  const patched = makeModel(4);
  assert.equal(replay(patched, ['buy', 'craft', 'sell']).violates, false);
  assert.equal(search(patched, { maxDepth: 12 }).status, 'no-counterexample-within-bound');
});

test('a state budget exhaustion is inconclusive, never reported as safe', () => {
  const result = search(makeModel(5), { maxStates: 1 });
  assert.equal(result.status, 'inconclusive');
  assert.equal(result.reason, 'state budget reached');
});

test('rejects impossible actions and malformed numerical rules', () => {
  assert.throws(() => replay(makeModel(), ['sell']), /insufficient resources/);
  assert.throws(() => search(makeModel(-1)), /nonnegative/);
  assert.throws(() => search(makeModel(Number.NaN)), /nonnegative/);
  assert.throws(() => search(makeModel(), { maxDepth: -1 }), /bounds/);
});

test('checks arbitrary sale-price inputs instead of returning a fixed demonstration result', () => {
  for (const price of [0, 1, 3, 4, 5, 6, 9, 20]) {
    const result = search(makeModel(price), { maxDepth: 6 });
    assert.equal(result.status, price > 4 ? 'counterexample' : 'no-counterexample-within-bound');
  }
});

test('unchanged inventory is required; extra gold with consumed starting goods is not this violation', () => {
  const model = makeModel(5);
  model.initial = { gold: 4, wood: 0, blade: 1 };
  const sale = replay(model, ['sell']);
  assert.equal(sale.trace.at(-1).state.gold, 9);
  assert.equal(sale.violates, false);
});
