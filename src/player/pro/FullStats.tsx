import { defaultSourceDate } from './tianyuan.ts';
import { useState } from 'react';
import type { Hero } from '../model.ts';
import { ROLES } from '../model.ts';
import { heroById } from '../catalog.ts';
import { SourceBlock, SourceTable, Identity, rateColumn } from './SourceWidgets.tsx';
import type { Column } from './SourceWidgets.tsx';
import { sourceDate } from './tianyuan.ts';
export default function FullStats({ onOpen }: { onOpen: (h: Hero) => void }) {
  const [date, setDate] = useState(defaultSourceDate),
    [mode, setMode] = useState(5),
    [role, setRole] = useState('全部'),
    [group, setGroup] = useState('base'),
    [adjusted, setAdjusted] = useState(false),
    [hideLow, setHideLow] = useState(false);
  const groups: Record<string, Column[]> = {
    base: [
      rateColumn('winRate', '胜率'),
      rateColumn('pickRate', '出场率'),
      rateColumn('banRate', '禁用率'),
      { key: 'winRateDelta', label: '胜率日变化（百分点）' },
      { key: 'kda', label: 'KDA' },
      { key: 'qAreaTop10Power', label: 'Q区国十战力' },
    ],
    fight: [
      { key: 'avgDamagePerMinute', label: '分均输出' },
      { key: 'avgDamageTakenPerMinute', label: '分均承伤' },
      { key: 'avgEconomyPerMinute', label: '分均经济' },
      rateColumn('participation', '参团率'),
      rateColumn('damageShare', '输出占比'),
      rateColumn('tankShare', '承伤占比'),
      { key: 'avgCrowdControlTime', label: '控制时长' },
      { key: 'avgDamageToBuildings', label: '对建筑伤害' },
      { key: 'avgHealDone', label: '治疗量' },
      { key: 'avgKills', label: '场均击杀' },
      { key: 'avgDeaths', label: '场均死亡' },
      { key: 'avgAssists', label: '场均助攻' },
      { key: 'avgHurtTransRate', label: '伤转（来源值）' },
    ],
    medal: [
      rateColumn('winMvpRate', '胜方MVP率'),
      rateColumn('loseMvpRate', '败方MVP率'),
      rateColumn('goldMedalRate', '金牌率'),
      rateColumn('silverMedalRate', '银牌率'),
      rateColumn('godLikeRate', '超神率'),
    ],
    power: ['q', 'aq', 'iq', 'av', 'iv'].flatMap((area, i) =>
      [10, 100].map((rank) => ({
        key: area + 'AreaTop' + rank + 'Power',
        label: ['Q均', '安卓Q', '苹果Q', '安卓V', '苹果V'][i] + '国' + rank,
      })),
    ),
    time: [
      rateColumn('earlyWinRate', '前期胜率'),
      rateColumn('midWinRate', '中期胜率'),
      rateColumn('lateWinRate', '后期胜率'),
      { key: 'avgDurationInSeconds', label: '平均时长（秒）' },
      { key: 'avgOldMasterMatchScore', label: '平均巅峰分' },
    ],
  };
  return (
    <>
      <h2>全英雄数据 · 扩展指标</h2>
      <div className="pro-toolbar">
        <label>
          英雄统计日
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          统计分段
          <select value={mode} onChange={(e) => setMode(Number(e.target.value))}>
            {[
              [1, '大众分段'],
              [3, '巅峰1350+'],
              [4, '顶端排位'],
              [5, '巅峰千强'],
              [6, '千强近5日'],
              [7, '千强近15日'],
              [8, '巅峰百强'],
            ].map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          统计分路
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {['全部', ...ROLES].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          指标组
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            {[
              ['base', '选禁与胜率'],
              ['fight', '输出／经济／团队'],
              ['medal', '高光与荣誉'],
              ['time', '前中后期'],
              ['power', '各区战力'],
            ].map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pro-toolbar">
        <label>
          <input
            type="checkbox"
            checked={adjusted}
            onChange={(e) => setAdjusted(e.target.checked)}
          />
          只看来源标注调整的英雄
        </label>
        <label>
          <input type="checkbox" checked={hideLow} onChange={(e) => setHideLow(e.target.checked)} />
          隐藏出场率低于 2.5% 的英雄
        </label>
      </div>
      <p className="data-caption">
        按来源实际返回覆盖展示，缺失字段保持未公布。5 日／15
        日与百强是来源独立统计口径，不能当作本工具计算的分段。前／中／后期沿用来源划分；统计相关性不能替代英雄梯度结论。
        来源未提供统一分母的 BP 率，因此不把出场率与禁用率相加。
      </p>
      <SourceBlock query={{ kind: 'allStats', date, gameMode: mode }}>
        {(d) => (
          <SourceTable
            title="全英雄详细统计"
            rows={d.rows
              .filter(
                (r: any) =>
                  (role === '全部' || r.roles?.includes(role)) &&
                  (!adjusted || r.update === true) &&
                  (!hideLow || (typeof r.pickRate === 'number' && r.pickRate >= 2.5)),
              )
              .map((r: any) => ({
                ...r,
                participation:
                  typeof r.avgJoinGamePercent === 'number' ? r.avgJoinGamePercent * 100 : null,
                damageShare:
                  typeof r.avgTotalHurtHeroCntPercent === 'number'
                    ? r.avgTotalHurtHeroCntPercent * 100
                    : null,
                tankShare:
                  typeof r.avgTotalBeHurtedCntPercent === 'number'
                    ? r.avgTotalBeHurtedCntPercent * 100
                    : null,
              }))}
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
                    <Identity name={r.heroName} icon={r.avatarUrl} />
                  </button>
                ),
              },
              { key: 'roles', label: '分路' },
              ...groups[group],
            ]}
          />
        )}
      </SourceBlock>
    </>
  );
}
