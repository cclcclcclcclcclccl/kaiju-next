import { defaultSourceDate } from './tianyuan.ts';
import SkinComparison from './SkinComparison.tsx';
import ConditionalBuilds from './ConditionalBuilds.tsx';
import { useState } from 'react';
import {
  SourceBlock,
  SourceTable,
  TrendChart,
  Identity,
  rateColumn,
  AREAS,
  valueText,
} from './SourceWidgets.tsx';
import type { PlusKind, SourceRow, PlusQuery } from './sourcePlus.ts';
import { sourceDate } from './tianyuan.ts';
const tabs: [PlusKind, string][] = [
  ['trends', '长期趋势'],
  ['heroEquip', '条件出装'],
  ['heroBp', '选人顺序表现'],
  ['behavior', '实战行为'],
  ['jungle', '真实刷野路线'],
  ['adjustments', '调整历史'],
  ['heroPower', '战力门槛'],
  ['highlights', '高光类型'],
  ['skinTrends', '皮肤使用趋势'],
];
export default function HeroSourceDetails({
  heroId,
  initialTab = 'trends',
  initialSkin = '',
}: {
  heroId: number;
  initialTab?: PlusKind;
  initialSkin?: string;
}) {
  const [tab, setTab] = useState<PlusKind>(initialTab),
    [days, setDays] = useState(30),
    [mode, setMode] = useState(5),
    [area, setArea] = useState(7),
    [date, setDate] = useState(defaultSourceDate),
    [metric, setMetric] = useState('winRate');
  const query: PlusQuery = {
    kind: tab,
    heroId,
    ...(['trends', 'skinTrends'].includes(tab) ? { days } : {}),
    ...(tab === 'trends' ? { gameMode: mode } : {}),
    ...(tab === 'heroBp' ? { date } : {}),
    ...(tab === 'heroPower' ? { areaId: area } : {}),
  };
  return (
    <section className="hero-source-details">
      <h3>深入数据 · 版本与实战证据</h3>
      <div className="pro-tabs">
        {tabs.map(([k, n]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {n}
          </button>
        ))}
      </div>
      {tab === 'heroEquip' ? (
        <ConditionalBuilds heroId={heroId} />
      ) : (
        <>
          <div className="pro-toolbar">
            {['trends', 'skinTrends'].includes(tab) && (
              <label>
                趋势周期
                <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {[30, 90, 180, 0].map((n) => (
                    <option key={n} value={n}>
                      {n ? n + ' 天' : '全部历史'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {tab === 'trends' && (
              <>
                <label>
                  趋势分段
                  <select value={mode} onChange={(e) => setMode(Number(e.target.value))}>
                    {[
                      [1, '大众分段'],
                      [3, '巅峰1350+'],
                      [4, '顶端排位'],
                      [5, '巅峰千强'],
                    ].map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  趋势指标
                  <select value={metric} onChange={(e) => setMetric(e.target.value)}>
                    {[
                      ['winRate', '版本胜率'],
                      ['singleDayWinRate', '单日胜率'],
                      ['pickRate', '出场率'],
                      ['banRate', '禁用率'],
                    ].map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {tab === 'heroPower' && (
              <label>
                战力大区
                <select value={area} onChange={(e) => setArea(Number(e.target.value))}>
                  {AREAS.map(([v, n]) => (
                    <option key={v} value={v}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {tab === 'heroBp' && (
              <label>
                选禁统计日
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            )}
          </div>
          <SourceBlock key={JSON.stringify(query)} query={query}>
            {(d) => {
              if (tab === 'trends')
                return (
                  <>
                    <TrendChart rows={d.trends} metric={metric} label="英雄历史统计" />
                    <SourceTable
                      title="英雄趋势明细"
                      rows={d.trends}
                      columns={[
                        { key: 'date', label: '日期' },
                        rateColumn('winRate', '版本胜率'),
                        rateColumn('singleDayWinRate', '单日胜率'),
                        rateColumn('pickRate', '出场率'),
                        rateColumn('banRate', '禁用率'),
                      ]}
                    />
                  </>
                );
              if (tab === 'heroBp')
                return (
                  <>
                    <p className="data-caption">
                      来源选禁模式：{d.bpMode ?? '未标注'}
                      。统计中的先手／后手与本工具练习规则分别解释，不混用为同一赛事样本。
                    </p>
                    <SourceTable
                      title="阵营表现"
                      rows={['blue', 'red'].map((s) => ({
                        side: s === 'blue' ? '蓝方' : '红方',
                        win: d.overallStats?.[s + 'SideWinRate'],
                        pick: d.overallStats?.[s + 'SidePickRate'],
                        ban: d.overallStats?.[s + 'SideBanRate'],
                      }))}
                      columns={[
                        { key: 'side', label: '阵营' },
                        rateColumn('win', '胜率'),
                        rateColumn('pick', '选用率'),
                        rateColumn('ban', '禁用率'),
                      ]}
                    />
                    <SourceTable
                      title="先后手表现"
                      rows={[
                        {
                          label: '先手出',
                          win: d.overallStats?.earlyPickWinRate,
                          pick: d.overallStats?.earlyPickPickRate,
                        },
                        {
                          label: '后手出',
                          win: d.overallStats?.latePickWinRate,
                          pick: d.overallStats?.latePickPickRate,
                        },
                      ]}
                      columns={[
                        { key: 'label', label: '阶段' },
                        rateColumn('win', '胜率'),
                        rateColumn('pick', '占比'),
                      ]}
                    />
                    <SourceTable
                      title="选人顺序"
                      rows={d.pickOrderStats}
                      columns={[
                        { key: 'slotLabel', label: '选人批次' },
                        rateColumn('pickRate', '占比'),
                        rateColumn('winRate', '胜率'),
                      ]}
                    />
                  </>
                );
              if (tab === 'behavior')
                return (
                  <div className="plus-grid">
                    {d.categories.map((c: SourceRow) => (
                      <article className="surface" key={c.title}>
                        <h4>
                          <Identity name={c.title} icon={c.icon} />
                        </h4>
                        <dl>
                          {c.dataCounts?.map((r: SourceRow) => (
                            <div key={r.name}>
                              <dt>{r.name}</dt>
                              <dd>
                                {valueText(r.data)}
                                {r.dataNote ? ' · ' + r.dataNote : ''}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    ))}
                  </div>
                );
              if (tab === 'highlights')
                return (
                  <>
                    <p>来源列出的高光事件类别；不是视频片段，也没有虚构发生频次。</p>
                    <div className="pro-toolbar">
                      {d.highlights.map((n: string) => (
                        <span className="outline-tag" key={n}>
                          {n}
                        </span>
                      ))}
                    </div>
                  </>
                );
              if (tab === 'heroPower')
                return (
                  <SourceTable
                    title="英雄战力门槛"
                    rows={d.rankDetails}
                    columns={[
                      { key: 'targetRankNo', label: '目标名次' },
                      { key: 'powerValue', label: '战力门槛' },
                      { key: 'overallRank', label: '跨英雄排名' },
                    ]}
                  />
                );
              if (tab === 'adjustments')
                return (
                  <div className="plus-timeline">
                    {d.adjustments.map((a: SourceRow) => (
                      <details key={a.id}>
                        <summary>
                          {String(a.modifyTime).slice(0, 10)} · {a.modifyLabel} · {a.content}
                        </summary>
                        <p>
                          {a.version ?? '版本未标注'} {a.think}
                        </p>
                        {[
                          ...(a.other ?? []),
                          ...(a.skillList ?? []).flatMap((s: SourceRow) =>
                            (s.modifyList ?? []).map((m: SourceRow) => ({
                              ...m,
                              title: s.skillName + ' · ' + m.title,
                            })),
                          ),
                        ].map((m: SourceRow, i: number) => (
                          <p key={i}>
                            <strong>{m.title}</strong> {m.oldContent ? m.oldContent + ' → ' : ''}
                            {m.newContent}
                          </p>
                        ))}
                      </details>
                    ))}
                  </div>
                );
              if (tab === 'jungle') {
                const names: Record<string, string> = {
                  RB: '红Buff',
                  BB: '蓝Buff',
                  BOAR: '山猪',
                  RED_SMALL: '猕猴',
                  WOLF: '狼',
                  LIZ: '蜥蜴',
                  BIRD: '山鸡',
                  ARMOR: '穿山甲',
                };
                return (
                  <>
                    <p className="data-caption">
                      路线来自来源收录的真实对局。胜率是对应样本结果，不代表路线因果效果。清野时间未提供时保持未知。
                    </p>
                    {['blue', 'red'].map((side) => (
                      <SourceTable
                        key={side}
                        title={
                          (side === 'blue' ? '蓝方' : '红方') +
                          '刷野路线（样本 ' +
                          valueText(d[side]?.total) +
                          '）'
                        }
                        rows={(d[side]?.patterns ?? []).map((r: SourceRow) => ({
                          ...r,
                          route: r.routeKey
                            .split('|')
                            .map((n: string) => names[n] ?? n)
                            .join(' → '),
                          percent: typeof r.pct === 'number' ? r.pct * 100 : null,
                          win: typeof r.winRate === 'number' ? r.winRate * 100 : null,
                        }))}
                        columns={[
                          { key: 'route', label: '顺序' },
                          { key: 'count', label: '场次' },
                          rateColumn('percent', '占比'),
                          rateColumn('win', '胜率'),
                          { key: 'avgFullClear', label: '平均清野时间（来源值）' },
                        ]}
                      />
                    ))}
                  </>
                );
              }
              return <SkinComparison trends={d.skinTrends ?? []} initialSkin={initialSkin} />;
            }}
          </SourceBlock>
        </>
      )}
    </section>
  );
}
