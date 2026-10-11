import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createStore } from './store.ts';
import { createApp } from './app.ts';
import { scenarios } from '../src/core/scenarios.ts';
import { validateCandidate } from './model-provider.ts';

test('API performs real verification, persists snapshots and evaluates repair candidates', async t => {
  const store = createStore(':memory:');
  const app = createApp(store);
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => app.close(() => { store.close(); resolve(); })));
  const base = 'http://127.0.0.1:' + (app.address() as AddressInfo).port;
  const post = (path: string, data: unknown, extra: Record<string,string> = {}) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(data) });
  const created = await post('/api/projects', { model: scenarios[0].model });
  assert.equal(created.status, 200);
  assert.equal((await (await fetch(base + '/api/projects')).json()).length, 1);
  const analysis = await post('/api/analyze', { model: scenarios[0].model, bounds: { maxDepth: 12, maxStates: 12000, maxMillis: 1500 } });
  assert.equal(analysis.status, 200);
  const run = await analysis.json();
  assert.equal(run.result.status, 'counterexample');
  assert.equal(run.modelHash.length, 64);
  const restored = await (await fetch(base + '/api/runs/' + run.id)).json();
  assert.deepEqual(restored.result.trace, run.result.trace);
  const fixes = await (await post('/api/repairs', { runId: run.id })).json();
  assert.equal(fixes.length, 2);
  assert.ok(fixes.every((fix: any) => fix.result.status === 'bounded-clear' && !fix.oldTrace.violates));
  assert.equal((await post('/api/analyze', { model: { invalid: true } })).status, 400);
  assert.equal((await post('/api/projects', { model: scenarios[0].model }, { Origin: 'https://untrusted.example' })).status, 403);
  const huge = await post('/api/projects', { text: 'x'.repeat(140000) });
  assert.equal(huge.status, 413);
});
test('model candidate must cite every numeric field with an exact input quote', () => {
  const model = scenarios[0].model;
  const paths = [
    ...model.resources.map((_, i) => 'resources.' + i + '.initial'),
    ...model.actions.flatMap((a, i) => ['cost','gain'].flatMap(k => Object.keys(a[k as 'cost'|'gain']).map(r => 'actions.' + i + '.' + k + '.' + r))),
    'contract.allowedProfit',
  ];
  const valid = { status: 'candidate', model, evidence: paths.map(path => ({ path, quote: '原始规则' })), notes: [] };
  assert.equal(validateCandidate(valid, '这里是原始规则').status, 'candidate');
  assert.throws(() => validateCandidate({ ...valid, evidence: [] }, '原始规则'), /缺少/);
  assert.throws(() => validateCandidate(valid, '没有引文'), /缺少/);
  assert.equal(validateCandidate({ status: 'needs-clarification', questions: ['初始金币数量是多少？'] }, '不完整信息').status, 'needs-clarification');
});
