import { useRef, useState } from 'react';
import { ArrowRight, FileJson, FileUp, LoaderCircle, Sparkles, Check, Info } from 'lucide-react';
import { Modal } from './ui.tsx';
import { modelSchema } from './core/model.ts';
import type { Economy } from './core/model.ts';
import type { Candidate, Clarification } from './core/api-types.ts';
import { api } from './api.ts';
export default function ImportDialog({
  model,
  mode,
  configured,
  onClose,
  onImport,
}: {
  model: Economy;
  mode: 'json' | 'ai';
  configured: boolean;
  onClose: () => void;
  onImport: (m: Economy, source: 'custom' | 'model') => void;
}) {
  const [tab, setTab] = useState(mode);
  const [json, setJson] = useState(JSON.stringify(model, null, 2));
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | Clarification | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const acceptJson = () => {
    try {
      const raw = JSON.parse(json);
      const parsed = modelSchema.parse(raw.model ?? raw);
      onImport(parsed, 'custom');
    } catch (error) {
      setError(
        error instanceof SyntaxError
          ? 'JSON 格式不完整，请检查括号和引号。'
          : '规则不符合格式：请检查资源、动作和验证约束，数量需为非负整数。',
      );
    }
  };
  const generate = async () => {
    setBusy(true);
    setError('');
    setCandidate(null);
    try {
      setCandidate(await api<Candidate | Clarification>('/generate', { input }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const label = (candidate: Candidate, path: string) => {
    const p = path.split('.');
    if (p[0] === 'resources') return candidate.model.resources[Number(p[1])]?.name + ' · 初始库存';
    if (p[0] === 'actions')
      return (
        candidate.model.actions[Number(p[1])]?.name +
        ' · ' +
        (p[2] === 'cost' ? '消耗' : '产出') +
        (candidate.model.resources.find((r) => r.id === p[3])?.name ?? p[3])
      );
    return '允许的净增上限';
  };
  return (
    <Modal title="把设计意图带进实验室" eyebrow="CREATE A RULE MODEL" onClose={onClose} wide>
      <div className="dialog-tabs">
        <button className={tab === 'json' ? 'active' : ''} onClick={() => setTab('json')}>
          <FileJson size={16} />
          结构化规则
        </button>
        <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
          <Sparkles size={16} />
          文字建模
        </button>
      </div>
      {tab === 'json' ? (
        <>
          <p className="dialog-lead">在这里调整资源、动作与验证约束，或导入之前保存的规则文件。</p>
          <div className="code-toolbar">
            <span>规则文件 · JSON</span>
            <button className="text-button" onClick={() => file.current?.click()}>
              <FileUp size={14} />
              选择文件
            </button>
          </div>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const selected = e.target.files?.[0];
              if (!selected) return;
              if (selected.size > 128 * 1024) {
                setError('规则文件不能超过 128 KB');
                return;
              }
              setJson(await selected.text());
              setError('');
            }}
          />
          <textarea
            className="code-editor"
            aria-label="完整规则 JSON"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            spellCheck={false}
          />
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <p>
              <Info size={14} />
              导入前会检查格式与资源引用。
            </p>
            <button className="button button-primary" onClick={acceptJson}>
              载入规则
              <ArrowRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="dialog-lead">
            说明初始库存、每个动作的成本与产出，以及你不希望发生的结果。候选规则由你检查后才会载入。
          </p>
          {!configured && (
            <div className="connection-note">
              <Info size={17} />
              <div>
                <strong>模型服务尚未连接</strong>
                <p>
                  当前仍可使用结构化编辑和全部验证功能。连接后，下面的文字会发送给你配置的模型服务。
                </p>
                <details>
                  <summary>连接方式</summary>
                  <p>
                    将项目中的 .env.example 复制为 .env，填写
                    MODEL_BASE_URL、MODEL_API_KEY、MODEL_NAME，然后重新启动服务。密钥只由本机服务读取。
                  </p>
                </details>
              </div>
            </div>
          )}
          <label className="input-label" htmlFor="intent-input">
            你的规则与验证意图
          </label>
          <textarea
            id="intent-input"
            className="intent-input"
            value={input}
            maxLength={12000}
            onChange={(e) => {
              setInput(e.target.value);
              setCandidate(null);
            }}
            placeholder="例如：初始有 12 金币，矿石和金属锭均为 0。3 金币买 1 矿石，2 矿石炼成 1 金属锭，1 金属锭卖 7 金币。我希望矿石和金属锭恢复初始库存时，金币不能净增……"
          />
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <p>只在点击后调用模型，可能产生服务费用。</p>
            <button
              className="button button-primary"
              disabled={!configured || busy || input.trim().length < 10}
              onClick={generate}
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
              {busy ? '正在整理规则…' : '生成候选规则'}
            </button>
          </div>
          {candidate?.status === 'needs-clarification' && (
            <div className="candidate-box">
              <h3>还需要澄清这些信息</h3>
              <ul>
                {candidate.questions.map((question, i) => (
                  <li key={i}>{question}</li>
                ))}
              </ul>
              <p>补充到上方文字中，再次生成。</p>
            </div>
          )}
          {candidate?.status === 'candidate' && (
            <div className="candidate-box">
              <h3>
                {candidate.model.title} <span>待你确认</span>
              </h3>
              <p>
                {candidate.model.resources.length} 种资源 · {candidate.model.actions.length} 条动作
              </p>
              <div className="evidence-list">
                {candidate.evidence.map((e, i) => (
                  <div key={i}>
                    <b>{label(candidate, e.path)}</b>
                    <q>{e.quote}</q>
                  </div>
                ))}
              </div>
              {candidate.notes.map((note, i) => (
                <p key={i}>{note}</p>
              ))}
              <p className="muted">
                引用已检查是否存在于输入中，数值含义和设计意图仍需你逐项确认。
              </p>
              <button
                className="button button-primary"
                onClick={() => onImport(candidate.model, 'model')}
              >
                <Check size={16} />
                确认并载入候选
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
