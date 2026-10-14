import { useState } from 'react';
import {
  Plus,
  ArrowRight,
  Check,
  ClipboardList,
  Target,
  Clock,
  TrendingUp,
  PencilLine,
} from 'lucide-react';
import { heroes, heroById } from './catalog.ts';
import { ROLES, matchSchema } from './model.ts';
import type { Match, MatchInput } from './model.ts';
import { notes } from './tactics.ts';
import { Modal, Portrait, Empty } from './ui.tsx';
import { download } from '../api.ts';
const today = () => new Date().toLocaleDateString('en-CA');
const blank = (): MatchInput => ({
  heroId: heroes[0].id,
  role: '对抗路',
  outcome: 'win',
  kills: 0,
  deaths: 0,
  assists: 0,
  minutes: 15,
  focus: '站位与生存',
  note: '',
  nextAction: '',
  playedOn: today(),
});
export default function Journal({
  matches,
  onAdd,
  onCheck,
  busy,
}: {
  matches: Match[];
  onAdd: (m: MatchInput, id?: string) => Promise<void>;
  onCheck: (m: Match, done: boolean) => void;
  busy: boolean;
}) {
  const [entry, setEntry] = useState<MatchInput | null>(null),
    [editId, setEditId] = useState<string | undefined>(),
    [error, setError] = useState('');
  const wins = matches.filter((m) => m.outcome === 'win').length,
    done = matches.filter((m) => m.done).length;
  const frequencies = Object.entries(
    matches.reduce<Record<string, number>>((acc, m) => {
      acc[m.focus] = (acc[m.focus] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const edit = (m?: Match) => {
    setEditId(m?.id);
    setError('');
    if (m) {
      const { id, createdAt, done, ...input } = m;
      setEntry(input);
    } else setEntry(blank());
  };
  const save = async () => {
    const parsed = matchSchema.safeParse(entry);
    if (!parsed.success) {
      setError(
        '请填写有效日期、0–100 的击杀/死亡/助攻、1–120 分钟的时长，以及一个具体的下局行动。',
      );
      return;
    }
    try {
      await onAdd(parsed.data, editId);
      setEntry(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MATCH JOURNAL / BETTER NEXT TIME</p>
          <h1>输赢之后，留下点有用的。</h1>
          <p>亲手记下这局的转折，把“下次注意”变成一个可以做到的动作。</p>
        </div>
        <button className="btn primary" onClick={() => edit()}>
          <Plus size={17} />
          记录一局
        </button>
      </div>
      <div className="journal-stats">
        <article>
          <ClipboardList size={21} />
          <div>
            <strong>
              {matches.length}
              <small>局</small>
            </strong>
            <span>你记录的对局</span>
          </div>
        </article>
        <article>
          <TrendingUp size={21} />
          <div>
            <strong>
              {matches.length ? Math.round((wins / matches.length) * 100) : '—'}
              <small>{matches.length ? '%' : ''}</small>
            </strong>
            <span>手记样本胜率 · {wins} 胜</span>
          </div>
        </article>
        <article>
          <Target size={21} />
          <div>
            <strong>
              {done}
              <small>项</small>
            </strong>
            <span>已完成的练习目标</span>
          </div>
        </article>
      </div>
      <div className="journal-layout">
        <section className="surface">
          <div className="section-title">
            <h2>对局时间线</h2>
            <span className="tiny-label">手动记录 · 非游戏账号同步</span>
          </div>
          {matches.length ? (
            <div className="match-list">
              {matches.map((m) => (
                <article className="match-entry" key={m.id}>
                  <div className="match-header">
                    <span className={'outcome ' + m.outcome}>
                      {m.outcome === 'win' ? '胜利' : '失利'}
                    </span>
                    <Portrait hero={heroById(m.heroId)} />
                    <div>
                      <strong>
                        {heroById(m.heroId)?.name}
                        <small>{m.role}</small>
                      </strong>
                      <span>
                        {m.playedOn} · {m.minutes} 分钟
                      </span>
                    </div>
                    <div className="kda">
                      <strong>
                        {m.kills}
                        <i>/</i>
                        {m.deaths}
                        <i>/</i>
                        {m.assists}
                      </strong>
                      <small>击杀 / 死亡 / 助攻</small>
                    </div>
                    <button
                      className="icon-btn"
                      aria-label={'编辑' + heroById(m.heroId)?.name + '对局'}
                      onClick={() => edit(m)}
                    >
                      <PencilLine size={15} />
                    </button>
                  </div>
                  <div className="match-note">
                    <span>{m.focus}</span>
                    <p>{m.note || '这一局没有补充文字复盘。'}</p>
                  </div>
                  <div className={'next-action ' + (m.done ? 'complete' : '')}>
                    <button
                      aria-label={(m.done ? '取消完成' : '完成目标') + m.nextAction}
                      aria-pressed={m.done}
                      disabled={busy}
                      onClick={() => onCheck(m, !m.done)}
                    >
                      {m.done ? <Check size={14} /> : null}
                    </button>
                    <div>
                      <small>{m.done ? '已完成这项练习' : '下一局的一个动作'}</small>
                      <p>{m.nextAction}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="第一条手记，从这局开始。"
              description="不用写长篇复盘。记住一个具体问题，再给下一局留一个行动。"
              action={
                <button className="btn secondary" onClick={() => edit()}>
                  记下我的第一局 <ArrowRight size={15} />
                </button>
              }
            />
          )}
        </section>
        <aside>
          <section className="surface journal-insight">
            <p className="eyebrow">FIND YOUR PATTERN</p>
            <h2>最近，你更关注什么？</h2>
            {frequencies.length ? (
              <>
                <p>
                  在你记录的 {matches.length} 局中，关注最多的是{' '}
                  <strong>{frequencies[0][0]}</strong>。
                </p>
                {frequencies.map(([name, n]) => (
                  <div className="focus-bar" key={name}>
                    <span>{name}</span>
                    <strong>{n} 次</strong>
                    <div>
                      <i style={{ width: (n / matches.length) * 100 + '%' }} />
                    </div>
                  </div>
                ))}
                <p className="data-caption">根据你选择的复盘标签汇总，不能据此判定输赢原因。</p>
              </>
            ) : (
              <p className="muted">
                积累几条真实手记后，这里会呈现你的关注点。没有对局记录时，不生成虚构分析。
              </p>
            )}
          </section>
          <section className="journal-prompt">
            <span className="eyebrow">A BETTER QUESTION</span>
            <h3>
              比“队友不行”
              <br />
              再往前想一步。
            </h3>
            <p>
              那波团战开始前，
              <br />
              我有看到队友的位置吗？
              <br />
              <br />
              把回答写下来，
              <br />
              下一局就有了练习的方向。
            </p>
          </section>
        </aside>
      </div>
      {entry && (
        <Modal
          title={editId ? '修改这局的记录' : '用一分钟，留下一局的收获'}
          onClose={() => setEntry(null)}
          wide
        >
          <p className="dialog-lead">
            记录自己的观察。这里不会连接游戏账号，统计仅来自你保存的手记。
          </p>
          <div className="form-grid three">
            <label>
              使用英雄
              <select
                aria-label="使用英雄"
                value={entry.heroId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setEntry({
                    ...entry,
                    heroId: id,
                    role: (heroById(id)?.roles[0] ?? '中路') as MatchInput['role'],
                  });
                }}
              >
                {heroes.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              分路
              <select
                aria-label="手记分路"
                value={entry.role}
                onChange={(e) => setEntry({ ...entry, role: e.target.value as MatchInput['role'] })}
              >
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              对局日期
              <input
                aria-label="对局日期"
                type="date"
                value={entry.playedOn}
                onChange={(e) => setEntry({ ...entry, playedOn: e.target.value })}
              />
            </label>
          </div>
          <div className="form-grid three">
            <label>
              结果
              <select
                aria-label="对局结果"
                value={entry.outcome}
                onChange={(e) => setEntry({ ...entry, outcome: e.target.value as 'win' | 'loss' })}
              >
                <option value="win">胜利</option>
                <option value="loss">失利</option>
              </select>
            </label>
            <label>
              时长（分钟）
              <input
                aria-label="对局时长"
                type="number"
                min={1}
                max={120}
                value={Number.isNaN(entry.minutes) ? '' : entry.minutes}
                onChange={(e) => setEntry({ ...entry, minutes: e.target.valueAsNumber })}
              />
            </label>
            <label>
              关注点
              <select
                aria-label="复盘关注点"
                value={entry.focus}
                onChange={(e) =>
                  setEntry({ ...entry, focus: e.target.value as MatchInput['focus'] })
                }
              >
                {['站位与生存', '兵线与发育', '支援与转线', '开团与配合', '资源与推塔'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid three">
            {(['kills', 'deaths', 'assists'] as const).map((field, i) => (
              <label key={field}>
                {['击杀', '死亡', '助攻'][i]}
                <input
                  aria-label={['击杀', '死亡', '助攻'][i]}
                  type="number"
                  min={0}
                  max={100}
                  value={Number.isNaN(entry[field]) ? '' : entry[field]}
                  onChange={(e) => setEntry({ ...entry, [field]: e.target.valueAsNumber })}
                />
              </label>
            ))}
          </div>
          <label className="form-field">
            这局最值得记住的一件事
            <textarea
              aria-label="这局的复盘"
              maxLength={1200}
              rows={3}
              value={entry.note}
              placeholder="例如：队友还在清线，我就先手开团了。"
              onChange={(e) => setEntry({ ...entry, note: e.target.value })}
            />
          </label>
          <label className="form-field">
            下一局，我要做的一个具体动作
            <input
              aria-label="下一局行动"
              maxLength={240}
              value={entry.nextAction}
              placeholder="例如：每次开团前，先看一次小地图上的队友位置。"
              onChange={(e) => setEntry({ ...entry, nextAction: e.target.value })}
            />
          </label>
          {notes[heroById(entry.heroId)?.name ?? ''] && (
            <button
              className="text-btn"
              onClick={() =>
                setEntry({ ...entry, nextAction: notes[heroById(entry.heroId)!.name].drill })
              }
            >
              <Target size={14} />
              采用这位英雄的练习提示
            </button>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <span className="muted">保存在本机，可随时修改。</span>
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => download('开局-手记草稿.json', JSON.stringify(entry, null, 2))}
            >
              导出当前手记草稿
            </button>
            <button className="btn primary" onClick={save} disabled={busy}>
              <Check size={16} />
              保存手记
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
