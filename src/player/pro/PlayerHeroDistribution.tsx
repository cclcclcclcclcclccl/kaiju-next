import type { Hero } from '../model.ts';
import { heroById } from '../catalog.ts';
import type { SourceRow } from './sourcePlus.ts';
import { playerHeroDistribution } from './sourceComparisons.ts';
import { SourceTable, Identity, rateColumn } from './SourceWidgets.tsx';
export default function PlayerHeroDistribution({
  data,
  onOpen,
}: {
  data: SourceRow;
  onOpen: (h: Hero) => void;
}) {
  const players = data.players ?? [],
    rows = playerHeroDistribution(players);
  return (
    <section className="player-hero-distribution">
      <h3>上榜玩家的英雄分布</h3>
      <p>
        本次返回 {players.length} 条玩家榜记录，其中{' '}
        {players.filter((p: SourceRow) => (p.heroPowerRanks ?? []).length).length}{' '}
        条公开了上榜英雄。同一记录中同一英雄只计一次；占比以全部返回记录为分母。未公开不等于不会玩，不代表全服英雄出场率。
      </p>
      <SourceTable
        title="上榜英雄分布"
        rows={rows.map((r) => ({
          ...r,
          name: data.heroes?.[r.heroId]?.heroName ?? heroById(r.heroId)?.name ?? String(r.heroId),
        }))}
        columns={[
          {
            key: 'name',
            label: '英雄',
            render: (r) => (
              <button
                className="text-btn"
                onClick={() => {
                  const h = heroById(r.heroId);
                  if (h) onOpen(h);
                }}
              >
                <Identity name={r.name} icon={heroById(r.heroId)?.portrait} />
              </button>
            ),
          },
          { key: 'players', label: '榜单记录数' },
          rateColumn('percent', '榜单占比'),
          { key: 'averagePower', label: '平均公开战力' },
          { key: 'maxPower', label: '最高公开战力' },
          { key: 'powerSamples', label: '有效战力样本' },
          { key: 'bestRank', label: '最好英雄名次' },
        ]}
      />
      <p className="data-caption">
        多区同英雄战力取该记录公开的最高值后计算平均；不把缺失战力当作 0。
      </p>
    </section>
  );
}
