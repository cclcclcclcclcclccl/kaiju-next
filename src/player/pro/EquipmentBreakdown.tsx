import { useState } from 'react';
import type { z } from 'zod';
import type { tianyuanEquipSchema } from './tianyuan.ts';
import { EquipmentIdentity, NamedIcon, RateBar, RateLegend } from './SourceMedia.tsx';
export default function EquipmentBreakdown({
  data,
}: {
  data: z.infer<typeof tianyuanEquipSchema>;
}) {
  const [slot, setSlot] = useState(1);
  const [sort, setSort] = useState<'pickRate' | 'winRate'>('pickRate');
  const selected = data.topItemsBySlot?.find((s) => s.slot === slot);
  const rows = [...(selected?.topItems ?? [])].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1));
  return (
    <section className="equipment-breakdown" aria-label="装备栏位置与完整出装">
      <h4>装备栏位置统计</h4>
      <p className="data-caption">
        按来源的第 1–6
        装备栏分别比较。装备栏位置不等于购买先后顺序；来源只返回各栏热门装备，不是全部装备的完整交叉表。
      </p>
      <div className="pro-toolbar">
        <div className="filter-tabs" aria-label="装备栏选择">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              aria-pressed={n === slot}
              className={n === slot ? 'active' : ''}
              onClick={() => setSlot(n)}
            >
              第 {n} 栏
            </button>
          ))}
        </div>
        <label>
          栏位装备排序
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="pickRate">出场率优先</option>
            <option value="winRate">胜率优先</option>
          </select>
        </label>
      </div>
      {selected?.baseWinRate != null && (
        <p className="data-caption">该栏来源基准胜率：{selected.baseWinRate.toFixed(2)}%</p>
      )}
      {rows.length ? (
        <div className="table-scroll">
          <table className="pro-table">
            <caption>第 {slot} 栏热门装备</caption>
            <thead>
              <tr>
                <th>装备</th>
                <th>栏位出场率</th>
                <th>相关对局胜率</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.equipId}>
                  <td>
                    <EquipmentIdentity id={r.equipId} name={r.equipName} icon={r.equipIcon} />
                  </td>
                  <td>
                    <RateBar value={r.pickRate} label="栏位出场率" />
                  </td>
                  <td>
                    <RateBar value={r.winRate} win />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>来源未公布第 {slot} 栏数据，不从单件装备总出场率推算。</p>
      )}
      <RateLegend />
      <h4>常见六神装 · 来源完整出装</h4>
      <p className="data-caption">
        六件装备与关联召唤师技能来自同一条来源记录。来源未提供整套胜率；“频率”为来源返回值，分母尚未公开核验，不与单件出场率混用。
      </p>
      <div className="full-build-list">
        {data.topFullBuilds?.map((b, i) => (
          <article key={i}>
            <div className="section-title">
              <strong>
                组合 {i + 1}
                {b.build.length !== 6 ? ' · 不足六件' : ''}
              </strong>
              <span>来源频率 {b.frequency == null ? '未公布' : b.frequency.toFixed(2) + '%'}</span>
            </div>
            <ol className="full-build-items">
              {b.build.map((item, j) => (
                <li key={j}>
                  <small>第 {j + 1} 栏</small>
                  <EquipmentIdentity
                    id={item.equipId}
                    name={item.equipName}
                    icon={item.equipIcon}
                  />
                </li>
              ))}
            </ol>
            {b.summonerSkill && (
              <NamedIcon name={b.summonerSkill.skillName} icon={b.summonerSkill.skillIcon} />
            )}
          </article>
        ))}
      </div>
      {!data.topFullBuilds?.length && <p>来源未公布完整出装组合。</p>}
    </section>
  );
}
