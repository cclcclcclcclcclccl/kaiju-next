import { defaultSourceDate } from './tianyuan.ts';
import { useState } from 'react';
import { heroes, heroById } from '../catalog.ts';
import type { Hero, Pool } from '../model.ts';
import { SourceBlock, Identity, valueText } from './SourceWidgets.tsx';
import { RateBar } from './SourceMedia.tsx';
import { sourceDate } from './tianyuan.ts';
import type { SourceRow } from './sourcePlus.ts';
import { download } from '../../api.ts';
export const compareMetrics = [
  ['winRate', '胜率', '%'],
  ['pickRate', '出场率', '%'],
  ['banRate', '禁用率', '%'],
  ['kda', 'KDA', ''],
  ['earlyWinRate', '前期胜率', '%'],
  ['midWinRate', '中期胜率', '%'],
  ['lateWinRate', '后期胜率', '%'],
  ['avgDamagePerMinute', '分均输出', ''],
  ['avgDamageTakenPerMinute', '分均承伤', ''],
  ['avgEconomyPerMinute', '分均经济', ''],
  ['qAreaTop10Power', 'Q区国十战力', ''],
] as const;
export function comparableRows(rows: SourceRow[], ids: number[]) {
  return ids.map((id) => rows.find((r) => r.heroId === id) ?? null);
}
export default function HeroCompare({ pool, onOpen }: { pool: Pool; onOpen: (h: Hero) => void }) {
  const [date, setDate] = useState(defaultSourceDate),
    [mode, setMode] = useState(5),
    [search, setSearch] = useState('');
  const [ids, setIds] = useState<number[]>(() => pool.slice(0, 4).map((r) => r.heroId));
  const choices = heroes.filter(
    (h) =>
      !search ||
      h.name.includes(search.trim()) ||
      h.slug.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const modes = [
    [1, '大众分段'],
    [3, '巅峰1350+'],
    [4, '顶端排位'],
    [5, '巅峰千强'],
    [6, '千强近5日'],
    [7, '千强近15日'],
    [8, '巅峰百强'],
  ] as const;
  return (
    <section className="hero-compare">
      <h2>英雄横向对比</h2>
      <p>
        把纠结的英雄放在一起，查看同一查询下的表现。数字优势不等同于更适合你；先看分段，再结合自己的英雄池与阵容。
      </p>
      <div className="pro-toolbar">
        <label>
          对比统计日
          <input
            type="date"
            value={date}
            max={sourceDate()}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          对比分段
          <select value={mode} onChange={(e) => setMode(Number(e.target.value))}>
            {modes.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          搜索待对比英雄
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="英雄名字或拼音"
          />
        </label>
        <label>
          加入对比
          <select
            value=""
            disabled={ids.length >= 4}
            onChange={(e) => {
              if (e.target.value) setIds((old) => [...old, Number(e.target.value)]);
            }}
          >
            <option value="">选择英雄（最多 4 位）</option>
            {choices
              .filter((h) => !ids.includes(h.id))
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} · {h.roles.join('/')}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="compare-selected">
        {ids.map((id) => (
          <div key={id}>
            <button className="text-btn" onClick={() => onOpen(heroById(id)!)}>
              <Identity name={heroById(id)!.name} icon={heroById(id)!.portrait} />
            </button>
            <small>{pool.some((p) => p.heroId === id) ? '在我的英雄池' : '尚未加入英雄池'}</small>
            <button
              className="text-btn"
              aria-label={'移除对比' + heroById(id)!.name}
              onClick={() => setIds((old) => old.filter((v) => v !== id))}
            >
              移除
            </button>
          </div>
        ))}
      </div>
      {ids.length < 2 ? (
        <p className="pro-notice">请选择至少 2 位英雄开始对比。选入对比不会修改英雄池。</p>
      ) : (
        <SourceBlock query={{ kind: 'allStats', date, gameMode: mode }}>
          {(d, packet) => {
            const rows = comparableRows(d.rows, ids),
              names = ids.map((id) => heroById(id)!.name);
            return (
              <>
                <p className="pro-notice">
                  对比范围：{date} · {modes.find(([m]) => m === mode)?.[1]} ·
                  同一来源批次。英雄完整样本量未公布，不能据此判断差异是否显著；不合成 BP
                  率或预测下一局胜率。
                </p>
                {rows.some((r) => !r) && (
                  <p role="status">
                    本查询缺少{' '}
                    {ids
                      .filter((_, i) => !rows[i])
                      .map((id) => heroById(id)!.name)
                      .join('、')}{' '}
                    的统计，保持未公布。
                  </p>
                )}
                <div className="table-scroll">
                  <table className="pro-table compare-table" aria-label="英雄横向对比表">
                    <thead>
                      <tr>
                        <th scope="col">指标</th>
                        {names.map((n) => (
                          <th scope="col" key={n}>
                            {n}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {compareMetrics.map(([key, label, unit]) => (
                        <tr key={key}>
                          <th scope="row">{label}</th>
                          {rows.map((r, i) => (
                            <td key={ids[i]}>
                              {unit === '%' ? (
                                <RateBar
                                  label={names[i] + ' ' + label}
                                  value={typeof r?.[key] === 'number' ? r[key] : null}
                                  win={key.toLowerCase().includes('win')}
                                />
                              ) : (
                                valueText(r?.[key])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  className="btn secondary"
                  onClick={() =>
                    download(
                      '自在弈境-英雄对比与出处.json',
                      JSON.stringify(
                        { names, heroIds: ids, metrics: compareMetrics, rows, source: packet },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  导出对比与出处
                </button>
              </>
            );
          }}
        </SourceBlock>
      )}
    </section>
  );
}
