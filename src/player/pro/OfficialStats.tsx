import { useEffect, useState } from 'react';
import { RefreshCw, ArrowUpRight, Download } from 'lucide-react';
import { api, download } from '../../api.ts';
import { heroById } from '../catalog.ts';
import type { Hero } from '../model.ts';
import { Portrait } from '../ui.tsx';
import { OFFICIAL_SEGMENTS, OFFICIAL_POSITIONS, OFFICIAL_RANK_PAGE } from './official.ts';
import type { OfficialRankResult } from './official.ts';

function useOfficialStats(segment: string, role: string) {
  const segmentId = OFFICIAL_SEGMENTS[segment];
  const position = OFFICIAL_POSITIONS[role];
  const key = `${segmentId}-${position}`;
  const supported = segmentId !== undefined && position !== undefined;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    loading: boolean;
    result?: OfficialRankResult;
    error?: string;
  }>({ key: '', loading: false });
  useEffect(() => {
    let active = true;
    if (!supported) return;
    setState({ key, loading: true });
    api<OfficialRankResult>(`/official/hero-rank?segment=${segmentId}&position=${position}`)
      .then((result) => {
        if (active) setState({ key, loading: false, result });
      })
      .catch((e) => {
        if (active) setState({ key, loading: false, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [key, segmentId, position, supported, revision]);
  const current: typeof state = state.key === key ? state : { key, loading: supported };
  return { ...current, supported, refresh: () => setRevision((v) => v + 1) };
}

function SourceDate({ result }: { result: OfficialRankResult }) {
  return (
    <p className="data-caption">
      官方更新日期：{result.data.sourceUpdatedOn} · 获取时间：
      {new Date(result.data.fetchedAt).toLocaleString('zh-CN', { hour12: false })}
      {result.cache === 'cached'
        ? ' · 30 分钟缓存内'
        : result.cache === 'stale'
          ? ' · 更新失败，保留旧记录'
          : ''}
      <br />
      官方未提供统计起止日期、英雄样本量及选禁分母；更新时间不等于统计区间。
      分路是官方榜单的筛选条件，尚未证实三率只统计该分路对局。
    </p>
  );
}

export default function OfficialStats({
  segment,
  role,
  query,
  hideLowPick,
  order,
  onOpen,
}: {
  segment: string;
  role: string;
  query: string;
  hideLowPick: boolean;
  order: string;
  onOpen: (hero: Hero, context: { segment: string; role: string }) => void;
}) {
  const { supported, loading, result, error, refresh } = useOfficialStats(segment, role);
  const needles = query
    .trim()
    .split(/[\s,，、]+/)
    .filter(Boolean);
  const rows = [...(result?.data.rows ?? [])]
    .filter(
      (r) =>
        (!needles.length || needles.some((s) => r.name.includes(s))) &&
        (!hideLowPick || r.pickRate >= 2.5),
    )
    .sort((a, b) =>
      order === 'win'
        ? b.winRate - a.winRate
        : order === 'pick'
          ? b.pickRate - a.pickRate
          : order === 'ban'
            ? b.banRate - a.banRate
            : 0,
    );
  return (
    <section className="surface official-stats" aria-label="官方公开统计">
      <div className="section-title">
        <div>
          <p className="eyebrow">LIVE SOURCE / 王者营地</p>
          <h2>官方公开英雄榜</h2>
        </div>
        {supported && (
          <button className="btn secondary" disabled={loading} onClick={refresh}>
            <RefreshCw size={15} />
            {loading ? '读取中…' : '读取官方数据'}
          </button>
        )}
        <a href={OFFICIAL_RANK_PAGE} target="_blank" rel="noreferrer">
          打开官方榜单 <ArrowUpRight size={14} />
        </a>
      </div>
      <p className="data-caption">
        {segment === '大众分段' ? '所有段位（官方原名）' : segment} · {role}。 官方 T
        级表示使用热度；开局的强度梯度在下方单独计算。
        {segment === '顶端排位' && '官方说明：每日全网平均段位最高的前 10 万场对局。'}
      </p>
      {!supported && (
        <p role="status" className="pro-notice">
          这个分段尚未找到可匿名获取的官方公开接口。现已接通所有段位、巅峰 1350+ 和顶端排位。
        </p>
      )}
      {loading && supported && <p role="status">正在读取腾讯官方公开分享榜…</p>}
      {error && (
        <p className="pro-notice" role="alert">
          {error}
        </p>
      )}
      {result && supported && (
        <>
          {result.warning && (
            <p className="pro-notice" role="status">
              {result.warning}
            </p>
          )}
          <SourceDate result={result} />
          <p className="official-coverage">
            公开接口本次返回 {result.data.rows.length} 位英雄，当前显示 {rows.length} 位。
            这是分享榜的部分数据，完整榜单需在营地查看；未上榜不代表弱势。排序与筛选只作用于已返回记录。
          </p>
          <div className="table-scroll">
            <table className="official-table">
              <caption className="sr-only">
                {segment} {role} 官方公开英雄榜
              </caption>
              <thead>
                <tr>
                  <th>英雄</th>
                  <th>官方热度</th>
                  <th>胜率</th>
                  <th>登场率</th>
                  <th>禁用率</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const hero = heroById(r.heroId);
                  return (
                    <tr key={r.heroId}>
                      <td>
                        {hero ? (
                          <button
                            className="hero-row"
                            onClick={() => onOpen(hero, { segment, role })}
                          >
                            <Portrait hero={hero} />
                            <strong>{r.name}</strong>
                          </button>
                        ) : (
                          <strong>{r.name}</strong>
                        )}
                      </td>
                      <td>
                        <span className="official-heat">{r.heat}</span>
                      </td>
                      <td>{r.winRate.toFixed(2)}%</td>
                      <td>{r.pickRate.toFixed(2)}%</td>
                      <td>{r.banRate.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length && <p role="status">当前公开记录里没有符合筛选条件的英雄。</p>}
          <div className="pro-actions">
            <button
              className="text-btn"
              onClick={() =>
                download(
                  `官方公开榜-${result.data.sourceUpdatedOn}-${segment}-${role}.json`,
                  JSON.stringify(result.data, null, 2),
                )
              }
            >
              <Download size={14} />
              导出官方数据与来源
            </button>
            <span className="data-caption">
              当前记录不直接生成开局梯度、BP 总率或进入 BP 版本评分。
            </span>
          </div>
        </>
      )}
    </section>
  );
}

export function OfficialHeroStats({
  heroId,
  segment,
  role,
}: {
  heroId: number;
  segment: string;
  role: string;
}) {
  const { supported, loading, result, error } = useOfficialStats(segment, role);
  if (!supported) return null;
  const row = result?.data.rows.find((r) => r.heroId === heroId);
  return (
    <div className="official-hero-stats">
      <h4>王者营地 · 官方公开表现</h4>
      {loading && <p role="status">正在读取官方统计…</p>}
      {error && <p className="data-caption">{error}</p>}
      {result && (
        <>
          {result.warning && <p className="pro-notice">{result.warning}</p>}
          {row ? (
            <p className="official-hero-values">
              热度 {row.heat} · 胜率 {row.winRate.toFixed(2)}% · 登场率 {row.pickRate.toFixed(2)}% ·
              禁用率 {row.banRate.toFixed(2)}%
            </p>
          ) : (
            <p className="data-caption">
              本次官方分享榜的 {result.data.rows.length} 条记录未覆盖此英雄，不据此判断强弱。
            </p>
          )}
          <SourceDate result={result} />
          <a href={OFFICIAL_RANK_PAGE} target="_blank" rel="noreferrer">
            核对官方分享榜 ↗
          </a>
          <p className="data-caption">
            官方热度与开局强度梯度含义不同；未公布的样本与口径保持未知。
          </p>
        </>
      )}
    </div>
  );
}
