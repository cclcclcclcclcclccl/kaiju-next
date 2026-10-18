import { useState } from 'react';
import type { z } from 'zod';
import { heroes, heroById } from '../catalog.ts';
import type { Hero } from '../model.ts';
import { sourceDate, tianyuanEquipSchema } from './tianyuan.ts';
import { useSource, Provenance } from './TianyuanLive.tsx';
import { EquipmentIdentity } from './SourceMedia.tsx';

export default function EquipmentStats({ onOpen }: { onOpen: (hero: Hero) => void }) {
  const [heroId, setHeroId] = useState(544);
  const [date, setDate] = useState(sourceDate());
  const [sort, setSort] = useState<'pickRate' | 'winRate'>('pickRate');
  const [search, setSearch] = useState('');
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  const source = useSource<z.infer<typeof tianyuanEquipSchema>>(
    validDate ? { kind: 'equip', heroId, date } : undefined,
  );
  const packet = source.packet;
  const hero = heroById(heroId)!;
  const rows =
    packet?.data.equipmentWinRates
      .filter((r) => r.equipmentName.includes(search.trim()))
      .sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1) || a.equipmentId - b.equipmentId) ?? [];
  const percent = (n: number | null) => (n == null ? '未公布' : n.toFixed(2) + '%');
  return (
    <section className="surface equipment-statistics" aria-label="英雄装备出场率与胜率">
      <div className="section-title">
        <h2>装备出场率与胜率</h2>
        <button className="text-btn" onClick={() => onOpen(hero)}>
          查看{hero.name}图鉴 ↗
        </button>
      </div>
      <p>先选英雄，比较这个英雄的实际出装表现。数据来源：天元之弈数据站公开统计。</p>
      <div className="pro-toolbar">
        <label>
          统计英雄
          <select
            aria-label="统计英雄"
            value={heroId}
            onChange={(e) => {
              setHeroId(Number(e.target.value));
              setSearch('');
            }}
          >
            {heroes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          装备统计查询日
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          装备统计排序
          <select
            aria-label="装备统计排序"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="pickRate">出场率 · 从高到低</option>
            <option value="winRate">胜率 · 从高到低</option>
          </select>
        </label>
        <label>
          筛选统计装备
          <input
            value={search}
            placeholder="输入装备名称"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          className="btn secondary"
          disabled={!validDate || source.loading}
          onClick={source.reload}
        >
          重新读取统计
        </button>
      </div>
      {!validDate && <p role="alert">请选择有效的查询日期。</p>}
      {source.loading && <p role="status">正在读取{hero.name}的装备统计…</p>}
      {source.error && (
        <p role="alert">本次统计未能读取：{source.error}。请重试或选择其他查询日。</p>
      )}
      {packet && (
        <>
          <p className="data-caption">
            {hero.name} · 查询日 {date} · 来源返回 {packet.data.equipmentWinRates.length} 件装备 ·{' '}
            {packet.cache === 'stale'
              ? '更新失败，沿用相同查询的旧缓存'
              : packet.cache === 'cached'
                ? '已保存的来源快照'
                : '本次成功获取'}
          </p>
          <p className="data-caption">
            来源统计截止：
            {new Date(packet.data.queryEndDate).toLocaleString('zh-CN', {
              timeZone: 'Asia/Shanghai',
              hour12: false,
            })}
            （北京时间）。该接口不提供分段选择，不能视为巅峰千强或全分段总榜。
          </p>
          <div
            className="roster-scroll"
            tabIndex={0}
            role="region"
            aria-label="装备统计表格，可横向滚动"
          >
            <table className="roster-table">
              <caption>
                {hero.name}装备表现 · {sort === 'pickRate' ? '按出场率排序' : '按胜率排序'}
              </caption>
              <thead>
                <tr>
                  <th>装备</th>
                  <th>出场率</th>
                  <th>胜率</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.equipmentId}>
                    <td>
                      <EquipmentIdentity
                        id={r.equipmentId}
                        name={r.equipmentName}
                        icon={r.equipmentIcon}
                      />
                    </td>
                    <td>{percent(r.pickRate)}</td>
                    <td>{percent(r.winRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p>
              {packet.data.equipmentWinRates.length
                ? '没有匹配的装备，请清除筛选词。'
                : '来源没有返回这次查询的装备统计，保持空白。'}
            </p>
          )}
          <Provenance packet={packet} />
        </>
      )}
      <p className="pro-notice">
        统计范围是所选英雄，来源未提供样本场次、完整分母和分段定义。高胜率可能受到顺风局、购买时机与玩家水平影响，不等于装备本身能提高这么多胜率；多件装备可以在同一局出现，出场率不必相加为
        100%。
      </p>
    </section>
  );
}
