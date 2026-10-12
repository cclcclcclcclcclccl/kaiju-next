import { emptyDraft, ROLES } from '../model.ts';
import type { Hero, Draft } from '../model.ts';
import { searchCoach, applyCoachMove, coachTurns } from './coach.ts';
import type { CoachInput, CoachMove } from './coach.ts';
export type ArenaResult = {
  seed: number;
  policy: 'coverage' | 'greedy';
  moves: CoachMove[];
  draft: Draft;
  nodes: number;
  elapsedMs: number;
  depths: number[];
  legal: boolean;
  coverage: number;
  meanRootRoles: number;
  note: string;
};
export function simulateDraft(
  heroes: Hero[],
  seed: number,
  policy: 'coverage' | 'greedy' = 'coverage',
  onProgress?: (move: number) => void,
): ArenaResult {
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  let draft = emptyDraft();
  const moves: CoachMove[] = [],
    depths: number[] = [],
    rootRoles: number[] = [];
  let nodes = 0;
  const started = performance.now();
  // Two reproducible practice bans, independent of the search evaluator.
  const shuffled = [...heroes].sort((a, b) => a.id - b.id);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  draft = { ...draft, banned: shuffled.slice(0, 2).map((h) => h.id) };
  for (let step = 0; step < 10; step++) {
    const input: CoachInput = {
      draft,
      settings: {
        depth: 3,
        width: 6,
        strategy: 'robust',
        firstPick: seed % 2 ? 'allies' : 'enemies',
        nextSide: 'auto',
        action: 'pick',
        respectPools: false,
      },
      members: {},
      opponentPool: [],
    };
    const side = coachTurns(draft, input.settings)[0];
    let move: CoachMove;
    if (side === 'enemies') {
      // Alternate independent random-legal and one-ply greedy opponents across fixed seeds.
      if (seed % 3 === 0) {
        const taken = new Set([
          ...Object.values(draft.allies),
          ...Object.values(draft.enemies),
          ...draft.banned,
        ]);
        const legal = ROLES.flatMap((role) =>
          draft.enemies[role]
            ? []
            : heroes
                .filter((h) => h.roles.includes(role) && !taken.has(h.id))
                .map((h) => ({
                  team: 'enemies' as const,
                  kind: 'pick' as const,
                  role,
                  heroId: h.id,
                })),
        );
        move = legal[Math.floor(random() * legal.length)];
      } else {
        const r = searchCoach(
          heroes,
          { ...input, settings: { ...input.settings, depth: 1 } },
          { maxMs: 30000, maxNodes: 2500, candidatePolicy: 'greedy', now: Date.UTC(2026, 9, 12) },
        );
        move = r.candidates[0].move;
        nodes += r.searchedNodes;
      }
    } else {
      const r = searchCoach(heroes, input, {
        maxMs: 30000,
        maxNodes: 2500,
        candidatePolicy: policy,
        now: Date.UTC(2026, 9, 12),
      });
      move = r.candidates[0].move;
      nodes += r.searchedNodes;
      depths.push(r.completedDepth);
      rootRoles.push(new Set(r.candidates.map((c) => c.move.role)).size);
    }
    if (!move) throw new Error('没有可用候选');
    draft = applyCoachMove(draft, move);
    moves.push(move);
    onProgress?.(step + 1);
  }
  const selected = [...Object.values(draft.allies), ...Object.values(draft.enemies)];
  const legal =
    selected.length === 10 &&
    new Set([...selected, ...draft.banned]).size === 12 &&
    moves.every((m) => heroes.find((h) => h.id === m.heroId)?.roles.includes(m.role));
  return {
    seed,
    policy,
    moves,
    draft,
    nodes,
    elapsedMs: Math.round(performance.now() - started),
    depths,
    legal,
    coverage: ROLES.filter((r) => draft.allies[r] && draft.enemies[r]).length,
    meanRootRoles: rootRoles.reduce((a, b) => a + b, 0) / rootRoles.length,
    note: '固定种子选人模拟；对照为一手贪心或随机合法策略。只评估工程约束，不预测胜率，不证明职业水平，不自动学习或改写权重。',
  };
}
