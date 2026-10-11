import { z } from 'zod';

const id = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,23}$/)
  .refine((v) => !['constructor', 'prototype', '__proto__'].includes(v));
const amount = z.number().int().min(0).max(1_000_000);
const vector = z.record(id, amount);
export const modelSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().trim().min(1).max(80),
    description: z.string().max(1200),
    resources: z
      .array(z.object({ id, name: z.string().trim().min(1).max(24), initial: amount }).strict())
      .min(2)
      .max(8),
    actions: z
      .array(
        z
          .object({
            id,
            name: z.string().trim().min(1).max(40),
            cost: vector,
            gain: vector,
          })
          .strict(),
      )
      .min(1)
      .max(16),
    playtests: z
      .array(
        z
          .object({
            id,
            name: z.string().trim().min(1).max(60),
            initial: vector,
            actions: z.array(id).min(1).max(32),
            minimum: vector.refine((v) => Object.keys(v).length > 0, '至少声明一个最低库存要求'),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    contract: z
      .object({
        target: id,
        restore: z.array(id).min(1).max(7),
        allowedProfit: amount,
      })
      .strict(),
  })
  .strict()
  .superRefine((model, ctx) => {
    const ids = model.resources.map((r) => r.id);
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (new Set(ids).size !== ids.length) fail('资源标识不能重复');
    if (new Set(model.actions.map((a) => a.id)).size !== model.actions.length)
      fail('动作标识不能重复');
    if (!ids.includes(model.contract.target)) fail('验证目标必须是已定义资源');
    if (new Set(model.contract.restore).size !== model.contract.restore.length)
      fail('恢复库存不能重复');
    if (model.contract.restore.some((r) => !ids.includes(r) || r === model.contract.target))
      fail('恢复库存必须是其他已定义资源');
    if (new Set((model.playtests ?? []).map((t) => t.id)).size !== (model.playtests ?? []).length)
      fail('保留用例标识不能重复');
    for (const t of model.playtests ?? []) {
      if ([...Object.keys(t.initial), ...Object.keys(t.minimum)].some((key) => !ids.includes(key)))
        fail('保留用例引用了未定义资源');
      if (t.actions.some((key) => !model.actions.some((a) => a.id === key)))
        fail('保留用例引用了未定义动作');
    }
    for (const action of model.actions) {
      if (
        [...Object.keys(action.cost), ...Object.keys(action.gain)].some((key) => !ids.includes(key))
      )
        fail('动作引用了未定义资源');
      if (![...Object.values(action.cost), ...Object.values(action.gain)].some((v) => v > 0))
        fail('动作至少要有一项非零消耗或产出');
    }
  });
export const boundsSchema = z
  .object({
    maxDepth: z.number().int().min(1).max(32).default(12),
    maxStates: z.number().int().min(1).max(25_000).default(12000),
    maxMillis: z.number().int().min(10).max(3000).default(1500),
  })
  .strict();
export type Economy = z.infer<typeof modelSchema>;
export type Bounds = z.infer<typeof boundsSchema>;
export type Inventory = Record<string, number>;
export type TraceStep = {
  step: number;
  actionId: string | null;
  actionName: string;
  inventory: Inventory;
  profit: number;
};
export type SearchResult = {
  status: 'counterexample' | 'bounded-clear' | 'inconclusive';
  reason?: 'state-budget' | 'time-budget';
  bounds: Bounds;
  visited: number;
  expanded: number;
  elapsedMs: number;
  deepest: number;
  actions: string[];
  trace: TraceStep[];
  profit: number;
};
export type Patch = {
  id: string;
  actionId: string;
  field: 'cost' | 'gain';
  resourceId: string;
  from: number;
  to: number;
  title: string;
  model: Economy;
};
export type Comparison = {
  patch: Patch;
  result: SearchResult;
  playtests: { before: PlaytestResult[]; after: PlaytestResult[] };
  oldTrace: { legal: boolean; violates: boolean; profit?: number; message?: string };
};
export type Playtest = NonNullable<Economy['playtests']>[number];
export type PlaytestResult = {
  id: string;
  name: string;
  status: 'pass' | 'blocked' | 'below-minimum';
  message: string;
  failedStep?: number;
  inventory: Inventory;
};
export const ENGINE_VERSION = '0.2.0';
export const DEFAULT_BOUNDS: Bounds = { maxDepth: 12, maxStates: 12000, maxMillis: 1500 };
export function initialInventory(model: Economy): Inventory {
  return Object.fromEntries(model.resources.map((r) => [r.id, r.initial]));
}

/** Object key order is serialization detail; action and resource array order stays meaningful. */
export function sameModel(left: Economy, right: Economy): boolean {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, v]) => [key, canonical(v)]),
          )
        : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
