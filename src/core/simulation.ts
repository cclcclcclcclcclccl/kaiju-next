import { modelSchema, initialInventory } from './model.ts';
import type { Economy, Inventory, TraceStep, PlaytestResult } from './model.ts';

export function nextState(state: Inventory, action: Economy['actions'][number]): Inventory | null {
  for (const [key, value] of Object.entries(action.cost)) if (state[key] < value) return null;
  return Object.fromEntries(
    Object.entries(state).map(([key, value]) => [
      key,
      value - (action.cost[key] ?? 0) + (action.gain[key] ?? 0),
    ]),
  );
}
export function violates(model: Economy, state: Inventory, initial: Inventory): boolean {
  return (
    state[model.contract.target] - initial[model.contract.target] > model.contract.allowedProfit &&
    model.contract.restore.every((key) => state[key] === initial[key])
  );
}
export function replay(
  input: unknown,
  actions: string[],
): { trace: TraceStep[]; violates: boolean; profit: number } {
  const model = modelSchema.parse(input);
  if (actions.length > 128) throw new Error('回放路径过长');
  const initial = initialInventory(model);
  let inventory = initial;
  const trace: TraceStep[] = [
    { step: 0, actionId: null, actionName: '初始状态', inventory, profit: 0 },
  ];
  for (const id of actions) {
    const action = model.actions.find((a) => a.id === id);
    if (!action) throw new Error('回放动作不存在：' + id);
    const next = nextState(inventory, action);
    if (!next) throw new Error('第 ' + trace.length + ' 步资源不足，原路径已无法执行');
    inventory = next;
    trace.push({
      step: trace.length,
      actionId: id,
      actionName: action.name,
      inventory,
      profit: inventory[model.contract.target] - initial[model.contract.target],
    });
  }
  return {
    trace,
    violates: violates(model, inventory, initial),
    profit: inventory[model.contract.target] - initial[model.contract.target],
  };
}

export function evaluatePlaytests(input: unknown): PlaytestResult[] {
  const model = modelSchema.parse(input);
  return (model.playtests ?? []).map((test) => {
    let inventory = { ...initialInventory(model), ...test.initial };
    for (let i = 0; i < test.actions.length; i++) {
      const action = model.actions.find((a) => a.id === test.actions[i])!;
      const next = nextState(inventory, action);
      if (!next) {
        const missing = Object.entries(action.cost)
          .filter(([key, value]) => inventory[key] < value)
          .map(
            ([key, value]) =>
              model.resources.find((r) => r.id === key)!.name +
              '需 ' +
              value +
              '，现有 ' +
              inventory[key],
          )
          .join('；');
        return {
          id: test.id,
          name: test.name,
          status: 'blocked' as const,
          failedStep: i + 1,
          message: '第 ' + (i + 1) + ' 步「' + action.name + '」无法执行：' + missing,
          inventory,
        };
      }
      inventory = next;
    }
    const missed = Object.entries(test.minimum).filter(([key, value]) => inventory[key] < value);
    return {
      id: test.id,
      name: test.name,
      status: missed.length ? ('below-minimum' as const) : ('pass' as const),
      message: missed.length
        ? missed
            .map(
              ([key, value]) =>
                model.resources.find((r) => r.id === key)!.name +
                '至少需 ' +
                value +
                '，实际 ' +
                inventory[key],
            )
            .join('；')
        : '路径可执行，期末库存满足要求',
      inventory,
    };
  });
}
