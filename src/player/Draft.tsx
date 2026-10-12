import { latestSnapshot, usableSnapshot } from './pro/analytics.ts';
import { scopeIssue } from './pro/statistics.ts';
import { usePro } from './pro/context.tsx';
import { SEGMENTS } from './pro/model.ts';
import BpRounds from './pro/BpRounds.tsx';
import type { SocialData } from './pro/Social.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  X,
  Search,
  ArrowRight,
  ArrowUpRight,
  Shield,
  Swords,
  Save,
  Download,
  Sparkles,
  Check,
  RefreshCw,
  Info,
} from 'lucide-react';
import { heroes, heroById } from './catalog.ts';
import { ROLES, levelNames } from './model.ts';
import type { Draft, Role, Hero } from './model.ts';
import { recommend, notes, traitNames, lineupTraits } from './tactics.ts';
import type { Trait } from './tactics.ts';
import { Portrait, Modal, SourceLink, Empty } from './ui.tsx';
import { api, download } from '../api.ts';
export default function DraftPage({
  draft,
  onChange,
  onSave,
  onSavePlan,
  onDemo,
  onOpen,
  busy,
  configured,
  active,
  setActive,
}: {
  active: number | undefined;
  setActive: (id: number) => void;
  draft: Draft;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onSavePlan: (heroId: number, name: string) => Promise<void>;
  onDemo: () => void;
  onOpen: (h: Hero) => void;
  busy: boolean;
  configured: boolean;
}) {
  const [picker, setPicker] = useState<{
    team: 'allies' | 'enemies' | 'banned';
    role: Role;
  } | null>(null);
  const [query, setQuery] = useState(''),
    [allRoles, setAllRoles] = useState(false);
  const [ai, setAi] = useState<{
      headline: string;
      steps: string[];
      caution: string;
      source: string;
    } | null>(null),
    [aiBusy, setAiBusy] = useState(false),
    [aiError, setAiError] = useState(''),
    [settings, setSettings] = useState(false);
  const epoch = useRef(0);
  const { data: pro } = usePro();
  const [social, setSocial] = useState<SocialData>({ user: null, friends: [] });
  useEffect(() => {
    api<SocialData>('/social')
      .then(setSocial)
      .catch(() => {});
  }, []);
  const member = social.friends.find((f) => f.user.id === draft.memberId && f.shared);
  const snapshot = latestSnapshot(pro.snapshots, draft.segment ?? '大众分段');
  const recommendations = useMemo(
    () =>
      recommend(member ? { ...draft, pool: member.pool } : draft, heroes, {
        profile: member?.profile ?? pro.profile,
        snapshot,
      }),
    [draft, member, pro.profile, snapshot],
  );
  const current = recommendations.find((r) => r.hero.id === active) ?? recommendations[0];
  const allies = Object.entries(draft.allies)
    .filter(([role, id]) => role !== draft.role && id)
    .map(([, id]) => id!);
  const before = lineupTraits(allies, heroes),
    after = new Set([...before, ...(current?.note.traits ?? [])]);
  const count =
    Object.values(draft.allies).filter(Boolean).length +
    Object.values(draft.enemies).filter(Boolean).length;
  useEffect(() => {
    epoch.current++;
    setAi(null);
    setAiError('');
    setAiBusy(false);
  }, [draft, active, pro.profile, snapshot]);
  const taken = new Set([
    ...Object.values(draft.allies),
    ...Object.values(draft.enemies),
    ...draft.banned,
  ]);
  const pick = (id: number) => {
    if (!picker) return;
    if (picker.team === 'banned') onChange({ ...draft, banned: [...draft.banned, id] });
    else onChange({ ...draft, [picker.team]: { ...draft[picker.team], [picker.role]: id } });
    setPicker(null);
    setQuery('');
  };
  const openPicker = (team: 'allies' | 'enemies' | 'banned', role: Role) => {
    setQuery('');
    setAllRoles(team === 'banned');
    setPicker({ team, role });
  };
  const clear = (team: 'allies' | 'enemies', role: Role) => {
    const side = { ...draft[team] };
    delete side[role];
    onChange({ ...draft, [team]: side });
  };
  const exportCard = () => {
    if (!current) return;
    const h = current.hero;
    download(
      '开局-' + h.name + '-备战卡.md',
      [
        '# 开局 NEXT · ' + h.name + '备战卡',
        '',
        '分路：' + draft.role,
        '我方：' +
          ROLES.map((r) => r + ' ' + (heroById(draft.allies[r])?.name ?? '待定')).join(' / '),
        '敌方：' +
          ROLES.map((r) => r + ' ' + (heroById(draft.enemies[r])?.name ?? '待定')).join(' / '),
        '候选：' + h.name,
        '',
        '## 为什么考虑',
        ...current.reasons.map((r) => '- ' + r),
        '',
        '## 需要取舍',
        ...current.risks.map((r) => '- ' + r),
        '',
        '## 下一局只练这一件事',
        current.note.drill,
        '',
        '官方资料：' + h.source,
        '本卡为阵容与熟练度规则生成的定性备战建议，不是胜率预测。战术笔记未经对局数据校准。',
      ].join('\n'),
      'text/markdown',
    );
  };
  const generate = async () => {
    if (!configured) {
      setSettings(true);
      return;
    }
    if (!current) return;
    const request = ++epoch.current;
    setAiBusy(true);
    setAiError('');
    try {
      const result = await api<{
        headline: string;
        steps: string[];
        caution: string;
        source: string;
      }>('/coach', { name: current.hero.name + '备战', heroId: current.hero.id, draft });
      if (request === epoch.current) setAi(result);
    } catch (e) {
      if (request === epoch.current) setAiError((e as Error).message);
    } finally {
      if (request === epoch.current) setAiBusy(false);
    }
  };
  const selectable = heroes.filter(
    (h) =>
      !taken.has(h.id) &&
      (allRoles || h.roles.includes(picker?.role ?? draft.role)) &&
      (!query || h.name.includes(query) || h.slug.includes(query)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DRAFT ROOM / YOUR NEXT MOVE</p>
          <h1>这一局，选谁更有思路？</h1>
          <p>放入双方英雄，结合你的英雄池，看清阵容取舍，再带走一份备战卡。</p>
        </div>
        <button className="btn secondary" onClick={onDemo}>
          <RefreshCw size={15} />
          载入教学阵容
        </button>
      </div>
      <BpRounds draft={draft} onChange={onChange} />
      <div className="pro-toolbar">
        <label>
          选人侧重
          <select
            aria-label="选人侧重"
            value={draft.preference ?? 'balanced'}
            onChange={(e) =>
              onChange({ ...draft, preference: e.target.value as 'comfort' | 'balanced' | 'meta' })
            }
          >
            <option value="comfort">更重熟练度</option>
            <option value="balanced">均衡选择</option>
            <option value="meta">更重版本</option>
          </select>
        </label>
        <label>
          参考分段
          <select
            aria-label="BP 参考分段"
            value={draft.segment ?? '大众分段'}
            onChange={(e) =>
              onChange({ ...draft, segment: e.target.value as (typeof SEGMENTS)[number] })
            }
          >
            {SEGMENTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          为谁选英雄
          <select
            aria-label="为谁选英雄"
            value={draft.memberId ?? ''}
            onChange={(e) => onChange({ ...draft, memberId: e.target.value || undefined })}
          >
            <option value="">我自己</option>
            {social.friends
              .filter((f) => f.shared)
              .map((f) => (
                <option key={f.id} value={f.user.id}>
                  {f.user.name} · 已共享
                </option>
              ))}
          </select>
        </label>
        <span className="muted">
          {snapshot
            ? snapshot.patch +
              ' · ' +
              snapshot.endDate +
              (scopeIssue(snapshot)
                ? ' · 统计口径待核对，已停用版本权重'
                : usableSnapshot(snapshot)
                  ? ' · 请核对当前游戏版本'
                  : ' · 统计过旧或日期异常，已停用版本权重')
            : '此分段未接入统计，版本权重自动让给已知依据'}
        </span>
      </div>
      <div className="draft-controls">
        <label>
          我的位置
          <select
            aria-label="我的位置"
            value={draft.role}
            onChange={(e) => onChange({ ...draft, role: e.target.value as Role })}
          >
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="check-control">
          <input
            type="checkbox"
            checked={draft.onlyPool}
            onChange={(e) => onChange({ ...draft, onlyPool: e.target.checked })}
          />
          只从我的英雄池里选
        </label>
        <button className="text-btn" disabled={busy} onClick={onSave}>
          <Save size={15} />
          保存阵容
        </button>
      </div>
      <div className="draft-layout">
        <section className="draft-board surface">
          <div className="lineup-title">
            <span>
              <i className="dot blue" />
              我方阵容
            </span>
            <small>点选位置添加英雄</small>
            <span>
              敌方阵容
              <i className="dot red" />
            </span>
          </div>
          <div className="lineup-versus">
            <div className="lineup-side">
              {ROLES.map((role) => (
                <div key={role} className={'slot ' + (role === draft.role ? 'my-slot' : '')}>
                  <button aria-label={'选择我方' + role} onClick={() => openPicker('allies', role)}>
                    <Portrait hero={heroById(draft.allies[role])} />
                    <span>
                      <small>
                        {role}
                        {role === draft.role ? ' · 我的位置' : ''}
                      </small>
                      <strong>
                        {heroById(draft.allies[role])?.name ??
                          (role === draft.role ? '留给你的选择' : '选择英雄')}
                      </strong>
                    </span>
                  </button>
                  {draft.allies[role] && (
                    <button
                      className="slot-remove"
                      aria-label={'移除我方' + role}
                      onClick={() => clear('allies', role)}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="versus-axis">
              <span>蓝方</span>
              <i />
              <b>VS</b>
              <i />
              <span>红方</span>
            </div>
            <div className="lineup-side enemy">
              {ROLES.map((role) => (
                <div key={role} className="slot">
                  <button
                    aria-label={'选择敌方' + role}
                    onClick={() => openPicker('enemies', role)}
                  >
                    <Portrait hero={heroById(draft.enemies[role])} />
                    <span>
                      <small>{role}</small>
                      <strong>{heroById(draft.enemies[role])?.name ?? '选择英雄'}</strong>
                    </span>
                  </button>
                  {draft.enemies[role] && (
                    <button
                      className="slot-remove"
                      aria-label={'移除敌方' + role}
                      onClick={() => clear('enemies', role)}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="bans">
            <span>已禁用</span>
            {draft.banned.map((id) => (
              <button
                key={id}
                title={'取消禁用' + heroById(id)?.name}
                aria-label={'取消禁用' + heroById(id)?.name}
                onClick={() => onChange({ ...draft, banned: draft.banned.filter((x) => x !== id) })}
              >
                <Portrait hero={heroById(id)} />
                <X size={10} />
              </button>
            ))}
            {draft.banned.length < 10 && (
              <button
                className="ban-add"
                aria-label="添加禁用英雄"
                onClick={() => openPicker('banned', draft.role)}
              >
                <Plus size={15} />
              </button>
            )}
            <small>{draft.banned.length}/10</small>
          </div>
          <div className="board-note">
            <Info size={14} />
            <span>已确认 {count}/10 个位置。未选位置保留未知，建议会随阵容变化。</span>
          </div>
        </section>
        <aside className="surface composition">
          <p className="eyebrow">WHAT DOES YOUR TEAM NEED?</p>
          <h2>选前 / 选后</h2>
          <p className="muted">看看加入 {current?.hero.name ?? '一位候选'}，会补上什么。</p>
          <div className="coverage-label">
            <span>阵容能力</span>
            <span>选前</span>
            <span>选后</span>
          </div>
          {(['frontline', 'engage', 'peel', 'magic', 'physical'] as Trait[]).map((t) => (
            <div className="coverage-row" key={t}>
              <span>{traitNames[t]}</span>
              <span
                role="img"
                aria-label={'选前' + traitNames[t] + (before.has(t) ? '有' : '暂无标注')}
                className={before.has(t) ? 'yes' : 'no'}
              >
                {before.has(t) ? <Check size={14} /> : '—'}
              </span>
              <span
                role="img"
                aria-label={'选后' + traitNames[t] + (after.has(t) ? '有' : '暂无标注')}
                className={after.has(t) ? 'yes' : 'no'}
              >
                {after.has(t) ? <Check size={14} /> : '—'}
              </span>
            </div>
          ))}
          <p className="data-caption">
            依据战术笔记识别阵容能力，不是伤害模拟或胜率预测。“—”表示已标注英雄中暂无该项。
          </p>
        </aside>
      </div>
      <div className="section-title recommendations-title">
        <div>
          <p className="eyebrow">THREE OPTIONS. DIFFERENT TRADEOFFS.</p>
          <h2>给你几个有理由的选择。</h2>
        </div>
        <span className="tiny-label">分路适配 + 阵容补充 + 个人熟练度</span>
      </div>
      {!recommendations.length ? (
        <Empty
          title="当前没有符合条件的候选"
          description="可能是英雄池、禁用或已选英雄限制了范围。取消“只从我的英雄池里选”，或添加这个位置的常用英雄。"
        />
      ) : (
        <>
          <div className="recommend-grid">
            {recommendations.map((r, i) => (
              <button
                key={r.hero.id}
                className={'recommend-card ' + (current?.hero.id === r.hero.id ? 'selected' : '')}
                onClick={() => setActive(r.hero.id)}
              >
                <div className="recommend-top">
                  <Portrait hero={r.hero} />
                  <div>
                    <small>方案 0{i + 1}</small>
                    <h3>{r.hero.name}</h3>
                    <span>{r.level ? levelNames[r.level] : '熟练度待确认'}</span>
                  </div>
                  <span className="selection-dot">
                    {current?.hero.id === r.hero.id && <Check size={12} />}
                  </span>
                </div>
                {r.fit && (
                  <p className="fit-summary">
                    个人准备度 {r.fit.mastery.score} · {r.fit.mastery.confidence}
                    <br />
                    {r.fit.meta === null
                      ? '版本强度：数据不足'
                      : '分段梯度 ' + r.fit.stat?.tier + ' · ' + draft.segment}
                  </p>
                )}
                <div className="chips">
                  {r.reasons.slice(0, 4).map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </div>
                <p>{r.note.tip}</p>
                <div className="recommend-tradeoff">
                  <Shield size={14} />
                  <span>{r.note.tradeoff}</span>
                </div>
                <span className="select-option">
                  {current?.hero.id === r.hero.id ? '正在对照这位英雄' : '查看这位英雄的打法'}
                  <ArrowRight size={15} />
                </span>
              </button>
            ))}
          </div>
          {current && (
            <section className="surface plan-panel">
              <div className="plan-intro">
                <p className="eyebrow">YOUR GAME PLAN</p>
                <h2>
                  如果选 {current.hero.name}，<br />
                  带着这些想法上场。
                </h2>
                <SourceLink hero={current.hero} />
                <button className="text-btn" onClick={() => onOpen(current.hero)}>
                  查看技能与练习笔记 <ArrowUpRight size={14} />
                </button>
              </div>
              <div className="plan-content">
                <div>
                  <span className="step-badge">01</span>
                  <h3>知道自己要做什么</h3>
                  <p>{current.note.tip}</p>
                </div>
                <div>
                  <span className="step-badge">02</span>
                  <h3>记住这次选择的代价</h3>
                  <p>{current.risks.join(' ')}</p>
                </div>
                <div className="plan-practice">
                  <span className="step-badge">03</span>
                  <h3>下一局只练这一件事</h3>
                  <p>{current.note.drill}</p>
                </div>
                <div className="plan-actions">
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={() =>
                      onSavePlan(current.hero.id, current.hero.name + ' · ' + draft.role + '备战')
                    }
                  >
                    <Save size={15} />
                    保存备战卡
                  </button>
                  <button className="btn secondary" onClick={exportCard}>
                    <Download size={15} />
                    导出卡片
                  </button>
                  <button className="text-btn" disabled={aiBusy} onClick={generate}>
                    <Sparkles size={15} />
                    {aiBusy ? '正在生成解读…' : configured ? 'AI 展开解读' : 'AI 解读 · 未连接'}
                  </button>
                </div>
                {aiError && (
                  <p className="error-message" role="alert">
                    {aiError}
                  </p>
                )}
                {ai && (
                  <div className="ai-result">
                    <span className="eyebrow">AI 生成解读 · 请结合游戏内情况判断</span>
                    <h3>{ai.headline}</h3>
                    {ai.steps.map((step, i) => (
                      <p key={i}>
                        {i + 1}. {step}
                      </p>
                    ))}
                    <p className="muted">{ai.caution}</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
      <p className="data-caption">
        全部 {heroes.length} 位英雄可参与候选；其中 {Object.keys(notes).length}{' '}
        位有项目战术笔记，其余结合官方定位与攻略。个人记录和可用分段数据参与排序，缺失统计保持未知；建议不代表对局胜率。
      </p>
      {picker && (
        <Modal
          title={
            picker.team === 'banned'
              ? '选择禁用英雄'
              : (picker.team === 'allies' ? '我方' : '敌方') + ' · ' + picker.role
          }
          onClose={() => setPicker(null)}
          wide
        >
          <div className="picker-toolbar">
            <label className="search-box">
              <Search size={16} />
              <input
                autoFocus
                aria-label="查找待选英雄"
                placeholder="输入英雄名称或拼音"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {picker.team !== 'banned' && (
              <label className="check-control">
                <input
                  type="checkbox"
                  checked={allRoles}
                  onChange={(e) => setAllRoles(e.target.checked)}
                />
                查看全部分路
              </label>
            )}
          </div>
          <div className="hero-picker">
            {selectable.map((h) => (
              <button key={h.id} onClick={() => pick(h.id)}>
                <Portrait hero={h} />
                <strong>{h.name}</strong>
                <small>{h.roles.join(' / ')}</small>
              </button>
            ))}
          </div>
          {!selectable.length && (
            <p className="muted">没有匹配的可选英雄。已选与已禁用英雄不会重复出现。</p>
          )}
        </Modal>
      )}
      {settings && (
        <Modal title="连接 AI 解读" onClose={() => setSettings(false)}>
          <p className="dialog-lead">
            阵容建议与备战卡可以直接使用。连接模型后，可将当前英雄资料与阵容发送给模型，生成更完整的文字解读。
          </p>
          <p className="muted">
            在项目 .env 中填写 MODEL_BASE_URL、MODEL_API_KEY 和
            MODEL_NAME，再重启服务。密钥保存在本机服务端。
          </p>
          <p className="data-caption">
            仅点击生成时调用；模型服务可能收费。当前尚未配置，页面没有用固定文字冒充模型返回。
          </p>
        </Modal>
      )}
    </>
  );
}
