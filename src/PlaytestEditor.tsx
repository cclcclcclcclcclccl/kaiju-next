import { useCallback, useState } from 'react';
import { Plus, PencilLine, Trash2, ArrowUp, ArrowDown, Check, Route } from 'lucide-react';
import { Modal } from './ui.tsx';
import { modelSchema } from './core/model.ts';
import type { Economy, Playtest } from './core/model.ts';
import { evaluatePlaytests } from './core/simulation.ts';

export default function PlaytestEditor({
  model,
  onChange,
  disabled,
}: {
  model: Economy;
  onChange: (model: Economy) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState<Playtest | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const tests = model.playtests ?? [];
  const parsed = modelSchema.safeParse(model);
  const results = parsed.success ? evaluatePlaytests(parsed.data) : [];
  const save = (test: Playtest) => {
    onChange({
      ...model,
      playtests: tests.some((t) => t.id === test.id)
        ? tests.map((t) => (t.id === test.id ? test : t))
        : [...tests, test],
    });
    close();
  };
  return (
    <section className="playtest-section" aria-label="正常玩法保留检查">
      <div className="section-caption">
        <span>
          <Route size={16} /> 正常玩法保留检查 <b>{tests.length}</b>
        </span>
        <button
          className="text-button"
          disabled={disabled || tests.length >= 8 || !parsed.success}
          onClick={() =>
            setEditing({
              id: 'test_' + Date.now().toString(36),
              name: '新的保留用例',
              initial: {},
              actions: [model.actions[0].id],
              minimum: { [model.resources[1].id]: 1 },
            })
          }
        >
          <Plus size={14} />
          添加保留用例
        </button>
      </div>
      <p className="section-description">
        声明哪些操作必须仍然可行、结束时至少保留多少资源。每个修复方案都会再次检查这些要求。
      </p>
      {!tests.length && (
        <p className="unassessed">尚未声明正常玩法。修复比较将明确标记“未评估玩法影响”。</p>
      )}
      {tests.map((t) => {
        const result = results.find((r) => r.id === t.id);
        return (
          <article className="playtest-row" key={t.id}>
            <div>
              <strong>{t.name}</strong>
              <p>
                {t.actions
                  .map((id) => model.actions.find((a) => a.id === id)?.name ?? id)
                  .join(' → ')}
              </p>
              {result && (
                <span
                  className={
                    'check-label ' + (result.status === 'pass' ? 'check-pass' : 'check-fail')
                  }
                >
                  {result.status === 'pass' ? '当前通过' : '当前未通过'} · {result.message}
                </span>
              )}
            </div>
            <div className="row-tools">
              <button
                className="icon-button"
                disabled={disabled}
                aria-label={'编辑用例' + t.name}
                onClick={() => setEditing(structuredClone(t))}
              >
                <PencilLine size={15} />
              </button>
              <button
                className="icon-button"
                disabled={disabled}
                aria-label={'删除用例' + t.name}
                onClick={() =>
                  onChange({ ...model, playtests: tests.filter((x) => x.id !== t.id) })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        );
      })}
      {editing && <PlaytestDialog model={model} initial={editing} onSave={save} onClose={close} />}
    </section>
  );
}

function PlaytestDialog({
  model,
  initial,
  onSave,
  onClose,
}: {
  model: Economy;
  initial: Playtest;
  onSave: (test: Playtest) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const parsed = modelSchema.safeParse({ ...model, playtests: [draft] });
  const preview = parsed.success ? evaluatePlaytests(parsed.data)[0] : null;
  const move = (index: number, delta: number) => {
    const actions = [...draft.actions];
    [actions[index], actions[index + delta]] = [actions[index + delta], actions[index]];
    setDraft({ ...draft, actions });
  };
  return (
    <Modal title="定义必须保留的玩法" eyebrow="PRESERVE THE INTENT" onClose={onClose} wide>
      <p className="dialog-lead">
        检查一条明确的操作序列。它用于保护设计意图，通过这些用例不代表覆盖了全部玩法。
      </p>
      <label className="form-field">
        用例名称
        <input
          aria-label="用例名称"
          maxLength={60}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <div className="section-caption">
        <span>起始库存</span>
        <button className="text-button" onClick={() => setDraft({ ...draft, initial: {} })}>
          全部继承主规则
        </button>
      </div>
      <div className="form-grid">
        {model.resources.map((r) => (
          <label className="form-field" key={r.id}>
            {r.name}
            <input
              type="number"
              min={0}
              max={1000000}
              step={1}
              aria-label={'用例初始' + r.name}
              value={Number.isNaN(draft.initial[r.id]) ? '' : (draft.initial[r.id] ?? r.initial)}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  initial: {
                    ...draft.initial,
                    [r.id]: e.target.value === '' ? NaN : e.target.valueAsNumber,
                  },
                })
              }
            />
            <small>
              {Object.hasOwn(draft.initial, r.id) ? '此用例独立设置' : '随主规则初始库存变化'}
            </small>
          </label>
        ))}
      </div>
      <div className="section-caption">
        <span>按顺序执行</span>
        <span>最多 32 步，可重复动作</span>
      </div>
      <div className="sequence-editor">
        {draft.actions.map((id, i) => (
          <div className="sequence-row" key={i}>
            <span>{i + 1}</span>
            <select
              aria-label={'用例第 ' + (i + 1) + ' 步'}
              value={id}
              onChange={(e) => {
                const actions = [...draft.actions];
                actions[i] = e.target.value;
                setDraft({ ...draft, actions });
              }}
            >
              {model.actions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              aria-label={'上移第 ' + (i + 1) + ' 步'}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp size={14} />
            </button>
            <button
              className="icon-button"
              aria-label={'下移第 ' + (i + 1) + ' 步'}
              disabled={i === draft.actions.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown size={14} />
            </button>
            <button
              className="icon-button"
              aria-label={'移除第 ' + (i + 1) + ' 步'}
              disabled={draft.actions.length <= 1}
              onClick={() =>
                setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="add-action"
        disabled={draft.actions.length >= 32}
        onClick={() => setDraft({ ...draft, actions: [...draft.actions, model.actions[0].id] })}
      >
        <Plus size={14} />
        添加操作步骤
      </button>
      <div className="section-caption">
        <span>结束时的最低库存</span>
        <span>勾选至少一项</span>
      </div>
      <div className="form-grid">
        {model.resources.map((r) => (
          <div className="minimum-field" key={r.id}>
            <label>
              <input
                type="checkbox"
                checked={Object.hasOwn(draft.minimum, r.id)}
                onChange={(e) => {
                  const minimum = { ...draft.minimum };
                  if (e.target.checked) minimum[r.id] = 1;
                  else delete minimum[r.id];
                  setDraft({ ...draft, minimum });
                }}
              />
              {r.name}
            </label>
            {Object.hasOwn(draft.minimum, r.id) && (
              <input
                type="number"
                min={0}
                max={1000000}
                step={1}
                aria-label={'最低' + r.name}
                value={Number.isNaN(draft.minimum[r.id]) ? '' : draft.minimum[r.id]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    minimum: { ...draft.minimum, [r.id]: e.target.valueAsNumber },
                  })
                }
              />
            )}
          </div>
        ))}
      </div>
      {preview && (
        <div
          className={
            'playtest-preview ' + (preview.status === 'pass' ? 'check-pass' : 'check-fail')
          }
          role="status"
        >
          <strong>{preview.status === 'pass' ? '当前规则通过' : '当前规则未通过'}</strong>
          <p>{preview.message}</p>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <p>保存未通过的用例可用于记录尚未满足的设计要求。</p>
        <button
          className="button button-primary"
          onClick={() => {
            if (!parsed.success) {
              setError('请填写名称、合法库存、操作序列，并至少勾选一项最低库存。');
              return;
            }
            onSave(parsed.data.playtests![0]);
          }}
        >
          <Check size={15} />
          保存保留用例
        </button>
      </div>
    </Modal>
  );
}
