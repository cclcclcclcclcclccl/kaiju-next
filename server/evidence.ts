import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { modelSchema, boundsSchema, ENGINE_VERSION } from '../src/core/model.ts';
import { replay, search } from '../src/core/engine.ts';
import { evaluatePlaytests } from '../src/core/simulation.ts';

const count = z.number().int().nonnegative();
const inventory = z.record(z.string(), count);
const trace = z
  .array(
    z
      .object({
        step: count,
        actionId: z.string().nullable(),
        actionName: z.string(),
        inventory,
        profit: z.number().int(),
      })
      .strict(),
  )
  .max(33);
const resultSchema = z
  .object({
    status: z.enum(['counterexample', 'bounded-clear', 'inconclusive']),
    reason: z.enum(['state-budget', 'time-budget']).optional(),
    bounds: boundsSchema,
    visited: count,
    expanded: count,
    elapsedMs: z.number().nonnegative(),
    deepest: count.max(32),
    actions: z.array(z.string()).max(32),
    trace,
    profit: z.number().int(),
  })
  .strict();
const playtestResults = z
  .array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        status: z.enum(['pass', 'blocked', 'below-minimum']),
        message: z.string(),
        failedStep: count.optional(),
        inventory,
      })
      .strict(),
  )
  .max(8);
const envelope = z
  .object({
    format: z.literal('hengju-evidence'),
    formatVersion: z.literal(1),
    run: z
      .object({
        id: z.string().uuid(),
        createdAt: z.string().datetime(),
        modelHash: z.string().regex(/^[a-f0-9]{64}$/),
        model: z.unknown(),
        result: resultSchema,
        engineVersion: z.string().optional(),
        playtests: playtestResults.optional(),
      })
      .strict(),
  })
  .strict();

export function verifyEvidence(raw: unknown) {
  const { run } = envelope.parse(raw);
  const hash = createHash('sha256').update(JSON.stringify(run.model)).digest('hex');
  if (hash !== run.modelHash) throw new Error('规则指纹不匹配：输入内容已改变');
  const model = modelSchema.parse(run.model);
  const recorded = run.result;
  if (recorded.status === 'counterexample') {
    if (!recorded.actions.length || recorded.actions.length > recorded.bounds.maxDepth)
      throw new Error('反例路径超出声明范围');
    const witness = replay(model, recorded.actions);
    if (
      !witness.violates ||
      !isDeepStrictEqual(witness.trace, recorded.trace) ||
      witness.profit !== recorded.profit
    )
      throw new Error('反例证据与独立回放不一致');
  } else if (recorded.actions.length || recorded.trace.length || recorded.profit !== 0) {
    throw new Error('非反例结果不应包含反例轨迹');
  }
  const playtests = evaluatePlaytests(model);
  if (run.playtests && !isDeepStrictEqual(playtests, run.playtests))
    throw new Error('保留用例结果与重新执行不一致');
  const rerun = search(model, recorded.bounds);
  // A replay proves the witness, while budget-dependent non-findings require a completed re-search.
  if (recorded.status === 'bounded-clear' && rerun.status === 'counterexample')
    throw new Error('原“未发现”结论未复现：重新搜索发现反例');
  if (
    recorded.status === 'counterexample' &&
    rerun.status === 'counterexample' &&
    rerun.actions.length !== recorded.actions.length
  )
    throw new Error('最短路径长度与重新搜索不一致');
  return {
    modelHash: hash,
    recordedEngine: run.engineVersion ?? 'unrecorded',
    verifierEngine: ENGINE_VERSION,
    witnessReplayed: recorded.status === 'counterexample',
    recordedStatus: recorded.status,
    rerunStatus: rerun.status,
    boundedConclusionReproduced:
      recorded.status === 'inconclusive' || rerun.status === 'inconclusive'
        ? null
        : recorded.status === rerun.status,
    playtests,
    note: '指纹用于检查内容一致性，不证明作者身份。预算耗尽时不确认未发现反例的结论；用例只覆盖声明路径。',
  };
}
