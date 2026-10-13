import { useState } from 'react';
import { Plus, Trash2, Check, Save } from 'lucide-react';
import { heroes, heroById } from '../catalog.ts';
import { ROLES } from '../model.ts';
import type { Role } from '../model.ts';
import { SEGMENTS, snapshotSchema } from './model.ts';
import { blankEntry, parsePastedStats, parseStatEntries, inputError } from './importers.ts';
import type { StatEntry } from './importers.ts';
import { Modal } from '../ui.tsx';
import { api } from '../../api.ts';
import { scopeIssue, scopeLabel } from './statistics.ts';
import type { z } from 'zod';
import TableCapture from './TableCapture.tsx';
type Input = z.infer<typeof snapshotSchema>;
export default function StatImport({
  segment,
  role,
  onClose,
  onSaved,
}: {
  segment: string;
  role: string;
  onClose: () => void;
  onSaved: (segment: string) => Promise<void>;
}) {
  const today = new Date().toLocaleDateString('en-CA');
  const [mode, setMode] = useState<'table' | 'json' | 'screenshots'>('table');
  const [meta, setMeta] = useState({
    title: '',
    segment,
    patch: '',
    startDate: today,
    endDate: today,
    sourceName: '',
    sourceUrl: '',
  });
  const [entries, setEntries] = useState<StatEntry[]>([blankEntry(role as Role)]);
  const [scope, setScope] = useState({
    denominator: 'unknown',
    winRateScope: 'unknown',
    winRateWindow: 'unknown',
    scopeNotes: '',
  });
  const [pasted, setPasted] = useState(''),
    [raw, setRaw] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Input | null>(null);
  const reset = () => {
    setPreview(null);
    setError('');
  };
  const change = (index: number, key: keyof StatEntry, value: string) => {
    reset();
    setEntries(entries.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  };
  const parse = () =>
    snapshotSchema.parse(
      mode === 'json'
        ? JSON.parse(raw)
        : { ...meta, ...scope, rows: parseStatEntries(entries, heroes) },
    );
  const inspect = () => {
    try {
      setPreview(parse());
      setError('');
    } catch (e) {
      setError(inputError(e));
    }
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const input = mode === 'json' ? parse() : preview;
      if (!input) throw new Error('请先预览并核对');
      await api('/pro/snapshot', input);
      await onSaved(input.segment);
    } catch (e) {
      setError(inputError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="录入有出处的英雄统计" onClose={onClose} wide>
      <p className="dialog-lead">
        从你能看到的统计表录入，或粘贴表格。保留分段、版本、日期和来源；没有公布场次就留空。
      </p>
      <div className="pro-actions">
        <button
          className={'btn ' + (mode === 'screenshots' ? 'primary' : 'secondary')}
          onClick={() => {
            setMode('screenshots');
            reset();
          }}
        >
          榜单截图识别
        </button>
        <button
          className={'btn ' + (mode === 'table' ? 'primary' : 'secondary')}
          onClick={() => {
            setMode('table');
            reset();
          }}
        >
          表格录入
        </button>
        <button
          className={'btn ' + (mode === 'json' ? 'primary' : 'secondary')}
          onClick={() => {
            setMode('json');
            reset();
          }}
        >
          JSON 导入
        </button>
      </div>
      {mode !== 'json' ? (
        <>
          {mode === 'screenshots' && (
            <>
              <div className="pro-toolbar">
                <label>
                  常用数据来源
                  <select
                    aria-label="选择榜单来源"
                    defaultValue=""
                    onChange={(e) => {
                      reset();
                      const t = e.target.value === 'tianyuan';
                      setMeta((m) => ({
                        ...m,
                        sourceName: t ? '天元之弈数据站 · 截图核对' : '王者营地 · 截图核对',
                        sourceUrl: t
                          ? '#小程序://天元之弈/u6nCjaHUkuIRe6u'
                          : 'https://camp.qq.com/h5/webdist/hero-rank/index.html',
                        patch: m.patch || '来源未标注版本，待核对',
                      }));
                      setScope({
                        denominator: 'unknown',
                        winRateScope: 'unknown',
                        winRateWindow: 'unknown',
                        scopeNotes: '',
                      });
                    }}
                  >
                    <option value="" disabled>
                      选择实际截图来源
                    </option>
                    <option value="tianyuan">天元之弈数据站</option>
                    <option value="camp">王者营地</option>
                  </select>
                </label>
              </div>
              <TableCapture
                key={meta.sourceUrl}
                onInvalidate={reset}
                onApply={({ entries, date, hashes }) => {
                  reset();
                  setEntries(entries);
                  setMeta((m) => ({
                    ...m,
                    title: m.title || '榜单截图核对批次',
                    ...(date ? { startDate: date, endDate: date } : {}),
                  }));
                  setScope((s) => ({
                    ...s,
                    scopeNotes: (
                      '截图识别后人工核对；图片 SHA256：' +
                      hashes.map((h) => h.slice(0, 16)).join('、') +
                      '。' +
                      s.scopeNotes
                    ).slice(0, 600),
                  }));
                }}
              />
            </>
          )}
          <div className="pro-form">
            <label>
              批次名称
              <input
                value={meta.title}
                maxLength={80}
                onChange={(e) => {
                  reset();
                  setMeta({ ...meta, title: e.target.value });
                }}
                placeholder="例如：10 月中路统计"
              />
            </label>
            <label>
              数据分段
              <select
                aria-label="录入数据分段"
                value={meta.segment}
                onChange={(e) => {
                  reset();
                  setMeta({ ...meta, segment: e.target.value });
                }}
              >
                {SEGMENTS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              游戏版本
              <input
                value={meta.patch}
                maxLength={60}
                onChange={(e) => {
                  reset();
                  setMeta({ ...meta, patch: e.target.value });
                }}
                placeholder="按来源所示版本填写"
              />
            </label>
            <label>
              统计开始日期
              <input
                type="date"
                value={meta.startDate}
                onChange={(e) => {
                  reset();
                  setMeta({ ...meta, startDate: e.target.value });
                }}
              />
            </label>
            <label>
              统计结束日期
              <input
                type="date"
                value={meta.endDate}
                onChange={(e) => {
                  reset();
                  setMeta({ ...meta, endDate: e.target.value });
                }}
              />
            </label>
            <label>
              数据发布者
              <input
                value={meta.sourceName}
                maxLength={80}
                onChange={(e) => {
                  reset();
                  setMeta({ ...meta, sourceName: e.target.value });
                }}
                placeholder="实际发布者名称"
              />
            </label>
          </div>
          <label className="field">
            来源链接或微信小程序分享口令
            <input
              aria-label="统计来源"
              value={meta.sourceUrl}
              maxLength={600}
              onChange={(e) => {
                reset();
                setMeta({ ...meta, sourceUrl: e.target.value });
              }}
              placeholder="https://… 或 #小程序://…"
            />
          </label>
          <fieldset className="scope-fields">
            <legend>核对指标口径</legend>
            <p className="data-caption">
              按来源说明填写。分段页面中的胜率也可能来自全分段或版本累计；不确定就保留待核对。
            </p>
            <div className="pro-form">
              <label>
                胜率统计人群
                <select
                  aria-label="胜率统计人群"
                  value={scope.winRateScope}
                  onChange={(e) => {
                    reset();
                    setScope({ ...scope, winRateScope: e.target.value });
                  }}
                >
                  <option value="unknown">待核对</option>
                  <option value="segment">与所选分段一致</option>
                  <option value="all">全分段样本</option>
                </select>
              </label>
              <label>
                胜率时间范围
                <select
                  aria-label="胜率时间范围"
                  value={scope.winRateWindow}
                  onChange={(e) => {
                    reset();
                    setScope({ ...scope, winRateWindow: e.target.value });
                  }}
                >
                  <option value="unknown">待核对</option>
                  <option value="range">与所填起止日期一致</option>
                  <option value="version">游戏版本累计</option>
                </select>
              </label>
              <label>
                出场与禁用分母
                <select
                  aria-label="出场与禁用分母"
                  value={scope.denominator}
                  onChange={(e) => {
                    reset();
                    setScope({ ...scope, denominator: e.target.value });
                  }}
                >
                  <option value="unknown">待核对，不计算 BP 率</option>
                  <option value="match">已确认采用同一对局分母</option>
                </select>
              </label>
            </div>
            <label className="field">
              口径说明
              <input
                aria-label="口径说明"
                maxLength={600}
                value={scope.scopeNotes}
                onChange={(e) => {
                  reset();
                  setScope({ ...scope, scopeNotes: e.target.value });
                }}
                placeholder="例如：来源对千强人群的定义、版本累计规则"
              />
            </label>
          </fieldset>
          <div className="stat-entry-list">
            {entries.map((entry, i) => (
              <div className="stat-entry" key={i}>
                <label>
                  英雄
                  <select
                    aria-label={'录入英雄' + (i + 1)}
                    value={entry.hero}
                    onChange={(e) => change(i, 'hero', e.target.value)}
                  >
                    <option value="">选择英雄</option>
                    {heroes.map((h) => (
                      <option key={h.id} value={h.name}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  分路
                  <select
                    aria-label={'录入分路' + (i + 1)}
                    value={entry.role}
                    onChange={(e) => change(i, 'role', e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    ['win', '胜率 %'],
                    ['pick', '出场率 %'],
                    ['ban', '禁用率 %'],
                    ['games', '场次（可空）'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      aria-label={label + '第' + (i + 1) + '行'}
                      inputMode="decimal"
                      value={entry[key]}
                      onChange={(e) => change(i, key, e.target.value)}
                    />
                  </label>
                ))}
                <button
                  className="icon-btn"
                  aria-label={'删除统计第' + (i + 1) + '行'}
                  disabled={entries.length === 1}
                  onClick={() => {
                    reset();
                    setEntries(entries.filter((_, j) => j !== i));
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="pro-actions">
            <button
              className="btn secondary"
              disabled={entries.length >= 500}
              onClick={() => {
                reset();
                setEntries([...entries, blankEntry(role as Role)]);
              }}
            >
              <Plus size={15} />
              添加一行
            </button>
          </div>
          <details className="import-paste">
            <summary>从表格批量粘贴</summary>
            <p className="data-caption">
              列顺序：英雄、分路、胜率、出场率、禁用率、场次（可空）。支持制表符或逗号分隔；会替换上方待录入行。
            </p>
            <textarea
              aria-label="粘贴英雄统计表格"
              rows={5}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={'英雄\t分路\t胜率\t出场率\t禁用率\t场次'}
            />
            <button
              className="btn secondary"
              onClick={() => {
                try {
                  const rows = parsePastedStats(pasted);
                  parseStatEntries(rows, heroes);
                  reset();
                  setEntries(rows);
                } catch (e) {
                  setError(inputError(e));
                }
              }}
            >
              解析到表格
            </button>
          </details>
          <p className="data-caption">
            来源未提供的数值请勿猜填。口径未核对、指标人群混合或场次不足时，只展示原始指标，不给正式梯度。
          </p>
          <button className="btn secondary" onClick={inspect}>
            <Check size={15} />
            预览并核对
          </button>
          {preview && (
            <div className="surface import-preview">
              <h3>
                即将保存 {preview.rows.length} 行 · {preview.segment}
              </h3>
              <p className="data-caption">
                {preview.patch} · {preview.startDate} 至 {preview.endDate} · {preview.sourceName}
              </p>
              <p className="data-caption">
                {scopeLabel({ ...preview, id: 'preview', importedAt: '' })}
              </p>
              {scopeIssue({ ...preview, id: 'preview', importedAt: '' }) && (
                <p className="pro-notice">
                  {scopeIssue({ ...preview, id: 'preview', importedAt: '' })}
                </p>
              )}
              <div className="table-scroll">
                <table className="pro-table">
                  <thead>
                    <tr>
                      <th>英雄</th>
                      <th>分路</th>
                      <th>胜率</th>
                      <th>出场</th>
                      <th>禁用</th>
                      <th>场次</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.heroId + '-' + r.role}>
                        <td>{heroById(r.heroId)?.name}</td>
                        <td>{r.role}</td>
                        <td>{r.winRate}%</td>
                        <td>{r.pickRate}%</td>
                        <td>{r.banRate}%</td>
                        <td>{r.games ?? '未公布'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <label className="field">
            选择 JSON 文件
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 1024 * 1024) {
                  setError('文件不能超过 1 MB');
                  return;
                }
                reset();
                setRaw(await f.text());
              }}
            />
          </label>
          <label className="field">
            统计 JSON
            <textarea
              aria-label="统计 JSON"
              value={raw}
              rows={12}
              onChange={(e) => {
                reset();
                setRaw(e.target.value);
              }}
            />
          </label>
        </>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="pro-actions">
        <button
          className="btn primary"
          disabled={busy || (mode !== 'json' ? !preview : !raw)}
          onClick={save}
        >
          <Save size={15} />
          {busy ? '正在保存…' : mode === 'json' ? '核验并导入' : '确认保存统计'}
        </button>
      </div>
    </Modal>
  );
}
