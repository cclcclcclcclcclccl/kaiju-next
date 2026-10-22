import { reviewMode } from '../reviewMode.ts';
import { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import { parseSeries } from './seriesBp.ts';
import type { Series } from './seriesBp.ts';
type Saved = { revision: number; series: Series | null; owner: string; name: string };
export default function SeriesSave({
  series,
  onLoad,
}: {
  series: Series | null;
  onLoad: (s: Series) => void;
}) {
  const [saved, setSaved] = useState<Saved>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const read = async () => {
    setBusy(true);
    setError('');
    try {
      setSaved(await api<Saved>('/pro/bp-series'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void read();
  }, []);
  return (
    <details className="source-proof series-server-save">
      <summary>{reviewMode ? '浏览器完整存档 · 纳入个人备份' : '服务器存档 · 同账号读取'}</summary>
      <p>
        {reviewMode ? (
          '这里将当前系列赛保存在此浏览器，纳入完整个人备份；不会上传或自动跨设备同步。'
        ) : (
          <>
            浏览器仍自动保存。这里手动保存到当前自在弈境服务器，登录自己的自在弈境账号后按账号隔离；访客使用本机公共空间。其他设备须连接同一服务器，不与天元或游戏账号互通。
            保存到服务器后会纳入“完整个人备份”；未上传的浏览器系列赛请单独导出。
          </>
        )}
      </p>
      {saved && (
        <p>
          {saved.name} · 存档版本 {saved.revision} ·{' '}
          {saved.series ? `BO${saved.series.bestOf} / ${saved.series.games.length} 局` : '尚无存档'}
        </p>
      )}
      <div className="pro-actions">
        <button className="text-btn" disabled={busy} onClick={read}>
          {reviewMode ? '重新读取浏览器存档' : '重新读取服务器记录'}
        </button>
        <button
          className="btn secondary"
          disabled={busy || !series || !saved}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              setSaved(
                await api<Saved>('/pro/bp-series', {
                  series,
                  expected: saved!.revision,
                  owner: saved!.owner,
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {reviewMode ? '保存当前系列赛到浏览器' : '保存当前系列赛到服务器'}
        </button>
        <button
          className="btn secondary"
          disabled={busy || !saved?.series}
          onClick={() => {
            try {
              const next = parseSeries(saved!.series);
              if (series)
                localStorage.setItem('kaiju.bp.series.before-edit.v1', JSON.stringify(series));
              onLoad(next);
              setError('');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {reviewMode ? '备份当前草稿并载入存档' : '备份本机并载入服务器系列赛'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
