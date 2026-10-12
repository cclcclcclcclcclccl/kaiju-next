import { useState } from 'react';
import { Undo2, Check, Play, RotateCcw } from 'lucide-react';
import { heroes } from '../catalog.ts';
import { ROLES, emptyDraft } from '../model.ts';
import type { Draft, Role } from '../model.ts';
export const BP_ROUNDS = [
  ...Array.from({ length: 6 }, (_, i) => ({
    kind: 'ban',
    team: i % 2 === 0 ? 'allies' : 'enemies',
  })),
  ...[
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
  ].map((team) => ({ kind: 'pick', team })),
] as { kind: string; team: 'allies' | 'enemies' }[];
export function bpStep(draft: Draft, index: number, heroId: number, role: Role): Draft {
  const turn = BP_ROUNDS[index];
  if (!turn) throw new Error('演练已结束');
  const used = [...Object.values(draft.allies), ...Object.values(draft.enemies), ...draft.banned];
  if (used.includes(heroId)) throw new Error('英雄已选或已禁用');
  if (turn.kind === 'ban') return { ...draft, banned: [...draft.banned, heroId] };
  if (draft[turn.team][role]) throw new Error('这个位置已有英雄');
  return { ...draft, [turn.team]: { ...draft[turn.team], [role]: heroId } };
}
export default function BpRounds({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const [started, setStarted] = useState(false),
    [history, setHistory] = useState<Draft[]>([]),
    [chosen, setChosen] = useState(''),
    [role, setRole] = useState<Role>('中路'),
    [error, setError] = useState('');
  const turn = BP_ROUNDS[history.length],
    used = [...Object.values(draft.allies), ...Object.values(draft.enemies), ...draft.banned];
  const begin = () => {
    setHistory([]);
    setChosen('');
    setError('');
    setStarted(true);
    onChange({
      ...emptyDraft(),
      pool: draft.pool,
      preference: draft.preference,
      segment: draft.segment,
      memberId: draft.memberId,
    });
  };
  const confirm = () => {
    try {
      if (!chosen) throw new Error('先选择本轮英雄');
      const next = bpStep(draft, history.length, Number(chosen), role);
      setHistory([...history, structuredClone(draft)]);
      onChange(next);
      setChosen('');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="surface bp-rounds">
      <div className="section-title">
        <div>
          <p className="eyebrow">PICK / BAN REHEARSAL</p>
          <h3>
            {!started
              ? '回合 BP 演练'
              : turn
                ? '第 ' +
                  (history.length + 1) +
                  ' / 16 步 · ' +
                  (turn.team === 'allies' ? '我方' : '对方') +
                  (turn.kind === 'ban' ? '禁用' : '选人')
                : '本轮阵容已完成'}
          </h3>
        </div>
        <button className="btn secondary" onClick={begin}>
          {started ? <RotateCcw size={15} /> : <Play size={15} />}开始新演练
        </button>
      </div>
      <p className="data-caption">
        练习规则：双方交替各禁 3 位，再按 1–2–2–2–2–1
        选人，不声称对应所有当前排位或赛事规则。开始演练会清空当前阵容，已保存卡片保留。
      </p>
      {started && turn && (
        <div className="pro-toolbar">
          {turn.kind === 'pick' && (
            <label>
              本轮位置
              <select
                aria-label="本轮位置"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} disabled={!!draft[turn.team][r]}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            本轮英雄
            <select
              aria-label="本轮英雄"
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
            >
              <option value="">选择英雄</option>
              {heroes
                .filter(
                  (h) => !used.includes(h.id) && (turn.kind === 'ban' || h.roles.includes(role)),
                )
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
            </select>
          </label>
          <button className="btn primary" onClick={confirm}>
            <Check size={15} />
            确认本轮
          </button>
          <button
            className="btn secondary"
            disabled={!history.length}
            onClick={() => {
              onChange(history.at(-1)!);
              setHistory(history.slice(0, -1));
              setError('');
            }}
          >
            <Undo2 size={15} />
            撤回一步
          </button>
        </div>
      )}
      {started && !turn && (
        <button
          className="btn secondary"
          onClick={() => {
            onChange(history.at(-1)!);
            setHistory(history.slice(0, -1));
          }}
        >
          撤回最后一步
        </button>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
