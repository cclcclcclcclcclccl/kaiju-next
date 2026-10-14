import TianyuanLive from './TianyuanLive.tsx';
import StatImport from './StatImport.tsx';
import StatHistory from './StatHistory.tsx';
import OfficialStats from './OfficialStats.tsx';
import AllHeroRanks from './AllHeroRanks.tsx';
import DataUpdates from './DataUpdates.tsx';
import { aggregateObservation } from './environment.ts';
import { withPublicReference, publicReference, publicReferences } from './publicReferences.ts';
import { scopeIssue, scopeLabel } from './statistics.ts';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Download, Upload, Info } from 'lucide-react';
import { heroes, heroById } from '../catalog.ts';
import { ROLES } from '../model.ts';
import type { Hero } from '../model.ts';
import { SEGMENTS } from './model.ts';
import type { StatSnapshot } from './model.ts';
import { tierList, sortedSnapshots, usableSnapshot } from './analytics.ts';
import { usePro } from './context.tsx';
import { api, download } from '../../api.ts';
import { Portrait, Modal, Empty } from '../ui.tsx';
export default function Leaderboard({
  onOpen,
}: {
  onOpen: (h: Hero, context?: { segment: string; role: string; snapshotId?: string }) => void;
}) {
  const { data, refresh } = usePro();
  const [segment, setSegment] = useState<string>(SEGMENTS[0]),
    [role, setRole] = useState<string>('中路'),
    [selected, setSelected] = useState(''),
    [query, setQuery] = useState(''),
    [hideLowPick, setHideLowPick] = useState(false),
    [order, setOrder] = useState('tier'),
    [importing, setImporting] = useState(false),
    [sourceMessage, setSourceMessage] = useState(''),
    [method, setMethod] = useState(false),
    [demo, setDemo] = useState(false);
  const [live, setLive] = useState(true);
  const [officialRevision, setOfficialRevision] = useState('');
  const snapshots = sortedSnapshots(withPublicReference(data.snapshots), segment),
    snapshot = snapshots.find((s) => s.id === selected) ?? snapshots[0];
  const example = useMemo<StatSnapshot>(
    () => ({
      id: 'demo',
      importedAt: new Date().toISOString(),
      title: '合成算法演示',
      segment: '大众分段',
      patch: '演示，无真实版本',
      startDate: '2026-10-01',
      endDate: '2026-10-07',
      sourceName: '合成示例，非实际游戏数据',
      sourceUrl: 'https://example.invalid',
      denominator: 'match',
      winRateScope: 'segment',
      winRateWindow: 'range',
      rows: heroes
        .filter((h) => h.roles.includes(role))
        .slice(0, 10)
        .map((h, i) => ({
          heroId: h.id,
          role: role as (typeof ROLES)[number],
          winRate: 47 + i * 0.6,
          pickRate: 3 + i,
          banRate: i * 1.3,
          games: i === 0 ? 25 : 1000 + i * 500,
        })),
    }),
    [role],
  );
  const shown = demo ? example : snapshot;
  const allRanking = shown ? tierList(shown, role) : [];
  const ranking = allRanking
    .filter(
      (r) =>
        (!query.trim() ||
          query
            .trim()
            .split(/[\s,，]+/)
            .some((q) => heroById(r.row.heroId)?.name.includes(q))) &&
        (!hideLowPick || r.row.pickRate >= 2.5),
    )
    .sort((a, b) =>
      order === 'tier'
        ? Number(b.tier.startsWith('T')) - Number(a.tier.startsWith('T')) ||
          b.score - a.score ||
          b.row.winRate - a.row.winRate
        : order === 'win'
          ? b.row.winRate - a.row.winRate
          : order === 'pick'
            ? b.row.pickRate - a.row.pickRate
            : order === 'ban'
              ? b.row.banRate - a.row.banRate
              : (b.bp ?? -1) - (a.bp ?? -1),
    );
  const template = () =>
    download(
      '开局-统计导入模板.json',
      JSON.stringify(
        {
          title: '请填写数据标题',
          segment: '大众分段',
          patch: '请填写游戏版本',
          startDate: '2026-10-01',
          endDate: '2026-10-07',
          sourceName: '请填写数据发布者',
          sourceUrl: 'https://请替换为实际来源',
          denominator: 'unknown',
          winRateScope: 'unknown',
          winRateWindow: 'unknown',
          scopeNotes: '请按来源核对胜率人群、时间范围与选禁分母',
          rows: [
            {
              heroId: 109,
              role: '中路',
              winRate: null,
              pickRate: null,
              banRate: null,
              games: null,
            },
          ],
        },
        null,
        2,
      ),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">META / KNOW THE CONTEXT</p>
          <h1>强度，要放回你的分段看。</h1>
          <p>分段、分路、版本与来源始终一起展示。梯度分不是对局胜率。</p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setImporting(true);
          }}
        >
          <Upload size={16} />
          导入统计快照
        </button>
      </div>
      <div className="resource-tabs" aria-label="榜单数据来源">
        <button className={live ? 'active' : ''} onClick={() => setLive(true)}>
          天元联网全榜
        </button>
        <button className={!live ? 'active' : ''} onClick={() => setLive(false)}>
          历史快照与官方榜
        </button>
      </div>
      {live ? (
        <TianyuanLive onOpen={onOpen} />
      ) : (
        <>
          <DataUpdates onUpdated={setOfficialRevision} />
          <div className="pro-toolbar">
            <label>
              统计分段
              <select
                aria-label="统计分段"
                value={segment}
                onChange={(e) => {
                  setSegment(e.target.value);
                  setSelected('');
                  setDemo(false);
                }}
              >
                {SEGMENTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              分路
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              数据批次
              <select
                aria-label="数据批次"
                value={snapshot?.id ?? ''}
                onChange={(e) => setSelected(e.target.value)}
              >
                {!snapshots.length && <option value="">尚无此分段数据</option>}
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id === publicReference.id ? '天元之弈133位总体记录' : s.title} · {s.endDate}
                  </option>
                ))}
              </select>
            </label>
            <label>
              找英雄
              <input
                aria-label="搜索梯度英雄"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="英雄名称，可用空格或逗号分隔"
              />
            </label>
            <label>
              排序依据
              <select
                aria-label="统计排序依据"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              >
                <option value="tier">综合梯度</option>
                <option value="win">胜率</option>
                <option value="pick">出场率</option>
                <option value="ban">禁用率</option>
                <option value="bp">BP 率</option>
              </select>
            </label>
            <button className="btn secondary" onClick={() => setMethod(true)}>
              <Info size={16} />
              怎么算的
            </button>
            <button className="text-btn" onClick={() => setDemo(!demo)}>
              {demo ? '退出合成演示' : '查看算法演示'}
            </button>
          </div>
          <AllHeroRanks
            segment={segment}
            onOpen={onOpen}
            selectedSnapshot={snapshot}
            refreshToken={officialRevision}
          />
          {segment === publicReference.segment && snapshot?.id !== publicReference.id && (
            <button
              className="btn secondary"
              onClick={() => {
                setSelected(publicReference.id);
                setDemo(false);
              }}
            >
              查看天元之弈公开参考 · {aggregateObservation.rows.length} 位英雄
            </button>
          )}
          {snapshot && publicReferences.some((r) => r.id === snapshot.id) && (
            <p className="pro-notice">
              当前是随项目附带的真实页面观察，数据日 {snapshot.endDate}。
              {snapshot.id === publicReference.id
                ? '上方总表覆盖133位英雄，其中132位胜率可用；下方保留96位单一分路标签的原始快照子集供核对。'
                : `历史批次收录${snapshot.rows.length}位英雄。`}
              不是实时榜单；此参考不写入你的档案。
            </p>
          )}
          <label className="check-control">
            <input
              type="checkbox"
              checked={hideLowPick}
              onChange={(e) => setHideLowPick(e.target.checked)}
            />
            隐藏出场率低于 2.5% 的英雄（只筛选显示，不重算梯度）
          </label>
          <OfficialStats
            key={officialRevision}
            segment={segment}
            role={role}
            query={query}
            hideLowPick={hideLowPick}
            order={order}
            onOpen={onOpen}
          />
          <h2 className="snapshot-heading">
            {snapshot?.id === publicReference.id && !demo
              ? '原始快照子集 · 按来源分路标签筛选'
              : '我的统计快照 · 开局梯度'}
          </h2>
          {demo && (
            <div className="pro-notice">
              当前是明确标注的合成数据，用于检查算法，不代表真实英雄强度，不会保存或进入 BP。
            </div>
          )}
          {shown && (
            <div className="source-strip">
              <strong>
                {shown.title} · {shown.patch}
              </strong>
              <span>
                {shown.startDate} 至 {shown.endDate} · {shown.sourceName}
              </span>
              {!demo &&
                (/^https?:/.test(shown.sourceUrl) ? (
                  <a href={shown.sourceUrl} target="_blank" rel="noreferrer">
                    核对来源 <ArrowUpRight size={13} />
                  </a>
                ) : (
                  <button
                    className="text-btn"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shown.sourceUrl);
                        setSourceMessage('小程序口令已复制，请在微信中打开核对');
                      } catch {
                        setSourceMessage(shown.sourceUrl);
                      }
                    }}
                  >
                    复制小程序来源口令
                  </button>
                ))}
              {!demo && (
                <button
                  className="text-btn"
                  onClick={() => {
                    const { id, importedAt, ...input } = shown;
                    download('开局-统计快照.json', JSON.stringify(input, null, 2));
                  }}
                >
                  导出这批数据
                </button>
              )}
            </div>
          )}
          {shown && !demo && !usableSnapshot(shown) && (
            <p className="pro-notice">
              这批统计距今超过 14 天或日期异常，仅供历史比较，已退出当前 BP 版本评分。即使在 14
              天内，也请核对版本是否发生调整。
            </p>
          )}
          {shown && (
            <p className="data-caption">
              {scopeLabel(shown)}
              {shown.scopeNotes ? `。${shown.scopeNotes}` : ''}
            </p>
          )}
          {shown && scopeIssue(shown) && (
            <p className="pro-notice" role="status">
              {scopeIssue(shown)}
            </p>
          )}
          {shown && (
            <p className="data-caption">
              当前比较覆盖本分路 {allRanking.length} 位英雄，其中{' '}
              {allRanking.filter((r) => r.tier.startsWith('T')).length}{' '}
              位满足梯度样本要求。未覆盖的英雄不能据此判为弱势。
            </p>
          )}
          {sourceMessage && (
            <p role="status" className="data-caption">
              {sourceMessage}
            </p>
          )}
          {!shown ? (
            <Empty
              title="这个分段还没有可靠统计"
              description="上方可查看已接通的官方公开榜。自己的梯度计算需要可核对的统计口径和样本量；可录入有出处的统计表，缺失值保持未知。"
              action={
                <button className="btn secondary" onClick={template}>
                  <Download size={15} />
                  下载导入模板
                </button>
              }
            />
          ) : (
            <div className="surface table-scroll">
              <table className="pro-table">
                <caption className="sr-only">
                  {segment} {role} 英雄梯度
                </caption>
                <thead>
                  <tr>
                    <th>英雄 / 梯度</th>
                    <th>梯度分</th>
                    <th>胜率</th>
                    <th>出场率</th>
                    <th>禁用率</th>
                    <th>BP 率</th>
                    <th>样本 / 95%区间</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.row.heroId}>
                      <td>
                        <button
                          className="hero-row"
                          onClick={() =>
                            onOpen(heroById(r.row.heroId)!, {
                              segment,
                              role,
                              snapshotId: demo ? undefined : shown.id,
                            })
                          }
                        >
                          <span className="rank-number">{i + 1}</span>
                          <Portrait hero={heroById(r.row.heroId)} />
                          <span>
                            <strong>{heroById(r.row.heroId)?.name}</strong>
                            <small className={'tier tier-' + r.tier}>{r.tier}</small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <strong className="gold">
                          {r.tier.startsWith('T') ? r.score.toFixed(1) : '—'}
                        </strong>
                        <small>
                          {r.tier.startsWith('T')
                            ? r.parts
                                .map((p) => p.label + Math.round(p.weight * 100) + '%')
                                .join(' · ')
                            : r.tier === '口径待核对'
                              ? '先核对指标口径，仅展示原始数值'
                              : '样本未满足梯度要求，可按原始指标排序'}
                        </small>
                      </td>
                      <td>{r.row.winRate.toFixed(2)}%</td>
                      <td>{r.row.pickRate.toFixed(2)}%</td>
                      <td>{r.row.banRate.toFixed(2)}%</td>
                      <td>{r.bp === null ? '—' : r.bp.toFixed(2) + '%'}</td>
                      <td>
                        {r.row.games?.toLocaleString() ?? '场次未知'}
                        <small>
                          {r.interval
                            ? r.interval.map((v) => v.toFixed(1)).join('–') + '%'
                            : r.confidence}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!ranking.length && (
                <p className="muted">
                  {allRanking.length
                    ? '没有符合当前搜索或出场率筛选的英雄。'
                    : '该快照没有此分路的数据。'}
                </p>
              )}
            </div>
          )}
          {shown && !demo && allRanking.length > 0 && (
            <StatHistory
              key={shown.id + role}
              current={shown}
              snapshots={data.snapshots}
              role={role}
            />
          )}
          <p className="data-caption">
            导入数据仍需核对真实性和统计口径。混合或未核对的口径不会进入梯度与 BP
            评分；只有确认同一对局分母才计算 BP 率。样本不足或缺失场次时不赋予正式 T
            梯度。网络评价仅作为带出处的辅助信号。
          </p>
        </>
      )}
      {method && (
        <Modal title="梯度算法 v1 · 可解释、可复算" onClose={() => setMethod(false)} wide>
          <div className="pro-prose">
            <p>
              先核对胜率统计人群和时间范围、出场与禁用分母，再在同一分段、版本、日期范围及分路内比较。版本累计胜率或混合人群只展示原始指标。胜率按
              500 场、50% 的先验收缩，避免少量对局登顶；同时显示原始胜率与 Wilson 95% 区间。
            </p>
            <p>
              收缩胜率 60%、出场率 15%、禁用率 15%。同口径战力名次和带出处的网络评价各最多占
              5%；只有同批次全部合格英雄均提供该信号时才纳入，缺项则整项停用并统一归一化权重。各项先转为合格样本的相对百分位。
            </p>
            <p>
              T0 ≥85，T1 ≥65，T2 ≥40，T3 ≥20，其余 T4。需要本分路至少 5 个英雄均达到 500
              场，才显示梯度。只代表当前快照覆盖范围；超过 14 天的统计退出 BP
              评分。阈值、时效与权重是项目设定，尚未经实战效果校准。
            </p>
            <p>
              热度不等于强度，高禁用也可能来自体验与偏好；战力排行需要相同统计人群，不能拿不同英雄的地区标分直接比较。
            </p>
          </div>
        </Modal>
      )}
      {importing && (
        <StatImport
          segment={segment}
          role={role}
          onClose={() => setImporting(false)}
          onSaved={async (next, id) => {
            await refresh();
            setSegment(next);
            setSelected(id);
            setLive(false);
            setDemo(false);
            setImporting(false);
          }}
        />
      )}
    </>
  );
}
