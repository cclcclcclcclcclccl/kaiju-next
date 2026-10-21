import { useRef, useState } from 'react';
import { api, download } from '../../api.ts';
import { backupSchema } from './backup.ts';
import type { PersonalBackup } from './backup.ts';
type Preview = {
  revision: string;
  current: Record<string, number | string>;
  incoming: Record<string, number | string>;
  scope: string;
};
export default function BackupCenter({ onRestored }: { onRestored: () => void }) {
  const [backup, setBackup] = useState<PersonalBackup>();
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const generation = useRef(0);
  async function exportBackup(checkpoint = false) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const value = await api<PersonalBackup>(checkpoint ? '/backup/checkpoint' : '/backup');
      download(
        checkpoint ? '自在弈境-恢复前备份.json' : '自在弈境-完整个人备份.json',
        JSON.stringify(value),
      );
      setMessage('备份已生成，请妥善保存下载文件。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(value: PersonalBackup) {
    setBusy(true);
    setError('');
    setPreview(undefined);
    setConfirmed(false);
    try {
      setPreview(await api<Preview>('/backup/preview', { backup: value }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!backup || !preview || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      await api('/backup/restore', { backup, expectedRevision: preview.revision, confirmed: true });
      onRestored();
    } catch (e) {
      setError((e as Error).message);
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="backup-center">
      <p>
        完整备份包含当前空间的英雄池、详细档案、已保存阵容、备战卡、对局手记、统计批次、刷野训练、复盘关键帧和已保存到服务器的系列赛。不会包含账号密码、好友关系、原始视频或当前
        Codex 对话。
      </p>
      <div className="detail-actions">
        <button className="btn primary" disabled={busy} onClick={() => void exportBackup()}>
          下载完整个人备份
        </button>
        <button className="btn secondary" disabled={busy} onClick={() => void exportBackup(true)}>
          下载上次恢复前备份
        </button>
      </div>
      <p className="data-caption">
        只备份服务器已保存内容。浏览器中的 BP
        演练和未上传系列赛仍需单独导出，档案草稿可在玩家档案导出。旧版备份未含系列赛字段时，恢复会保留服务器现有系列赛。文件含个人记录与截图，请保存到自己的设备。
      </p>
      <label className="field">
        选择完整个人备份
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            const version = ++generation.current;
            setBackup(undefined);
            setPreview(undefined);
            setConfirmed(false);
            setError('');
            setMessage('');
            if (!file) return;
            try {
              if (file.size > 64 * 1024 * 1024) throw Error('文件不能超过 64 MB');
              const value = backupSchema.parse(JSON.parse(await file.text()));
              if (version !== generation.current) return;
              setBackup(value);
              await inspect(value);
            } catch (e) {
              if (version === generation.current) setError('备份校验失败：' + (e as Error).message);
            }
          }}
        />
      </label>
      {backup && (
        <button className="btn secondary" disabled={busy} onClick={() => void inspect(backup)}>
          重新预览备份
        </button>
      )}
      {preview && (
        <>
          <h3>恢复到：{preview.scope}</h3>
          <div className="roster-scroll" role="region" aria-label="备份恢复数量对比" tabIndex={0}>
            <table className="roster-table">
              <caption>当前记录与备份内容</caption>
              <thead>
                <tr>
                  <th>内容</th>
                  <th>当前</th>
                  <th>备份</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(preview.current).map((key) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>{preview.current[key]}</td>
                    <td>{preview.incoming[key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pro-notice">
            完整恢复会替换当前空间的上述已保存内容。系统先保留一份恢复前备份，再在同一事务中恢复；其他账号不会被修改。恢复后关闭英雄池分享，重新检查后可自行开启。备战中引用的好友身份会清除。
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            我已核对目标空间与数量，确认替换当前已保存内容
          </label>
          <button
            className="btn primary"
            disabled={busy || !confirmed}
            onClick={() => void restore()}
          >
            确认恢复完整备份
          </button>
        </>
      )}
      {busy && <p role="status">正在处理备份，请等待…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
