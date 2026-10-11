import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarios } from './scenarios.ts';
import { search, proposePatches } from './engine.ts';
import { evaluatePlaytests, replay } from './simulation.ts';
import { modelSchema } from './model.ts';

test('two exploit repairs differ in whether a low-budget player can still craft', () => {
  const model = scenarios[0].model;
  assert.equal(evaluatePlaytests(model)[0].status, 'pass');
  const patches = proposePatches(model, search(model));
  for (const patch of patches) {
    assert.equal(search(patch.model).status, 'bounded-clear');
    const test = evaluatePlaytests(patch.model)[0];
    if (patch.field === 'gain') {
      assert.equal(test.status, 'pass');
      assert.equal(test.inventory.ingot, 1);
    } else {
      assert.equal(test.status, 'blocked');
      assert.equal(test.failedStep, 2);
      assert.equal(test.inventory.gold, 2);
    }
  }
  assert.equal(model.resources[0].initial, 12);
});

test('a legal path can violate a minimum yield; baseline failures remain explicit', () => {
  const model = structuredClone(scenarios[0].model);
  model.playtests![0].minimum.ingot = 2;
  assert.equal(evaluatePlaytests(model)[0].status, 'below-minimum');
  model.playtests![0].initial = { gold: 3 };
  assert.equal(evaluatePlaytests(model)[0].status, 'blocked');
});

test('legacy models need no playtests, and dangling or oversized tests are rejected', () => {
  const model = structuredClone(scenarios[0].model);
  delete model.playtests;
  assert.deepEqual(evaluatePlaytests(model), []);
  for (const change of [
    (m: any) => m.playtests[0].actions.push('missing'),
    (m: any) => (m.playtests[0].initial.missing = 5),
    (m: any) => (m.playtests[0].minimum = {}),
    (m: any) => (m.playtests[0].actions = Array(33).fill('buy')),
    (m: any) => m.playtests.push(m.playtests[0]),
  ]) {
    const input = structuredClone(scenarios[0].model);
    change(input);
    assert.equal(modelSchema.safeParse(input).success, false);
  }
});

test('omitting a consumable from restoration changes the declared property', () => {
  const model = structuredClone(scenarios[2].model);
  model.resources.push({ id: 'badge', name: '徽记', initial: 0 });
  model.contract.restore = ['badge'];
  assert.equal(replay(model, ['sell']).violates, true);
  model.contract.restore.push('wood');
  assert.equal(replay(model, ['sell']).violates, false);
});
