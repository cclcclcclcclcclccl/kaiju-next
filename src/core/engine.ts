import { performance } from 'node:perf_hooks';
import { modelSchema, boundsSchema, initialInventory } from './model.ts';
import type { Economy, Inventory, SearchResult, TraceStep, Patch } from './model.ts';

function nextState(state: Inventory, action: Economy['actions'][number]): Inventory | null {
  for (const [key, value] of Object.entries(action.cost)) if (state[key] < value) return null;
  return Object.fromEntries(Object.entries(state).map(([key, value]) =>
    [key, value - (action.cost[key] ?? 0) + (action.gain[key] ?? 0)]));
}
function violates(model: Economy, state: Inventory, initial: Inventory): boolean {
  return state[model.contract.target] - initial[model.contract.target] > model.contract.allowedProfit
    && model.contract.restore.every(key => state[key] === initial[key]);
}
export function replay(input: unknown, actions: string[]): { trace: TraceStep[]; violates: boolean; profit: number } {
  const model = modelSchema.parse(input);
  if (actions.length > 128) throw new Error('回放路径过长');
  const initial = initialInventory(model);
  let inventory = initial;
  const trace: TraceStep[] = [{ step: 0, actionId: null, actionName: '初始状态', inventory, profit: 0 }];
  for (const id of actions) {
    const action = model.actions.find(a => a.id === id);
    if (!action) throw new Error('回放动作不存在：' + id);
    const next = nextState(inventory, action);
    if (!next) throw new Error('第 ' + trace.length + ' 步资源不足，原路径已无法执行');
    inventory = next;
    trace.push({ step: trace.length, actionId: id, actionName: action.name, inventory, profit: inventory[model.contract.target] - initial[model.contract.target] });
  }
  return { trace, violates: violates(model, inventory, initial), profit: inventory[model.contract.target] - initial[model.contract.target] };
}
export function search(input: unknown, rawBounds: unknown = {}): SearchResult {
  const model = modelSchema.parse(input);
  const bounds = boundsSchema.parse(rawBounds);
  const start = performance.now();
  const initial = initialInventory(model);
  type Node = { inventory: Inventory; parent: number; action: string | null; depth: number };
  const queue: Node[] = [{ inventory: initial, parent: -1, action: null, depth: 0 }];
  const key = (state: Inventory) => model.resources.map(r => state[r.id]).join(',');
  const seen = new Set([key(initial)]);
  let expanded = 0, deepest = 0;
  const result = (status: SearchResult['status'], extras: Partial<SearchResult> = {}): SearchResult => ({
    status, bounds, visited: seen.size, expanded, elapsedMs: Math.round((performance.now() - start) * 100) / 100,
    deepest, actions: [], trace: [], profit: 0, ...extras,
  });
  const path = (node: Node): string[] => {
    const ids: string[] = [];
    let current = node;
    while (current.parent !== -1) {
      ids.push(current.action!);
      current = queue[current.parent];
    }
    return ids.reverse();
  };
  for (let cursor = 0; cursor < queue.length; cursor++) {
    if (performance.now() - start >= bounds.maxMillis) return result('inconclusive', { reason: 'time-budget' });
    const node = queue[cursor];
    if (node.depth >= bounds.maxDepth) continue;
    expanded++;
    for (const action of model.actions) {
      const inventory = nextState(node.inventory, action);
      if (!inventory) continue;
      const stateKey = key(inventory);
      if (seen.has(stateKey)) continue;
      if (seen.size >= bounds.maxStates) return result('inconclusive', { reason: 'state-budget' });
      seen.add(stateKey);
      const child: Node = { inventory, parent: cursor, action: action.id, depth: node.depth + 1 };
      deepest = Math.max(deepest, child.depth);
      if (violates(model, inventory, initial)) {
        const actions = path(child);
        const witness = replay(model, actions);
        return result('counterexample', { actions, trace: witness.trace, profit: witness.profit });
      }
      queue.push(child);
    }
  }
  return result('bounded-clear');
}
export function proposePatches(input: unknown, result: SearchResult): Patch[] {
  const model = modelSchema.parse(input);
  if (result.status !== 'counterexample') return [];
  const target = model.contract.target;
  const overrun = result.profit - model.contract.allowedProfit;
  const counts = new Map<string, number>();
  result.actions.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
  const patches: Patch[] = [];
  for (const field of ['gain', 'cost'] as const) {
    for (const [id, count] of counts) {
      const action = model.actions.find(a => a.id === id)!;
      const from = action[field][target] ?? 0;
      if (from === 0) continue;
      const delta = Math.ceil(overrun / count);
      const to = from + (field === 'gain' ? -delta : delta);
      if (to < 0 || to > 1_000_000) continue;
      const candidate = structuredClone(model);
      candidate.actions.find(a => a.id === id)![field][target] = to;
      if (!modelSchema.safeParse(candidate).success) continue;
      patches.push({ id: id + '-' + field, actionId: id, field, resourceId: target, from, to,
        title: (field === 'gain' ? '减少「' : '提高「') + action.name + '」的' + (field === 'gain' ? '产出' : '成本'),
        model: candidate });
    }
  }
  return patches.slice(0, 3);
}
