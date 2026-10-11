import { modelSchema, boundsSchema, initialInventory } from './model.ts';
import type { Economy, Inventory, SearchResult, Patch } from './model.ts';

import { nextState, violates, replay } from './simulation.ts';
export { replay } from './simulation.ts';

export function search(input: unknown, rawBounds: unknown = {}): SearchResult {
  const model = modelSchema.parse(input);
  const bounds = boundsSchema.parse(rawBounds);
  const start = performance.now();
  const initial = initialInventory(model);
  type Node = { inventory: Inventory; parent: number; action: string | null; depth: number };
  const queue: Node[] = [{ inventory: initial, parent: -1, action: null, depth: 0 }];
  const key = (state: Inventory) => model.resources.map((r) => state[r.id]).join(',');
  const seen = new Set([key(initial)]);
  let expanded = 0,
    deepest = 0;
  const result = (
    status: SearchResult['status'],
    extras: Partial<SearchResult> = {},
  ): SearchResult => ({
    status,
    bounds,
    visited: seen.size,
    expanded,
    elapsedMs: Math.round((performance.now() - start) * 100) / 100,
    deepest,
    actions: [],
    trace: [],
    profit: 0,
    ...extras,
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
    if (performance.now() - start >= bounds.maxMillis)
      return result('inconclusive', { reason: 'time-budget' });
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
  result.actions.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  const patches: Patch[] = [];
  for (const field of ['gain', 'cost'] as const) {
    for (const [id, count] of counts) {
      const action = model.actions.find((a) => a.id === id)!;
      const from = action[field][target] ?? 0;
      if (from === 0) continue;
      const delta = Math.ceil(overrun / count);
      const to = from + (field === 'gain' ? -delta : delta);
      if (to < 0 || to > 1_000_000) continue;
      const candidate = structuredClone(model);
      candidate.actions.find((a) => a.id === id)![field][target] = to;
      if (!modelSchema.safeParse(candidate).success) continue;
      patches.push({
        id: id + '-' + field,
        actionId: id,
        field,
        resourceId: target,
        from,
        to,
        title:
          (field === 'gain' ? '减少「' : '提高「') +
          action.name +
          '」的' +
          (field === 'gain' ? '产出' : '成本'),
        model: candidate,
      });
    }
  }
  return patches.slice(0, 3);
}
