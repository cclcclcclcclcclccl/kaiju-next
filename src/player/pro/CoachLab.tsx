import { useEffect, useRef, useState } from 'react';
import { Swords, Square, Download, ArrowRight } from 'lucide-react';
import { heroes, heroById } from '../catalog.ts';
import { ROLES } from '../model.ts';
import type { Draft, Role, Hero } from '../model.ts';
import { Portrait } from '../ui.tsx';
import { usePro } from './context.tsx';
import { latestSnapshot } from './analytics.ts';
import { applyCoachMove } from './coach.ts';
import type { CoachResult, CoachSettings, CoachInput, CoachMove } from './coach.ts';
import type { SocialData } from './Social.tsx';
import type { SquadMember } from './squad.ts';
import { api, download } from '../../api.ts';

const defaultSettings: CoachSettings = {
  depth: 4,
  width: 6,
  strategy: 'robust',
  firstPick: 'allies',
  nextSide: 'auto',
  action: 'pick',
  respectPools: true,
};
const label = (move: CoachMove) =>
  `${move.team === 'allies' ? '我方' : '对方'}${move.kind === 'ban' ? '禁用' : '选'} ${heroById(move.heroId)?.name ?? move.heroId}${move.kind === 'pick' ? ' · ' + move.role : ''}`;
export default function CoachLab({
  draft,
  onChange,
  onOpen,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onOpen: (h: Hero) => void;
}) {
  const { data } = usePro();
  const [settings, setSettings] = useState<CoachSettings>(defaultSettings),
    [opponentPool, setOpponentPool] = useState<number[]>([]),
    [opponentQuery, setOpponentQuery] = useState('');
  const [assignments, setAssignments] = useState<Partial<Record<Role, string>>>({
    [draft.role]: 'self',
  });
  const [social, setSocial] = useState<SocialData>({ user: null, friends: [] });
  const [result, setResult] = useState<CoachResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const worker = useRef<Worker | null>(null),
    generation = useRef(0),
    timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const available: SquadMember[] = [
    {
      id: 'self',
      name: data.profile.name === '我的档案' ? '我自己' : data.profile.name,
      pool: draft.pool,
      profile: data.profile,
    },
    ...social.friends
      .filter((f) => f.shared)
      .map((f) => ({
        id: f.user.id,
        name: f.user.name,
        pool: f.pool,
        profile: f.profile ?? undefined,
      })),
  ];
  const fingerprint = JSON.stringify([
    draft,
    data.profile,
    data.snapshots,
    settings,
    assignments,
    opponentPool,
    social,
  ]);
  const cancel = () => {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    clearTimeout(timeout.current);
    setBusy(false);
  };
  useEffect(() => {
    api<SocialData>('/social')
      .then(setSocial)
      .catch(() => {});
  }, []);
  useEffect(() => {
    cancel();
    setResult(null);
    return () => {
      worker.current?.terminate();
      clearTimeout(timeout.current);
      generation.current++;
    };
  }, [fingerprint]);
  const run = async () => {
    cancel();
    const request = ++generation.current;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const fresh = await api<SocialData>('/social');
      if (request !== generation.current) return;
      if (JSON.stringify(fresh) !== JSON.stringify(social)) {
        setSocial(fresh);
        setBusy(false);
        setError('好友共享记录已更新，请确认成员分工后重新推演。');
        return;
      }
      const members: CoachInput['members'] = {};
      for (const role of ROLES)
        if (assignments[role]) {
          const member = available.find((m) => m.id === assignments[role]);
          if (!member) throw new Error('成员未共享或已经撤销共享，请重新选择');
          members[role] = member;
        }
      const input: CoachInput = {
        draft,
        settings,
        members,
        opponentPool,
        snapshot: latestSnapshot(data.snapshots, draft.segment ?? '大众分段'),
      };
      const instance = new Worker(new URL('./coach.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = instance;
      timeout.current = setTimeout(() => {
        if (request === generation.current) {
          cancel();
          setError('本次推演超时，请降低深度或候选宽度后重试。');
        }
      }, 15000);
      instance.onmessage = (
        event: MessageEvent<{ ok: boolean; result?: CoachResult; error?: string }>,
      ) => {
        if (request !== generation.current) return;
        clearTimeout(timeout.current);
        instance.terminate();
        worker.current = null;
        setBusy(false);
        if (event.data.ok && event.data.result) setResult(event.data.result);
        else setError(event.data.error ?? '推演未完成');
      };
      instance.onerror = () => {
        if (request === generation.current) {
          cancel();
          setError('推演线程未能启动，请刷新页面重试。');
        }
      };
      instance.postMessage({
        input,
        heroes: heroes.map((h) => ({
          ...h,
          builds: undefined,
          runes: undefined,
          skills: h.skills.map((s) => ({ ...s, description: '' })),
        })),
      });
    } catch (e) {
      if (request === generation.current) {
        setBusy(false);
        setError((e as Error).message);
      }
    }
  };
  return (
    <section className="surface coach-lab" aria-label="教练博弈 BP">
      <div className="section-title">
        <div>
          <p className="eyebrow">COACH SEARCH / 先想对手，再落下一手</p>
          <h2>
            <Swords size={22} /> 教练博弈 BP
          </h2>
        </div>
        <span className="outline-tag">双方多位置 · 多步应对</span>
      </div>
      <p>
        从下方当前阵容出发，比较“我方选择 → 对方针对 →
        我方应对”。已知选手使用各自记录，未指定的队友按未知水平处理。
      </p>
      <div className="pro-form">
        <label>
          我方选人顺序
          <select
            value={settings.firstPick}
            onChange={(e) =>
              setSettings({ ...settings, firstPick: e.target.value as CoachSettings['firstPick'] })
            }
          >
            <option value="allies">蓝方先选</option>
            <option value="enemies">红方后选</option>
          </select>
        </label>
        <label>
          推演谁的下一手
          <select
            value={settings.nextSide}
            onChange={(e) =>
              setSettings({ ...settings, nextSide: e.target.value as CoachSettings['nextSide'] })
            }
          >
            <option value="auto">按当前选人数推断</option>
            <option value="allies">我方下一手</option>
            <option value="enemies">对方下一手</option>
          </select>
        </label>
        <label>
          本手行动
          <select
            value={settings.action}
            onChange={(e) => setSettings({ ...settings, action: e.target.value as 'pick' | 'ban' })}
          >
            <option value="pick">选人及后续应对</option>
            <option value="ban">禁用及后续选人</option>
          </select>
        </label>
        <label>
          推演深度
          <select
            value={settings.depth}
            onChange={(e) => setSettings({ ...settings, depth: Number(e.target.value) })}
          >
            <option value={2}>快速 · 2 手</option>
            <option value={4}>标准 · 4 手</option>
            <option value={5}>深入 · 5 手</option>
          </select>
        </label>
        <label>
          每步候选宽度
          <select
            value={settings.width}
            onChange={(e) => setSettings({ ...settings, width: Number(e.target.value) })}
          >
            <option value={4}>4 个 · 快速</option>
            <option value={6}>6 个 · 均衡</option>
            <option value={8}>8 个 · 更多分支</option>
          </select>
        </label>
        <label>
          对手模型
          <select
            value={settings.strategy}
            onChange={(e) =>
              setSettings({ ...settings, strategy: e.target.value as CoachSettings['strategy'] })
            }
          >
            <option value="robust">稳健：防范最强应对</option>
            <option value="tendency">倾向：按对手偏好加权</option>
          </select>
        </label>
      </div>
      <details className="coach-players">
        <summary>选手分工与对手线索 · 指定队友后使用其详细档案</summary>
        <div className="pro-form">
          {ROLES.map((role) => (
            <label key={role}>
              {'我方' + role + '选手'}
              <select
                value={assignments[role] ?? ''}
                onChange={(e) =>
                  setAssignments({ ...assignments, [role]: e.target.value || undefined })
                }
              >
                <option value="">未指定 · 不假定我会玩</option>
                {available.map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                    disabled={Object.entries(assignments).some(
                      ([r, id]) => r !== role && id === m.id,
                    )}
                  >
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="check-control">
          <input
            type="checkbox"
            checked={settings.respectPools}
            onChange={(e) => setSettings({ ...settings, respectPools: e.target.checked })}
          />
          指定选手只使用其已登记英雄池
        </label>
        <label className="field">
          搜索对手常用英雄
          <input
            value={opponentQuery}
            onChange={(e) => setOpponentQuery(e.target.value)}
            placeholder="可选；不填写时按未知对手建模"
          />
        </label>
        <div className="opponent-pool">
          {heroes
            .filter((h) => !opponentQuery || h.name.includes(opponentQuery))
            .map((h) => (
              <label className="check-control" key={h.id}>
                <input
                  type="checkbox"
                  checked={opponentPool.includes(h.id)}
                  disabled={!opponentPool.includes(h.id) && opponentPool.length >= 30}
                  onChange={(e) =>
                    setOpponentPool(
                      e.target.checked
                        ? [...opponentPool, h.id]
                        : opponentPool.filter((id) => id !== h.id),
                    )
                  }
                />
                {h.name}
              </label>
            ))}
        </div>
        <p className="data-caption">
          已记录 {opponentPool.length}{' '}
          个对手偏好线索。对手仍可能选择池外英雄；不会把这个列表当作真实账号同步结果。
        </p>
      </details>
      <div className="pro-actions">
        <button className="btn primary" disabled={busy} onClick={() => void run()}>
          <Swords size={16} />
          {busy ? '正在计算双方应对…' : '开始教练推演'}
        </button>
        {busy && (
          <button className="btn secondary" onClick={cancel}>
            <Square size={14} />
            停止推演
          </button>
        )}
        <span className="data-caption">
          计算在独立线程进行。调整阵容、选手或参数后，旧结果会自动失效。
        </span>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="coach-results">
          <div className="coach-metrics">
            <div>
              <strong>
                {result.completedDepth} / {result.requestedDepth}
              </strong>
              <span>完成推演手数</span>
            </div>
            <div>
              <strong>{result.searchedNodes.toLocaleString()}</strong>
              <span>访问搜索节点</span>
            </div>
            <div>
              <strong>{result.evaluatedPositions.toLocaleString()}</strong>
              <span>实际局面评估次数</span>
            </div>
            <div>
              <strong>{result.elapsedMs} ms</strong>
              <span>本次计算耗时</span>
            </div>
          </div>
          {result.bounded && (
            <p className="pro-notice">
              已达到计算预算，展示最后完整算完的一层；未完成的更深结果没有混入排名。
            </p>
          )}
          <p className="data-caption">
            {result.side === 'allies' ? '按我方相对方案值排序' : '按对方最能施压的应对排序'}
            。方案值不是胜率；对手分支是推演假设，需随实际选择重新计算。
          </p>
          <div className="coach-candidates">
            {result.candidates.slice(0, 3).map((candidate, i) => (
              <article key={candidate.move.heroId + candidate.move.role}>
                <div className="section-title">
                  <button
                    className="hero-row"
                    onClick={() => onOpen(heroById(candidate.move.heroId)!)}
                  >
                    <Portrait hero={heroById(candidate.move.heroId)} />
                    <span>
                      <strong>
                        {i + 1}. {label(candidate.move)}
                      </strong>
                      <small>相对方案值 {candidate.value.toFixed(1)}</small>
                    </span>
                  </button>
                </div>
                <ol className="coach-line">
                  {candidate.line.map((move, j) => (
                    <li className={move.team} key={j}>
                      <span>{j + 1}</span>
                      <strong>{label(move)}</strong>
                    </li>
                  ))}
                </ol>
                <ul>
                  {candidate.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {candidate.opponentReplies.map((reply, j) => (
                  <p className="opponent-reply" key={j}>
                    预判回应：{label(reply.move)}。{reply.reason}
                  </p>
                ))}
                {candidate.risks.map((risk) => (
                  <p className="muted" key={risk}>
                    {risk}
                  </p>
                ))}
                <button
                  className="btn secondary"
                  onClick={() => {
                    try {
                      onChange(applyCoachMove(draft, candidate.move));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  只应用这一步 <ArrowRight size={15} />
                </button>
              </article>
            ))}
          </div>
          <details className="score-explanation">
            <summary>
              搜索范围与依据 · 剪枝 {result.prunedBranches}，缓存命中 {result.cacheHits}
            </summary>
            <ul>
              {result.assumptions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </details>
          <button
            className="text-btn"
            onClick={() =>
              download(
                '开局-教练推演.json',
                JSON.stringify(
                  {
                    generatedAt: new Date().toISOString(),
                    draft: { allies: draft.allies, enemies: draft.enemies, banned: draft.banned },
                    settings,
                    result,
                  },
                  null,
                  2,
                ),
              )
            }
          >
            <Download size={14} />
            导出这次推演
          </button>
        </div>
      )}
    </section>
  );
}
