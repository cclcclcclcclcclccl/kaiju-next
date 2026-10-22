import { useEffect, useState } from 'react';
import { reviewMode, reviewConfig } from '../reviewMode.ts';
import { api } from '../../api.ts';
import { TIANYUAN_MODES } from './tianyuan.ts';
type Row = {
  mode: number;
  queryDate: string;
  records: number;
  state: string;
  checkedAt?: string;
  fetchedAt?: string;
  sourceUpdatedAt?: string;
  inProgress: boolean;
};
export default function SourceHealth() {
  const [state, setState] = useState<Row[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const read = () =>
      void api<{ rows: Row[] }>('/tianyuan/status')
        .then((r) => {
          if (active) {
            setState(r.rows);
            setError('');
          }
        })
        .catch(() => {
          if (active) setError('暂时无法读取来源健康状态');
        });
    read();
    const timer = setInterval(read, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (reviewMode)
    return (
      <details className="surface data-updates">
        <summary>四分段历史快照 · 默认 {reviewConfig?.statsDate}</summary>
        <p>
          本入口提供已校验的四分段公开数据，非实时更新。可以更改日期查询其他已收录批次；未收录的数据不会用其他日期替代。
        </p>
      </details>
    );
  const labels: Record<string, string> = {
    fresh: '已获取',
    cached: '一小时内获取的缓存',
    stale: '更新失败，保留旧缓存',
    expired: '缓存超过一小时，待检查',
    missing: '尚无可用数据',
    error: '未取得可用数据',
  };
  return (
    <details className="surface data-updates">
      <summary>四分段来源状态 · {state.filter((r) => r.records > 0).length}/4 有可用记录</summary>
      <p>
        每 30
        秒读取本机状态，不额外请求来源。查询日、来源更新时间和抓取时间分别记录；缓存有效不代表它属于今天。
      </p>
      {error && <p role="status">{error}</p>}
      <div className="table-scroll" tabIndex={0} role="region" aria-label="全榜来源状态">
        <table className="pro-table">
          <caption>天元之弈公开统计来源状态</caption>
          <thead>
            <tr>
              <th>分段</th>
              <th>查询日</th>
              <th>记录</th>
              <th>状态</th>
              <th>实际获取（北京时间）</th>
            </tr>
          </thead>
          <tbody>
            {state.map((r) => (
              <tr key={r.mode}>
                <td>{Object.entries(TIANYUAN_MODES).find(([, id]) => id === r.mode)?.[0]}</td>
                <td>{r.queryDate}</td>
                <td>{r.records || '—'}</td>
                <td>
                  {r.inProgress ? '正在检查 · ' : ''}
                  {labels[r.state] ?? '未知'}
                </td>
                <td>
                  {r.fetchedAt
                    ? new Date(r.fetchedAt).toLocaleString('zh-CN', {
                        timeZone: 'Asia/Shanghai',
                        hour12: false,
                      })
                    : '尚未获取'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="data-caption">
        135 条可能含同一英雄的不同形态，不等于 135
        位基础英雄。巅峰1800+、巅峰万强尚无独立可核验来源，未用其他分段填补。
      </p>
    </details>
  );
}
