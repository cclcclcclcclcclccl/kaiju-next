import { useEffect, useState } from 'react';
import type { z } from 'zod';
import { api, download } from '../../api.ts';
import { heroes, heroById } from '../catalog.ts';
import type { Hero } from '../model.ts';
import { ROLES } from '../model.ts';
import { Portrait } from '../ui.tsx';
import {
  sourceDate,
  TIANYUAN_MODES,
  tianyuanSkinSchema,
  tianyuanDurationSchema,
  tianyuanAnalysisSchema,
  tianyuanEquipSchema,
  tianyuanCombinedSchema,
  tianyuanTierSchema,
} from './tianyuan.ts';
import type { TianyuanPacket, TianyuanStat, TianyuanQuery } from './tianyuan.ts';
import { strengthRanks, STRENGTH_TIERS, STRENGTH_VERSION } from './strength.ts';
import { StrengthExplanation, StrengthMethod } from './StrengthExplain.tsx';

export function useSource<T>(query: TianyuanQuery | undefined) {
  const key = query
    ? new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()
    : '';
  const [state, setState] = useState<{ key: string; packet?: TianyuanPacket<T>; error?: string }>({
    key: '',
  });
  const [revision, reload] = useState(0);
  useEffect(() => {
    let active = true;
    if (!key) return;
    setState({ key });
    void api<TianyuanPacket<T>>('/tianyuan?' + key)
      .then((packet) => {
        if (active) setState({ key, packet });
      })
      .catch((e) => {
        if (active) setState({ key, error: (e as Error).message });
      });
    return () => {
      active = false;
    };
  }, [key, revision]);
  const result = state.key === key ? state : { key };
  return {
    ...result,
    loading: !!key && !result.packet && !result.error,
    reload: () => reload((n) => n + 1),
  };
}
const percentage = (value: number | null | undefined) =>
  value == null ? '未公布' : value.toFixed(2) + '%';
export function Provenance({ packet }: { packet: TianyuanPacket }) {
  return (
    <details className="source-proof">
      <summary>
        {packet.cache === 'stale' ? '更新失败 · 正在显示旧缓存 · ' : ''}
        {packet.query.kind === 'stats'
          ? Object.entries(TIANYUAN_MODES).find(([, mode]) => mode === packet.query.mode)?.[0] +
            ' · '
          : ''}
        数据来源、时间与原始凭据
      </summary>
      <p>
        <a href={packet.url} target="_blank" rel="noreferrer">
          天元之弈数据站 · 原始公开接口 ↗
        </a>{' '}
        · 独立第三方，非腾讯官方后台。
      </p>
      <p>
        查询日期：{packet.requestedDate ?? '接口未提供日期选择'}；来源更新时间：
        {packet.sourceUpdatedAt ?? '该接口未返回'}；实际获取：
        {new Date(packet.fetchedAt).toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          hour12: false,
        })}
        （北京时间）。
      </p>
      <p>来源声明来自公开对局；尚未独立审计原始对局抽样与清洗。SHA-256：{packet.rawSha256}</p>
      {packet.warning && <p role="status">{packet.warning}</p>}
      <button
        className="text-btn"
        onClick={() => download('开局-天元公开数据.json', JSON.stringify(packet, null, 2))}
      >
        导出当前数据与来源
      </button>
    </details>
  );
}
export default function TianyuanLive({
  onOpen,
}: {
  onOpen: (h: Hero, context?: { segment: string; role: string; snapshotId?: string }) => void;
}) {
  const [segment, setSegment] = useState('巅峰千强'),
    [date, setDate] = useState(sourceDate()),
    [query, setQuery] = useState(''),
    [role, setRole] = useState('全部'),
    [basis, setBasis] = useState('own'),
    [view, setView] = useState('board'),
    [sort, setSort] = useState('strength');
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  const stats = useSource<TianyuanStat[]>(
    validDate ? { kind: 'stats', date, mode: TIANYUAN_MODES[segment] } : undefined,
  );
  const tier = useSource<z.infer<typeof tianyuanTierSchema>>(
    validDate && basis === 'tier' && segment === '巅峰千强' ? { kind: 'tier', date } : undefined,
  );
  const packet = stats.packet;
  const top = useSource<TianyuanStat[]>(
    validDate && basis === 'own' && segment === '巅峰千强'
      ? { kind: 'stats', date, mode: 4 }
      : undefined,
  );
  const ranking = packet
    ? strengthRanks(packet.data, TIANYUAN_MODES[segment], role, top.packet?.data)
    : undefined;
  const ownById = new Map(ranking?.rows.map((r) => [r.row.heroId, r]));
  const rankById = new Map(tier.packet?.data.tiers.map((r) => [r.heroId, r]));
  const rows = (basis === 'own' ? (ranking?.rows.map((r) => r.row) ?? []) : (packet?.data ?? []))
    .filter(
      (r) =>
        (role === '全部' || r.roles.includes(role)) &&
        (!query.trim() || r.heroName.includes(query.trim())),
    )
    .sort((a, b) =>
      basis === 'own' && sort === 'strength'
        ? (ownById.get(b.heroId)?.score ?? -1) - (ownById.get(a.heroId)?.score ?? -1) ||
          a.heroId - b.heroId
        : basis === 'tier'
          ? (rankById.get(a.heroId)?.rankInRole ?? 999) -
            (rankById.get(b.heroId)?.rankInRole ?? 999)
          : sort === 'name'
            ? a.heroName.localeCompare(b.heroName, 'zh-CN')
            : sort === 'win'
              ? (b.winRate ?? -1) - (a.winRate ?? -1)
              : sort === 'ban'
                ? b.banRate - a.banRate
                : b.pickRate - a.pickRate,
    );
  const open = (r: TianyuanStat) => {
    const hero = heroById(r.baseHeroId ?? r.heroId);
    if (hero)
      onOpen(hero, {
        segment,
        role,
        snapshotId: `tianyuan:${date}:${TIANYUAN_MODES[segment]}:${r.heroId}`,
      });
  };
  const groupedOwn = basis === 'own' && sort === 'strength';
  const groups = groupedOwn
    ? [...STRENGTH_TIERS, '待评估']
    : basis === 'tier'
      ? [...STRENGTH_TIERS, '未评级']
      : [basis === 'own' ? '指标排序' : '公开三率'];
  return (
    <section className="surface tianyuan-live" aria-label="天元之弈联网全榜">
      <div className="section-title">
        <div>
          <p className="eyebrow">PUBLIC DATA / 可追溯的全英雄榜</p>
          <h2>开局强度梯度</h2>
        </div>
        <button
          className="btn secondary"
          onClick={() => {
            stats.reload();
            tier.reload();
            top.reload();
          }}
        >
          重新读取
        </button>
      </div>
      <p className="data-caption">
        数据来源：天元之弈公开接口 · 强度计算：{STRENGTH_VERSION}
        。先看适合当前环境的英雄，再检查评分依据。
      </p>
      <div className="pro-toolbar">
        <label>
          联网榜单分段
          <select
            value={segment}
            onChange={(e) => {
              setSegment(e.target.value);
              setBasis('own');
              setSort('strength');
            }}
          >
            {Object.keys(TIANYUAN_MODES).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          联网数据日期
          <input
            type="date"
            max={sourceDate()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          联网榜单分路
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {['全部', ...ROLES].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          联网英雄搜索
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="英雄名称" />
        </label>
        <label>
          联网排序
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {basis === 'own' && <option value="strength">开局强度</option>}
            <option value="pick">出场率</option>
            <option value="ban">禁用率</option>
            <option value="win">胜率</option>
            <option value="name">名称</option>
          </select>
        </label>
      </div>
      <div className="resource-tabs">
        <button
          className={basis === 'own' ? 'active' : ''}
          onClick={() => {
            setBasis('own');
            setSort('strength');
          }}
        >
          开局强度梯度
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
        <button
          className={basis === 'tier' ? 'active' : ''}
          disabled={segment !== '巅峰千强'}
          onClick={() => {
            setBasis('tier');
            setSort('pick');
          }}
        >
          天元来源梯度
        </button>
        <button onClick={() => setView(view === 'board' ? 'table' : 'board')}>
          {view === 'board' ? '查看完整数据表' : '切回头像看板'}
        </button>
      </div>
      {basis === 'own' && (
        <>
          <StrengthMethod mode={TIANYUAN_MODES[segment]} />
          <p className="strength-summary">
            {ranking
              ? `${ranking.rows.filter((r) => r.score !== null).length} 位已评级 · ${ranking.rows.filter((r) => r.sensitive).length} 位在参数检查中跨档`
              : '等待读取真实数据'}{' '}
            · 点击英雄可看加减分与排名范围。
          </p>
          {segment === '巅峰千强' && (
            <p className="pro-notice">
              千强代理强度：采用同日顶端排位胜率参考，结合千强选禁环境；不是千强独立胜率估计。
            </p>
          )}
          {top.packet && <Provenance packet={top.packet} />}
        </>
      )}
      <p className="pro-notice">
        {segment === '巅峰千强'
          ? '千强页面胜率是全量人群、版本累计；选禁数据与它的统计人群不完全相同。'
          : '该分段由天元之弈转发统计；完整上游链、统计窗口和样本量尚未证实。'}{' '}
        分路为来源定位标签，三率是总体观察。
        {basis === 'tier'
          ? 'T标签和分数由天元之弈发布，原站标注“算法测试中”，不冒充开局算法或胜率。'
          : ''}
      </p>
      {!validDate && <p role="alert">请选择有效日期。</p>}
      {(stats.loading || tier.loading || top.loading) && (
        <p role="status">正在读取有来源的公开记录……</p>
      )}
      {(stats.error || tier.error || top.error) && (
        <p role="alert">{stats.error ?? tier.error ?? top.error}；没有用其他日期或示例数据填充。</p>
      )}
      {packet && (
        <>
          <div className="rank-coverage">
            <strong>
              {new Set(packet.data.map((r) => r.baseHeroId ?? r.heroId)).size} / {heroes.length}
            </strong>
            <span>
              目录英雄覆盖 · {packet.data.length} 条来源记录（含形态） · 当前筛选 {rows.length} 条 ·
              查询 {date}
            </span>
          </div>
          <Provenance packet={packet} />
        </>
      )}
      {basis === 'tier' && tier.packet && <Provenance packet={tier.packet} />}
      {packet &&
        (basis !== 'tier' || tier.packet) &&
        (view === 'board' ? (
          <div className="tier-board">
            {groups.map((group) => {
              const entries = rows.filter((r) =>
                groupedOwn
                  ? (ownById.get(r.heroId)?.tier ?? '待评估') === group
                  : basis !== 'tier' || (rankById.get(r.heroId)?.tierInRole ?? '未评级') === group,
              );
              return entries.length ? (
                <section
                  className={'tier-band ' + (basis === 'stats' ? 'unknown' : '')}
                  key={group}
                >
                  <div className="tier-band-label">
                    <strong>{group}</strong>
                    <span>{entries.length} 条</span>
                  </div>
                  <div className="tier-band-heroes">
                    {entries.map((r) => (
                      <button
                        key={r.heroId}
                        className={
                          'tier-portrait ' +
                          (r.banRate >= 20 ? 'high-ban' : r.pickRate < 2.5 ? 'low-pick' : '')
                        }
                        aria-label={'查看' + r.heroName + '公开详情'}
                        onClick={() => open(r)}
                      >
                        <Portrait hero={heroById(r.baseHeroId ?? r.heroId)} />
                        <strong>{r.heroName}</strong>
                        {basis === 'own' && (
                          <>
                            <span className="tier-score">
                              {ownById.get(r.heroId)?.score?.toFixed(1) ?? '待评估'}
                            </span>
                            <small>
                              {ownById.get(r.heroId)?.tier} ·{' '}
                              {ownById.get(r.heroId)?.score == null
                                ? '证据不足'
                                : ownById.get(r.heroId)?.sensitive
                                  ? '边界敏感'
                                  : '参数较稳'}
                            </small>
                          </>
                        )}
                        <small>
                          {basis === 'own' && segment === '巅峰千强'
                            ? '顶端胜 ' + percentage(ownById.get(r.heroId)?.winRateUsed)
                            : '胜 ' + percentage(r.winRate)}
                        </small>
                        <small>出 {percentage(r.pickRate)}</small>
                        <small>禁 {percentage(r.banRate)}</small>
                        {basis === 'tier' && rankById.has(r.heroId) && (
                          <span className="tier-score">
                            {rankById.get(r.heroId)!.finalNormalizedTierScore.toFixed(2)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null;
            })}
          </div>
        ) : (
          <div className="roster-scroll">
            <table className="roster-table">
              <caption>
                天元之弈 · {segment} · {date} · 总体观察
              </caption>
              <thead>
                <tr>
                  <th>英雄 / 形态</th>
                  {basis === 'own' && (
                    <>
                      <th>开局梯度</th>
                      <th>强度分</th>
                      <th>排名范围</th>
                    </>
                  )}
                  <th>来源分路</th>
                  <th>胜率</th>
                  <th>出场率</th>
                  <th>禁用率</th>
                  <th>Q区国十战力</th>
                  <th>来源梯度</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.heroId}>
                    <td>
                      <button className="text-btn" onClick={() => open(r)}>
                        {r.heroName}
                      </button>
                    </td>
                    {basis === 'own' && (
                      <>
                        <td>{ownById.get(r.heroId)?.tier}</td>
                        <td>{ownById.get(r.heroId)?.score?.toFixed(2) ?? '待评估'}</td>
                        <td>{ownById.get(r.heroId)?.rankRange?.join('–') ?? '—'}</td>
                      </>
                    )}
                    <td>{r.roles}</td>
                    <td>{percentage(r.winRate)}</td>
                    <td>{percentage(r.pickRate)}</td>
                    <td>{percentage(r.banRate)}</td>
                    <td>{r.qAreaTop10Power ?? '未公布'}</td>
                    <td>
                      {rankById.has(r.heroId)
                        ? `${rankById.get(r.heroId)!.tierInRole} · ${rankById.get(r.heroId)!.finalNormalizedTierScore}`
                        : '未读取'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {packet && !rows.length && <p>当前筛选没有英雄，请调整分路或搜索词。</p>}
    </section>
  );
}

export function TianyuanHero({
  hero,
  context,
}: {
  hero: Hero;
  context?: { segment: string; role: string; snapshotId?: string };
}) {
  const parts = context?.snapshotId?.startsWith('tianyuan:')
    ? context.snapshotId.split(':')
    : undefined;
  const date = parts?.[1] ?? sourceDate(),
    mode = Number(parts?.[2] ?? 5),
    recordId = Number(parts?.[3] ?? hero.id);
  const [kind, setKind] = useState<
    'stats' | 'skin' | 'duration' | 'analysis' | 'equip' | 'combined'
  >('stats');
  const data = useSource<unknown>({
    kind,
    ...(['duration', 'analysis'].includes(kind) ? {} : { date }),
    ...(kind === 'stats' ? { mode } : { heroId: hero.id }),
  });
  const packet = data.packet;
  const top = useSource<TianyuanStat[]>(
    kind === 'stats' && mode === 5 ? { kind: 'stats', date, mode: 4 } : undefined,
  );
  const strength =
    kind === 'stats' && packet
      ? strengthRanks(
          packet.data as TianyuanStat[],
          mode,
          context?.role ?? '全部',
          top.packet?.data,
        ).rows.find((r) => r.row.heroId === hero.id)
      : undefined;
  const row =
    kind === 'stats'
      ? (packet?.data as TianyuanStat[] | undefined)?.find((r) => r.heroId === recordId)
      : undefined;
  return (
    <section className="tianyuan-hero" id="hero-stats">
      <h3>天元公开统计 · {hero.name}</h3>
      <p className="data-caption">
        日期选择 {date} · {Object.entries(TIANYUAN_MODES).find(([, n]) => n === mode)?.[0]}
        。皮肤、装备、分路与关系接口为独立统计口径，不继承榜单分段；无日期的接口不冒充该日数据。形态榜记录保留，其他页签按基础英雄查询。
      </p>
      <div className="resource-tabs" aria-label="公开英雄数据分类">
        {(
          [
            ['stats', '总体表现'],
            ['combined', '分路与召唤师技能'],
            ['skin', '皮肤使用率'],
            ['duration', '对局时长胜率'],
            ['equip', '实际出装统计'],
            ['analysis', '克制与组合'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>
      {data.loading && <p role="status">正在读取来源数据……</p>}
      {data.error && (
        <p role="alert">
          {data.error}
          <button className="text-btn" onClick={data.reload}>
            重试
          </button>
        </p>
      )}
      {packet && (
        <>
          <Provenance packet={packet} />
          {kind === 'stats' &&
            (row ? (
              <>
                <h4>{row.heroName} · 总体三率</h4>
                {recordId === hero.id && strength && (
                  <StrengthExplanation item={strength} role={context?.role ?? '全部'} />
                )}
                {top.packet && <Provenance packet={top.packet} />}
                {top.error && <p role="alert">顶端排位参考暂不可用，千强代理强度暂不评级。</p>}
                <div className="metric-strip">
                  {[
                    ['胜率', percentage(row.winRate)],
                    ['出场率', percentage(row.pickRate)],
                    ['禁用率', percentage(row.banRate)],
                    ['Q区国十', row.qAreaTop10Power ?? '未公布'],
                    ['Q区国百', row.qAreaTop100Power ?? '未公布'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <strong>{v}</strong>
                      <span>{k}</span>
                    </div>
                  ))}
                </div>
                <p className="data-caption">
                  分路标签：{row.roles}
                  。战力阈值反映排行榜，不代表英雄对局胜率。千强页面总体胜率为全量人群、版本累计；未取得总体场次，不能计算可靠置信区间。
                </p>
              </>
            ) : (
              <p>此来源批次未包含该英雄，保持未知。</p>
            ))}
          {kind === 'skin' && (
            <SimpleTable
              headers={['皮肤', '来源使用率']}
              rows={tianyuanSkinSchema
                .parse(packet.data)
                .skinDistribution.map((s) => [s.skinName, percentage(s.pickRate)])}
              caption={`英雄皮肤分布 · 来源查询日 ${date} · 分母和场次数未公布`}
            />
          )}
          {kind === 'duration' && (
            <>
              <p className="pro-notice">
                该接口不返回统计日期、样本量或窗口。以下为获取时来源公布的时长分组，不能称为所选日期的结果。
              </p>
              <SimpleTable
                headers={['对局时长', '胜率', '该时长占比']}
                rows={tianyuanDurationSchema
                  .parse(packet.data)
                  .winRateByDuration.map((s) => [
                    s.durationRange,
                    percentage(s.winRate),
                    percentage(s.intervalRate),
                  ])}
                caption="对局时长分组胜率 · 第三方统计"
              />
            </>
          )}
          {kind === 'equip' && (
            <>
              <p className="pro-notice">
                出装胜率受到经济、顺逆风和存活时长影响，不能推导买该装备会提高多少胜率。来源返回截止时刻：
                {tianyuanEquipSchema.parse(packet.data).queryEndDate}；起始窗口与样本量未公布。
              </p>
              <SimpleTable
                headers={['装备', '出场率', '相关对局胜率']}
                rows={tianyuanEquipSchema
                  .parse(packet.data)
                  .equipmentWinRates.map((s) => [
                    s.equipmentName,
                    percentage(s.pickRate),
                    percentage(s.winRate),
                  ])}
                caption="来源装备胜率统计"
              />
            </>
          )}
          {kind === 'combined' && (
            <>
              <SimpleTable
                headers={['位置', '位置占比', '胜率']}
                rows={Object.entries(tianyuanCombinedSchema.parse(packet.data).positions).map(
                  ([k, s]) => [
                    (
                      {
                        '0': '对抗路',
                        '1': '中路',
                        '2': '发育路',
                        '3': '打野',
                        '4': '游走',
                      } as Record<string, string>
                    )[k] ?? k,
                    percentage(s.pickRate),
                    percentage(s.winRate),
                  ],
                )}
                caption="该英雄内部位置分布 · 非全英雄出场率"
              />
              <SimpleTable
                headers={['召唤师技能', '使用率', '胜率']}
                rows={tianyuanCombinedSchema
                  .parse(packet.data)
                  .summonerSkills.map((s) => [
                    s.skillName,
                    percentage(s.pickRate),
                    percentage(s.winRate),
                  ])}
                caption="来源召唤师技能统计 · 样本量未公布"
              />
            </>
          )}
          {kind === 'analysis' && (
            <>
              <p className="pro-notice">
                来源优势/协同指数与场次数。指数公式、调整因素及统计窗口尚未明确，不把指数当成胜率提升，不直接写入BP评分。
              </p>
              {(
                [
                  ['counters', '来源有利对位'],
                  ['counteredBy', '来源不利对位'],
                  ['goodSynergies', '来源正向组合'],
                  ['badSynergies', '来源负向组合'],
                ] as const
              ).map(([key, label]) => (
                <SimpleTable
                  key={key}
                  headers={['英雄', '样本场次', '来源指数']}
                  rows={tianyuanAnalysisSchema
                    .parse(packet.data)
                    [key].map((r) => [
                      r.heroName,
                      String(r.totalMatches),
                      String(r.advantageIndex ?? r.synergyIndex ?? '未公布'),
                    ])}
                  caption={label}
                />
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}
function SimpleTable({
  headers,
  rows,
  caption,
}: {
  headers: string[];
  rows: string[][];
  caption: string;
}) {
  return (
    <div className="table-scroll">
      <table className="pro-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>来源当前未返回记录；没有补造数值。</p>}
    </div>
  );
}
