import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { EquipmentIdentity, SkinDistribution } from './SourceMedia.tsx';
import type { z } from 'zod';
import { api, download } from '../../api.ts';
import { heroById } from '../catalog.ts';
import type { Hero } from '../model.ts';
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
import { sourceBoard, sourceTierDate } from './publicBoard.ts';

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
  const [date, setDate] = useState(parts?.[1] ?? sourceDate());
  const [tierDate, setTierDate] = useState(parts?.[4] ?? (parts ? parts[1] : sourceTierDate()));
  const [mode, setMode] = useState(
    Number(parts?.[2] ?? TIANYUAN_MODES[context?.segment ?? '巅峰千强'] ?? 5),
  );
  const recordId = Number(parts?.[3] ?? hero.id);
  const [kind, setKind] = useState<
    'stats' | 'skin' | 'duration' | 'analysis' | 'equip' | 'combined'
  >('stats');
  const stats = useSource<TianyuanStat[]>({ kind: 'stats', date, mode });
  const extra = useSource<unknown>(
    kind === 'stats'
      ? undefined
      : {
          kind,
          ...(['duration', 'analysis'].includes(kind) ? {} : { date }),
          heroId: hero.id,
        },
  );
  const data = kind === 'stats' ? stats : extra;
  const packet = data.packet;
  const tiers = useSource<z.infer<typeof tianyuanTierSchema>>({ kind: 'tier', date: tierDate });
  const tier = sourceBoard(tiers.packet?.data.tiers ?? [], []).find(
    (r) => r.tier.heroId === hero.id,
  );
  const row = stats.packet?.data.find((r) => r.heroId === recordId);
  return (
    <section className="tianyuan-hero" id="hero-stats">
      <h3>分段表现 · {hero.name} · 天元公开统计</h3>
      <div className="pro-toolbar">
        <label>
          英雄统计分段
          <select
            aria-label="英雄统计分段"
            value={mode}
            onChange={(e) => setMode(Number(e.target.value))}
          >
            {Object.entries(TIANYUAN_MODES).map(([label, value]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          英雄统计日期
          <input
            type="date"
            value={date}
            max={sourceDate()}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </label>
        <label>
          英雄梯度日期
          <input
            type="date"
            value={tierDate}
            max={sourceTierDate()}
            onChange={(e) => {
              if (e.target.value) setTierDate(e.target.value);
            }}
          />
        </label>
      </div>
      <div className="metric-strip" aria-label="英雄来源梯度">
        <div>
          <strong>{tier?.label ?? (tiers.loading ? '读取中' : '未评级')}</strong>
          <span>天元综合梯度</span>
        </div>
        <div>
          <strong>{tier?.tier.finalNormalizedTierScore.toFixed(2) ?? '—'}</strong>
          <span>天元来源分数</span>
        </div>
        <div>
          <strong>{tier?.tier.role ?? '—'}</strong>
          <span>来源定位</span>
        </div>
      </div>
      {row && (
        <div className="metric-strip" aria-label="英雄分段三率">
          {[
            ['胜率', percentage(row.winRate)],
            ['出场率', percentage(row.pickRate)],
            ['禁用率', percentage(row.banRate)],
          ].map(([label, value]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      <p className="data-caption">
        综合梯度日期 {tierDate}
        ，由天元发布，不随三率分段变化；原站算法测试中。三率查询日 {date}。
      </p>
      {tiers.error && (
        <p role="alert">
          梯度暂不可用：{tiers.error}
          <button className="text-btn" onClick={tiers.reload}>
            重试梯度
          </button>
        </p>
      )}
      {tiers.packet && <Provenance packet={tiers.packet} />}
      {kind !== 'stats' && stats.error && (
        <p role="alert">
          英雄三率暂不可用：{stats.error}
          <button className="text-btn" onClick={stats.reload}>
            重试三率
          </button>
        </p>
      )}
      {kind !== 'stats' && stats.packet && <Provenance packet={stats.packet} />}
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
          <button
            key={k}
            aria-pressed={kind === k}
            className={kind === k ? 'active' : ''}
            onClick={() => setKind(k)}
          >
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
                <h4>{row.heroName} · 战力门槛</h4>
                <div className="metric-strip" aria-label="英雄战力门槛">
                  {[
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
                  。战力阈值反映排行榜，不代表英雄对局胜率。未取得完整样本量与选禁共同分母，不把出场率和禁用率相加冒充
                  BP 率。{mode === 5 ? '千强胜率与选禁的人群及累计窗口未完成独立核验。' : ''}
                </p>
              </>
            ) : (
              <p>此来源批次未包含该英雄，保持未知。</p>
            ))}
          {kind === 'skin' && (
            <SkinDistribution
              rows={tianyuanSkinSchema.parse(packet.data).skinDistribution}
              date={date}
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
                    <EquipmentIdentity
                      id={s.equipmentId}
                      name={s.equipmentName}
                      icon={s.equipmentIcon}
                    />,
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
  rows: ReactNode[][];
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
