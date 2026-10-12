import { useState } from 'react';
import type { StatSnapshot } from './model.ts';
import { heroById } from '../catalog.ts';
import { comparisonIssue, historyFor } from './statistics.ts';

const METRICS = [
  ['winRate', '胜率'],
  ['pickRate', '出场率'],
  ['banRate', '禁用率'],
] as const;
type Metric = (typeof METRICS)[number][0];
export default function StatHistory({
  current,
  snapshots,
  role,
  heroId,
}: {
  current: StatSnapshot;
  snapshots: StatSnapshot[];
  role: string;
  heroId?: number;
}) {
  const rows = current.rows.filter((r) => r.role === role);
  const [chosenHero, setChosenHero] = useState(heroId ?? rows[0]?.heroId ?? 0);
  const [metric, setMetric] = useState<Metric>('winRate');
  const [selected, setSelected] = useState('');
  const id = heroId ?? chosenHero;
  const currentRow = rows.find((r) => r.heroId === id);
  const candidates = snapshots
    .filter(
      (s) =>
        s.id !== current.id &&
        s.endDate < current.endDate &&
        s.rows.some((r) => r.heroId === id && r.role === role),
    )
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || b.importedAt.localeCompare(a.importedAt));
  const eligible = candidates.filter((s) => !comparisonIssue(current, s));
  const before = eligible.find((s) => s.id === selected) ?? eligible[0];
  const previousRow = before?.rows.find((r) => r.heroId === id && r.role === role);
  const points = historyFor(snapshots, current, id, role);
  const start = Date.parse(points[0]?.snapshot.endDate ?? current.endDate);
  const end = Date.parse(current.endDate);
  const x = (date: string) =>
    45 + (570 * (Date.parse(date) - start)) / Math.max(86400000, end - start);
  const y = (value: number) => 150 - value * 1.2;
  const label = METRICS.find(([key]) => key === metric)![1];
  return (
    <section className="surface stat-history">
      <div className="section-title">
        <h3>历史对比 · 变化有出处</h3>
        <span className="muted">
          {current.patch} · {role}
        </span>
      </div>
      <p className="data-caption">
        只比较来源、版本、分段、指标口径和区间长度一致的已导入批次。版本累计的变化也不等于单日表现。
      </p>
      <div className="pro-toolbar">
        {!heroId && (
          <label>
            对比英雄
            <select
              aria-label="历史对比英雄"
              value={id}
              onChange={(e) => {
                setChosenHero(Number(e.target.value));
                setSelected('');
              }}
            >
              {rows.map((r) => (
                <option key={r.heroId} value={r.heroId}>
                  {heroById(r.heroId)?.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          对比基准
          <select
            aria-label="历史对比基准"
            value={before?.id ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {!eligible.length && <option value="">暂无可比的历史批次</option>}
            {candidates.map((s) => {
              const issue = comparisonIssue(current, s);
              return (
                <option key={s.id} value={s.id} disabled={!!issue}>
                  {s.endDate} · {s.title}
                  {issue ? `（${issue}，不比较）` : ''}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          趋势指标
          <select
            aria-label="历史趋势指标"
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
          >
            {METRICS.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {currentRow && previousRow && before ? (
        <>
          <div className="history-deltas">
            {METRICS.map(([key, name]) => {
              const delta = currentRow[key] - previousRow[key];
              return (
                <div key={key}>
                  <span>{name}</span>
                  <strong>
                    {delta > 0 ? '+' : ''}
                    {delta.toFixed(2)} <small>个百分点</small>
                  </strong>
                  <span>
                    {previousRow[key].toFixed(2)}% → {currentRow[key].toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
          <p className="data-caption">
            基准：{before.startDate} 至 {before.endDate}；当前：{current.startDate} 至{' '}
            {current.endDate}。
            {current.startDate <= before.endDate
              ? '两个统计区间重叠，不能把变化视为独立样本的提升。'
              : '数值变化不证明调整或训练产生了效果。'}
            {current.winRateWindow === 'version' ? '胜率为版本累计，可能共享历史对局。' : ''}
          </p>
        </>
      ) : (
        <p className="pro-notice">
          {candidates.length
            ? '现有历史批次的口径不能直接比较，具体原因见基准列表。'
            : '再导入一份日期更早、口径一致的统计，就能查看变化。没有历史数据时不补造曲线。'}
        </p>
      )}
      {points.length >= 2 && (
        <>
          <svg
            className="history-chart"
            viewBox="0 0 640 185"
            role="img"
            aria-label={`${heroById(id)?.name}的${label}历史，${points.length}个已导入日期，纵轴0至100百分比`}
          >
            {[0, 50, 100].map((v) => (
              <g key={v}>
                <line x1="45" x2="615" y1={y(v)} y2={y(v)} stroke="currentColor" opacity="0.2" />
                <text x="5" y={y(v) + 4}>
                  {v}%
                </text>
              </g>
            ))}
            <polyline
              fill="none"
              stroke="var(--gold)"
              strokeWidth="2"
              points={points.map((p) => `${x(p.snapshot.endDate)},${y(p.row[metric])}`).join(' ')}
            />
            {points.map((p) => (
              <circle
                key={p.snapshot.id}
                cx={x(p.snapshot.endDate)}
                cy={y(p.row[metric])}
                r="4"
                fill="var(--gold)"
              >
                <title>
                  {p.snapshot.endDate} · {p.row[metric].toFixed(2)}%
                </title>
              </circle>
            ))}
            <text x="45" y="177">
              {points[0].snapshot.endDate}
            </text>
            <text x="615" y="177" textAnchor="end">
              {current.endDate}
            </text>
          </svg>
          <p className="data-caption">
            {label} · 最多最近 30
            个可比日期，同日取一个批次。连线只连接观察值；未导入的日期没有测量。
          </p>
          <details>
            <summary>查看趋势原始数值和来源</summary>
            <div className="table-scroll">
              <table className="pro-table">
                <caption className="sr-only">趋势原始数据</caption>
                <thead>
                  <tr>
                    <th>统计区间</th>
                    <th>{label}</th>
                    <th>批次与来源</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.snapshot.id}>
                      <td>
                        {p.snapshot.startDate} 至 {p.snapshot.endDate}
                      </td>
                      <td>{p.row[metric].toFixed(2)}%</td>
                      <td>
                        {p.snapshot.title} · {p.snapshot.sourceName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
