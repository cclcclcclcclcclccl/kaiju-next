import { useEffect, useRef, useState } from 'react';

export default function ConnectionStatus({
  publicSharing = false,
  onReconnect,
}: {
  publicSharing?: boolean;
  onReconnect?: () => void;
}) {
  const [offline, setOffline] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const wasOffline = useRef(false);
  const reconnect = useRef(onReconnect);
  reconnect.current = onReconnect;
  const remote = publicSharing || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const [checking, setChecking] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true,
      pending = false;
    const check = async () => {
      if (pending) return;
      pending = true;
      setChecking(true);
      try {
        const response = await fetch('/api/status', {
          cache: 'no-store',
          signal: AbortSignal.timeout(4000),
        });
        const data = await response.json();
        if (active) {
          const failed = !response.ok || data.product !== '开局 NEXT';
          setOffline(failed);
          if (!failed && wasOffline.current) {
            setRecovered(true);
            reconnect.current?.();
          }
          wasOffline.current = failed;
        }
      } catch {
        if (active) {
          setOffline(true);
          wasOffline.current = true;
        }
      } finally {
        pending = false;
        if (active) setChecking(false);
      }
    };
    void check();
    const interval = setInterval(() => void check(), 15000);
    const focused = () => void check();
    window.addEventListener('focus', focused);
    window.addEventListener('online', focused);
    window.addEventListener('offline', focused);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', focused);
      window.removeEventListener('online', focused);
      window.removeEventListener('offline', focused);
    };
  }, [revision]);
  if (!offline)
    return recovered ? (
      <aside className="pro-notice" role="status" aria-label="连接恢复提示">
        <strong>服务连接已恢复。</strong> 未保存的输入仍留在当前页面，请核对已保存记录后再提交。
        <button className="btn secondary" onClick={() => setRecovered(false)}>
          知道了
        </button>
      </aside>
    ) : null;
  return (
    <aside className="pro-notice" role="alert" aria-label="服务连接提示">
      <strong>服务暂时断开，当前操作可能无法保存。</strong>
      <p>
        {remote
          ? '请先检查网络。若仍无法连接，请联系分享者确认服务在线，并核对分享网址是否更新。'
          : '请在项目文件夹双击 start-kaiju.cmd，等待启动完成；它不会清空已有记录。'}
        保留当前页面可以避免丢失尚未保存的输入。恢复连接不会自动重发保存操作。
      </p>
      <button
        className="btn secondary"
        disabled={checking}
        onClick={() => setRevision((n) => n + 1)}
      >
        {checking ? '正在检查…' : '检查服务连接'}
      </button>
    </aside>
  );
}
