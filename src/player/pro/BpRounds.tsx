import { useEffect, useMemo, useState } from 'react';
import { Undo2, Play, Pause, Download, Check, Swords } from 'lucide-react';
import { heroes, heroById } from '../catalog.ts';
import { ROLES } from '../model.ts';
import type { Draft, Role } from '../model.ts';
import { Portrait } from '../ui.tsx';
import { download } from '../../api.ts';
import BpTimer from './BpTimer.tsx';
import {
  roundsFor,
  replaySession,
  sessionSchema,
  assessDraft,
  sessionInference,
  setSessionRole,
  appendSessionMove,
  undoSession,
} from './bpSession.ts';
import type { BpSession } from './bpSession.ts';
import type { CoachResult } from './coach.ts';
export { BP_ROUNDS, bpStep } from './bpSession.ts';
const STORAGE = 'kaiju.bp.rehearsal.v1';
function restore() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return { session: null, error: '' };
    const session = sessionSchema.parse(JSON.parse(raw));
    replaySession(session);
    return { session, error: '' };
  } catch {
    return { session: null, error: '上次演练记录未能校验，请重新开始；原有备战卡片不受影响。' };
  }
}
export default function BpRounds({
  draft,
  onChange,
  series,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  series?: { seed: BpSession; onSession: (session: BpSession) => void };
}) {
  const [initial] = useState(() => (series ? { session: series.seed, error: '' } : restore()));
  const [session, setSession] = useState<BpSession | null>(initial.session);
  const [format, setFormat] = useState<BpSession['format']>(initial.session?.format ?? 'staged');
  const [mode, setMode] = useState<BpSession['mode']>(initial.session?.mode ?? 'manual');
  const [role, setRole] = useState<Role | '全部'>('全部');
  const [query, setQuery] = useState(''),
    [chosen, setChosen] = useState('');
  const [error, setError] = useState(initial.error),
    [storageError, setStorageError] = useState('');
  const [paused, setPaused] = useState(!!initial.session),
    [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [clockEpoch, setClockEpoch] = useState(0);
  const rounds = roundsFor(session?.format ?? format);
  const count = session?.moves.length ?? 0,
    turn = session ? rounds[count] : undefined;
  const position = useMemo(
    () => replaySession(session ?? { version: 1, format, mode, moves: [] }, draft),
    [session, draft, format, mode],
  );
  const used = [
    ...Object.values(position.allies),
    ...Object.values(position.enemies),
    ...position.banned,
  ];
  const inferences = useMemo(
    () =>
      session
        ? {
            allies: sessionInference(session, 'allies'),
            enemies: sessionInference(session, 'enemies'),
          }
        : undefined,
    [session],
  );
  const aiTurn =
    !!turn &&
    ((mode === 'blue' && turn.team === 'enemies') || (mode === 'red' && turn.team === 'allies'));
  const canManual = !!turn && (!aiTurn || paused);
  const excluded = turn?.kind === 'pick' ? (session?.unavailable?.[turn.team] ?? []) : [];
  useEffect(() => {
    if (!session) return;
    if (series) {
      series.onSession({ ...session, mode });
      return;
    }
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ ...session, mode }));
      setStorageError('');
    } catch {
      setStorageError('浏览器未能保存演练，请先导出选禁记录，避免关闭页面后丢失。');
    }
  }, [session, mode]);
  useEffect(() => {
    setChosen('');
    setRole('全部');
  }, [session, mode]);
  useEffect(() => {
    if (!session || !turn || !aiTurn || paused) {
      setBusy(false);
      return;
    }
    let active = true;
    setBusy(true);
    const instance = new Worker(new URL('./coach.worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      if (active) {
        active = false;
        instance.terminate();
        setBusy(false);
        setPaused(true);
        setError('本手计算超时，已暂停。可重试或手动选禁。');
      }
    }, 15000);
    instance.onmessage = (
      event: MessageEvent<{ ok: boolean; result?: CoachResult; error?: string }>,
    ) => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      instance.terminate();
      setBusy(false);
      try {
        if (!event.data.ok || !event.data.result?.candidates.length)
          throw Error(event.data.error ?? '未找到合法应对');
        const next = event.data.result.candidates[0].move;
        if (next.team !== turn.team || next.kind !== turn.kind)
          throw Error('AI 返回的行动与当前回合不一致');
        setSession(appendSessionMove(session, next.heroId));
        setResult(event.data.result);
      } catch (e) {
        setPaused(true);
        setError((e as Error).message);
      }
    };
    instance.onerror = () => {
      if (active) {
        active = false;
        clearTimeout(timer);
        instance.terminate();
        setBusy(false);
        setPaused(true);
        setError('AI 线程未能完成，请重试或手动接管。');
      }
    };
    instance.postMessage({
      heroes,
      input: {
        draft: position,
        settings: {
          depth: 4,
          width: 6,
          strategy: 'robust',
          firstPick: 'allies',
          nextSide: turn.team,
          action: turn.kind,
          respectPools: false,
        },
        members: {},
        opponentPool: [],
        sequence: rounds.slice(count),
        flexibleRoles: { locks: session.locks ?? {} },
        unavailableHeroes: session.unavailable,
      },
    });
    return () => {
      active = false;
      clearTimeout(timer);
      instance.terminate();
    };
  }, [session, mode, paused]);
  const begin = () => {
    setClockEpoch((n) => n + 1);
    setSession({
      version: 1,
      format,
      mode,
      moves: [],
      ...(series ? { unavailable: series.seed.unavailable } : {}),
    });
    setPaused(false);
    setQuery('');
    setError('');
    setResult(null);
  };
  const confirm = () => {
    try {
      if (!session || !canManual) return;
      if (!chosen) throw Error('先选择本轮英雄');
      setSession(appendSessionMove(session, Number(chosen)));
      setResult(null);
      setQuery('');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const undo = () => {
    if (session) {
      setPaused(true);
      setResult(null);
      setError('');
      setSession(undoSession(session));
    }
  };
  const list = heroes.filter(
    (h) =>
      (!query || [h.name, h.slug].some((s) => s.includes(query.trim()))) &&
      (role === '全部' || h.roles.includes(role)),
  );
  const adjustRole = (team: 'allies' | 'enemies', id: number, value: Role | 'auto') => {
    if (!session) return;
    try {
      const next = setSessionRole(session, team, id, value);
      replaySession(next);
      setPaused(true);
      setResult(null);
      setError('');
      setSession(next);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const finished = !!session && !turn;
  return (
    <section className="surface bp-rounds" aria-label="红蓝双方BP操作台">
      <div className="section-title">
        <div>
          <p className="eyebrow">DRAFT ROOM / HUMAN × AI</p>
          <h2>
            <Swords size={21} /> 红蓝双方 · 逐手 BP
          </h2>
        </div>
        <span className="outline-tag">
          {session ? `${count} / ${rounds.length} 手` : '准备开始'}
        </span>
      </div>
      <p className="muted">
        你来操控双方，或选择一方与 AI 交锋。点头像、确认本轮，按阶段完成禁用与选人。
      </p>
      <div className="pro-toolbar">
        <label>
          BP规则
          <select
            aria-label="BP规则"
            value={format}
            disabled={!!series || (!!session && count > 0 && !finished)}
            onChange={(e) => setFormat(e.target.value as typeof format)}
          >
            <option value="staged">分阶段选禁 · 20 手</option>
            <option value="classic">简化练习 · 16 手</option>
          </select>
        </label>
        <label>
          操作模式
          <select
            aria-label="操作模式"
            value={mode}
            onChange={(e) => {
              setPaused(true);
              setMode(e.target.value as typeof mode);
            }}
          >
            <option value="manual">人类控制红蓝双方</option>
            <option value="blue">我控制蓝方 · AI 红方</option>
            <option value="red">我控制红方 · AI 蓝方</option>
          </select>
        </label>
        <button className="btn primary" onClick={begin}>
          <Play size={15} />
          开始新演练
        </button>
        {session && (
          <button className="btn secondary" disabled={!count} onClick={undo}>
            <Undo2 size={15} />
            撤回一步
          </button>
        )}
        {session && turn && (
          <button
            className="btn secondary"
            onClick={() => {
              setPaused(!paused);
              setError('');
            }}
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}
            {paused
              ? mode === 'manual'
                ? '继续 BP'
                : '继续 AI'
              : mode === 'manual'
                ? '暂停 BP 计时'
                : '暂停 AI / 手动接管'}
          </button>
        )}
      </div>
      <BpTimer
        turnKey={`${clockEpoch}:${session?.format}:${count}`}
        active={!!turn}
        paused={paused}
        onPause={setPaused}
        onTimeout={() => {
          setPaused(true);
          setError('本手计时结束，已暂停。请确认选禁，或重新计时并继续。');
        }}
      />
      <p className="data-caption">
        分阶段规则参考天元网站版：双方各禁 2 位 → 各选 3 位 → 各禁 3 位 → 各选 2 位。简化规则先各禁
        3 位，再按 1–2–2–2–2–1
        选人。均为单局练习，不冒充所有赛事规则。演练独立保存，点击“带入备战”才替换下方阵容。
      </p>
      <div className="bp-turn-banner" role={session ? 'status' : undefined}>
        {!session
          ? '选择模式后，开始 BP'
          : turn
            ? `第 ${count + 1} / ${rounds.length} 步 · ${turn.team === 'allies' ? '蓝方' : '红方'}${turn.kind === 'ban' ? '禁用' : '选人'}${busy ? ' · AI 正在推演…' : aiTurn && !paused ? ' · AI 回合' : ' · 请点选英雄'}`
            : '选禁完成 · 查看双方阵容评估'}
      </div>
      <p className="pro-notice">
        每一手只选英雄，双方可优先选任意分路。系统随本方后续选人重新推断位置；“仍可摇摆”不等于已确定分路。下方可手动锁定分路；选择已占用的位置会交换两位英雄并同时锁定。调整后
        AI 暂停，确认后继续。
      </p>
      <div className="bp-board">
        {(['allies', 'enemies'] as const).map((team) => (
          <section
            className={'bp-team ' + team}
            key={team}
            aria-label={team === 'allies' ? '蓝方阵容' : '红方阵容'}
          >
            <h3>
              {team === 'allies' ? '蓝方 · 先选' : '红方 · 后选'}
              <small>
                {(mode === 'blue' && team === 'enemies') || (mode === 'red' && team === 'allies')
                  ? 'AI'
                  : '人类'}
              </small>
            </h3>
            <div className="bp-bans">
              {rounds
                .filter((t) => t.team === team && t.kind === 'ban')
                .map((_, i) => {
                  const bans =
                    session?.moves.filter(
                      (_, j) => rounds[j].team === team && rounds[j].kind === 'ban',
                    ) ?? [];
                  return (
                    <div
                      key={i}
                      className="bp-ban"
                      title={heroById(bans[i]?.heroId)?.name ?? `禁用位 ${i + 1}`}
                    >
                      <Portrait hero={heroById(bans[i]?.heroId)} />
                      <small>{heroById(bans[i]?.heroId)?.name ?? `禁 ${i + 1}`}</small>
                    </div>
                  );
                })}
            </div>
            <div className="bp-picks">
              {Array.from({ length: 5 }, (_, i) => {
                const pick = session?.moves.filter(
                  (_, j) => rounds[j].team === team && rounds[j].kind === 'pick',
                )[i];
                const hero = heroById(pick?.heroId);
                const inferred = hero
                  ? ROLES.find((r) => position[team][r] === hero.id)
                  : undefined;
                const options = hero ? (inferences?.[team].alternatives[hero.id] ?? []) : [];
                const locked = hero ? session?.locks?.[hero.id] : undefined;
                const unsupported = hero && inferences?.[team].unsupported.includes(hero.id);
                return (
                  <article className="bp-pick-slot" key={i}>
                    <small>第 {i + 1} 手选人</small>
                    <Portrait hero={hero} />
                    <strong>{hero?.name ?? '待选择'}</strong>
                    {hero && (
                      <>
                        <span className="bp-role-status">
                          {locked
                            ? '手动锁定'
                            : unsupported
                              ? '非目录分路 · 待确认'
                              : options.length > 1
                                ? '暂排'
                                : '当前推断'}
                          ：{inferred}
                        </span>
                        {unsupported && (
                          <span className="bp-role-warning">
                            此位置不在英雄目录分路中，请确认或调整。
                          </span>
                        )}
                        {!locked && options.length > 1 && (
                          <small className="bp-flex-options">仍可摇摆：{options.join(' / ')}</small>
                        )}
                        <label>
                          分路调整
                          <select
                            aria-label={(team === 'allies' ? '蓝方' : '红方') + hero.name + '分路'}
                            value={locked ?? 'auto'}
                            onChange={(e) =>
                              adjustRole(team, hero.id, e.target.value as Role | 'auto')
                            }
                          >
                            <option value="auto">自动判断</option>
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                                {!hero.roles.includes(r) ? '（手动非常规）' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
            {session && (
              <button
                className="text-btn"
                onClick={() => {
                  const ids = session.moves
                    .filter((_, i) => rounds[i].team === team && rounds[i].kind === 'pick')
                    .map((m) => String(m.heroId));
                  setSession({
                    ...session,
                    locks: Object.fromEntries(
                      Object.entries(session.locks ?? {}).filter(([id]) => !ids.includes(id)),
                    ),
                  });
                  setPaused(true);
                  setResult(null);
                  setError('');
                }}
              >
                本方全部恢复自动分路
              </button>
            )}
          </section>
        ))}
      </div>
      {session && turn && (
        <div className="bp-selection">
          <div className="pro-toolbar">
            <label>
              英雄分路筛选
              <select
                aria-label="英雄分路筛选"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as Role | '全部');
                  setChosen('');
                }}
              >
                <option>全部</option>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              搜索待选英雄
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="英雄名 / 拼音"
              />
            </label>
            <label>
              本轮英雄
              <select
                aria-label="本轮英雄"
                value={chosen}
                disabled={!canManual}
                onChange={(e) => setChosen(e.target.value)}
              >
                <option value="">选择英雄</option>
                {list
                  .filter((h) => !used.includes(h.id) && !excluded.includes(h.id))
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="bp-hero-picker" aria-label="本轮英雄头像选择">
            {list.map((h) => (
              <button
                key={h.id}
                aria-label={`BP选择${h.name}`}
                aria-pressed={chosen === String(h.id)}
                disabled={!canManual || used.includes(h.id) || excluded.includes(h.id)}
                className={chosen === String(h.id) ? 'selected' : ''}
                onClick={() => setChosen(String(h.id))}
              >
                <Portrait hero={h} />
                <span>{h.name}</span>
                {used.includes(h.id) && <small>已选 / 禁</small>}
                {!used.includes(h.id) && excluded.includes(h.id) && <small>本队前局已用</small>}
              </button>
            ))}
          </div>
          <div className="bp-confirm">
            <span>
              {chosen
                ? `待${turn.kind === 'ban' ? '禁用' : '选择'}：${heroById(Number(chosen))?.name}${turn.kind === 'pick' ? ' · 分路自动推断' : ''}`
                : '点选头像后确认'}
            </span>
            <button className="btn primary" disabled={!chosen || !canManual} onClick={confirm}>
              <Check size={16} />
              确认本轮
            </button>
          </div>
        </div>
      )}
      {result && (
        <details className="source-proof">
          <summary>
            上一手 AI 的计算记录 · {result.searchedNodes} 个搜索节点 / 完成 {result.completedDepth}{' '}
            手
          </summary>
          <p>{result.candidates[0]?.reasons.join('；')}</p>
          <p>{result.assumptions.join('；')}</p>
        </details>
      )}
      {finished && (
        <div className="bp-verdict">
          <h3>电脑阵容评估</h3>
          <p>
            当前尚无经过真实对局校准的阵容胜率模型，因此不输出虚假的胜率百分比。下面比较阵容结构与官方关系快照，实战仍取决于熟练度、版本和局内决策。
          </p>
          <div className="bp-board">
            {assessDraft(position).map((a) => (
              <article key={a.team}>
                <h4>
                  {a.team === 'allies' ? '蓝方' : '红方'} · 结构评估 {a.score} / 100
                </h4>
                <p>具备：{a.covered.join('、') || '待补充'}</p>
                <p>需要补足：{a.missing.join('、') || '基础结构已覆盖'}</p>
                {a.offRoles.length > 0 && <p>摇摆位置需实测：{a.offRoles.join('、')}</p>}
                <ul>
                  {a.relations.map((r, i) => (
                    <li key={i}>
                      {r.from} → {heroById(r.heroId)?.name}：
                      {r.type === 'partner' ? '搭配' : r.type === 'counters' ? '针对' : '需提防'} ·{' '}
                      {r.reason}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <details>
            <summary>评估怎么算</summary>
            <p>
              结构基础 40 分；前排、开团、法术输出、物理输出各覆盖一项加 10
              分；官网关系每条搭配或针对加 3 分、受克制减 4 分；限定在
              0–100。权重是项目设计，尚未经过比赛结果校准。个人战力与分段胜率没有冒充整队胜率。
            </p>
          </details>
        </div>
      )}
      {session && count > 0 && (
        <>
          <details className="bp-history">
            <summary>逐手选禁记录 · {count} 手</summary>
            <ol>
              {session.moves.map((m, i) => (
                <li key={i}>
                  <span>
                    {i + 1}. {rounds[i].team === 'allies' ? '蓝方' : '红方'}
                    {rounds[i].kind === 'ban' ? '禁用' : '选择'}
                  </span>
                  <Portrait hero={heroById(m.heroId)} />
                  <strong>{heroById(m.heroId)?.name}</strong>
                  {rounds[i].kind === 'pick' && (
                    <small>
                      当前{ROLES.find((r) => position[rounds[i].team][r] === m.heroId)}
                      {session.locks?.[m.heroId] ? ' · 手动' : ' · 推断'}
                    </small>
                  )}
                </li>
              ))}
            </ol>
          </details>
          <div className="pro-actions">
            <button
              className="btn secondary"
              onClick={() => onChange({ ...position, pool: draft.pool, memberId: draft.memberId })}
            >
              带入备战（蓝方为我方）
            </button>
            <button
              className="btn secondary"
              onClick={() =>
                onChange({
                  ...position,
                  allies: position.enemies,
                  enemies: position.allies,
                  pool: draft.pool,
                  memberId: draft.memberId,
                })
              }
            >
              带入备战（红方为我方）
            </button>
            <button
              className="text-btn"
              onClick={() =>
                download(
                  '自在弈境-BP逐手记录.json',
                  JSON.stringify(
                    { ...session, mode, assessment: finished ? assessDraft(position) : undefined },
                    null,
                    2,
                  ),
                )
              }
            >
              <Download size={15} />
              导出选禁记录
            </button>
          </div>
          <p className="data-caption">
            {storageError || '演练自动保存到当前浏览器。刷新后恢复并暂停 AI，防止自动落子。'}
          </p>
        </>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
