import { useEffect, useState } from 'react';

export default function ConnectionStatus() {
  const [offline, setOffline] = useState(false);
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
        if (active) setOffline(!response.ok || data.product !== '开局 NEXT');
      } catch {
        if (active) setOffline(true);
      } finally {
        pending = false;
        if (active) setChecking(false);
      }
    };
    void check();
    const interval = setInterval(() => void check(), 15000);
    const focused = () => void check();
    window.addEventListener('focus', focused);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', focused);
    };
  }, [revision]);
  if (!offline) return null;
  return (
    <aside className="pro-notice" role="alert" aria-label="本地服务连接提示">
      <strong>本地服务暂时断开，当前操作可能无法保存。</strong>
      <p>
        请在项目文件夹双击
        start-kaiju.cmd，等待启动完成。电脑重启后也需要运行此文件；它不会清空已有记录。保留当前页面可以避免丢失尚未保存的输入。
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
