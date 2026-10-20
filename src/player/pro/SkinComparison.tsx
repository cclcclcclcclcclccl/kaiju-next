import { useState } from 'react';
import { SourceTable, rateColumn, valueText } from './SourceWidgets.tsx';
import type { SourceRow } from './sourcePlus.ts';
import { skinComparison } from './sourceComparisons.ts';
const colors = [
  '#55b8ff',
  '#f9c66d',
  '#c3a1ff',
  '#6bd6a0',
  '#ff8998',
  '#5ce0e4',
  '#f3a0e4',
  '#b8ce73',
];
export default function SkinComparison({
  trends,
  initialSkin,
}: {
  trends: SourceRow[];
  initialSkin: string;
}) {
  const choices = [
    ...new Map<string, string>(
      trends.flatMap((r) =>
        (r.skins ?? []).map((s: SourceRow) => [String(s.id), String(s.name)] as [string, string]),
      ),
    ).entries(),
  ];
  const [primary, setPrimary] = useState(
    choices.some(([id]) => id === initialSkin) ? initialSkin : (choices[0]?.[0] ?? ''),
  );
  const [extra, setExtra] = useState<string[]>([]);
  const selected = [primary, ...extra.filter((id) => id !== primary)].filter((id) =>
    choices.some(([c]) => c === id),
  );
  const rows = skinComparison(trends, selected);
  const values = rows
    .flatMap((r) => selected.map((id) => r[id]))
    .filter((v): v is number => typeof v === 'number');
  const max = Math.max(1, ...values);
  const timestamps = rows.map((r) => Date.parse(String(r.date))),
    start = timestamps[0],
    end = timestamps.at(-1) ?? start;
  const x = (i: number) =>
    50 +
    680 *
      (Number.isFinite(start) && end > start
        ? (timestamps[i] - start) / (end - start)
        : i / Math.max(1, rows.length - 1));
  const y = (v: number) => 190 - (v / max) * 160;
  return (
    <section className="skin-comparison">
      <label>
        选择皮肤
        <select
          value={primary}
          onChange={(e) => {
            setPrimary(e.target.value);
            setExtra((current) => current.filter((id) => id !== e.target.value).slice(0, 7));
          }}
        >
          {choices.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>叠加对比皮肤（最多 8 款，含主选皮肤）</legend>
        <div className="pro-toolbar">
          {choices
            .filter(([id]) => id !== primary)
            .map(([id, n]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={extra.includes(id)}
                  disabled={!extra.includes(id) && selected.length >= 8}
                  onChange={(e) =>
                    setExtra((current) =>
                      e.target.checked ? [...current, id] : current.filter((v) => v !== id),
                    )
                  }
                />
                {n}
              </label>
            ))}
          <button className="text-btn" onClick={() => setExtra([])}>
            只看主选皮肤
          </button>
        </div>
      </fieldset>
      <p className="data-caption">
        同一英雄、同一来源周期的使用率；缺失值断开，不补零。使用率不代表皮肤带来胜率提升。
      </p>
      <figure className="plus-chart">
        <figcaption>皮肤使用率对比 · {rows.length} 个来源时间点</figcaption>
        <div className="pro-toolbar">
          {selected.map((id, i) => (
            <span key={id} style={{ color: colors[i] }}>
              ● {choices.find(([c]) => c === id)?.[1]}
            </span>
          ))}
        </div>
        {values.length ? (
          <svg viewBox="0 0 770 230" role="img" aria-label="皮肤使用率对比，详细数值见下方表格">
            <line x1="50" y1="190" x2="730" y2="190" stroke="#65758d" />
            <text x="0" y="30">
              {valueText(max, 1)}%
            </text>
            <text x="10" y="190">
              0%
            </text>
            {selected.map((id, c) => {
              let path = '',
                previous = false;
              rows.forEach((r, i) => {
                const v = r[id];
                if (typeof v !== 'number') {
                  previous = false;
                  return;
                }
                path += (previous ? ' L' : ' M') + x(i) + ',' + y(v);
                previous = true;
              });
              return (
                <g key={id}>
                  <path data-skin-id={id} d={path} fill="none" stroke={colors[c]} strokeWidth="2" />
                  {rows.map(
                    (r, i) =>
                      typeof r[id] === 'number' && (
                        <circle key={i} cx={x(i)} cy={y(r[id])} r="3" fill={colors[c]}>
                          <title>
                            {r.date} · {choices.find(([v]) => v === id)?.[1]}：{valueText(r[id])}%
                          </title>
                        </circle>
                      ),
                  )}
                </g>
              );
            })}
            <text x="50" y="220">
              {rows[0]?.date}
            </text>
            <text x="730" y="220" textAnchor="end">
              {rows.at(-1)?.date}
            </text>
          </svg>
        ) : (
          <p>来源未提供可绘制的数值。</p>
        )}
      </figure>
      <SourceTable
        key={selected.join(',')}
        title="皮肤趋势明细"
        rows={rows}
        columns={[
          { key: 'date', label: '日期' },
          ...selected.map((id) => rateColumn(id, choices.find(([c]) => c === id)?.[1] ?? id)),
        ]}
      />
    </section>
  );
}
