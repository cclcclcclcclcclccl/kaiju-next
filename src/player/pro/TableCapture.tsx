import { useMemo, useState, useRef, useEffect } from 'react';
import { api, download } from '../../api.ts';
import { mergePublicTables } from './publicTable.ts';
import type { Capture, PublicTable } from './publicTable.ts';
import type { StatEntry } from './importers.ts';
type Applied = { entries: StatEntry[]; date?: string; hashes: string[] };
export default function TableCapture({
  onApply,
  onInvalidate,
}: {
  onApply: (value: Applied) => void;
  onInvalidate: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [captures, setCaptures] = useState<Capture[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [choices, setChoices] = useState<Record<string, number>>({}),
    [confirmed, setConfirmed] = useState(false),
    [applied, setApplied] = useState(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const merged = useMemo(() => mergePublicTables(captures), [captures]);
  const conflicts = merged.rows.filter(
    (r) => r.variants.length > 1 && choices[r.key] === undefined,
  );
  const run = async () => {
    onInvalidate();
    const token = ++generation.current;
    setBusy(true);
    setCaptures([]);
    setErrors([]);
    setChoices({});
    setConfirmed(false);
    setApplied(false);
    try {
      for (let i = 0; i < files.length; i++) {
        if (token !== generation.current) break;
        const file = files[i];
        setProgress(`识别 ${i + 1} / ${files.length} · ${file.name}`);
        try {
          if (file.size > 8 * 1024 * 1024) throw Error('超过 8 MB');
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
            throw Error('仅支持 PNG/JPG/WebP');
          const image = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(Error('文件读取失败'));
            reader.readAsDataURL(file);
          });
          const result = await api<PublicTable>('/pro/recognize-stat-table', { image });
          if (token !== generation.current) break;
          setCaptures((c) => [...c, { ...result, fileName: file.name }]);
        } catch (e) {
          if (token === generation.current)
            setErrors((c) => [...c, `${file.name}：${(e as Error).message}`]);
        }
      }
    } finally {
      if (token === generation.current) {
        setBusy(false);
        setProgress('');
      }
    }
  };
  const choose = (key: string, value: number) => {
    onInvalidate();
    setChoices({ ...choices, [key]: value });
    setConfirmed(false);
    setApplied(false);
  };
  const apply = () => {
    if (!confirmed || conflicts.length || merged.dataDates.length > 1) return;
    const selected = merged.rows.flatMap((r) => {
      const index = choices[r.key] ?? 0;
      return index < 0 ? [] : [r.variants[index].row];
    });
    onApply({
      entries: selected.map((r) => ({
        hero: r.name,
        role: r.role,
        win: String(r.winRate),
        pick: String(r.pickRate),
        ban: String(r.banRate),
        games: '',
      })),
      date: merged.dataDates[0],
      hashes: captures.map((c) => c.sha256),
    });
    setApplied(true);
  };
  const selectedCount = merged.rows.filter((r) => choices[r.key] !== -1).length;
  return (
    <section className="table-capture" aria-label="批量识别榜单截图">
      <h3>把可见榜单变成可核对的数据</h3>
      <p>
        一次选择同一来源、分段、日期的最多 12
        张截图。每张保留完整表头、英雄名称和分路；同一英雄的重复数据自动合并，数值冲突由你选择。识别不会直接保存。
      </p>
      <div className="pro-toolbar">
        <label>
          选择榜单截图
          <input
            aria-label="批量上传榜单截图"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => {
              onInvalidate();
              const next = Array.from(e.target.files ?? []);
              setFiles(next.slice(0, 12));
              setCaptures([]);
              setChoices({});
              setConfirmed(false);
              setApplied(false);
              setErrors(next.length > 12 ? ['一次最多 12 张，已保留前 12 张'] : []);
            }}
          />
        </label>
        <button
          className="btn secondary"
          disabled={busy || !files.length}
          onClick={() => void run()}
        >
          识别 {files.length} 张榜单截图
        </button>
        {busy && (
          <button
            className="text-btn"
            onClick={() => {
              generation.current++;
              setBusy(false);
              setProgress('');
              setConfirmed(false);
            }}
          >
            停止后续识别
          </button>
        )}
      </div>
      {progress && <p role="status">{progress}</p>}
      {errors.map((e, i) => (
        <p className="error-message" role="alert" key={i}>
          {e}
        </p>
      ))}
      {captures.length > 0 && (
        <>
          <p className="pro-notice">
            识别成功 {captures.length} 张 · {merged.rows.length} 个英雄分路 · 合并{' '}
            {merged.duplicateRows} 条重复记录、{merged.duplicateFiles} 张重复图片 · 待解决{' '}
            {conflicts.length} 项冲突
          </p>
          <p className="data-caption">
            识别的数据日期：{merged.dataDates.join(' / ') || '未识别，请在下方填写'}
            。选中的分段不能仅凭标签文字确定，请核对下方“数据分段”。
          </p>
          {merged.dataDates.length > 1 && (
            <p role="alert" className="error-message">
              截图含不同数据日期，不能合成一批。请重新选择同一天的截图。
            </p>
          )}
          <div className="table-scroll">
            <table className="pro-table">
              <caption>待核对记录 · 百分比按截图原精度保留</caption>
              <thead>
                <tr>
                  <th>英雄 / 分路</th>
                  <th>胜 / 出场 / 禁用</th>
                  <th>截图来源</th>
                  <th>采用记录</th>
                </tr>
              </thead>
              <tbody>
                {merged.rows.map((r) => {
                  const selected = choices[r.key] ?? 0,
                    v = r.variants[Math.max(0, selected)];
                  return (
                    <tr key={r.key}>
                      <td>
                        {v.row.name} · {v.row.role}
                        {v.row.ocrConfidence < 0.92 && (
                          <small className="block-source">识别置信度偏低，请核对</small>
                        )}
                      </td>
                      <td>
                        {v.row.winRate}% / {v.row.pickRate}% / {v.row.banRate}%
                      </td>
                      <td>{v.files.join('、')}</td>
                      <td>
                        <select
                          aria-label={'采用' + r.key}
                          value={choices[r.key] ?? (r.variants.length > 1 ? '' : 0)}
                          onChange={(e) => choose(r.key, Number(e.target.value))}
                        >
                          {r.variants.length > 1 && (
                            <option value="" disabled>
                              请选择冲突记录
                            </option>
                          )}
                          {r.variants.map((v, i) => (
                            <option value={i} key={i}>
                              {v.row.winRate}/{v.row.pickRate}/{v.row.banRate} · {v.files[0]}
                            </option>
                          ))}
                          <option value={-1}>不采用此英雄</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {merged.rejected.length > 0 && (
            <details open>
              <summary>未纳入的 {merged.rejected.length} 项</summary>
              {merged.rejected.map((r, i) => (
                <p className="data-caption" key={i}>
                  {r.fileName} · {r.text}：{r.reason}
                </p>
              ))}
            </details>
          )}
          <label className="check-control">
            <input
              aria-label="已核对榜单图片来源及数值"
              type="checkbox"
              checked={confirmed}
              disabled={busy || !!conflicts.length || merged.dataDates.length > 1}
              onChange={(e) => {
                onInvalidate();
                setConfirmed(e.target.checked);
              }}
            />
            已对照截图核对来源、分段、日期和数值
          </label>
          <div className="pro-actions">
            <button
              className="btn primary"
              disabled={
                busy ||
                !confirmed ||
                !selectedCount ||
                !!conflicts.length ||
                merged.dataDates.length > 1
              }
              onClick={apply}
            >
              将 {selectedCount} 行填入下方表格
            </button>
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() =>
                download(
                  '开局-榜单识别核对记录.json',
                  JSON.stringify(
                    {
                      capturedAt: new Date().toISOString(),
                      captures,
                      choices,
                      status: 'review-record-not-published',
                    },
                    null,
                    2,
                  ),
                )
              }
            >
              导出识别核对记录
            </button>
          </div>
          <p className="data-caption">
            填入会替换下方尚未保存的行；请补齐来源与统计范围，再“预览并核对”后保存。
          </p>
          {applied && <p role="status">已填入表格，尚未保存。继续核对下方来源和统计范围。</p>}
        </>
      )}
    </section>
  );
}
