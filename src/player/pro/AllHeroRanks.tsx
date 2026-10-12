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

export default function AllHeroRanks({
  segment,
  onOpen,
}: {
  segment: string;
  onOpen: (h: Hero, context?: { segment: string; role: string; snapshotId?: string }) => void;
}) {
  const { data } = usePro();
  const [role, setRole] = useState('全部'),
    [query, setQuery] = useState(''),
    [sort, setSort] = useState('name');
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
  const snapshot = latestSnapshot(data.snapshots, segment);
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
      {current.failures > 0 && (
        <p className="data-caption" role="status">
          {current.failures} 条分路暂未读取成功；对应数据保持未知。
        </p>
      )}
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
    </section>
  );
}
