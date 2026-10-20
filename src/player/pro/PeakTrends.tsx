import { useState } from 'react';
import { SourceBlock, SourceTable, TrendChart } from './SourceWidgets.tsx';
export default function PeakTrends({ areaType }: { areaType: number }) {
  const [branch, setBranch] = useState(7),
    [rank, setRank] = useState(1),
    [days, setDays] = useState(30);
  return (
    <details className="source-proof">
      <summary>五路巅峰门槛历史</summary>
      <div className="pro-toolbar">
        <label>
          门槛趋势分路
          <select
            value={branch}
            onChange={(e) => {
              setBranch(Number(e.target.value));
              setRank(1);
            }}
          >
            {[
              [7, '总榜'],
              [1, '对抗路'],
              [2, '中路'],
              [3, '发育路'],
              [4, '打野'],
              [5, '游走'],
            ].map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          门槛趋势名次
          <select value={rank} onChange={(e) => setRank(Number(e.target.value))}>
            {(branch === 7 ? [1, 100, 5000, 10000] : [1, 100, 500]).map((n) => (
              <option key={n} value={n}>
                前 {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          门槛趋势天数
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[30, 90, 180].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <SourceBlock query={{ kind: 'peakTrends', areaType, branchType: branch, rankNo: rank, days }}>
        {(d) => (
          <>
            <TrendChart rows={d.trends} metric="rankScore" label="巅峰分数门槛" unit="分" />
            <SourceTable
              title="门槛历史明细"
              rows={d.trends}
              columns={[
                { key: 'date', label: '日期' },
                { key: 'rankScore', label: '巅峰分数' },
              ]}
            />
          </>
        )}
      </SourceBlock>
    </details>
  );
}
