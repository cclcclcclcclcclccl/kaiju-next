import MatchScreenshot from './MatchScreenshot.tsx';
import { useState } from 'react';
import { heroes, heroById } from '../catalog.ts';
import { ROLES } from '../model.ts';
import type { Hero, Draft } from '../model.ts';
import { SourceBlock, SourceTable, Identity, rateColumn, valueText } from './SourceWidgets.tsx';
import type { PlusQuery, SourceRow } from './sourcePlus.ts';
import { download } from '../../api.ts';
const lanes = ['对抗路', '中路', '发育路', '打野', '游走'];
export default function PublicMatchExplorer({
  onOpen,
  draft,
}: {
  onOpen: (h: Hero) => void;
  draft?: Draft;
}) {
  const [mode, setMode] = useState('matches'),
    [conditions, setConditions] = useState<Record<string, string>>({}),
    [exclude, setExclude] = useState<Record<string, boolean>>({}),
    [query, setQuery] = useState<PlusQuery | null>(null),
    [match, setMatch] = useState(''),
    [error, setError] = useState('');
  const change = (key: string, value: string) => {
    setConditions((c) => ({ ...c, [key]: value }));
    setQuery(null);
    setMatch('');
    setError('');
  };
  const submit = () => {
    setMatch('');
    setError('');
    if (mode === 'recommend') {
      const ids = [...new Set(Object.values(conditions).filter(Boolean).map(Number))];
      if (!ids.length || ids.length > 5) {
        setError('请选择 1–5 位英雄');
        return;
      }
      setQuery({ kind: 'recommend', heroIds: JSON.stringify(ids) });
      return;
    }
    const c1: SourceRow = {},
      c2: SourceRow = {},
      e1: SourceRow = {},
      e2: SourceRow = {};
    for (const [key, value] of Object.entries(conditions)) {
      if (!value) continue;
      const [side, lane] = key.split(':');
      const target = side === '1' ? (exclude[key] ? e1 : c1) : exclude[key] ? e2 : c2;
      target[lane] = Number(value);
    }
    if (
      Object.keys(c1).length + Object.keys(c2).length === 0 ||
      Object.values(conditions).filter(Boolean).length < 2
    ) {
      setError('至少一个必选英雄，总计至少两个必选或排除条件。');
      return;
    }
    setQuery({
      kind: 'matches',
      days: 30,
      camp1Heroes: JSON.stringify(c1),
      camp2Heroes: JSON.stringify(c2),
      camp1ExcludeHeroes: JSON.stringify(e1),
      camp2ExcludeHeroes: JSON.stringify(e2),
    });
  };
  return (
    <section className="public-match-explorer">
      <h2>真实对位与组合查询</h2>
      <p className="muted">
        查询来源收录的近 30 天历史对局，建议先选 2–3 位英雄。阵营 1／2
        不固定红蓝；样本胜率不等于下一局预测。
      </p>
      <div className="pro-tabs">
        {[
          ['matches', '历史对位'],
          ['recommend', '共同克制与组合'],
        ].map(([v, n]) => (
          <button
            key={v}
            className={mode === v ? 'active' : ''}
            onClick={() => {
              setMode(v);
              setConditions({});
              setExclude({});
              setQuery(null);
              setMatch('');
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <MatchScreenshot onAssign={change} />
      {draft && (
        <button
          className="btn secondary"
          onClick={() => {
            const c: Record<string, string> = {};
            for (const [i, s] of ['allies', 'enemies'].entries())
              for (const [role, id] of Object.entries(draft[s as 'allies']))
                c[i + 1 + ':' + lanes.indexOf(role)] = String(id);
            setConditions(c);
            setExclude({});
            setQuery(null);
            setMatch('');
          }}
        >
          载入当前备战阵容（查询前可删减）
        </button>
      )}
      <div className="plus-grid">
        {(mode === 'matches' ? ['1', '2'] : ['1']).map((side) => (
          <fieldset key={side}>
            <legend>{mode === 'matches' ? '阵营 ' + side : '选定英雄'}</legend>
            {lanes.map((lane, i) => {
              const key = side + ':' + i;
              return (
                <div className="match-condition" key={key}>
                  <label>
                    {lane}
                    <select
                      aria-label={'查询阵营' + side + lane}
                      value={conditions[key] ?? ''}
                      onChange={(e) => change(key, e.target.value)}
                    >
                      <option value="">不限定</option>
                      {heroes.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                          {h.roles.includes(lane) ? '' : '（可选非常规）'}
                        </option>
                      ))}
                    </select>
                  </label>
                  {mode === 'matches' && (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={!!exclude[key]}
                        onChange={(e) => {
                          setExclude((c) => ({ ...c, [key]: e.target.checked }));
                          setQuery(null);
                          setMatch('');
                        }}
                      />
                      排除此英雄
                    </label>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}
      </div>
      <div className="pro-actions">
        <button className="btn primary" onClick={submit}>
          查询真实样本
        </button>
        <button
          className="btn secondary"
          onClick={() => {
            setConditions({});
            setExclude({});
            setQuery(null);
            setMatch('');
            setError('');
          }}
        >
          清空查询条件
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {query && (
        <SourceBlock key={JSON.stringify(query)} query={query}>
          {(d) =>
            query.kind === 'recommend' ? (
              <>
                {[
                  ['counters', '共同克制推荐'],
                  ['synergies', '共同组合推荐'],
                ].map(([key, title]) => (
                  <SourceTable
                    key={key}
                    title={title}
                    rows={d.recommendations?.[key] ?? []}
                    columns={[
                      {
                        key: 'heroName',
                        label: '英雄',
                        render: (r) => (
                          <button
                            className="text-btn"
                            onClick={() => {
                              const h = heroById(r.heroId);
                              if (h) onOpen(h);
                            }}
                          >
                            <Identity name={r.heroName} icon={heroById(r.heroId)?.portrait} />
                          </button>
                        ),
                      },
                      { key: 'score', label: '来源优势指数（百分点）' },
                      { key: 'totalMatches', label: '统计场次' },
                      { key: 'appearance', label: '覆盖所选英雄数' },
                    ]}
                  />
                ))}
              </>
            ) : (
              <>
                <div className="plus-metrics">
                  <article>
                    <span>匹配样本</span>
                    <strong>{valueText(d.totalMatchesFound)} 场</strong>
                  </article>
                  <article>
                    <span>阵营 1 样本胜率</span>
                    <strong>
                      {d.camp1WinRate == null ? '未公布' : valueText(d.camp1WinRate * 100) + '%'}
                    </strong>
                  </article>
                  <article>
                    <span>阵营 2 样本胜率</span>
                    <strong>
                      {d.camp2WinRate == null ? '未公布' : valueText(d.camp2WinRate * 100) + '%'}
                    </strong>
                  </article>
                </div>
                <p className="pro-notice">
                  有条件筛选的历史样本，不是随机实验或预测。来源最多列出 50
                  场详情，下面列表与全部匹配样本分母不同。
                </p>
                <SourceTable
                  title="所选英雄表现"
                  rows={(d.heroComparisons ?? []).map((r: SourceRow) => ({
                    ...r,
                    current: typeof r.currentWinRate === 'number' ? r.currentWinRate * 100 : null,
                    average: typeof r.averageWinRate === 'number' ? r.averageWinRate * 100 : null,
                    difference:
                      typeof r.winRateDifference === 'number' ? r.winRateDifference * 100 : null,
                  }))}
                  columns={[
                    {
                      key: 'heroName',
                      label: '英雄',
                      render: (r) => (
                        <Identity name={r.heroName} icon={heroById(r.heroId)?.portrait} />
                      ),
                    },
                    { key: 'position', label: '分路' },
                    rateColumn('current', '组合胜率'),
                    rateColumn('average', '近期平均胜率'),
                    { key: 'difference', label: '差值（百分点）' },
                  ]}
                />
                <SourceTable
                  title="匹配对局"
                  rows={d.matchIds}
                  columns={[
                    {
                      key: 'id',
                      label: '对局记录',
                      render: (r) => (
                        <button className="text-btn" onClick={() => setMatch(r.id)}>
                          查看对局 {r.id.slice(-8)}
                        </button>
                      ),
                    },
                    { key: 'winningCamp', label: '获胜阵营' },
                  ]}
                />
              </>
            )
          }
        </SourceBlock>
      )}
      {match && (
        <SourceBlock key={match} query={{ kind: 'match', gameId: match }}>
          {(d, p) => (
            <section className="match-detail">
              <h3>
                单场详情 · {d.matchDisplayInfo?.type} · {d.matchDisplayInfo?.dateTime} ·{' '}
                {d.matchDisplayInfo?.duration}
              </h3>
              <p className="data-caption">
                当前查询 ID 与来源原始 gameId
                分别保留。以下为赛后统计，不能据此还原录像中的全部决策。
              </p>
              <div className="plus-grid">
                {['camp1', 'camp2'].map((side) => (
                  <article key={side}>
                    <h4>{d.teamSummary?.[side]?.resultText}</h4>
                    <p>
                      KDA {d.teamSummary?.[side]?.teamKDA} · 经济{' '}
                      {valueText(d.teamSummary?.[side]?.totalEconomy)} · 平均巅峰分{' '}
                      {valueText(d.teamSummary?.[side]?.averagePinnacleScore)}
                    </p>
                    <div className="pro-toolbar">
                      {(d.bannedHeroes?.[side + 'Bans'] ?? []).map((h: SourceRow, i: number) => (
                        <Identity key={i} name={'禁 ' + h.heroName} icon={h.heroAvatarUrl} />
                      ))}
                    </div>
                    {(d.playerPerformances?.[side] ?? []).map((r: SourceRow, i: number) => (
                      <details className="source-proof" key={i}>
                        <summary>
                          <Identity name={r.hero?.name ?? '英雄未标注'} icon={r.hero?.avatarUrl} />{' '}
                          {r.kda?.valueStr} · 评分 {valueText(r.gameScore)}
                        </summary>
                        <p>
                          赛前巅峰 {valueText(r.pinnacleScore)} · 输出{' '}
                          {valueText(r.statsOverview?.damageDealtPercent)}% · 承伤{' '}
                          {valueText(r.statsOverview?.damageTakenPercent)}% · 参团{' '}
                          {valueText(r.statsOverview?.killParticipationPercent)}%
                        </p>
                        <div className="plus-item-list">
                          {[...(r.summonerSkills ?? []), ...(r.equipment ?? [])].map(
                            (e: SourceRow, j: number) => (
                              <Identity key={j} name={e.name} icon={e.iconUrl} />
                            ),
                          )}
                        </div>
                        <p>
                          经济 {valueText(r.detailedStats?.economy?.value)} · 控制{' '}
                          {valueText(r.detailedStats?.teamfight?.ccDurationSecs)} 秒 · 对塔伤害{' '}
                          {valueText(r.detailedStats?.teamfight?.damageToTowers)}
                        </p>
                      </details>
                    ))}
                  </article>
                ))}
              </div>
              <button
                className="btn secondary"
                onClick={() =>
                  download(
                    '自在弈境-真实对局-' + match + '.json',
                    JSON.stringify({ queryId: match, ...p }, null, 2),
                  )
                }
              >
                导出这场对局与出处
              </button>
            </section>
          )}
        </SourceBlock>
      )}
    </section>
  );
}
