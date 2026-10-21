import { useRef, useState } from 'react';
import { BookOpen, ExternalLink, Film, Download } from 'lucide-react';
import { heroes, heroById } from '../catalog.ts';
import type { Hero, Role } from '../model.ts';
import { ROLES } from '../model.ts';
import { Portrait } from '../ui.tsx';
import { download } from '../../api.ts';
import {
  teachingSources,
  teachingStatus,
  teachingVersion,
  teachingCoverage,
  lessonPacket,
  teachingSearchUrl,
  sourcesForTeaching,
} from './teaching.ts';

export default function TeachingLibrary({
  hero,
  role,
  compact = false,
}: {
  hero?: Hero;
  role?: Role;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState(0),
    [selectedRole, setRole] = useState(''),
    [status, setStatus] = useState(''),
    [sort, setSort] = useState('studied'),
    [expanded, setExpanded] = useState(false),
    [coverageSearch, setCoverageSearch] = useState('');
  const current = hero ?? heroById(selected);
  const lessonHeading = useRef<HTMLHeadingElement>(null);
  function selectHero(id: number, jump = false) {
    const next = heroById(id);
    setSelected(id);
    if (next && selectedRole && !next.roles.includes(selectedRole)) setRole('');
    setExpanded(false);
    if (jump)
      requestAnimationFrame(() => {
        lessonHeading.current?.focus({ preventScroll: true });
        lessonHeading.current?.scrollIntoView({ behavior: 'instant', block: 'center' });
      });
  }
  const effectiveRole = role ?? selectedRole;
  const coverage = teachingCoverage.find((h) => h.heroId === current?.id);
  const coveredHeroes = teachingCoverage.filter(
    (h) =>
      h.name.includes(coverageSearch.trim()) && (!effectiveRole || h.roles.includes(effectiveRole)),
  );
  const packet = lessonPacket(
    current ?? { id: 0, roles: [...ROLES] },
    (effectiveRole as Role) || undefined,
  );
  const sources = sourcesForTeaching(current, effectiveRole, status, sort);
  return (
    <section
      className={'teaching-library surface' + (compact ? ' compact' : '')}
      aria-label="教学资料与决策练习"
    >
      <div className="section-title">
        <div>
          <p className="eyebrow">STUDY / 把教学变成可检查的判断</p>
          <h3>
            <BookOpen size={22} aria-hidden="true" /> 教学资料与决策练习
          </h3>
        </div>
        {current && <Portrait hero={current} />}
      </div>
      <p className="muted">
        {teachingVersion} · {teachingSources.filter((s) => s.kind === 'video').length} 个视频资料 ·{' '}
        {teachingSources.filter((s) => s.status === 'text').length}{' '}
        份已研读文字资料。播放量用于发现内容，不代表战术正确或训练效果。
      </p>
      {!hero && (
        <details className="teaching-coverage">
          <summary>
            本轮搜索涉及英雄 · {teachingCoverage.length} / {teachingCoverage.length}{' '}
            位已整理基础检查卡
          </summary>
          <p className="data-caption">
            范围为九组公开搜索结果标题涉及的英雄，包含对位对手；不是已看完全部教学视频。每位均附官方文字出处、判断条件与练习。未标明版本的资料仍需与游戏内核对。
          </p>
          <label>
            查找已整理英雄
            <input
              aria-label="查找已整理英雄"
              value={coverageSearch}
              onChange={(e) => setCoverageSearch(e.target.value)}
              placeholder="输入英雄名称"
            />
          </label>
          <div className="teaching-hero-grid">
            {coveredHeroes.map((h) => (
              <button
                type="button"
                key={h.heroId}
                aria-pressed={current?.id === h.heroId}
                onClick={() => selectHero(h.heroId, true)}
              >
                <Portrait hero={heroById(h.heroId)} />
                <span>
                  {h.name}
                  <small>{h.conflict ? '已标注资料冲突' : '基础卡已整理'}</small>
                </span>
              </button>
            ))}
          </div>
          {!coveredHeroes.length && <p>当前名称与分路下没有已整理英雄。</p>}
        </details>
      )}
      {!hero && (
        <div className="pro-toolbar">
          <label>
            学习英雄
            <select
              aria-label="学习英雄"
              value={selected}
              onChange={(e) => {
                selectHero(Number(e.target.value));
              }}
            >
              <option value={0}>全部英雄 / 通用教学</option>
              {heroes.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            学习分路
            <select
              aria-label="学习分路"
              value={selectedRole}
              onChange={(e) => {
                setRole(e.target.value);
                setExpanded(false);
              }}
            >
              <option value="">全部分路</option>
              {ROLES.filter((r) => !current || current.roles.includes(r)).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <button
            className="text-btn"
            type="button"
            onClick={() => {
              setSelected(0);
              setRole('');
              setStatus('');
              setSort('studied');
              setCoverageSearch('');
              setExpanded(false);
            }}
          >
            重置教学筛选
          </button>
        </div>
      )}
      {current && (
        <div className="teaching-discovery">
          <strong>{current.name} · 继续找课</strong>
          <a href={teachingSearchUrl(current.name)} target="_blank" rel="noreferrer">
            高播放教学 <ExternalLink size={14} />
          </a>
          <a href={teachingSearchUrl(current.name, true)} target="_blank" rel="noreferrer">
            最新发布 <ExternalLink size={14} />
          </a>
          <span className="data-caption">覆盖全英雄的搜索入口；不代表已研读全英雄课程。</span>
        </div>
      )}
      {packet && (
        <>
          {coverage?.conflict && (
            <aside className="teaching-conflict" aria-label="资料版本冲突">
              <strong>这位英雄的旧提示存在冲突</strong>
              <p>{coverage.conflict}</p>
              <p className="data-caption">
                已按本次获取的技能正文整理；官方页面没有明确版本日期，请以游戏内实际技能为准。
              </p>
            </aside>
          )}
          <div className="section-title">
            <h4 ref={lessonHeading} tabIndex={-1}>
              {current ? '适合当前英雄与分路的检查卡' : '通用决策检查卡'} · {packet.cards.length}
            </h4>
            {packet.cards.length > 0 && (
              <button
                className="text-btn"
                onClick={() =>
                  download(
                    '自在弈境-' + (current?.name ?? '通用') + '-教学检查卡.json',
                    JSON.stringify(packet, null, 2),
                    'application/json',
                  )
                }
              >
                <Download size={15} /> 导出带出处的练习卡
              </button>
            )}
          </div>
          {!packet.cards.length && (
            <p>
              {current
                ? '该英雄与分路还没有已研读的专属检查卡。可以打开官方技能与上方教学搜索，不能据此认为已完成专项学习。'
                : '当前分路还没有已研读的通用检查卡。请选择英雄查看专项内容。'}
            </p>
          )}
          <div className="teaching-lessons">
            {packet.cards.map((card) => (
              <details key={card.id}>
                <summary>{card.title}</summary>
                <p>{card.takeaway}</p>
                <ul>
                  {card.checks.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
                <p>
                  <strong>不适用的情况：</strong>
                  {card.counterexample}
                </p>
                <p>
                  <strong>练一次：</strong>
                  {card.drill}
                </p>
                <a href={card.source.url} target="_blank" rel="noreferrer">
                  依据：{card.source.title} ↗
                </a>
                <p className="data-caption">
                  {card.source.author} · {card.source.published} · 定位：{card.anchor}。
                  {card.source.versionNote} 检查问题与练习由项目整理，未验证提分效果。
                </p>
                {!!card.evidenceExcerpts?.length && (
                  <details className="teaching-excerpts">
                    <summary>查看本卡的官方原文材料</summary>
                    <p className="data-caption">
                      下列为留存页面文字，不是已验证的当前版本最优打法。若与游戏内技能不同，停止套用并核对版本。
                    </p>
                    {card.evidenceExcerpts.map((e, i) => (
                      <div key={i}>
                        <strong>{e.label}</strong>
                        <p>{e.text}</p>
                      </div>
                    ))}
                  </details>
                )}
                {card.relatedVideo && (
                  <p className="data-caption">
                    <a href={card.relatedVideo.url} target="_blank" rel="noreferrer">
                      画面参照：{card.relatedVideo.title} ↗
                    </a>{' '}
                    {card.relatedVideo.scope} {card.relatedVideo.versionNote}
                  </p>
                )}
              </details>
            ))}
          </div>
          {coverage && (
            <details className="teaching-candidates">
              <summary>
                搜索中涉及{current!.name}的候选视频 · {coverage.mentions.length} 条
              </summary>
              <p className="data-caption">
                以下仅核对了公开搜索结果标题。可能是主讲英雄、对位对手或标题提及；不表示已观看、认可标题结论或纳入复盘依据。
              </p>
              <ul>
                {coverage.mentions.map((m, i) => (
                  <li key={i}>
                    <a href={m.url} target="_blank" rel="noreferrer">
                      {m.title} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <details open={!compact}>
        <summary>公开教学资料 · 当前筛选 {sources.length} 份</summary>
        <div className="pro-toolbar">
          <label>
            研读范围
            <select
              aria-label="研读范围"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setExpanded(false);
              }}
            >
              <option value="">全部资料</option>
              <option value="text">已研读文字</option>
              <option value="metadata">待研读视频</option>
              <option value="preview">仅片头抽帧</option>
              <option value="frames">已核对教学画面</option>
            </select>
          </label>
          <label>
            资料排序
            <select aria-label="资料排序" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="popular">播放量优先</option>
              <option value="studied">已研读优先</option>
              <option value="retrieved">最近核对</option>
            </select>
          </label>
        </div>
        <div className="teaching-sources">
          {sources.slice(0, expanded ? sources.length : compact ? 3 : 6).map((s) => (
            <article key={s.id}>
              <div className="teaching-meta">
                <span className="outline-tag">
                  {s.kind === 'video' ? <Film size={14} /> : <BookOpen size={14} />}{' '}
                  {teachingStatus[s.status]}
                </span>
                {s.viewsLabel && <span>播放 {s.viewsLabel}</span>}
                {s.duration && <span>{s.duration}</span>}
              </div>
              <h4>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title} ↗
                </a>
              </h4>
              <p className="data-caption">
                {s.author} · 发布：{s.published} · 核对：{s.retrievedAt.slice(0, 10)}
              </p>
              <p>{s.scope}</p>
              <p className="data-caption">{s.versionNote}</p>
            </article>
          ))}
        </div>
        {!sources.length && <p>此筛选下还没有收录资料；不会用其他英雄的资料冒充。</p>}
        {sources.length > (compact ? 3 : 6) && (
          <button className="text-btn" onClick={() => setExpanded(!expanded)}>
            {expanded ? '收起资料' : '展开全部筛选结果'}
          </button>
        )}
      </details>
    </section>
  );
}
