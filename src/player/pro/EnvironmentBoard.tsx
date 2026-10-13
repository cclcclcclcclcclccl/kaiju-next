import { useState } from 'react';
import { heroes, heroById } from '../catalog.ts';
import type { Hero } from '../model.ts';
import { ROLES } from '../model.ts';
import { Portrait } from '../ui.tsx';
import { download } from '../../api.ts';
import { aggregateObservation, currentEnvironment, ENVIRONMENT_VERSION } from './environment.ts';
type Open = (h: Hero, context?: { segment: string; role: string; snapshotId?: string }) => void;
export default function EnvironmentBoard({
  mode,
  view,
  onOpen,
}: {
  mode: 'source' | 'environment';
  view: 'board' | 'table';
  onOpen: Open;
}) {
  const [role, setRole] = useState('全部'),
    [query, setQuery] = useState(''),
    [sort, setSort] = useState(mode === 'environment' ? 'tier' : 'name');
  const rows = currentEnvironment
    .filter(
      (r) =>
        (role === '全部' || r.row.sourceRoles.includes(role as (typeof ROLES)[number])) &&
        (!query.trim() || heroById(r.row.heroId)?.name.includes(query.trim())),
    )
    .sort((a, b) =>
      sort === 'win'
        ? (b.row.winRate ?? -1) - (a.row.winRate ?? -1)
        : sort === 'tier'
          ? b.score - a.score
          : (heroById(a.row.heroId)?.name ?? '').localeCompare(
              heroById(b.row.heroId)?.name ?? '',
              'zh-CN',
            ),
    );
  const open = (id: number) => {
    const h = heroById(id);
    if (h)
      onOpen(h, {
        segment: '巅峰千强',
        role: h.roles[0],
        snapshotId: 'public-tianyuan-2026-10-12',
      });
  };
  return (
    <div className="environment-board">
      <p className="pro-notice">
        {mode === 'environment'
          ? `${ENVIRONMENT_VERSION} · 根据千强页面的选禁环境计算参考层级，含有限的全分段累计胜率修正；未经实战标定，不是千强胜率或职业强度结论。`
          : '已补齐133位英雄的公开总体记录：132位三率完整，明世隐总胜率未公布。'}{' '}
        多分路标签仅表示来源定位，数值是英雄总体统计，不能当作各分路独立胜率。
      </p>
      <div className="rank-coverage">
        <strong>
          {rows.length} / {heroes.length}
        </strong>
        <span>
          当前筛选有英雄总体记录 · 胜率可用 {rows.filter((r) => r.row.winRate !== null).length} 位 ·
          来源数据日 {aggregateObservation.dataDate}
        </span>
      </div>
      <div className="pro-toolbar">
        <label>
          总表分路
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {['全部', ...ROLES].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          搜索全部英雄
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="英雄名称" />
        </label>
        <label>
          总表排序
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">英雄名称</option>
            <option value="tier">环境梯度分优先</option>
            <option value="win">已知总体胜率优先</option>
          </select>
        </label>
      </div>
      <p className="data-caption">
        来源：天元之弈数据站 · 巅峰千强页面 · 2026-10-12 · 2026-10-13
        08:46更新。胜率为全量人群、版本累计；选禁分母与样本量未公布。筛选只改变显示，不重算全局分位。
      </p>
      <details className="environment-method">
        <summary>算法公式、分级与不确定性</summary>
        <p>
          出场分 P、禁用分 B：在全部133位英雄中按原始百分比计算并列中位百分位，范围0–100。环境分 S =
          0.55P + 0.45B + W，截取0–100。
        </p>
        <p>
          W = clamp(胜率−50, −5, 5) × 出场率 /
          (出场率+2.5)。它是全分段累计胜率的有限背景修正，最多±5分；胜率缺失不补50%，W不参与。这个抑制系数不代表场次或统计置信度。
        </p>
        <p>
          T0 ≥90；T1 ≥75；T2 ≥55；T3
          ≥35；其余T4。阈值与权重是v1设计参数，尚未用职业或真实对局标签拟合。T4表示本批次低选禁优先级，不表示英雄不能上分。
        </p>
        <p>
          敏感性检查：出场权重取45%/55%/65%，胜率修正取0/50%/100%，共9种组合；跨层级时标记“边界敏感”。区间是参数变化范围，不是胜率置信区间。所有层级都需结合熟练度、阵容与版本检查，当前不写入BP强度权重。
        </p>
      </details>
      <button
        className="text-btn"
        onClick={() =>
          download(
            '开局-133位英雄总体观察-2026-10-12.json',
            JSON.stringify(aggregateObservation, null, 2),
          )
        }
      >
        导出133位总体记录与来源
      </button>
      {view === 'board' ? (
        <div className="tier-board" aria-label="英雄梯度分组">
          {(mode === 'environment' ? ['T0', 'T1', 'T2', 'T3', 'T4'] : ['已有原始统计']).map(
            (group) => {
              const entries = mode === 'environment' ? rows.filter((r) => r.tier === group) : rows;
              if (!entries.length) return null;
              return (
                <section
                  className={'tier-band ' + (mode === 'source' ? 'unknown' : '')}
                  key={group}
                >
                  <div className="tier-band-label">
                    <strong>{group}</strong>
                    <span>{entries.length} 位</span>
                  </div>
                  <div className="tier-band-heroes">
                    {entries.map((r) => {
                      const h = heroById(r.row.heroId)!;
                      return (
                        <button
                          key={h.id}
                          className={
                            'tier-portrait ' +
                            (r.row.banRate >= 20
                              ? 'high-ban'
                              : r.row.pickRate < 2.5
                                ? 'low-pick'
                                : '')
                          }
                          aria-label={'打开' + h.name + '图鉴'}
                          onClick={() => open(h.id)}
                          title={`${h.name} · ${r.row.sourceRoles.join('/')} · 英雄总体\n环境分${r.score.toFixed(1)}；参数范围${r.range.map((x) => x.toFixed(1)).join('–')}`}
                        >
                          <Portrait hero={h} />
                          <strong>{h.name}</strong>
                          <small>
                            {r.row.winRate === null
                              ? '胜率未公布'
                              : `胜 ${r.row.winRate.toFixed(1)}%`}
                          </small>
                          <small>
                            出 {r.row.pickRate}% · 禁 {r.row.banRate}%
                          </small>
                          {mode === 'environment' && (
                            <>
                              <span className="tier-score">{r.score.toFixed(1)}</span>
                              <small>{r.sensitive ? '边界敏感' : '参数检查稳定'}</small>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            },
          )}
        </div>
      ) : (
        <div className="roster-scroll">
          <table className="roster-table">
            <caption className="sr-only">133位英雄总体公开统计</caption>
            <thead>
              <tr>
                <th>英雄 / 图鉴</th>
                <th>来源分路标签</th>
                <th>参考环境梯度</th>
                <th>总体胜率</th>
                <th>出场率</th>
                <th>禁用率</th>
                <th>参数检查</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.row.heroId}>
                  <td>
                    <button
                      className="hero-row"
                      aria-label={'打开' + heroById(r.row.heroId)!.name + '图鉴'}
                      onClick={() => open(r.row.heroId)}
                    >
                      <Portrait hero={heroById(r.row.heroId)} />
                      {heroById(r.row.heroId)!.name}
                    </button>
                  </td>
                  <td>
                    {r.row.sourceRoles.join(' / ')}
                    <small className="block-source">英雄总体，非分路统计</small>
                  </td>
                  <td>
                    {r.tier} · {r.score.toFixed(1)}
                  </td>
                  <td>{r.row.winRate === null ? '未公布' : r.row.winRate.toFixed(2) + '%'}</td>
                  <td>{r.row.pickRate}%</td>
                  <td>{r.row.banRate}%</td>
                  <td>
                    {r.sensitive ? '边界敏感' : '参数检查稳定'} ·{' '}
                    {r.range.map((n) => n.toFixed(1)).join('–')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AggregateHeroStats({ heroId }: { heroId: number }) {
  const r = currentEnvironment.find((r) => r.row.heroId === heroId);
  if (!r) return null;
  return (
    <section className="aggregate-hero-stats">
      <h4>天元之弈总体观察 · 2026-10-12</h4>
      <div className="metric-strip">
        {[
          ['参考环境梯度', r.tier],
          ['环境分', r.score.toFixed(1)],
          ['总体胜率', r.row.winRate === null ? '未公布' : r.row.winRate.toFixed(2) + '%'],
          ['出场率', r.row.pickRate + '%'],
          ['禁用率', r.row.banRate + '%'],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="data-caption">
        来源定位：{r.row.sourceRoles.join(' / ')}
        。这是英雄总体记录，不随本页分路选择变化；胜率为全量人群、版本累计。{
          ENVIRONMENT_VERSION
        }{' '}
        尚未实战标定。
      </p>
      <details>
        <summary>查看得分依据与证据</summary>
        <p>
          出场分位 {r.pickPercentile.toFixed(1)} ×55% + 禁用分位 {r.banPercentile.toFixed(1)} ×45% +
          胜率背景修正 {r.winModifier.toFixed(2)} = {r.score.toFixed(1)}。
          {r.winMissing ? '总胜率未公布，未作修正。' : ''}
        </p>
        <p>
          9组参数检查范围 {r.range.map((x) => x.toFixed(1)).join('–')}；
          {r.sensitive
            ? '边界敏感，可能层级 ' + r.possibleTiers.join(' / ')
            : '在本次参数范围内层级稳定'}
          。不是统计置信区间。样本量、版本号仍未明确。
        </p>
        <p>原图记录：{r.row.evidence.join('、')}；来源：天元之弈助手，更新于2026-10-13 08:46。</p>
      </details>
    </section>
  );
}
