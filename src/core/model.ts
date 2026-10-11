import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9_]{0,23}$/).refine(v => !['constructor', 'prototype', '__proto__'].includes(v));
const amount = z.number().int().min(0).max(1_000_000);
const vector = z.record(id, amount);
export const modelSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(1).max(80),
  description: z.string().max(1200),
  resources: z.array(z.object({ id, name: z.string().trim().min(1).max(24), initial: amount }).strict()).min(2).max(8),
  actions: z.array(z.object({
    id, name: z.string().trim().min(1).max(40), cost: vector, gain: vector,
  }).strict()).min(1).max(16),
  contract: z.object({
    target: id,
    restore: z.array(id).min(1).max(7),
    allowedProfit: amount,
  }).strict(),
}).strict().superRefine((model, ctx) => {
  const ids = model.resources.map(r => r.id);
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (new Set(ids).size !== ids.length) fail('资源标识不能重复');
  if (new Set(model.actions.map(a => a.id)).size !== model.actions.length) fail('动作标识不能重复');
  if (!ids.includes(model.contract.target)) fail('验证目标必须是已定义资源');
  if (new Set(model.contract.restore).size !== model.contract.restore.length) fail('恢复库存不能重复');
  if (model.contract.restore.some(r => !ids.includes(r) || r === model.contract.target)) fail('恢复库存必须是其他已定义资源');
  for (const action of model.actions) {
    if ([...Object.keys(action.cost), ...Object.keys(action.gain)].some(key => !ids.includes(key))) fail('动作引用了未定义资源');
    if (![...Object.values(action.cost), ...Object.values(action.gain)].some(v => v > 0)) fail('动作至少要有一项非零消耗或产出');
  }
});
export const boundsSchema = z.object({
  maxDepth: z.number().int().min(1).max(32).default(12),
  maxStates: z.number().int().min(1).max(25_000).default(12000),
  maxMillis: z.number().int().min(10).max(3000).default(1500),
}).strict();
export type Economy = z.infer<typeof modelSchema>;
export type Bounds = z.infer<typeof boundsSchema>;
export type Inventory = Record<string, number>;
export type TraceStep = { step: number; actionId: string | null; actionName: string; inventory: Inventory; profit: number };
export type SearchResult = {
  status: 'counterexample' | 'bounded-clear' | 'inconclusive';
  reason?: 'state-budget' | 'time-budget';
  bounds: Bounds; visited: number; expanded: number; elapsedMs: number; deepest: number;
  actions: string[]; trace: TraceStep[]; profit: number;
};
export type Patch = {
  id: string; actionId: string; field: 'cost' | 'gain'; resourceId: string;
  from: number; to: number; title: string; model: Economy;
};
export type Comparison = { patch: Patch; result: SearchResult; oldTrace: { legal: boolean; violates: boolean; profit?: number; message?: string } };
export const DEFAULT_BOUNDS: Bounds = { maxDepth: 12, maxStates: 12000, maxMillis: 1500 };
export function initialInventory(model: Economy): Inventory {
  return Object.fromEntries(model.resources.map(r => [r.id, r.initial]));
}
