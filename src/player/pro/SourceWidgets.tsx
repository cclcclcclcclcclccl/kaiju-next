import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, download } from '../../api.ts';
import type { PlusPacket, PlusQuery, SourceRow } from './sourcePlus.ts';
import { publicImage } from './sourcePlus.ts';
import { NamedIcon, RateBar } from './SourceMedia.tsx';
export const valueText = (x: unknown, digits = 2) =>
  typeof x === 'number' && Number.isFinite(x)
    ? x.toLocaleString('zh-CN', { maximumFractionDigits: digits })
    : typeof x === 'string'
      ? x
      : '未公布';
export const AREAS = [
  [7, 'Q区平均'],
  [1, '安卓Q区'],
  [2, '苹果Q区'],
  [8, 'V区平均'],
  [3, '安卓V区'],
  [4, '苹果V区'],
  [9, 'QV平均'],
] as const;
export function usePlus(query: PlusQuery | null) {
  const key = query ? JSON.stringify(query) : '',
    [tick, setTick] = useState(0),
    [state, setState] = useState<{ key: string; packet?: PlusPacket; error?: string }>({ key: '' });
  useEffect(() => {
    if (!query) return;
    let active = true;
    setState({ key });
    api<PlusPacket>(
      '/source-plus?' + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])),
    )
      .then((packet) => {
        if (active) setState({ key, packet });
      })
      .catch((e) => {
        if (active) setState({ key, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [key, tick]);
  return {
    packet: state.key === key ? state.packet : undefined,
    error: state.key === key ? state.error : undefined,
    loading: !!key && (state.key !== key || (!state.packet && !state.error)),
    refresh: () => setTick((t) => t + 1),
  };
}
export function SourceBlock({
  query,
  children,
}: {
  query: PlusQuery;
  children: (data: SourceRow, packet: PlusPacket) => ReactNode;
}) {
  const { packet, error, loading, refresh } = usePlus(query);
  return (
    <section className="plus-source">
      {loading && <p role="status">正在读取真实公开数据…</p>}
      {error && (
        <p role="alert" className="error-message">
          {error}{' '}
          <button className="text-btn" onClick={refresh}>
            重试读取
          </button>
        </p>
      )}
      {packet && (
        <>
          <div className="source-context" aria-label="当前数据口径">
            <span>天元公开统计</span>
            <span>{packet.query.date ? '统计日 ' + packet.query.date : '独立统计窗口'}</span>
            {packet.query.gameMode && (
              <span>
                {
                  (
                    {
                      1: '大众分段',
                      3: '巅峰1350+',
                      4: '顶端排位',
                      5: '巅峰千强',
                      6: '千强近5日',
                      7: '千强近15日',
                      8: '巅峰百强',
                    } as Record<number, string>
                  )[packet.query.gameMode]
                }
              </span>
            )}
            <span>
              {packet.cache === 'stale'
                ? '更新失败 · 旧数据'
                : packet.cache === 'cached'
                  ? '已缓存'
                  : '本次读取'}
            </span>
            <time dateTime={packet.fetchedAt}>
              获取于{' '}
              {new Date(packet.fetchedAt).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false,
              })}
            </time>
          </div>
          {packet.warning && (
            <p role="status" className="pro-notice">
              {packet.warning}
            </p>
          )}
          {children(packet.data, packet)}
          <SourceStamp packet={packet} />
        </>
      )}
    </section>
  );
}
export function SourceStamp({ packet }: { packet: PlusPacket }) {
  return (
    <details className="source-proof">
      <summary>
        来源：{packet.source} · {packet.query.date ?? '来源独立时间窗口'} ·{' '}
        {packet.cache === 'stale' ? '旧缓存' : packet.cache === 'cached' ? '缓存' : '本次读取'}
      </summary>
      <p>
        获取时间：{new Date(packet.fetchedAt).toLocaleString('zh-CN')}
        。公开第三方统计，不是官方后台，也不代表个人下一局胜率。
      </p>
      <a href={packet.url} target="_blank" rel="noreferrer">
        查看原始公开来源 ↗
      </a>
      <button
        className="text-btn"
        onClick={() =>
          download('开局-公开来源-' + packet.query.kind + '.json', JSON.stringify(packet, null, 2))
        }
      >
        导出数据与出处
      </button>
      <p className="data-caption">内容校验：{packet.rawSha256}</p>
    </details>
  );
}
export function Identity({ name, icon }: { name: string; icon?: unknown }) {
  return (
    <span role="img" aria-label={name}>
      <span aria-hidden="true">
        <NamedIcon name={name} icon={publicImage(icon)} />
      </span>
    </span>
  );
}
export type Column = { key: string; label: string; render?: (row: SourceRow) => ReactNode };
export function SourceTable({
  rows,
  columns,
  title,
}: {
  rows: SourceRow[];
  columns: Column[];
  title: string;
}) {
  const [search, setSearch] = useState(''),
    [sort, setSort] = useState(''),
    [asc, setAsc] = useState(false),
    [limit, setLimit] = useState(30),
    [hidden, setHidden] = useState<string[]>([]);
  const visible = columns.filter((c) => !hidden.includes(c.key));
  const filtered = rows
    .filter((r) => !search || columns.some((c) => String(r[c.key] ?? '').includes(search)))
    .sort((a, b) => {
      if (!sort) return 0;
      const av = a[sort],
        bv = b[sort];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (
        (typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'zh-CN')) * (asc ? 1 : -1)
      );
    });
  return (
    <div className="source-table">
      <div className="pro-toolbar">
        <label>
          筛选{title}
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(30);
            }}
            placeholder="搜索名称"
          />
        </label>
        <span className="muted">{filtered.length} 条 · 点击表头排序</span>
      </div>
      <details className="source-proof">
        <summary>显示列与表格导出</summary>
        <div className="pro-toolbar">
          {columns.map((c) => (
            <label key={c.key}>
              <input
                type="checkbox"
                checked={!hidden.includes(c.key)}
                disabled={visible.length === 1 && !hidden.includes(c.key)}
                onChange={() =>
                  setHidden((old) =>
                    old.includes(c.key) ? old.filter((k) => k !== c.key) : [...old, c.key],
                  )
                }
              />
              {c.label}
            </label>
          ))}
        </div>
        <button
          className="text-btn"
          onClick={() => {
            const cell = (v: unknown) =>
              '"' +
              String(v == null ? '未公布' : typeof v === 'object' ? JSON.stringify(v) : v)
                .replace(/"/g, '""')
                .replace(/^([=+@-])/, "'$1") +
              '"';
            download(
              title + '.csv',
              '\ufeff' +
                [
                  visible.map((c) => cell(c.label)).join(','),
                  ...filtered.map((r) => visible.map((c) => cell(r[c.key])).join(',')),
                ].join('\r\n'),
            );
          }}
        >
          导出当前筛选表格 CSV
        </button>
      </details>
      <div className="table-scroll">
        <table className="pro-table" aria-label={title}>
          <thead>
            <tr>
              {visible.map((c) => (
                <th
                  key={c.key}
                  aria-sort={sort === c.key ? (asc ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    className="text-btn"
                    onClick={() => {
                      setSort(c.key);
                      setAsc(sort === c.key ? !asc : false);
                    }}
                  >
                    {c.label}
                    {sort === c.key ? (asc ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r, i) => (
              <tr key={String(r.id ?? r.heroId ?? r.date ?? i) + '-' + i}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(r) : valueText(r[c.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && <p className="muted">没有符合条件的数据。</p>}
      {filtered.length > limit && (
        <button className="btn secondary" onClick={() => setLimit((n) => n + 50)}>
          显示更多（{limit} / {filtered.length}）
        </button>
      )}
    </div>
  );
}
export const rateColumn = (key: string, label: string): Column => ({
  key,
  label,
  render: (r) => <RateBar value={r[key]} win={key.toLowerCase().includes('win')} label={label} />,
});
export function TrendChart({
  rows,
  metric,
  label,
  unit = '%',
}: {
  rows: SourceRow[];
  metric: string;
  label: string;
  unit?: string;
}) {
  const data = rows.map((r, i) => ({ x: i, value: r[metric], date: r.date }));
  const known = data.filter((r) => typeof r.value === 'number' && Number.isFinite(r.value));
  const max = Math.max(1, ...known.map((r) => r.value));
  const min = Math.min(0, ...known.map((r) => r.value));
  const x = (i: number) => 42 + (700 * i) / Math.max(1, rows.length - 1),
    y = (v: number) => 190 - ((v - min) * 160) / (max - min || 1);
  let path = '';
  data.forEach((p, i) => {
    if (typeof p.value !== 'number' || !Number.isFinite(p.value)) return;
    const prior = data[i - 1];
    path +=
      (prior && typeof prior.value === 'number' && Number.isFinite(prior.value) ? ' L' : ' M') +
      x(i) +
      ',' +
      y(p.value);
  });
  return (
    <figure className="plus-chart">
      <figcaption>
        {label} · {rows.length} 个来源时间点
      </figcaption>
      {known.length ? (
        <svg viewBox="0 0 770 230" role="img" aria-label={label + '趋势，详细数值见下方表格'}>
          <line x1="42" y1="190" x2="742" y2="190" stroke="#65758d" />
          <text x="0" y="35">
            {valueText(max, 1)}
            {unit}
          </text>
          <text x="0" y="190">
            {valueText(min, 1)}
          </text>
          <path d={path} fill="none" stroke="#74c6ff" strokeWidth="2" />
          {known.map((p) => (
            <circle key={p.x} cx={x(p.x)} cy={y(p.value)} r="3" fill="#f0d699">
              <title>
                {p.date}：{valueText(p.value)}
                {unit}
              </title>
            </circle>
          ))}
          <text x="42" y="220">
            {String(rows[0]?.date ?? '')}
          </text>
          <text x="742" y="220" textAnchor="end">
            {String(rows.at(-1)?.date ?? '')}
          </text>
        </svg>
      ) : (
        <p>来源未提供可绘制的数值。</p>
      )}
    </figure>
  );
}
