import { z } from 'zod';
import { emptyDraft, ROLES } from '../model.ts';
import type { Draft, Role } from '../model.ts';
import { heroes, heroById } from '../catalog.ts';
import { lineupTraits, traitNames } from '../tactics.ts';
import type { Trait } from '../tactics.ts';
import { inferRoles, changeRoleLock } from './flexRoles.ts';
export type Turn = { kind: 'ban' | 'pick'; team: 'allies' | 'enemies' };
const turns = (kind: Turn['kind'], teams: string): Turn[] =>
  [...teams].map((c) => ({ kind, team: c === 'B' ? 'allies' : 'enemies' }));
export const BP_ROUNDS: Turn[] = [...turns('ban', 'BRBRBR'), ...turns('pick', 'BRRBBRRBBR')];
// Observed public website sequence, 2026-10-19; a practice preset, not every competition.
export const STAGED_ROUNDS: Turn[] = [
  ...turns('ban', 'BRBR'),
  ...turns('pick', 'BRRBBR'),
  ...turns('ban', 'RBRBRB'),
  ...turns('pick', 'RBBR'),
];
export const roundsFor = (format: string) => (format === 'staged' ? STAGED_ROUNDS : BP_ROUNDS);
export function bpStep(
  draft: Draft,
  index: number,
  heroId: number,
  role: Role,
  rounds = BP_ROUNDS,
): Draft {
  const turn = rounds[index],
    hero = heroById(heroId);
  if (!turn) throw Error('演练已结束');
  if (!hero) throw Error('英雄不在已核对目录中');
  if (
    [...Object.values(draft.allies), ...Object.values(draft.enemies), ...draft.banned].includes(
      heroId,
    )
  )
    throw Error('英雄已选或已禁用');
  if (turn.kind === 'ban') return { ...draft, banned: [...draft.banned, heroId] };
  if (!ROLES.includes(role)) throw Error('请选择有效分路');
  if (draft[turn.team][role]) throw Error('这个位置已有英雄');
  return { ...draft, [turn.team]: { ...draft[turn.team], [role]: heroId } };
}
export const sessionSchema = z.object({
  version: z.literal(1),
  format: z.enum(['staged', 'classic']),
  mode: z.enum(['manual', 'blue', 'red']),
  moves: z.array(z.object({ heroId: z.number().int().positive(), role: z.enum(ROLES) })).max(20),
  locks: z.record(z.string().regex(/^\d+$/), z.enum(ROLES)).optional(),
  unavailable: z
    .object({
      allies: z.array(z.number().int().positive()).max(45),
      enemies: z.array(z.number().int().positive()).max(45),
    })
    .optional(),
});
export type BpSession = z.infer<typeof sessionSchema>;
export function replaySession(session: BpSession, base = emptyDraft()): Draft {
  const rounds = roundsFor(session.format);
  let position: Draft = {
    ...emptyDraft(),
    role: base.role,
    pool: base.pool,
    preference: base.preference,
    segment: base.segment,
  };
  const picked: Record<'allies' | 'enemies', number[]> = { allies: [], enemies: [] };
  const used = new Set<number>();
  session.moves.forEach((m, i) => {
    const turn = rounds[i];
    if (!turn || !heroById(m.heroId) || used.has(m.heroId))
      throw Error('选禁记录包含重复、未知英雄或多余回合');
    used.add(m.heroId);
    if (turn.kind === 'pick' && session.unavailable?.[turn.team].includes(m.heroId))
      throw Error('本队已在系列赛使用过该英雄');
    if (turn.kind === 'ban') position.banned.push(m.heroId);
    else picked[turn.team].push(m.heroId);
  });
  const picks = [...picked.allies, ...picked.enemies];
  if (Object.keys(session.locks ?? {}).some((id) => !picks.includes(Number(id))))
    throw Error('分路锁定不属于当前已选英雄');
  for (const team of ['allies', 'enemies'] as const)
    position[team] = inferRoles(picked[team], heroes, session.locks).lineup;
  return position;
}
export function sessionInference(session: BpSession, team: 'allies' | 'enemies') {
  const rounds = roundsFor(session.format);
  return inferRoles(
    session.moves
      .filter((_, i) => rounds[i]?.kind === 'pick' && rounds[i]?.team === team)
      .map((m) => m.heroId),
    heroes,
    session.locks,
  );
}
export function setSessionRole(
  session: BpSession,
  team: 'allies' | 'enemies',
  id: number,
  role: Role | 'auto',
): BpSession {
  const ids = Object.values(sessionInference(session, team).lineup) as number[];
  return { ...session, locks: changeRoleLock(ids, heroes, session.locks ?? {}, id, role) };
}
export function appendSessionMove(session: BpSession, heroId: number): BpSession {
  const next = { ...session, moves: [...session.moves, { heroId, role: '中路' as Role }] };
  const position = replaySession(next),
    turn = roundsFor(session.format)[session.moves.length];
  if (turn.kind === 'pick')
    next.moves[next.moves.length - 1].role = ROLES.find((r) => position[turn.team][r] === heroId)!;
  return next;
}
export function undoSession(session: BpSession): BpSession {
  const moves = session.moves.slice(0, -1),
    remaining = new Set(moves.map((m) => m.heroId));
  return {
    ...session,
    moves,
    locks: Object.fromEntries(
      Object.entries(session.locks ?? {}).filter(([id]) => remaining.has(Number(id))),
    ),
  };
}
export function assessDraft(draft: Draft) {
  return (['allies', 'enemies'] as const).map((team) => {
    const ids = Object.values(draft[team]).filter((n): n is number => n != null);
    const other = Object.values(draft[team === 'allies' ? 'enemies' : 'allies']);
    const traits = lineupTraits(ids, heroes);
    const essentials: Trait[] = ['frontline', 'engage', 'magic', 'physical'];
    const covered = essentials.filter((t) => traits.has(t)),
      missing = essentials.filter((t) => !traits.has(t));
    const relations = ids.flatMap((id) =>
      (heroById(id)?.relations ?? [])
        .filter((r) => (r.type === 'partner' ? ids.includes(r.heroId) : other.includes(r.heroId)))
        .map((r) => ({ ...r, from: heroById(id)!.name })),
    );
    const fit = relations.reduce(
      (n, r) => n + (r.type === 'partner' ? 3 : r.type === 'counters' ? 3 : -4),
      0,
    );
    return {
      team,
      score: Math.max(0, Math.min(100, 40 + covered.length * 10 + fit)),
      covered: covered.map((t) => traitNames[t]),
      missing: missing.map((t) => traitNames[t]),
      relations,
      offRoles: Object.entries(draft[team])
        .filter(([r, id]) => !heroById(id)?.roles.includes(r))
        .map(([r, id]) => `${heroById(id)?.name} · ${r}`),
    };
  });
}
