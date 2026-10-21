import { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import { aggregateObservation } from './environment.ts';
import { OFFICIAL_SEGMENTS, OFFICIAL_POSITIONS } from './official.ts';
import type { RefreshStatus } from '../../../server/pro/refresh.ts';
const time = (value?: string) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未完成';
export default function DataUpdates({ onUpdated }: { onUpdated: (revision: string) => void }) {
  const [status, setStatus] = useState<RefreshStatus>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () =>
      void api<RefreshStatus>('/official/update-status')
        .then((r) => {
          if (active) {
            setStatus(r);
            setError('');
            if (r.completedAt) onUpdated(r.completedAt);
          }
        })
        .catch(() => {
          if (active) setError('更新状态暂时读取失败');
        });
    load();
    const timer = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [onUpdated]);
  const ok = status?.results.filter((r) => r.state === 'fresh' || r.state === 'cached').length ?? 0;
  return (
    <details className="surface data-updates">
      <summary>
        数据更新 · 营地 {ok}/15 路更新可用 · 天元之弈 {aggregateObservation.rows.length} 位已核对
      </summary>
      <p>
        {status?.automatic
          ? '服务运行期间，每轮完成后 35 分钟自动检查营地三个公开分段、五条分路。'
          : '自动检查尚未启用，或正在读取更新状态。'}
        关闭本地服务后停止检查，重新启动会再检查。
      </p>
      {error && <p role="status">{error}</p>}
      <p>
        最近完成：{time(status?.completedAt)}
        {status?.running ? ' · 正在检查' : ''}；
        {status?.nextCheckAt ? `下次检查：${time(status.nextCheckAt)}` : '暂无下一次检查时间'}。
      </p>
      <p>
        天元之弈：数据日 {aggregateObservation.dataDate}，{aggregateObservation.rows.length}{' '}
        位英雄来自人工核对的历史页面批次，此批次不自动改写。新版“弈境强度与全榜”直接读取公开接口，服务运行时每轮完成后60分钟检查四分段。检查时间不等于来源数据日。
      </p>
      {status?.persistenceError && <p role="alert">{status.persistenceError}</p>}
      <div className="table-scroll" tabIndex={0} role="region" aria-label="可横向滚动的更新状态表">
        <table className="pro-table">
          <caption>营地各分段分路更新状态</caption>
          <thead>
            <tr>
              <th>分段 / 分路</th>
              <th>来源日期</th>
              <th>记录数</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {status?.results.map((r) => (
              <tr key={r.segment + '-' + r.position}>
                <td>
                  {Object.entries(OFFICIAL_SEGMENTS).find(([, v]) => v === r.segment)?.[0]} /{' '}
                  {Object.entries(OFFICIAL_POSITIONS).find(([, v]) => v === r.position)?.[0]}
                </td>
                <td>{r.sourceDate ?? '未知'}</td>
                <td>{r.rows}</td>
                <td>
                  {
                    {
                      fresh: '已获取',
                      cached: '有效缓存',
                      stale: '更新失败，保留旧数据',
                      error: '未取得数据',
                    }[r.state]
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="data-caption">
        “已获取”和“有效缓存”表示本次读取状态，不保证来源数据属于今天；请同时检查来源日期。日期未知的记录不能作为今日数据。
        公开分享榜每路最多十条，不是全英雄完整统计。每次不同内容按原来源日期归档，失败不伪造新日期。
      </p>
    </details>
  );
}
