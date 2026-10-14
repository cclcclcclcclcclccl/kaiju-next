import { TianyuanHero } from './TianyuanLive.tsx';
import { AggregateHeroStats } from './EnvironmentBoard.tsx';
import { useState } from 'react';
import type { Hero } from '../model.ts';
import { heroById } from '../catalog.ts';
import { Portrait } from '../ui.tsx';
import { SEGMENTS } from './model.ts';
import { tierList, latestSnapshot, usableSnapshot } from './analytics.ts';
import { scopeIssue, scopeLabel } from './statistics.ts';
import StatHistory from './StatHistory.tsx';
import { usePro } from './context.tsx';
import { OfficialHeroStats } from './OfficialStats.tsx';
import { withPublicReference } from './publicReferences.ts';
export default function HeroInsights({
  hero,
  context,
}: {
  hero: Hero;
  context?: { segment: string; role: string; snapshotId?: string };
}) {
  const { data } = usePro();
  const [publicOpen, setPublicOpen] = useState(false);
  const [segment, setSegment] = useState<string>(context?.segment ?? SEGMENTS[0]);
  const [role, setRole] = useState(context?.role ?? hero.roles[0]);
  const snapshot =
      withPublicReference(data.snapshots).find(
        (s) => s.id === context?.snapshotId && s.segment === segment,
      ) ?? latestSnapshot(withPublicReference(data.snapshots), segment),
    stat = snapshot ? tierList(snapshot, role).find((r) => r.row.heroId === hero.id) : undefined;
  return (
    <div className="hero-insights">
      {context?.snapshotId?.startsWith('tianyuan:') ? (
        <TianyuanHero hero={hero} context={context} />
      ) : (
        <section id="hero-stats">
          <div className="section-title">
            <h3>分段表现</h3>
            <select
              aria-label="英雄统计分路"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {hero.roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <select
              aria-label="英雄统计分段"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
            >
              {SEGMENTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <OfficialHeroStats heroId={hero.id} segment={segment} role={role} />
          {segment === '巅峰千强' && snapshot?.id === 'public-tianyuan-2026-10-12' ? (
            <AggregateHeroStats heroId={hero.id} />
          ) : (
            <>
              <h4>统计快照 · 开局梯度</h4>
              <div className="metric-strip">
                {[
                  ['梯度', stat?.tier ?? '待接入'],
                  ['胜率', stat ? stat.row.winRate.toFixed(2) + '%' : '—'],
                  ['出场率', stat ? stat.row.pickRate.toFixed(2) + '%' : '—'],
                  ['禁用率', stat ? stat.row.banRate.toFixed(2) + '%' : '—'],
                  ['BP 率', stat?.bp != null ? stat.bp.toFixed(2) + '%' : '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <p className="data-caption">
                {stat
                  ? snapshot!.sourceName +
                    ' · ' +
                    snapshot!.patch +
                    ' · ' +
                    snapshot!.endDate +
                    ' · ' +
                    role +
                    (usableSnapshot(snapshot!) ? '' : ' · 历史统计，不参与当前 BP')
                  : '此分段暂无已导入的可靠统计，数值保留未知。'}
              </p>
              {snapshot && stat && <p className="data-caption">{scopeLabel(snapshot)}</p>}
              {snapshot && stat && scopeIssue(snapshot) && (
                <p className="pro-notice">{scopeIssue(snapshot)}</p>
              )}
              {snapshot && stat && (
                <StatHistory
                  key={snapshot.id + role}
                  current={snapshot}
                  snapshots={data.snapshots}
                  role={role}
                  heroId={hero.id}
                />
              )}
            </>
          )}
        </section>
      )}
      {!context?.snapshotId?.startsWith('tianyuan:') && (
        <details className="source-proof" onToggle={(e) => setPublicOpen(e.currentTarget.open)}>
          <summary>查询天元之弈的皮肤、出装、时长与关系统计</summary>
          {publicOpen && <TianyuanHero hero={hero} />}
        </details>
      )}
      <section id="hero-relations">
        <h3>官方搭配与克制说明</h3>
        <p className="data-caption">
          这是官网提供的定性攻略快照，可能滞后于当前版本，不是对位胜率。
        </p>
        <div className="relation-grid">
          {(hero.relations ?? []).map((r, i) => (
            <article key={i}>
              <div className="hero-row">
                <Portrait hero={heroById(r.heroId)} />
                <div>
                  <small>
                    {r.type === 'partner'
                      ? '适合搭配'
                      : r.type === 'counters'
                        ? '可针对'
                        : '需要提防'}
                  </small>
                  <strong>{heroById(r.heroId)?.name}</strong>
                </div>
              </div>
              <p>{r.reason}</p>
              <a href={r.source} target="_blank" rel="noreferrer">
                官方原始资料 ↗
              </a>
            </article>
          ))}
        </div>
      </section>
      {hero.guide && (
        <section className="pro-prose" id="hero-guide">
          <h3>英雄攻略 · 官方资料摘录</h3>
          {[
            ['使用思路', hero.guide.play],
            ['团战任务', hero.guide.teamfight],
            ['应对这个英雄', hero.guide.against],
            ['技能加点', hero.guide.leveling],
            ['装备思路', hero.guide.buildNotes.join('\n')],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <h4>{k}</h4>
                <p>{v}</p>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}
