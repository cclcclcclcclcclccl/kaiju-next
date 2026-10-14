import { useState } from 'react';
import type { z } from 'zod';
import { heroById, heroes } from '../catalog.ts';
import type { Hero } from '../model.ts';
import { ROLES } from '../model.ts';
import { Portrait } from '../ui.tsx';
import { useSource, Provenance } from './TianyuanLive.tsx';
import { sourceDate, TIANYUAN_MODES, tianyuanTierSchema } from './tianyuan.ts';
import type { TianyuanStat } from './tianyuan.ts';
import { sourceBoard, sourceTierDate, SOURCE_TIERS } from './publicBoard.ts';
import SourceHealth from './SourceHealth.tsx';

const percent = (n: number | null | undefined) => (n == null ? '未公布' : n.toFixed(2) + '%');
const validDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
export default function PublicLeaderboard({
  onOpen,
}: {
  onOpen: (hero: Hero, context?: { segment: string; role: string; snapshotId?: string }) => void;
}) {
  const [segment, setSegment] = useState('巅峰千强');
  const [date, setDate] = useState(sourceDate());
  const [tierDate, setTierDate] = useState(sourceTierDate());
  const [role, setRole] = useState('全部');
  const [query, setQuery] = useState('');
  const [basis, setBasis] = useState<'tier' | 'stats'>('tier');
  const [sort, setSort] = useState('tier');
  const [table, setTable] = useState(false);
  const stats = useSource<TianyuanStat[]>(
    validDate(date) ? { kind: 'stats', date, mode: TIANYUAN_MODES[segment] } : undefined,
  );
  const tiers = useSource<z.infer<typeof tianyuanTierSchema>>(
    validDate(tierDate) ? { kind: 'tier', date: tierDate } : undefined,
  );
  const byId = new Map(
    sourceBoard(tiers.packet?.data.tiers ?? [], stats.packet?.data ?? []).map((r) => [
      r.tier.heroId,
      r,
    ]),
  );
  const sourceRows = sourceBoard(tiers.packet?.data.tiers ?? [], stats.packet?.data ?? [], role);
  const rows = (
    basis === 'tier'
      ? sourceRows.map((r) => ({
          id: r.tier.heroId,
          name: r.tier.heroName,
          roles: r.tier.role,
          stat: r.stat,
          source: r,
        }))
      : (stats.packet?.data ?? [])
          .filter((r) => role === '全部' || r.roles.includes(role))
          .map((r) => ({
            id: r.heroId,
            name: r.heroName,
            roles: r.roles,
            stat: r,
            source: byId.get(r.heroId),
          }))
  )
    .filter((r) => r.name.includes(query.trim()))
    .sort((a, b) =>
      sort === 'tier'
        ? Number(a.source?.secondary) - Number(b.source?.secondary) ||
          (b.source?.tier.finalNormalizedTierScore ?? -1) -
            (a.source?.tier.finalNormalizedTierScore ?? -1) ||
          (b.source?.tier.trueHeroPowerInRole ?? -1) - (a.source?.tier.trueHeroPowerInRole ?? -1) ||
          a.id - b.id
        : sort === 'name'
          ? a.name.localeCompare(b.name, 'zh-CN')
          : ((sort === 'win'
              ? b.stat?.winRate
              : sort === 'ban'
                ? b.stat?.banRate
                : b.stat?.pickRate) ?? -1) -
              ((sort === 'win'
                ? a.stat?.winRate
                : sort === 'ban'
                  ? a.stat?.banRate
                  : a.stat?.pickRate) ?? -1) || a.id - b.id,
    );
  const open = (r: (typeof rows)[number]) => {
    const hero = heroById(r.stat?.baseHeroId ?? r.id);
    if (hero)
      onOpen(hero, {
        segment,
        role,
        snapshotId: `tianyuan:${date}:${TIANYUAN_MODES[segment]}:${r.id}:${tierDate}`,
      });
  };
  const grouped = basis === 'tier' && sort === 'tier';
  return (
    <section className="surface tianyuan-live" aria-label="天元之弈联网全榜">
      <div className="section-title">
        <div>
          <p className="eyebrow">SOURCE RANKING / 原始梯度与分段数据</p>
          <h2>英雄梯度 · 天元来源榜</h2>
        </div>
        <button
          className="btn secondary"
          onClick={() => {
            stats.reload();
            tiers.reload();
          }}
        >
          重新读取
        </button>
      </div>
      <p className="pro-notice">
        T
        档与分数采用天元之弈综合梯度，按原站公开分数分档、排序，不再使用开局实验评分替代。原站标注“算法测试中”。综合梯度没有分段参数；下方分段只切换三率，不能把它称为该分段独立梯度。
      </p>
      <div className="pro-toolbar">
        <label>
          来源梯度日期
          <input
            type="date"
            value={tierDate}
            max={sourceTierDate()}
            onChange={(e) => setTierDate(e.target.value)}
          />
        </label>
        <label>
          联网榜单分段
          <select value={segment} onChange={(e) => setSegment(e.target.value)}>
            {Object.keys(TIANYUAN_MODES).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          联网数据日期
          <input
            type="date"
            value={date}
            max={sourceDate()}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          联网榜单分路
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {['全部', ...ROLES].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          联网英雄搜索
          <input value={query} placeholder="英雄名称" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          联网排序
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="tier">天元梯度分</option>
            <option value="pick">出场率</option>
            <option value="ban">禁用率</option>
            <option value="win">胜率</option>
            <option value="name">名称</option>
          </select>
        </label>
      </div>
      <p className="data-caption">
        梯度日期 {tierDate} · 三率查询日 {date} · {segment}
        。梯度与三率分别注明日期，匿名三率通常只能查询前一日。分路是来源定位标签；未发布的独立分段梯度不补造。
      </p>
      <div className="resource-tabs">
        <button
          className={basis === 'tier' ? 'active' : ''}
          onClick={() => {
            setBasis('tier');
            setSort('tier');
          }}
        >
          天元来源梯度
        </button>
        <button
          className={basis === 'stats' ? 'active' : ''}
          onClick={() => {
            setBasis('stats');
            setSort('pick');
          }}
        >
          真实三率全榜
        </button>
        <button onClick={() => setTable(!table)}>
          {table ? '切回头像看板' : '查看完整数据表'}
        </button>
      </div>
      {(!validDate(date) || !validDate(tierDate)) && <p role="alert">请选择有效日期。</p>}
      {(tiers.loading || stats.loading) && (
        <p role="status">正在读取来源记录；梯度与三率分别加载……</p>
      )}
      {tiers.error && (
        <p role="alert">
          梯度读取失败：{tiers.error}；没有用其他日期或示例数据填充。三率仍可独立查看。
        </p>
      )}
      {stats.error && (
        <p role="alert">
          三率读取失败：{stats.error}；没有用其他日期或示例数据填充。来源梯度仍可独立查看。
        </p>
      )}
      <div className="rank-coverage">
        <strong>
          {tiers.packet?.data.tiers.length ?? 0} / {heroes.length}
        </strong>
        <span>
          来源梯度记录 · 三率 {stats.packet?.data.length ?? 0} 条（含形态） · 当前筛选 {rows.length}{' '}
          条
        </span>
      </div>
      {segment === '巅峰千强' && (
        <p className="data-caption">
          千强来源说明：QQ双区各分路约千名选手的观察范围；胜率与选禁人群、累计窗口未完成独立核验，不混入顶端排位胜率，不合成
          BP 率。
        </p>
      )}
      {tiers.packet && <Provenance packet={tiers.packet} />}
      {stats.packet && <Provenance packet={stats.packet} />}
      {table ? (
        <div className="roster-scroll">
          <table className="roster-table">
            <caption>
              天元原始梯度与分段三率 · 梯度 {tierDate} · 三率 {date} {segment}
            </caption>
            <thead>
              <tr>
                {[
                  '英雄',
                  '天元梯度',
                  '来源分数',
                  '来源分路',
                  '胜率',
                  '出场率',
                  '禁用率',
                  'Q区国十战力',
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button className="text-btn" onClick={() => open(r)}>
                      {r.name}
                    </button>
                  </td>
                  <td>{r.source?.label ?? '未评级'}</td>
                  <td>{r.source?.tier.finalNormalizedTierScore.toFixed(2) ?? '未公布'}</td>
                  <td>{r.roles}</td>
                  <td>{percent(r.stat?.winRate)}</td>
                  <td>{percent(r.stat?.pickRate)}</td>
                  <td>{percent(r.stat?.banRate)}</td>
                  <td>{r.stat?.qAreaTop10Power ?? '未公布'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="tier-board">
          {(grouped ? SOURCE_TIERS : ['指标排序']).map((group) => {
            const entries = rows.filter((r) => !grouped || r.source?.label === group);
            return (
              entries.length > 0 && (
                <section className="tier-band" key={group}>
                  <div className="tier-band-label">
                    <strong>{group}</strong>
                    <span>{entries.length} 位</span>
                  </div>
                  <div className="tier-band-heroes">
                    {entries.map((r) => (
                      <button
                        className={
                          'tier-portrait ' +
                          (r.source?.tier.highBan
                            ? 'high-ban'
                            : r.source?.tier.lowPick
                              ? 'low-pick'
                              : '')
                        }
                        key={r.id}
                        aria-label={'查看' + r.name + '公开详情'}
                        onClick={() => open(r)}
                      >
                        <Portrait hero={heroById(r.stat?.baseHeroId ?? r.id)} />
                        <strong>{r.name}</strong>
                        <span className="tier-score">
                          {r.source?.tier.finalNormalizedTierScore.toFixed(2) ?? '未评级'}
                        </span>
                        <small>
                          天元 {r.source?.label ?? '未评级'}
                          {r.source?.secondary ? ' · 次分路' : ''}
                        </small>
                        <small>胜 {percent(r.stat?.winRate)}</small>
                        <small>出 {percent(r.stat?.pickRate)}</small>
                        <small>禁 {percent(r.stat?.banRate)}</small>
                      </button>
                    ))}
                  </div>
                </section>
              )
            );
          })}
        </div>
      )}
      {!rows.length && !tiers.loading && !stats.loading && (
        <p>当前来源或筛选没有记录，请调整筛选或重试。</p>
      )}
      <SourceHealth />
      <details className="environment-method">
        <summary>为什么不再默认使用开局强度 v2</summary>
        <p>
          旧算法以总体胜率为主，未完成玩家水平、操作难度、熟练度和实际比赛效果校准，且千强模式混入顶端排位胜率。固定阈值产生的
          T
          档不足以代表实战强度，现已退出产品默认榜单和英雄详情。历史实验代码保留供复核，不修改真实来源数据来迎合结论。
        </p>
        <a href="https://tianyuanzhiyi.com/tier" target="_blank" rel="noreferrer">
          核对天元原始梯度页面 ↗
        </a>
      </details>
    </section>
  );
}
