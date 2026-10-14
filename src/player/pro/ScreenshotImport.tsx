import { useEffect, useState } from 'react';
import { Camera, Upload, Check } from 'lucide-react';
import { heroes } from '../catalog.ts';
import type { Profile } from './model.ts';
import { extractProfile, mergeScreenshot } from './screenshot.ts';
import type { OcrData, ExtractedField, ScreenshotScope } from './screenshot.ts';
import { api } from '../../api.ts';
export default function ScreenshotImport({
  profile,
  expectedProfile,
  onSaved,
  onBusy,
}: {
  profile: Profile;
  expectedProfile: Profile;
  onSaved: () => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [scope, setScope] = useState<ScreenshotScope>('lifetime'),
    [observedOn, setObservedOn] = useState(new Date().toLocaleDateString('en-CA')),
    [heroId, setHeroId] = useState<number>(),
    [image, setImage] = useState(''),
    [fileName, setFileName] = useState(''),
    [busy, setWorking] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [ocr, setOcr] = useState<OcrData>(),
    [fields, setFields] = useState<ExtractedField[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [warnings, setWarnings] = useState<string[]>([]),
    [ready, setReady] = useState<boolean>();
  const setBusy = (value: boolean) => {
    setWorking(value);
    onBusy(value);
  };
  useEffect(() => {
    api<{ ready: boolean }>('/pro/ocr-status')
      .then((r) => setReady(r.ready))
      .catch(() => setReady(false));
  }, []);
  const reset = () => {
    setOcr(undefined);
    setFields([]);
    setSelected([]);
    setError('');
    setMessage('');
    setWarnings([]);
  };
  const recognize = async () => {
    setBusy(true);
    reset();
    try {
      const result = await api<OcrData>('/pro/recognize-profile', { image });
      setOcr(result);
      const extracted = extractProfile(result, scope, heroes);
      setHeroId(extracted.heroId);
      setFields(extracted.fields);
      setSelected(
        extracted.fields.filter((f) => !f.ambiguous && f.confidence >= 0.92).map((f) => f.key),
      );
      setWarnings(extracted.warnings);
      if (!extracted.fields.length)
        setMessage('读到了文字，但没有可靠匹配的指标。可裁剪截图重试，或展开识别原文核对。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = mergeScreenshot(
        profile,
        scope,
        heroId,
        fields.filter((f) => selected.includes(f.key)),
        ocr!.sha256,
        observedOn,
      );
      await api('/pro/profile-save', { expected: expectedProfile, profile: updated });
      await onSaved();
      setOcr(undefined);
      setFields([]);
      setImage('');
      setMessage('已将核对后的截图数据保存到档案，英雄池、推荐和 BP 已更新。');
    } catch (e) {
      setError(
        'issues' in (e as object)
          ? '识别数据与已有记录不一致，请核对场次、当前/历史战力后再保存。'
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="surface screenshot-import" aria-label="截图建立英雄池">
      <div className="section-title">
        <div>
          <p className="eyebrow">LESS TYPING / 截图就能开始</p>
          <h2>
            <Camera size={22} />
            上传截图，建立真实英雄池
          </h2>
        </div>
        <span className="outline-tag">本机识别 · 无需模型费用</span>
      </div>
      <div className="capture-steps">
        <article>
          <strong>① 英雄战绩页</strong>
          <p>优先选累计范围，保留英雄名、场次、胜率和评分。常玩的英雄逐个识别即可。</p>
        </article>
        <article>
          <strong>② 英雄战力详情</strong>
          <p>保留当前/历史战力、表现分与相关标签。不要求每个字段都齐全。</p>
        </article>
        <article>
          <strong>③ 巅峰赛页面 · 可选</strong>
          <p>保留巅峰分和能量。只作段位背景，不替代单英雄实战记录。</p>
        </article>
      </div>
      <p className="data-caption">
        游戏和营地界面可能随版本变化，请保留字段标题并裁掉聊天、账号标识等无关区域。原图不入库；每次识别一张，核对后保存。
      </p>
      {ready === false && (
        <p className="pro-notice">
          本机尚未配置截图识别引擎。项目启动目录运行 npm run ocr:setup，安装后刷新本页。
        </p>
      )}
      <div className="pro-toolbar">
        <label>
          截图内容与统计范围
          <select
            disabled={busy}
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as ScreenshotScope);
              reset();
            }}
          >
            <option value="lifetime">英雄战绩 · 累计</option>
            <option value="season">英雄战绩 · 本赛季</option>
            <option value="recent">英雄战绩 · 近期</option>
            <option value="power">英雄战力详情</option>
            <option value="account">巅峰赛 / 账号背景</option>
          </select>
        </label>
        <label className="btn secondary capture-upload">
          <Upload size={16} />
          选择截图
          <input
            aria-label="上传英雄数据截图"
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              reset();
              setImage('');
              if (!f) return;
              if (f.size > 8 * 1024 * 1024) {
                setError('图片不能超过 8 MB');
                return;
              }
              setFileName(f.name);
              const reader = new FileReader();
              reader.onload = () => setImage(String(reader.result));
              reader.readAsDataURL(f);
            }}
          />
        </label>
        <button
          className="btn primary"
          disabled={!image || busy || ready === false}
          onClick={() => void recognize()}
        >
          {busy ? '处理中…' : '识别这张截图'}
        </button>
      </div>
      {image && (
        <details>
          <summary>查看所选截图 · {fileName}</summary>
          <img className="screenshot-preview" src={image} alt="待识别的游戏数据截图" />
        </details>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="pro-notice">
          {message}
        </p>
      )}
      {ocr && (
        <div className="ocr-review">
          <h3>核对识别结果</h3>
          <p>请确认英雄、统计范围与数值。勾选字段将更新已有记录，未勾选字段保持原值。</p>
          <label className="field">
            截图数据日期
            <input
              aria-label="截图数据日期"
              type="date"
              value={observedOn}
              max={new Date().toLocaleDateString('en-CA')}
              onChange={(e) => setObservedOn(e.target.value)}
            />
          </label>
          <p className="data-caption">
            默认今天；上传旧截图时请改为当时的数据日期，避免把历史表现当成近期状态。
          </p>
          {scope !== 'account' && (
            <label className="field">
              这张截图的英雄
              <select
                aria-label="确认截图英雄"
                value={heroId ?? ''}
                onChange={(e) => setHeroId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">请选择英雄</option>
                {heroes.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {warnings.map((w) => (
            <p key={w} className="data-caption">
              {w}
            </p>
          ))}
          <div className="ocr-fields">
            {fields.map((field, index) => (
              <article key={field.key}>
                <label className="check-control">
                  <input
                    aria-label={'采用' + field.label}
                    type="checkbox"
                    checked={selected.includes(field.key)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, field.key]
                          : selected.filter((k) => k !== field.key),
                      )
                    }
                  />
                  {field.label}
                </label>
                <input
                  aria-label={'识别值' + field.label}
                  type="number"
                  min={0}
                  step="any"
                  value={field.value}
                  onChange={(e) =>
                    setFields(
                      fields.map((f, i) =>
                        i === index ? { ...f, value: Number(e.target.value) } : f,
                      ),
                    )
                  }
                />
                <small>
                  {field.ambiguous
                    ? '存在歧义，请重点核对'
                    : `OCR 文字置信度 ${(field.confidence * 100).toFixed(0)}%（不代表数值准确率）`}
                </small>
                <p>{field.evidence}</p>
              </article>
            ))}
          </div>
          <details>
            <summary>展开识别原文</summary>
            <pre className="ocr-text">{ocr.lines.map((l) => l.text).join('\n')}</pre>
          </details>
          <button
            className="btn primary"
            disabled={busy || !selected.length || (scope !== 'account' && !heroId)}
            onClick={() => void save()}
          >
            <Check size={16} />
            确认并保存 {selected.length} 个字段
          </button>
        </div>
      )}
    </section>
  );
}
