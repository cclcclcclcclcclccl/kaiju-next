import { useState } from 'react';
import { heroes } from '../catalog.ts';
import { api } from '../../api.ts';
import type { OcrData } from './screenshot.ts';
import { Identity } from './SourceWidgets.tsx';
import { suggestScreenshotLayout } from './screenshotLayout.ts';
import type { LayoutPick } from './screenshotLayout.ts';
export default function MatchScreenshot({
  onAssign,
}: {
  onAssign: (key: string, value: string) => void;
}) {
  const [ocr, setOcr] = useState<OcrData>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [target, setTarget] = useState('1:1');
  const [preview, setPreview] = useState(''),
    [layout, setLayout] = useState<'lr' | 'tb'>('lr'),
    [suggestions, setSuggestions] = useState<LayoutPick[]>([]);
  const found = heroes.filter((h) =>
    ocr?.lines.some(
      (l) => l.confidence >= 0.6 && l.text.replace(/\s/g, '') === h.name.replace(/\s/g, ''),
    ),
  );
  return (
    <details className="source-proof match-screenshot">
      <summary>从截图识别英雄名字 · 本机 OCR</summary>
      <p>
        上传含清晰英雄名称的 BP
        或阵容截图。仅识别文字，不识别纯头像。可按截图左右／上下布局生成位置草稿，分路由英雄定位推断，必须核对；不自动覆盖备战或英雄池。请先裁去禁用栏、聊天和多余说明文字。
      </p>
      <label>
        选择阵容截图
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setOcr(undefined);
            setPreview('');
            setSuggestions([]);
            setError('');
            if (file.size > 8 * 1024 * 1024) {
              setError('截图请小于 8 MB');
              return;
            }
            setBusy(true);
            try {
              const image = await new Promise<string>((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result));
                r.onerror = () => reject(Error('截图读取失败'));
                r.readAsDataURL(file);
              });
              setPreview(image);
              setOcr(await api<OcrData>('/pro/recognize-profile', { image }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {busy && <p role="status">正在本机识别截图，首次加载模型可能较慢…</p>}
      {preview && <img className="ocr-match-preview" src={preview} alt="待核对的阵容截图" />}
      {error && <p role="alert">{error}。仍可在下方手动选择英雄。</p>}
      {ocr && (
        <>
          <p>识别到 {found.length} 位英雄。先选放入位置，再点击英雄确认；重复英雄请自行核对。</p>
          <div className="pro-toolbar">
            <label>
              截图阵容布局
              <select
                value={layout}
                onChange={(e) => {
                  setLayout(e.target.value as 'lr' | 'tb');
                  setSuggestions([]);
                }}
              >
                <option value="lr">左右排列：左为阵营 1</option>
                <option value="tb">上下排列：上为阵营 1</option>
              </select>
            </label>
            <button
              className="btn secondary"
              onClick={() => {
                try {
                  setSuggestions(suggestScreenshotLayout(ocr, layout));
                  setError('');
                } catch (e) {
                  setSuggestions([]);
                  setError((e as Error).message);
                }
              }}
            >
              生成待核对位置草稿
            </button>
          </div>
          {!!suggestions.length && (
            <fieldset>
              <legend>逐项核对英雄与分路</legend>
              {suggestions.map((r, i) => (
                <label key={r.heroId}>
                  <Identity
                    name={heroes.find((h) => h.id === r.heroId)!.name}
                    icon={heroes.find((h) => h.id === r.heroId)!.portrait}
                  />
                  <select
                    aria-label={'核对' + r.text + '位置'}
                    value={r.key}
                    onChange={(e) =>
                      setSuggestions((rows) =>
                        rows.map((v, j) => (j === i ? { ...v, key: e.target.value } : v)),
                      )
                    }
                  >
                    <option value="">不采用</option>
                    {[1, 2].flatMap((side) =>
                      ['对抗路', '中路', '发育路', '打野', '游走'].map((n, j) => (
                        <option key={side + ':' + j} value={side + ':' + j}>
                          阵营 {side} · {n}
                        </option>
                      )),
                    )}
                  </select>
                </label>
              ))}
              <button
                className="btn primary"
                onClick={() => {
                  const chosen = suggestions.filter((r) => r.key);
                  if (!chosen.length || new Set(chosen.map((r) => r.key)).size !== chosen.length) {
                    setError('请至少保留一位英雄，且每个位置只能放一位。');
                    return;
                  }
                  chosen.forEach((r) => onAssign(r.key, String(r.heroId)));
                  setSuggestions([]);
                  setError('');
                }}
              >
                确认采用所选位置（替换对应查询条件）
              </button>
            </fieldset>
          )}
          <label>
            识别英雄放入位置
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {[1, 2].flatMap((side) =>
                ['对抗路', '中路', '发育路', '打野', '游走'].map((n, i) => (
                  <option key={side + ':' + i} value={side + ':' + i}>
                    阵营 {side} · {n}
                  </option>
                )),
              )}
            </select>
          </label>
          <div className="pro-actions">
            {found.map((h) => (
              <button
                key={h.id}
                className="btn secondary"
                onClick={() => onAssign(target, String(h.id))}
              >
                <Identity name={h.name} icon={h.portrait} />
              </button>
            ))}
          </div>
          <details>
            <summary>识别原文与凭据</summary>
            <p>
              引擎 {ocr.engine} · 图片校验 {ocr.sha256}
            </p>
            <pre>{ocr.lines.map((l) => l.text).join('\n')}</pre>
          </details>
        </>
      )}
    </details>
  );
}
