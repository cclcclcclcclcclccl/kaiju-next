import PlayerHeroDistribution from './PlayerHeroDistribution.tsx';
import PeakTrends from './PeakTrends.tsx';
import { useState, useEffect } from 'react';
import type { Hero, Draft } from '../model.ts';
import { ROLES } from '../model.ts';
import { heroes, heroById } from '../catalog.ts';
import {
  SourceBlock,
  SourceTable,
  Identity,
  rateColumn,
  valueText,
  AREAS,
  TrendChart,
  usePlus,
  SourceStamp,
} from './SourceWidgets.tsx';
import type { Column } from './SourceWidgets.tsx';
import { sourceDate } from './tianyuan.ts';
import type { PlusKind, PlusQuery, SourceRow, PlusPacket } from './sourcePlus.ts';
import { publicImage } from './sourcePlus.ts';
import { Modal } from '../ui.tsx';
import { RateBar } from './SourceMedia.tsx';
import HeroSourceDetails from './HeroSourceDetails.tsx';
import PublicMatchExplorer from './PublicMatchExplorer.tsx';
import PowerCalculator from './PowerCalculator.tsx';
import FullStats from './FullStats.tsx';
import HeroCompare from './HeroCompare.tsx';
import TeachingLibrary from './TeachingLibrary.tsx';
type Open = (hero: Hero) => void;
const heroColumn = (open: Open): Column => ({
  key: 'heroName',
  label: '英雄',
  render: (r) => (
    <button
      className="text-btn"
      onClick={() => {
        const h = heroById(r.heroId);
        if (h) open(h);
      }}
    >
      <Identity name={r.heroName ?? '未标注'} icon={r.heroIcon ?? heroById(r.heroId)?.portrait} />
    </button>
  ),
});
function GlobalData({ onOpen }: { onOpen: Open }) {
  const [tab, setTab] = useState<PlusKind>('overview'),
    [date, setDate] = useState(sourceDate),
    [area, setArea] = useState(7),
    [rank, setRank] = useState(10),
    [camp, setCamp] = useState<'blue' | 'red'>('blue'),
    [metric, setMetric] = useState<'ban' | 'pick'>('ban'),
    [branch, setBranch] = useState(0),
    [order, setOrder] = useState(''),
    [skill, setSkill] = useState<SourceRow>();
  const tabs: [PlusKind, string][] = [
    ['overview', '全局概况'],
    ['topban', '红蓝选禁榜'],
    ['power', '英雄战力榜'],
    ['peaks', '五路巅峰门槛'],
    ['players', '巅峰玩家'],
    ['skills', '召唤师技能'],
  ];
  const query: PlusQuery = {
    kind: tab,
    date,
    ...(['power', 'players'].includes(tab)
      ? { areaId: area, rankNo: tab === 'players' ? 100 : rank }
      : {}),
    ...(tab === 'players' && branch ? { branchType: branch } : {}),
    ...(tab === 'peaks' ? { areaType: area > 4 ? 1 : area } : {}),
    ...(tab === 'topban'
      ? { camp, metric, ...(order ? { [metric === 'ban' ? 'banOrder' : 'pickOrder']: order } : {}) }
      : {}),
  };
  return (
    <>
      <div className="pro-tabs">
        {tabs.map(([k, n]) => (
          <button
            key={k}
            className={k === tab ? 'active' : ''}
            onClick={() => {
              setTab(k);
              setSkill(undefined);
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="pro-toolbar">
        <label>
          全局统计日
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSkill(undefined);
            }}
          />
        </label>
        {['power', 'players', 'peaks'].includes(tab) && (
          <label>
            统计大区
            <select
              value={tab === 'peaks' && area > 4 ? 1 : area}
              onChange={(e) => setArea(Number(e.target.value))}
            >
              {AREAS.filter(([v]) => tab !== 'peaks' || v <= 4).map(([v, n]) => (
                <option key={v} value={v}>
                  {tab === 'players' ? n.replace('平均', '聚合') : n}
                </option>
              ))}
            </select>
          </label>
        )}
        {tab === 'power' && (
          <label>
            战力名次
            <select value={rank} onChange={(e) => setRank(Number(e.target.value))}>
              {[1, 10, 50, 100].map((n) => (
                <option key={n} value={n}>
                  国 {n}
                </option>
              ))}
            </select>
          </label>
        )}
        {tab === 'players' && (
          <label>
            榜单分路
            <select value={branch} onChange={(e) => setBranch(Number(e.target.value))}>
              {['总榜', '对抗路', '中路', '发育路', '打野', '游走'].map((n, i) => (
                <option key={i} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        {tab === 'topban' && (
          <>
            <label>
              阵营
              <select value={camp} onChange={(e) => setCamp(e.target.value as typeof camp)}>
                <option value="blue">蓝方</option>
                <option value="red">红方</option>
              </select>
            </label>
            <label>
              榜单指标
              <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
                <option value="ban">禁用率</option>
                <option value="pick">选用率</option>
              </select>
            </label>
            <label>
              选禁顺序
              <select value={order} onChange={(e) => setOrder(e.target.value)}>
                <option value="">全部顺序</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={String(n)}>
                    第 {n} 手
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <SourceBlock key={JSON.stringify(query)} query={query}>
        {(d) => {
          if (tab === 'overview')
            return (
              <>
                <div className="plus-metrics">
                  <article>
                    <span>蓝方样本胜率</span>
                    <RateBar value={d.blueTeamWinRate} win />
                  </article>
                  <article>
                    <span>红方样本胜率</span>
                    <RateBar value={d.redTeamWinRate} win />
                  </article>
                  <article>
                    <span>平均对局时长</span>
                    <strong>
                      {Math.floor(d.averageDurationInSeconds / 60)} 分{' '}
                      {d.averageDurationInSeconds % 60} 秒
                    </strong>
                  </article>
                </div>
                <p>
                  来源说明：巅峰千强口径覆盖 QQ
                  双区各分路约千名顶尖选手的公开对局；小范围样本可能波动，不能推及所有分段。
                </p>
              </>
            );
          if (tab === 'topban')
            return (
              <SourceTable
                title="红蓝选禁榜"
                rows={d.heroes}
                columns={[
                  heroColumn(onOpen),
                  rateColumn('rate', metric === 'ban' ? '禁用率' : '选用率'),
                  { key: 'count', label: '次数' },
                  { key: 'rankChange', label: '排名变化' },
                ]}
              />
            );
          if (tab === 'power')
            return (
              <SourceTable
                title="英雄战力榜"
                rows={d.heroes}
                columns={[
                  heroColumn(onOpen),
                  { key: 'powerValue', label: '战力门槛' },
                  { key: 'rankChange', label: '排名变化' },
                ]}
              />
            );
          if (tab === 'peaks')
            return (
              <>
                <SourceTable
                  title="巅峰分数门槛"
                  rows={d.branchRankings.flatMap((r: SourceRow) =>
                    (r.rankings ?? []).map((v: SourceRow) => ({ ...v, lane: r.branchName })),
                  )}
                  columns={[
                    { key: 'lane', label: '分路' },
                    { key: 'targetRankNo', label: '名次' },
                    { key: 'rankScore', label: '巅峰积分' },
                  ]}
                />
                <PeakTrends areaType={area > 4 ? 1 : area} />
              </>
            );
          if (tab === 'players')
            return (
              <>
                <p>仅展示来源公开榜单；“未授权游戏信息”等匿名名称原样保留。</p>
                <PlayerHeroDistribution data={d} onOpen={onOpen} />
                <SourceTable
                  title="巅峰玩家榜"
                  rows={d.players ?? []}
                  columns={[
                    { key: 'rankNo', label: '排名' },
                    { key: 'playerName', label: '玩家' },
                    { key: 'rankScore', label: '巅峰积分' },
                    {
                      key: 'heroPowerRanks',
                      label: '公开上榜英雄',
                      render: (r) => (
                        <div className="plus-item-list">
                          {(r.heroPowerRanks ?? []).map((h: SourceRow, i: number) => (
                            <button
                              className="text-btn"
                              key={i}
                              onClick={() => {
                                const hero = heroById(h.heroId);
                                if (hero) onOpen(hero);
                              }}
                            >
                              <Identity
                                name={
                                  (d.heroes?.[h.heroId]?.heroName ??
                                    heroById(h.heroId)?.name ??
                                    String(h.heroId)) +
                                  ' · ' +
                                  h.powerValue
                                }
                                icon={heroById(h.heroId)?.portrait}
                              />
                            </button>
                          ))}
                        </div>
                      ),
                    },
                  ]}
                />
              </>
            );
          return (
            <>
              <p className="data-caption">
                全局使用率沿用来源口径，可超过 100%；不能与单个英雄的技能使用率直接比较。
              </p>
              <SourceTable
                title="全局召唤师技能"
                rows={d.skillStats}
                columns={[
                  {
                    key: 'name',
                    label: '技能',
                    render: (r) => (
                      <button className="text-btn" onClick={() => setSkill(r)}>
                        <Identity name={r.name} icon={r.icon} />
                      </button>
                    ),
                  },
                  { key: 'pickRate', label: '全局使用率（%）' },
                  rateColumn('winRate', '胜率'),
                ]}
              />
              {skill && (
                <SourceTable
                  title={skill.name + '使用英雄'}
                  rows={Object.values(skill.heroDistribution ?? {}) as SourceRow[]}
                  columns={[
                    heroColumn(onOpen),
                    rateColumn('pickRate', '来源占比'),
                    rateColumn('winRate', '胜率'),
                  ]}
                />
              )}
            </>
          );
        }}
      </SourceBlock>
    </>
  );
}
function EquipmentData({ onOpen }: { onOpen: Open }) {
  const [date, setDate] = useState(sourceDate),
    [days, setDays] = useState(1),
    [type, setType] = useState('all'),
    [selected, setSelected] = useState<SourceRow>(),
    [tab, setTab] = useState('slots'),
    [period, setPeriod] = useState(30);
  return (
    <>
      <h2>全装备统计</h2>
      <p className="pro-notice">
        全局装备出场率保留来源原值，允许超过 100%。5／15
        日胜率含千强和万强样本，出场率与平均位置仍按千强计算。胜率受局势、成装时机等影响，不是装备强弱的因果结论。
      </p>
      <div className="pro-toolbar">
        <label>
          装备统计日
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelected(undefined);
            }}
          />
        </label>
        <label>
          统计天数
          <select
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setSelected(undefined);
            }}
          >
            {[1, 5, 15].map((n) => (
              <option key={n} value={n}>
                {n} 日
              </option>
            ))}
          </select>
        </label>
        <label>
          装备类型
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {[
              ['all', '全部'],
              ['attack', '攻击'],
              ['magic', '法术'],
              ['defense', '防御'],
              ['shoes', '鞋子'],
              ['jungle', '打野'],
              ['support', '辅助'],
            ].map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <SourceBlock
        key={date + days}
        query={{ kind: 'equipment', date, ...(days === 1 ? {} : { days }) }}
      >
        {(d) => (
          <SourceTable
            title="全装备出场与胜率"
            rows={d.equipmentStats.filter((e: SourceRow) => type === 'all' || e.type === type)}
            columns={[
              {
                key: 'name',
                label: '装备',
                render: (r) => (
                  <button className="text-btn" onClick={() => setSelected(r)}>
                    <Identity name={r.name} icon={r.icon} />
                  </button>
                ),
              },
              { key: 'pickRate', label: '全局出场率（%）' },
              rateColumn('winRate', '胜率'),
              { key: 'avgPosition', label: '平均出装位置' },
            ]}
          />
        )}
      </SourceBlock>
      {selected && (
        <section className="surface equipment-source-detail">
          <h3>
            <Identity name={selected.name} icon={selected.icon} />
          </h3>
          <div className="pro-tabs">
            {[
              ['slots', '出装栏位'],
              ['usage', '英雄使用'],
              ['history', '历史趋势'],
              ['moves', '英雄异动'],
            ].map(([v, n]) => (
              <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
                {n}
              </button>
            ))}
          </div>
          {tab === 'slots' && (
            <SourceTable
              title="全局装备栏位"
              rows={Object.entries(selected.positionStats ?? {}).map(([slot, r]) => ({
                slot,
                ...(r as SourceRow),
              }))}
              columns={[
                { key: 'slot', label: '栏位' },
                rateColumn('pickrate', '栏位占比'),
                rateColumn('winRate', '栏位胜率'),
              ]}
            />
          )}{' '}
          {tab === 'usage' && (
            <SourceBlock
              query={{
                kind: 'equipmentUsage',
                equipmentId: selected.id,
                date,
                ...(days === 1 ? {} : { days }),
              }}
            >
              {(d) => (
                <SourceTable
                  title="装备英雄使用"
                  rows={d.heroUsageStats ?? []}
                  columns={[
                    heroColumn(onOpen),
                    rateColumn('pickRate', '英雄内出场率'),
                    { key: 'avgPosition', label: '平均栏位' },
                  ]}
                />
              )}
            </SourceBlock>
          )}
          {tab === 'history' && (
            <>
              <label>
                装备趋势周期
                <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
                  {[30, 90, 180].map((n) => (
                    <option key={n} value={n}>
                      {n} 天
                    </option>
                  ))}
                </select>
              </label>
              <SourceBlock query={{ kind: 'equipmentHistory', id: selected.id, days: period }}>
                {(d) => (
                  <>
                    <TrendChart rows={d.trends ?? []} metric="pickRate" label="装备全局出场率" />
                    <SourceTable
                      title="装备趋势明细"
                      rows={d.trends ?? []}
                      columns={[
                        { key: 'date', label: '日期' },
                        { key: 'pickRate', label: '出场率（%）' },
                        rateColumn('winRate', '胜率'),
                        { key: 'avgPosition', label: '平均位置' },
                      ]}
                    />
                  </>
                )}
              </SourceBlock>
            </>
          )}
          {tab === 'moves' && (
            <SourceBlock query={{ kind: 'movements', date }}>
              {(d) => (
                <SourceTable
                  title="装备使用异动"
                  rows={d.movements?.[selected.id] ?? []}
                  columns={[heroColumn(onOpen), { key: 'delta', label: '来源变化量（百分点）' }]}
                />
              )}
            </SourceBlock>
          )}
        </section>
      )}
    </>
  );
}
function SkinLibrary({ onOpen }: { onOpen: Open }) {
  const [search, setSearch] = useState(''),
    [role, setRole] = useState('全部'),
    [series, setSeries] = useState('全部'),
    [limit, setLimit] = useState(60),
    [selected, setSelected] = useState<SourceRow>(),
    [sort, setSort] = useState('source');
  return (
    <>
      <h2>全皮肤库 · 使用率与历史</h2>
      <SourceBlock query={{ kind: 'skins' }}>
        {(d) => {
          const byId = new Map<number, any[]>(d.heroes.map((h: any[]) => [h[0], h]));
          const tags = [
            ...new Set<string>(
              d.skins.flatMap((s: any[]) => String(s[6] ?? '').split('/')).filter(Boolean),
            ),
          ].sort();
          let rows = d.skins
            .map((s: any[]) => ({
              heroId: s[0],
              id: s[1],
              name: s[2],
              icon: s[3],
              image: s[4],
              pickRate: s[5],
              tags: s[6],
              heroName: byId.get(s[0])?.[1] ?? String(s[0]),
              roles: byId.get(s[0])?.[2] ?? '',
            }))
            .filter(
              (s: SourceRow) =>
                (role === '全部' || s.roles.includes(role)) &&
                (series === '全部' || String(s.tags).split('/').includes(series)) &&
                search
                  .trim()
                  .split(/\s+/)
                  .every((w) => (s.heroName + s.name + s.tags).includes(w)),
            );
          if (sort === 'rate')
            rows.sort((a: SourceRow, b: SourceRow) => (b.pickRate ?? -1) - (a.pickRate ?? -1));
          return (
            <>
              <p>
                {d.skins.length} 款来源皮肤；当前符合 {rows.length}{' '}
                款。使用率在同英雄内部统计，跨英雄不能直接当人气总量比较。
              </p>
              <div className="pro-toolbar">
                <label>
                  搜索皮肤库
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setLimit(60);
                    }}
                    placeholder="英雄、皮肤或套系，空格分词"
                  />
                </label>
                <label>
                  皮肤分路
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    {['全部', ...ROLES].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label>
                  皮肤套系
                  <select value={series} onChange={(e) => setSeries(e.target.value)}>
                    <option>全部</option>
                    {tags.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  皮肤库排序
                  <select value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="source">来源顺序</option>
                    <option value="rate">英雄内使用率</option>
                  </select>
                </label>
              </div>
              <div className="plus-skin-grid">
                {rows.slice(0, limit).map((s: SourceRow) => (
                  <button className="plus-skin-card" key={s.id} onClick={() => setSelected(s)}>
                    <Identity name={s.name} icon={publicImage(s.icon, d.imageHost)} />
                    <strong>{s.heroName}</strong>
                    <span>{s.tags}</span>
                    <span>
                      使用率 {s.pickRate == null ? '未公布' : valueText(s.pickRate) + '%'}
                    </span>
                  </button>
                ))}
              </div>
              {rows.length > limit && (
                <button className="btn secondary" onClick={() => setLimit((n) => n + 60)}>
                  加载更多皮肤
                </button>
              )}
            </>
          );
        }}
      </SourceBlock>
      {selected && (
        <Modal
          title={selected.heroName + ' · ' + selected.name}
          onClose={() => setSelected(undefined)}
        >
          <img
            className="plus-skin-preview"
            src={publicImage(selected.image)}
            alt={selected.name}
          />
          <p>
            来源使用率 {valueText(selected.pickRate)}% · {selected.tags}
          </p>
          <button
            className="btn secondary"
            onClick={() => {
              const h = heroById(selected.heroId);
              setSelected(undefined);
              if (h) onOpen(h);
            }}
          >
            打开对应英雄图鉴
          </button>
          <HeroSourceDetails
            key={selected.heroId}
            heroId={selected.heroId}
            initialTab="skinTrends"
            initialSkin={String(selected.id)}
          />
        </Modal>
      )}
    </>
  );
}
function ActivityData() {
  const [tab, setTab] = useState('votes'),
    [hours, setHours] = useState(6),
    [metric, setMetric] = useState('votes'),
    [selected, setSelected] = useState<number[] | null>(null),
    [auto, setAuto] = useState(false),
    [copy, setCopy] = useState('');
  const codes = usePlus(tab === 'codes' ? { kind: 'codes' } : null);
  useEffect(() => {
    if (!auto || tab !== 'codes') return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') codes.refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [auto, tab]);
  return (
    <>
      <div className="pro-tabs">
        {[
          ['votes', '皮肤返场趋势'],
          ['codes', '活动互助口令'],
        ].map(([v, n]) => (
          <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
            {n}
          </button>
        ))}
      </div>
      {tab === 'votes' ? (
        <>
          <div className="pro-toolbar">
            <label>
              投票时间窗口
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {[6, 12, 24, 72, 0].map((n) => (
                  <option key={n} value={n}>
                    {n ? n + ' 小时' : '全部'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              返场曲线指标
              <select value={metric} onChange={(e) => setMetric(e.target.value)}>
                {[
                  ['votes', '票数'],
                  ['growth', '区间增长'],
                  ['share', '份额变化（百分点）'],
                  ['ranks', '排名'],
                  ['addNums', '每分钟增加'],
                ].map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <SourceBlock query={{ kind: 'votes', hours }}>
            {(d) => {
              const chosen = selected ?? [d.series[0]?.skinId];
              const totals = d.times.map((_: string, i: number) =>
                d.series.reduce(
                  (sum: number, r: SourceRow) =>
                    sum + (typeof r.votes?.[i] === 'number' ? r.votes[i] : 0),
                  0,
                ),
              );
              return (
                <>
                  <p>
                    源站更新时间：
                    {d.updatedAt ? new Date(d.updatedAt).toLocaleString('zh-CN') : '未公布'}
                    。数据由天元转引「苏苏的荣耀助手」。更新停止时不标为实时。
                  </p>
                  <div className="pro-toolbar">
                    {[3, 6, 10].map((n) => (
                      <button
                        key={n}
                        className="text-btn"
                        onClick={() =>
                          setSelected(d.series.slice(0, n).map((r: SourceRow) => r.skinId))
                        }
                      >
                        前 {n} 名曲线
                      </button>
                    ))}
                    <button
                      className="text-btn"
                      onClick={() => setSelected(d.series.map((r: SourceRow) => r.skinId))}
                    >
                      全部曲线
                    </button>
                    <button className="text-btn" onClick={() => setSelected([])}>
                      清空曲线
                    </button>
                  </div>
                  <SourceTable
                    title="返场投票榜"
                    rows={d.series.map((r: SourceRow) => ({
                      ...r,
                      growth:
                        r.votes?.length && r.latestVotes != null
                          ? r.latestVotes - r.votes[0]
                          : null,
                    }))}
                    columns={[
                      { key: 'latestRank', label: '排名' },
                      {
                        key: 'skinName',
                        label: '皮肤',
                        render: (r) => (
                          <button
                            className="text-btn"
                            aria-pressed={chosen.includes(r.skinId)}
                            onClick={() =>
                              setSelected(
                                chosen.includes(r.skinId)
                                  ? chosen.filter((id: number) => id !== r.skinId)
                                  : [...chosen, r.skinId],
                              )
                            }
                          >
                            <Identity name={r.heroName + ' · ' + r.skinName} icon={r.icon} />
                          </button>
                        ),
                      },
                      { key: 'latestVotes', label: '当前票数' },
                      { key: 'growth', label: '窗口增加票数' },
                      { key: 'latestAddNum', label: '来源分均增长' },
                    ]}
                  />
                  {d.series
                    .filter((r: SourceRow) => chosen.includes(r.skinId))
                    .map((r: SourceRow) => (
                      <TrendChart
                        key={r.skinId}
                        label={r.skinName}
                        metric="value"
                        unit=""
                        rows={d.times.map((t: string, i: number) => ({
                          date: new Date(t).toLocaleString('zh-CN'),
                          value:
                            metric === 'growth'
                              ? typeof r.votes?.[i] === 'number' && typeof r.votes?.[0] === 'number'
                                ? r.votes[i] - r.votes[0]
                                : null
                              : metric === 'share'
                                ? totals[i] > 0 &&
                                  totals[0] > 0 &&
                                  typeof r.votes?.[i] === 'number' &&
                                  typeof r.votes?.[0] === 'number'
                                  ? 100 * (r.votes[i] / totals[i] - r.votes[0] / totals[0])
                                  : null
                                : (r[metric]?.[i] ?? null),
                        }))}
                      />
                    ))}
                </>
              );
            }}
          </SourceBlock>
        </>
      ) : (
        <>
          <p>公开活动互助口令；有效性、价格及兑换结果以游戏内为准。仅复制，不替你兑换或发送。</p>
          <div className="pro-toolbar">
            <button className="btn secondary" onClick={codes.refresh} disabled={codes.loading}>
              刷新口令
            </button>
            <label>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              页面可见时每 30 秒刷新
            </label>
          </div>
          {codes.error && <p role="alert">{codes.error}</p>}
          {codes.loading && <p role="status">读取活动口令…</p>}
          {codes.packet && (
            <>
              {codes.packet.warning && <p role="status">{codes.packet.warning}</p>}
              <p>来源服务时间：{codes.packet.data.serverTime ?? '未公布'}</p>
              <SourceTable
                title="活动互助口令"
                rows={codes.packet.data.items}
                columns={[
                  { key: 'cakeCodeName', label: '口令' },
                  { key: 'cakePrice', label: '来源标注分值' },
                  {
                    key: 'sourceTime',
                    label: '发布时间',
                    render: (r) => new Date(r.sourceTime).toLocaleString('zh-CN'),
                  },
                  {
                    key: 'copy',
                    label: '操作',
                    render: (r) => (
                      <button
                        className="text-btn"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              String(codes.packet!.data.copyTemplate ?? '{code}')
                                .replace('{code}', r.cakeCodeName)
                                .replace('{price}', String(r.cakePrice)),
                            );
                            setCopy('已复制 ' + r.cakeCodeName);
                          } catch {
                            setCopy('剪贴板不可用，请选中口令手动复制');
                          }
                        }}
                      >
                        复制口令
                      </button>
                    ),
                  },
                ]}
              />
              <SourceStamp packet={codes.packet} />
            </>
          )}
          <p role="status">{copy}</p>
        </>
      )}
    </>
  );
}
export default function DataHub({
  onOpen,
  draft,
  initialTab,
  onTab,
}: {
  onOpen: Open;
  draft: Draft;
  initialTab?: string;
  onTab?: (tab: string) => void;
}) {
  const [tab, setTab] = useState(initialTab ?? 'global');
  return (
    <div className="data-hub">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PUBLIC DATA / YOUR PLAYBOOK</p>
          <h1>数据与工具</h1>
          <p>从公开实战数据到你的备战决策，每一项都能核对出处。</p>
        </div>
      </div>
      <p className="data-caption">
        日统计默认按来源北京时间 9 点日更选择日期，9
        点前展示前天；可手动选日核对。活动、皮肤与历史趋势使用各自来源时间窗口。
      </p>
      <div className="pro-tabs plus-main-tabs">
        {[
          ['global', '全局与榜单'],
          ['stats', '全英雄指标'],
          ['compare', '英雄横向对比'],
          ['teaching', '教学资料与练习'],
          ['equipment', '装备全局数据'],
          ['skins', '全皮肤库'],
          ['matches', '对位与推荐'],
          ['activities', '活动动态'],
          ['power', '战力试算'],
        ].map(([v, n]) => (
          <button
            key={v}
            className={tab === v ? 'active' : ''}
            onClick={() => {
              setTab(v);
              onTab?.(v);
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="surface">
        {tab === 'global' && <GlobalData onOpen={onOpen} />}{' '}
        {tab === 'stats' && <FullStats onOpen={onOpen} />}{' '}
        {tab === 'compare' && <HeroCompare onOpen={onOpen} pool={draft.pool} />}
        {tab === 'teaching' && <TeachingLibrary />}
        {tab === 'equipment' && <EquipmentData onOpen={onOpen} />}{' '}
        {tab === 'skins' && <SkinLibrary onOpen={onOpen} />}{' '}
        {tab === 'matches' && <PublicMatchExplorer onOpen={onOpen} draft={draft} />}{' '}
        {tab === 'activities' && <ActivityData />} {tab === 'power' && <PowerCalculator />}
      </div>
    </div>
  );
}
