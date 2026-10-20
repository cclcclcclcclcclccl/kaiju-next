import { useState } from 'react';
import { SourceBlock, SourceTable, Identity, rateColumn, valueText } from './SourceWidgets.tsx';
import { sourceDate } from './tianyuan.ts';
import type { PlusQuery, SourceRow } from './sourcePlus.ts';
import EquipmentBreakdown from './EquipmentBreakdown.tsx';
import { tianyuanEquipSchema } from './tianyuan.ts';
export default function ConditionalBuilds({ heroId }: { heroId: number }) {
  const [date, setDate] = useState(sourceDate),
    [position, setPosition] = useState(''),
    [locks, setLocks] = useState<Record<string, number>>({});
  const query: PlusQuery = {
    kind: 'heroEquip',
    heroId,
    date,
    ...(position !== '' ? { position: Number(position) } : {}),
    ...(Object.keys(locks).length ? { chain: 1, chainOnly: 1, ...locks } : {}),
  };
  return (
    <section className="conditional-builds">
      <p>
        锁定指定栏位装备，后续栏位按已选条件重新查询。统计是历史关联，不能解释为购买某件装备就提升相应胜率；栏位也不等于购买顺序。
      </p>
      <div className="pro-toolbar">
        <label>
          出装统计日
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setLocks({});
            }}
          />
        </label>
        <label>
          出装分路
          <select
            value={position}
            onChange={(e) => {
              setPosition(e.target.value);
              setLocks({});
            }}
          >
            <option value="">全部分路</option>
            {['对抗路', '中路', '发育路', '打野', '游走'].map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn secondary"
          disabled={!Object.keys(locks).length}
          onClick={() => setLocks({})}
        >
          清除装备条件
        </button>
      </div>
      <SourceBlock key={JSON.stringify(query)} query={query}>
        {(d) => (
          <>
            {d.selectedCombinationStats && (
              <p className="pro-notice">
                当前条件：胜率 {valueText(d.selectedCombinationStats.winRate)}% · 胜场{' '}
                {valueText(d.selectedCombinationStats.winCount)} / 样本{' '}
                {valueText(d.selectedCombinationStats.matchCount)} 场
              </p>
            )}
            <div className="plus-grid">
              {(d.chainedTopItemsBySlot ?? d.topItemsBySlot ?? []).map((s: SourceRow) => (
                <article key={s.slot}>
                  <h4>
                    第 {s.slot} 栏{locks['s' + s.slot] ? ' · 已锁定' : ''}
                  </h4>
                  <SourceTable
                    title={'条件出装第' + s.slot + '栏'}
                    rows={s.topItems ?? []}
                    columns={[
                      {
                        key: 'equipName',
                        label: '装备（点击锁定）',
                        render: (r) => (
                          <button
                            className="text-btn"
                            aria-pressed={locks['s' + s.slot] === r.equipId}
                            onClick={() =>
                              setLocks((old) => {
                                const next = { ...old };
                                for (let i = s.slot; i <= 6; i++) delete next['s' + i];
                                if (old['s' + s.slot] !== r.equipId) next['s' + s.slot] = r.equipId;
                                return next;
                              })
                            }
                          >
                            <Identity name={r.equipName} icon={r.equipIcon} />
                          </button>
                        ),
                      },
                      rateColumn('pickRate', '条件出场率'),
                      rateColumn('winRate', '胜率'),
                      { key: 'deltaWinRate', label: '相对基准（百分点）' },
                    ]}
                  />
                </article>
              ))}
            </div>
            {!Object.keys(locks).length &&
              (() => {
                const parsed = tianyuanEquipSchema.safeParse(d);
                return parsed.success ? (
                  <EquipmentBreakdown data={parsed.data} />
                ) : (
                  <p>来源完整出装结构已变化，暂不展示，栏位统计见上。</p>
                );
              })()}
          </>
        )}
      </SourceBlock>
    </section>
  );
}
