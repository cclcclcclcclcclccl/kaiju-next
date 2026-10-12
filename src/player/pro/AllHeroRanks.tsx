import { useEffect, useMemo, useState } from 'react';
import { heroes } from '../catalog.ts';
import type { Hero, Role } from '../model.ts';
import { ROLES } from '../model.ts';
import { Portrait } from '../ui.tsx';
import { usePro } from './context.tsx';
import { latestSnapshot, tierList } from './analytics.ts';
import { OFFICIAL_SEGMENTS, OFFICIAL_POSITIONS } from './official.ts';
import type { OfficialRankResult } from './official.ts';
import { api } from '../../api.ts';
import type { StatSnapshot } from './model.ts';

export default function AllHeroRanks({
  segment,
  onOpen,
  selectedSnapshot,
}: {
  segment: string;
  onOpen: (h: Hero, context?: { segment: string; role: string; snapshotId?: string }) => void;
  selectedSnapshot?: StatSnapshot;
}) {
  const { data } = usePro();
  const [role, setRole] = useState('全部'),
    [query, setQuery] = useState(''),
    [sort, setSort] = useState('name');
  const [view, setView] = useState<'board' | 'table'>('board'),
    [basis, setBasis] = useState<'heat' | 'strength'>('heat');
  const [state, setState] = useState<{
    segment: string;
    packets: { role: Role; result: OfficialRankResult }[];
    loading: boolean;
    failures: number;
  }>({ segment: '', packets: [], loading: false, failures: 0 });
  useEffect(() => {
    let active = true;
    const segmentId = OFFICIAL_SEGMENTS[segment];
    setState({ segment, packets: [], loading: !!segmentId, failures: 0 });
    if (segmentId)
      void Promise.allSettled(
        ROLES.map(async (role) => ({
          role,
          result: await api<OfficialRankResult>(
            `/official/hero-rank?segment=${segmentId}&position=${OFFICIAL_POSITIONS[role]}`,
          ),
        })),
      ).then((results) => {
        if (active)
          setState({
            segment,
            packets: results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
            loading: false,
            failures: results.filter((r) => r.status === 'rejected').length,
          });
      });
    return () => {
      active = false;
    };
  }, [segment]);
  const current = state.segment === segment ? state : { packets: [], loading: true, failures: 0 };
  const snapshot = selectedSnapshot ?? latestSnapshot(data.snapshots, segment);
  const tierByRole = useMemo(
    () => new Map(ROLES.map((role) => [role, snapshot ? tierList(snapshot, role) : []])),
    [snapshot],
  );
  const rows = heroes
    .filter(
      (h) =>
        (role === '全部' || h.roles.includes(role)) &&
        (!query.trim() || [h.name, h.slug, h.title].some((x) => x.includes(query.trim()))),
    )
    .map((hero) => {
      const selectedRole = (role === '全部' ? hero.roles[0] : role) as Role;
      const tier = tierByRole.get(selectedRole)?.find((r) => r.row.heroId === hero.id);
      const official = current.packets.find(
        (p) => p.role === selectedRole && p.result.data.rows.some((r) => r.heroId === hero.id),
      );
      const raw = official?.result.data.rows.find((r) => r.heroId === hero.id);
      return {
        hero,
        role: selectedRole,
        tier,
        official,
        raw,
        win: tier?.row.winRate ?? raw?.winRate,
      };
    })
    .sort((a, b) =>
      sort === 'win'
        ? (b.win ?? -1) - (a.win ?? -1)
        : sort === 'tier'
          ? (b.tier?.tier.startsWith('T') ? b.tier.score : -1) -
            (a.tier?.tier.startsWith('T') ? a.tier.score : -1)
          : a.hero.name.localeCompare(b.hero.name, 'zh-CN'),
    );
  return (
    <section className="surface all-hero-ranks" aria-label="全部英雄梯度总表">
      <div className="section-title">
        <div>
          <p className="eyebrow">COMPLETE ROSTER / 每位英雄都有入口</p>
          <h2>全部英雄 · {heroes.length} 位</h2>
        </div>
        <span className="outline-tag">当前显示 {rows.length} 位</span>
      </div>
      <p className="data-caption">
        点击英雄打开同一份英雄图鉴。没有统计的英雄仍在总表里；官方热度与开局强度分开列出，缺失数据不排成弱势。
      </p>
      <div className="rank-display-controls">
        <div className="resource-tabs" role="group" aria-label="梯度显示方式">
          <button
            aria-pressed={view === 'board'}
            className={view === 'board' ? 'active' : ''}
            onClick={() => setView('board')}
          >
            梯度看板
          </button>
          <button
            aria-pressed={view === 'table'}
            className={view === 'table' ? 'active' : ''}
            onClick={() => setView('table')}
          >
            详细数据表
          </button>
        </div>
        <label>
          看板依据
          <select value={basis} onChange={(e) => setBasis(e.target.value as 'heat' | 'strength')}>
            <option value="heat">王者营地官方热度（部分覆盖）</option>
            <option value="strength">开局综合梯度（合格统计快照）</option>
          </select>
        </label>
      </div>
      <p className="pro-notice">
        {basis === 'heat'
          ? '当前按官方分享榜的热度分组。T 标签来自官方热度，不等同于对局强度；每路最多公开 10 条，未覆盖英雄放入“暂无数据”。'
          : '当前按同分段、同分路的合格快照计算强度分。样本量或统计口径不足时保持待评级；不会拿热度填补强度。'}{' '}
        全部分路视图按英雄第一定位展示，具体分路可切换查看。
      </p>
      <div className="rank-coverage">
        <strong>
          {rows.filter((r) => (basis === 'heat' ? !!r.raw : !!r.tier?.tier.startsWith('T'))).length}{' '}
          / {rows.length}
        </strong>
        <span>
          当前筛选有{basis === 'heat' ? '官方热度' : '合格强度评级'} · 红框禁用率 ≥ 20% · 蓝框出场率
          &lt; 2.5%
        </span>
      </div>
      <div className="pro-toolbar">
        <label>
          总表分路
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {['全部', ...ROLES].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          搜索全部英雄
          <input
            value={query}
            placeholder="名称 / 拼音"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          总表排序
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">英雄名称</option>
            <option value="win">已知胜率优先</option>
            <option value="tier">已验证梯度优先</option>
          </select>
        </label>
      </div>
      {current.loading && <p role="status">正在补充五条分路的公开统计，英雄目录可先查看。</p>}
      <p className="data-caption">
        {basis === 'heat'
          ? `来源：王者营地官方公开分享榜 · ${segment} · 各路来源日期：${[...new Set(current.packets.map((p) => p.result.data.sourceUpdatedOn))].join(' / ') || '待返回'}${current.packets.some((p) => p.result.cache === 'stale') ? ' · 含更新失败的旧缓存' : ''}。统计窗口与样本量未公布。`
          : snapshot
            ? `来源：${snapshot.sourceName} · ${snapshot.patch} · ${snapshot.startDate} 至 ${snapshot.endDate}；各分路独立比较，跨分路分数不能直接解释为强度差距。`
            : '尚无合格统计快照，全部英雄仍可查看图鉴。'}
      </p>
      {current.failures > 0 && (
        <p className="data-caption" role="status">
          {current.failures} 条分路暂未读取成功；对应数据保持未知。
        </p>
      )}
      {view === 'board' && (
        <div className="tier-board" aria-label="英雄梯度分组">
          {['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', '暂无数据'].map((group) => {
            const entries = rows.filter(
              (r) =>
                (basis === 'heat'
                  ? r.raw?.heat
                  : r.tier?.tier.startsWith('T')
                    ? r.tier.tier
                    : undefined) === (group === '暂无数据' ? undefined : group),
            );
            if (!entries.length) return null;
            return (
              <section
                key={group}
                className={'tier-band ' + (group === '暂无数据' ? 'unknown' : '')}
              >
                <div className="tier-band-label">
                  <strong>{group}</strong>
                  <span>{entries.length} 位</span>
                </div>
                <div className="tier-band-heroes">
                  {entries.map((r) => {
                    const pick = basis === 'heat' ? r.raw?.pickRate : r.tier?.row.pickRate,
                      ban = basis === 'heat' ? r.raw?.banRate : r.tier?.row.banRate;
                    const win = basis === 'heat' ? r.raw?.winRate : r.tier?.row.winRate;
                    return (
                      <button
                        key={r.hero.id}
                        className={
                          'tier-portrait ' +
                          ((ban ?? 0) >= 20
                            ? 'high-ban'
                            : pick !== undefined && pick < 2.5
                              ? 'low-pick'
                              : '')
                        }
                        aria-label={'打开' + r.hero.name + '图鉴'}
                        title={`${r.hero.name} · ${r.role}\n胜率 ${win ?? '未知'}% / 出场 ${pick ?? '未知'}% / 禁用 ${ban ?? '未知'}%\n${basis === 'heat' ? (r.official?.result.data.sourceUpdatedOn ?? '暂无统计') : (snapshot?.endDate ?? '暂无快照')}`}
                        onClick={() =>
                          onOpen(r.hero, {
                            segment,
                            role: r.role,
                            snapshotId: basis === 'strength' ? snapshot?.id : undefined,
                          })
                        }
                      >
                        <Portrait hero={r.hero} />
                        <strong>{r.hero.name}</strong>
                        <small>{win === undefined ? '数据待接入' : `胜 ${win.toFixed(1)}%`}</small>
                        {basis === 'strength' && r.tier?.tier.startsWith('T') && (
                          <span className="tier-score">{r.tier.score.toFixed(1)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {view === 'table' && (
        <div className="roster-scroll">
          <table className="roster-table">
            <caption className="sr-only">{segment} 全部英雄数据与图鉴入口</caption>
            <thead>
              <tr>
                <th>英雄 / 图鉴</th>
                <th>统计分路</th>
                <th>开局梯度</th>
                <th>官方热度</th>
                <th>胜率</th>
                <th>登场率</th>
                <th>禁用率</th>
                <th>数据来源 / 日期</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ hero, role, tier, raw, official, win }) => (
                <tr key={hero.id}>
                  <td>
                    <button
                      className="hero-row"
                      onClick={() =>
                        onOpen(hero, { segment, role, snapshotId: tier ? snapshot?.id : undefined })
                      }
                      aria-label={'打开' + hero.name + '图鉴'}
                    >
                      <Portrait hero={hero} />
                      <span>
                        <strong>{hero.name}</strong>
                        <small>
                          {hero.skills.length} 项技能 · {hero.roles.join(' / ')}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>{role}</td>
                  <td>{tier?.tier ?? '待评级'}</td>
                  <td>{raw?.heat ?? '—'}</td>
                  <td>{win !== undefined ? win.toFixed(2) + '%' : '—'}</td>
                  <td>
                    {tier
                      ? tier.row.pickRate.toFixed(2) + '%'
                      : raw
                        ? raw.pickRate.toFixed(2) + '%'
                        : '—'}
                  </td>
                  <td>
                    {tier
                      ? tier.row.banRate.toFixed(2) + '%'
                      : raw
                        ? raw.banRate.toFixed(2) + '%'
                        : '—'}
                  </td>
                  <td>
                    <small>
                      {tier
                        ? `梯度与三率：${snapshot!.sourceName} · ${snapshot!.endDate}`
                        : !official
                          ? '暂无此分段统计，资料可正常查看'
                          : ''}
                      {official && (
                        <span className="block-source">
                          {tier ? '热度' : '三率与热度'}：官方分享榜 ·{' '}
                          {official.result.data.sourceUpdatedOn}
                          {official.result.cache === 'stale' ? ' · 旧缓存' : ''}
                        </span>
                      )}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
