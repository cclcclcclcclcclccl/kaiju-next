import { ROLES, draftSchema } from '../model.ts';
import type { Draft, Hero, Role } from '../model.ts';
import type { StatSnapshot } from './model.ts';
import type { SquadMember } from './squad.ts';
import { effectivePool, mastery, tierList, usableSnapshot } from './analytics.ts';
import { noteFor } from '../tactics.ts';
import type { Trait } from '../tactics.ts';
import { styleFit } from './playstyle.ts';
import { SYSTEMS } from './systems.ts';
import { inferRoles } from './flexRoles.ts';
import type { RoleLocks } from './flexRoles.ts';

export type Side = 'allies' | 'enemies';
export type CoachSettings = {
  depth: number;
  width: number;
  strategy: 'robust' | 'tendency';
  firstPick: Side;
  nextSide: 'auto' | Side;
  action: 'pick' | 'ban';
  respectPools: boolean;
};
export type CoachInput = {
  draft: Draft;
  settings: CoachSettings;
  members: Partial<Record<Role, SquadMember>>;
  opponentPool: number[];
  snapshot?: StatSnapshot;
  sequence?: { team: Side; kind: 'pick' | 'ban' }[];
  flexibleRoles?: { locks: RoleLocks };
  unavailableHeroes?: Partial<Record<Side, number[]>>;
};
export type CoachMove = { team: Side; kind: 'pick' | 'ban'; heroId: number; role: Role };
export type CoachCandidate = {
  move: CoachMove;
  value: number;
  immediateValue: number;
  line: CoachMove[];
  reasons: string[];
  risks: string[];
  opponentReplies: { move: CoachMove; reason: string }[];
};
export type CoachResult = {
  candidates: CoachCandidate[];
  completedDepth: number;
  requestedDepth: number;
  searchedNodes: number;
  evaluatedPositions: number;
  prunedBranches: number;
  cacheHits: number;
  elapsedMs: number;
  bounded: boolean;
  candidateWidth: number;
  side: Side;
  assumptions: string[];
};
const opposite = (side: Side): Side => (side === 'allies' ? 'enemies' : 'allies');
export function coachTurns(draft: Draft, cfg: CoachSettings): Side[] {
  const order: Side[] = [
    'allies',
    'enemies',
    'enemies',
    'allies',
    'allies',
    'enemies',
    'enemies',
    'allies',
    'allies',
    'enemies',
  ];
  const capacity = {
    allies: 5 - Object.values(draft.allies).filter(Boolean).length,
    enemies: 5 - Object.values(draft.enemies).filter(Boolean).length,
  };
  const total = 10 - capacity.allies - capacity.enemies;
  const planned = order
    .slice(total)
    .map((side) => (cfg.firstPick === 'allies' ? side : opposite(side)));
  const sequence: Side[] = [];
  for (let index = 0; index < planned.length; index++) {
    const desired =
      index === 0 && cfg.action === 'pick' && cfg.nextSide !== 'auto'
        ? cfg.nextSide
        : planned[index];
    const side = capacity[desired] > 0 ? desired : opposite(desired);
    if (capacity[side] > 0) {
      sequence.push(side);
      capacity[side]--;
    }
  }
  return cfg.action === 'ban'
    ? [cfg.nextSide === 'auto' ? (planned[0] ?? cfg.firstPick) : cfg.nextSide, ...sequence]
    : sequence;
}
export function applyCoachMove(draft: Draft, move: CoachMove): Draft {
  const used = [...Object.values(draft.allies), ...Object.values(draft.enemies), ...draft.banned];
  if (used.includes(move.heroId)) throw new Error('这位英雄已经被选择或禁用，请重新推演');
  if (move.kind === 'ban') {
    if (draft.banned.length >= 10) throw new Error('禁用位已满');
    return { ...draft, banned: [...draft.banned, move.heroId] };
  }
  if (draft[move.team][move.role]) throw new Error('这个位置已经有英雄，请重新推演');
  return { ...draft, [move.team]: { ...draft[move.team], [move.role]: move.heroId } };
}

export function searchCoach(
  heroes: Hero[],
  input: CoachInput,
  options: {
    maxMs?: number;
    maxNodes?: number;
    now?: number;
    candidatePolicy?: 'greedy' | 'coverage';
  } = {},
): CoachResult {
  const started = performance.now(),
    now = options.now ?? Date.now();
  const draft = draftSchema.parse(input.draft),
    cfg = input.settings;
  if (
    !Number.isInteger(cfg.depth) ||
    cfg.depth < 1 ||
    cfg.depth > 5 ||
    !Number.isInteger(cfg.width) ||
    cfg.width < 2 ||
    cfg.width > 10
  )
    throw new Error('推演深度或候选宽度无效');
  const byId = new Map(heroes.map((h) => [h.id, h]));
  const used = [...Object.values(draft.allies), ...Object.values(draft.enemies), ...draft.banned];
  if (used.some((id) => id !== undefined && !byId.has(id)))
    throw new Error('阵容包含目录中不存在的英雄');
  const assigned = Object.values(input.members).filter(Boolean);
  if (input.flexibleRoles && assigned.length) throw Error('自动摇摆推演暂不与固定选手分路约束混用');
  if (new Set(assigned.map((m) => m!.id)).size !== assigned.length)
    throw new Error('一位选手只能承担一个位置');
  const knownOpponents = new Set(input.opponentPool.filter((id) => byId.has(id)));
  const memberPools = new Map(
    ROLES.map((role) => [
      role,
      input.members[role]
        ? effectivePool(input.members[role]!.pool, input.members[role]!.profile)
        : [],
    ]),
  );
  const notes = new Map(heroes.map((h) => [h.id, noteFor(h)]));
  const meta = new Map<string, number>();
  if (
    input.snapshot &&
    usableSnapshot(input.snapshot, now) &&
    input.snapshot.segment === (draft.segment ?? '大众分段')
  )
    for (const role of ROLES)
      for (const tier of tierList(input.snapshot, role))
        if (/^T[0-4]$/.test(tier.tier)) meta.set(`${role}:${tier.row.heroId}`, tier.score);
  const preparation = new Map<string, number>();
  const ready = (side: Side, role: Role, id: number) => {
    const key = `${side}:${role}:${id}`;
    if (preparation.has(key)) return preparation.get(key)!;
    const member = side === 'allies' ? input.members[role] : undefined;
    let score = member ? mastery(id, member.pool, member.profile, now).score : 50;
    if (member?.profile?.habits)
      score =
        score * 0.85 + styleFit(byId.get(id)!, notes.get(id)!.traits, member.profile).score * 0.15;
    preparation.set(key, score);
    return score;
  };
  let searchedNodes = 0,
    evaluatedPositions = 0,
    prunedBranches = 0,
    cacheHits = 0,
    rootGeneration = true;
  const budget = () => {
    if (
      searchedNodes > (options.maxNodes ?? 20000) ||
      performance.now() - started > (options.maxMs ?? 4500)
    )
      throw new Error('SEARCH_BUDGET');
  };
  const sideValue = (state: Draft, side: Side) => {
    const entries = Object.entries(state[side]) as [Role, number][];
    const enemyIds = new Set(Object.values(state[opposite(side)]));
    const ids = new Set(entries.map(([, id]) => id));
    const traits = new Set(entries.flatMap(([, id]) => notes.get(id)?.traits ?? []));
    let value = 0;
    for (const [role, id] of entries) {
      const hero = byId.get(id)!;
      value += (ready(side, role, id) - 50) * 0.3;
      value += ((meta.get(`${role}:${id}`) ?? 50) - 50) * 0.12;
      for (const relation of hero.relations ?? []) {
        if (relation.type === 'partner' && ids.has(relation.heroId)) value += 2.5;
        if (relation.type === 'counters' && enemyIds.has(relation.heroId)) value += 3;
        if (relation.type === 'counteredBy' && enemyIds.has(relation.heroId)) value -= 4;
      }
    }
    for (const trait of ['frontline', 'engage', 'magic', 'physical'] as Trait[])
      if (traits.has(trait)) value += 4;
    const enemyMobile = [...enemyIds].filter(
      (id) => id && notes.get(id)?.traits.includes('mobility'),
    ).length;
    if (enemyMobile && traits.has('peel')) value += Math.min(6, enemyMobile * 2);
    if (entries.length >= 4 && (!traits.has('magic') || !traits.has('physical'))) value -= 4;
    for (const system of SYSTEMS) {
      const hit = system.heroes.filter(
        (name, i) => byId.get(state[side][system.roles[i] as Role] ?? -1)?.name === name,
      ).length;
      if (hit >= 2) value += (5 * hit) / system.heroes.length;
    }
    return value;
  };
  const evaluate = (state: Draft) => {
    evaluatedPositions++;
    if (!rootGeneration && evaluatedPositions % 128 === 0) budget();
    return sideValue(state, 'allies') - sideValue(state, 'enemies');
  };
  if (Object.keys(draft.allies).length + Object.keys(draft.enemies).length === 10)
    throw new Error('双方五个位置都已填满。先清除待推演位置，再计算下一手。');
  for (const role of ROLES)
    if (
      cfg.respectPools &&
      input.members[role] &&
      !draft.allies[role] &&
      !memberPools
        .get(role)!
        .some((p) => !used.includes(p.heroId) && byId.get(p.heroId)?.roles.includes(role))
    )
      throw new Error(
        `${input.members[role]!.name}在${role}没有可用的已登记英雄。请补充档案、调整选手分工，或取消仅用已登记英雄池。`,
      );
  if (
    input.sequence &&
    (!input.sequence.length ||
      input.sequence.length > 20 ||
      input.sequence.some(
        (t) => !['allies', 'enemies'].includes(t.team) || !['pick', 'ban'].includes(t.kind),
      ) ||
      input.sequence[0].kind !== cfg.action ||
      (cfg.nextSide !== 'auto' && input.sequence[0].team !== cfg.nextSide))
  )
    throw new Error('回合序列与当前行动不一致');
  const turns = input.sequence?.map((t) => t.team) ?? coachTurns(draft, cfg),
    rootSide = turns[0];
  const stateKey = (state: Draft) =>
    ROLES.map((r) => state.allies[r] ?? 0).join(',') +
    '/' +
    ROLES.map((r) => state.enemies[r] ?? 0).join(',') +
    '/' +
    [...state.banned].sort((a, b) => a - b).join(',');
  type RankedMove = { move: CoachMove; state: Draft; value: number; prior: number };
  const flexCache = new Map<string, ReturnType<typeof inferRoles> | null>();
  const flexAssignment = (ids: number[], locks: RoleLocks) => {
    const key = [...ids].sort((a, b) => a - b).join(',') + '|' + JSON.stringify(locks);
    if (flexCache.has(key)) return flexCache.get(key)!;
    let result: ReturnType<typeof inferRoles> | null = null;
    try {
      result = inferRoles(
        [...ids].sort((a, b) => a - b),
        heroes,
        locks,
      );
    } catch {}
    if (flexCache.size < 8000) flexCache.set(key, result);
    return result;
  };
  const moves = (state: Draft, side: Side, width = cfg.width): RankedMove[] => {
    const taken = new Set([
      ...Object.values(state.allies),
      ...Object.values(state.enemies),
      ...state.banned,
    ]);
    const list: RankedMove[] = [];
    const existing = Object.values(state[side]).filter((id): id is number => id !== undefined);
    if (existing.length >= 5) return list;
    const locks = input.flexibleRoles?.locks ?? {};
    const baseline = input.flexibleRoles
      ? (flexAssignment(existing, locks)?.unsupported.length ?? 0)
      : 0;
    for (const role of ROLES) {
      if (!input.flexibleRoles && state[side][role]) continue;
      const member = side === 'allies' ? input.members[role] : undefined;
      for (const hero of heroes) {
        if (input.unavailableHeroes?.[side]?.includes(hero.id)) continue;
        if (taken.has(hero.id) || !hero.roles.includes(role)) continue;
        if (member && cfg.respectPools && !memberPools.get(role)!.some((p) => p.heroId === hero.id))
          continue;
        const move: CoachMove = { team: side, kind: 'pick', heroId: hero.id, role };
        let next: Draft;
        if (input.flexibleRoles) {
          const assignment = flexAssignment([...existing, hero.id], { ...locks, [hero.id]: role });
          if (!assignment || assignment.unsupported.length > baseline) continue;
          next = { ...state, [side]: assignment.lineup };
        } else next = applyCoachMove(state, move);
        const value = evaluate(next);
        list.push({
          move,
          state: next,
          value,
          prior:
            (side === 'allies' ? value : -value) +
            (side === 'enemies' && knownOpponents.has(hero.id) ? 8 : 0),
        });
      }
    }
    list.sort((a, b) => b.prior - a.prior || a.move.heroId - b.move.heroId);
    if (options.candidatePolicy === 'greedy') return list.slice(0, width);
    // Preserve the best response for each open role before using remaining slots for raw score.
    // This prevents a narrow beam from considering only (for example) support picks.
    const roles = new Set<Role>(),
      covered: RankedMove[] = [];
    for (const candidate of list)
      if (!roles.has(candidate.move.role) && covered.length < width) {
        roles.add(candidate.move.role);
        covered.push(candidate);
      }
    for (const candidate of list)
      if (covered.length < width && !covered.includes(candidate)) covered.push(candidate);
    return covered.sort((a, b) => b.prior - a.prior || a.move.heroId - b.move.heroId);
  };
  const banMoves = (position: Draft, side: Side): RankedMove[] => {
    const targets = moves(position, opposite(side), Math.min(20, cfg.width * 3));
    const ids = [...new Set(targets.map((t) => t.move.heroId))];
    return ids.slice(0, cfg.width).map((heroId) => {
      const move: CoachMove = { team: side, kind: 'ban', heroId, role: draft.role };
      const state = applyCoachMove(position, move);
      return {
        move,
        state,
        value: evaluate(state),
        prior: targets.find((t) => t.move.heroId === heroId)?.prior ?? 0,
      };
    });
  };
  const roots = cfg.action === 'ban' ? banMoves(draft, rootSide) : moves(draft, rootSide);
  rootGeneration = false;
  if (!roots.length)
    throw new Error(
      '没有合法候选。检查选手英雄池、已禁英雄和待选位置；可关闭“仅用已登记英雄池”做练习推演。',
    );
  type Evaluation = { value: number; line: CoachMove[] };
  const transposition = new Map<string, Evaluation>();
  const visit = (
    state: Draft,
    index: number,
    depth: number,
    alpha: number,
    beta: number,
  ): Evaluation => {
    searchedNodes++;
    budget();
    if (depth === 0 || index >= turns.length) return { value: evaluate(state), line: [] };
    const key = stateKey(state) + `:${index}:${depth}`;
    if (transposition.has(key)) {
      cacheHits++;
      return transposition.get(key)!;
    }
    const initialAlpha = alpha,
      initialBeta = beta;
    const side = turns[index],
      next = input.sequence?.[index].kind === 'ban' ? banMoves(state, side) : moves(state, side);
    if (!next.length) return { value: evaluate(state) + (side === 'allies' ? -20 : 20), line: [] };
    let best: Evaluation = { value: side === 'allies' ? -Infinity : Infinity, line: [] };
    let weighted = 0,
      weights = 0,
      cut = false;
    const priorMax = next[0].prior;
    for (let i = 0; i < next.length; i++) {
      const m = next[i],
        child = visit(m.state, index + 1, depth - 1, alpha, beta);
      if (side === 'allies' ? child.value > best.value : child.value < best.value)
        best = { value: child.value, line: [m.move, ...child.line] };
      if (cfg.strategy === 'tendency' && side === 'enemies') {
        const weight = Math.exp((m.prior - priorMax) / 8);
        weighted += weight * child.value;
        weights += weight;
      } else if (cfg.strategy === 'robust') {
        if (side === 'allies') alpha = Math.max(alpha, best.value);
        else beta = Math.min(beta, best.value);
        if (beta <= alpha) {
          prunedBranches += next.length - i - 1;
          cut = true;
          break;
        }
      }
    }
    if (cfg.strategy === 'tendency' && side === 'enemies') best.value = weighted / weights;
    if (!cut && best.value > initialAlpha && best.value < initialBeta) transposition.set(key, best);
    return best;
  };
  let completedDepth = 1,
    bounded = false;
  searchedNodes = roots.length;
  let finished = roots.map((root) => ({
    root,
    evaluation: { value: root.value, line: [] as CoachMove[] },
  }));
  const requestedDepth = Math.min(cfg.depth, turns.length);
  for (let depth = 2; depth <= requestedDepth; depth++) {
    try {
      const iteration = roots.map((root) => ({
        root,
        evaluation: visit(root.state, 1, depth - 1, -Infinity, Infinity),
      }));
      finished = iteration;
      completedDepth = depth;
    } catch (e) {
      if ((e as Error).message === 'SEARCH_BUDGET') {
        bounded = true;
        break;
      }
      throw e;
    }
  }
  // Explanations use completed search results; interrupted iterations never replace them.
  const candidates = finished
    .map(({ root, evaluation }) => {
      const hero = byId.get(root.move.heroId)!,
        member = root.move.team === 'allies' ? input.members[root.move.role] : undefined;
      const reasons = [
        root.move.kind === 'ban'
          ? '比较禁用后双方剩余选人空间'
          : `填补${root.move.team === 'allies' ? '我方' : '对方'}${root.move.role}，比较后续应对`,
      ];
      if (input.flexibleRoles && root.move.kind === 'pick') {
        const changes = ROLES.flatMap((previous) => {
          const id = draft[root.move.team][previous];
          if (id === undefined) return [];
          const next = ROLES.find((r) => root.state[root.move.team][r] === id);
          return next && next !== previous
            ? [`${byId.get(id)!.name}由${previous}暂排到${next}`]
            : [];
        });
        if (changes.length) reasons.push(`摇摆调整：${changes.join('；')}；仅手动指定的位置会锁定`);
      }
      if (member)
        reasons.push(
          `${member.name}的准备度 ${mastery(hero.id, member.pool, member.profile, now).score}；按个人记录与打法计算`,
        );
      if (knownOpponents.has(hero.id)) reasons.push('该英雄在你提供的对手英雄池线索中');
      reasons.push(noteFor(hero).tip);
      const risks = [noteFor(hero).tradeoff];
      if (evaluation.line.length + 1 < completedDepth)
        risks.push('这条分支无法按当前英雄池继续完成选人，请调整成员分工或扩大可用英雄池');
      if (!meta.size) risks.push('没有满足口径与样本要求的版本统计，本次未加入版本强度分');
      const opponentMoves = evaluation.line.filter((m) => m.team === 'enemies').slice(0, 2);
      const opponentReplies = opponentMoves.map((move) => ({
        move,
        reason: knownOpponents.has(move.heroId)
          ? '已知对手英雄池 + 当前阵容回应'
          : '按阵容缺口和机制对抗推演，未掌握选手习惯',
      }));
      return {
        move: root.move,
        value: Math.round(evaluation.value * 10) / 10,
        immediateValue: Math.round(root.value * 10) / 10,
        line: [root.move, ...evaluation.line],
        reasons,
        risks,
        opponentReplies,
      };
    })
    .sort(
      (a, b) =>
        (rootSide === 'allies' ? b.value - a.value : a.value - b.value) ||
        (roots.find((r) => r.move.heroId === b.move.heroId && r.move.role === b.move.role)?.prior ??
          0) -
          (roots.find((r) => r.move.heroId === a.move.heroId && r.move.role === a.move.role)
            ?.prior ?? 0) ||
        a.move.heroId - b.move.heroId,
    );
  return {
    candidates,
    completedDepth,
    requestedDepth,
    searchedNodes,
    evaluatedPositions,
    prunedBranches,
    cacheHits,
    elapsedMs: Math.round(performance.now() - started),
    bounded,
    candidateWidth: cfg.width,
    side: rootSide,
    assumptions: [
      options.candidatePolicy === 'greedy'
        ? '候选按即时分截断（对照基线）'
        : input.flexibleRoles
          ? '候选优先保留各可行分路的应对（含现有英雄换位后的空间），再补充高分英雄；有限候选宽度可能遗漏方案'
          : '候选优先保留各空缺分路的最佳应对，再补充高分英雄；候选宽度小于空位数时无法覆盖全部分路',
      `在每步最多 ${cfg.width} 个候选中做${cfg.strategy === 'robust' ? '极大极小对抗搜索' : '对手偏好加权搜索'}，不是遍历全部合法棋树`,
      `已完成 ${completedDepth} 手推演；${input.sequence ? '使用操作台提供的逐手选禁序列，包含后续禁用阶段' : cfg.action === 'ban' ? '本次先比较一手禁用，再模拟选人；不模拟剩余全部禁用轮次' : '每一手是一位英雄，蓝方选人次序为 1–2–2–2–2–1'}`,
      knownOpponents.size
        ? '对手英雄池是用户提供的线索；倾向权重未经真实对局校准'
        : '未提供对手英雄池，预测只参考阵容和公开机制',
      '方案值是我方相对对方的启发式评价，不是胜率；没有证明全局最优',
      ...(input.flexibleRoles
        ? [
            '选人按英雄进行；每个候选重新分配该方未锁定英雄的分路，不受对方上一手分路限制。目录分路不是实战概率，未锁定的归属仍可摇摆。',
          ]
        : []),
      cfg.strategy === 'tendency'
        ? '倾向模型的方案值是候选应对的加权均值，展开的线路展示其中最不利的应对'
        : '展开的线路展示有限候选范围内的最强对抗回应',
    ],
  };
}
