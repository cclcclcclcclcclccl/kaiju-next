import { useEffect, useRef, useState } from 'react';
import { api, download } from '../../api.ts';
import { heroById } from '../catalog.ts';
import type { Pool } from '../model.ts';
import { levelNames } from '../model.ts';

type PoolStatus = {
  mode: 'guest' | 'account';
  name: string;
  pool: Pool;
  guestPool: Pool;
  savedAt: string | null;
  history: { id: number; reason: string; savedAt: string; before: Pool; after: Pool }[];
};
const names = (pool: Pool) =>
  pool.map((p) => `${heroById(p.heroId)?.name ?? p.heroId}（${levelNames[p.level]}）`).join('、') ||
  '空';
export default function PoolStorage({
  pool,
  busy,
  onSavedPool,
  onWorking,
}: {
  pool: Pool;
  busy: boolean;
  onSavedPool: (pool: Pool) => void;
  onWorking: (working: boolean) => void;
}) {
  const [status, setStatus] = useState<PoolStatus>();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const sequence = useRef(0);
  useEffect(() => {
    const version = ++sequence.current;
    void api<PoolStatus>('/pool-status')
      .then((s) => {
        if (sequence.current === version) {
          setStatus(s);
          setError('');
        }
      })
      .catch((e) => {
        if (sequence.current === version) setError(e.message);
      });
    return () => {
      sequence.current++;
    };
  }, [pool]);
  async function readOrImport(importGuest: boolean) {
    if (busy || working) return;
    setWorking(true);
    onWorking(true);
    setError('');
    setMessage('');
    sequence.current++;
    try {
      if (importGuest) await api<Pool>('/pool-import-guest', {});
      const fresh = await api<PoolStatus>('/pool-status');
      setStatus(fresh);
      onSavedPool(fresh.pool);
      setMessage(
        importGuest
          ? '访客记录已复制，当前账号已有的英雄记录保持原样。'
          : '已重新读取当前身份的英雄池。',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
      onWorking(false);
    }
  }
  const missing = status?.guestPool.filter((p) => !pool.some((c) => c.heroId === p.heroId)) ?? [];
  return (
    <section className="surface pool-storage" aria-label="英雄池保存位置">
      <div className="section-title">
        <h2>我的保存空间</h2>
        <span>
          {busy || working
            ? '正在处理…'
            : error
              ? '连接失败，请重试'
              : status
                ? '已连接本机数据库'
                : '正在确认…'}
        </span>
      </div>
      {status && (
        <>
          <p>
            <strong>
              当前身份：{status.mode === 'guest' ? '本机访客' : `独立账号 · ${status.name}`}
            </strong>{' '}
            · 已保存 {status.pool.length} 位自选英雄
          </p>
          <p className="data-caption">
            记录保存在运行本站的这台电脑，刷新页面仍保留。访客与独立账号各自保存；这不是王者账号同步或云备份。截图与详细战绩保存在「玩家档案」，也会计入英雄池。
          </p>
          <p className="data-caption">
            {status.savedAt
              ? '最近英雄池修改：' + new Date(status.savedAt).toLocaleString('zh-CN')
              : '已有记录已读取；本次升级前的保存时间未记录。'}
          </p>
          {status.mode === 'account' && missing.length > 0 && (
            <div className="pro-notice">
              <strong>找到本机访客的 {missing.length} 位其他英雄</strong>
              <p>{names(missing)}</p>
              <button
                className="btn primary"
                disabled={busy || working}
                onClick={() => void readOrImport(true)}
              >
                复制访客英雄池到当前账号
              </button>
              <p className="data-caption">
                复制自选英雄与自报标签；保留访客原记录，不覆盖当前账号已有英雄。详细战绩不在此处复制。
              </p>
            </div>
          )}
        </>
      )}
      <div className="detail-actions">
        <button
          className="btn secondary"
          disabled={busy || working}
          onClick={() => void readOrImport(false)}
        >
          重新读取英雄池
        </button>
        <button
          className="btn secondary"
          disabled={!status || busy || working}
          onClick={() =>
            status &&
            download(
              '开局-英雄池备份.json',
              JSON.stringify(
                {
                  format: 'kaiju-pool-backup-v1',
                  exportedAt: new Date().toISOString(),
                  scope: status.mode,
                  name: status.name,
                  pool: status.pool,
                },
                null,
                2,
              ),
            )
          }
        >
          导出自选英雄备份
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">保存状态读取失败：{error}</p>}
      {!!status?.history.length && (
        <details>
          <summary>最近保存记录 · {status.history.length} 次</summary>
          <ul className="pool-history">
            {status.history.map((h) => (
              <li key={h.id}>
                <strong>
                  {new Date(h.savedAt).toLocaleString('zh-CN')} · {h.reason}
                </strong>
                <p>之前：{names(h.before)}</p>
                <p>之后：{names(h.after)}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
