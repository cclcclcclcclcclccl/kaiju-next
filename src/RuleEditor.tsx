import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Plus, Trash2, Braces, PencilLine } from 'lucide-react';
import { ActionDialog, ResourcesDialog } from './AuthoringDialogs.tsx';
import { ResourceIcon } from './ui.tsx';
import type { Economy } from './core/model.ts';

function Amount({
  value,
  onChange,
  label,
  disabled = false,
  onInvalid,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
  onInvalid: (message: string) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="amount-input"
      type="number"
      min="0"
      max="1000000"
      step="1"
      value={text}
      aria-label={label}
      disabled={disabled}
      onChange={(event) => {
        setText(event.target.value);
        const n = Number(event.target.value);
        if (event.target.value !== '' && Number.isInteger(n) && n >= 0 && n <= 1000000) onChange(n);
      }}
      onBlur={() => {
        const n = Number(text);
        if (text === '' || !Number.isInteger(n) || n < 0 || n > 1000000) {
          onInvalid(label + '：请输入 0 到 1,000,000 的整数，已恢复为 ' + value + '。');
          setText(String(value));
        }
      }}
    />
  );
}
export default function RuleEditor({
  model,
  onChange,
  disabled,
  onJson,
}: {
  model: Economy;
  onChange: (model: Economy) => void;
  disabled: boolean;
  onJson: () => void;
}) {
  const [dialog, setDialog] = useState<'resources' | 'action' | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [editorError, setEditorError] = useState('');
  const close = useCallback(() => setDialog(null), []);
  const edit = (fn: (draft: Economy) => void) => {
    setEditorError('');
    const draft = structuredClone(model);
    fn(draft);
    onChange(draft);
  };
  const name = (id: string) => model.resources.find((r) => r.id === id)?.name ?? id;
  return (
    <>
      <fieldset className="rule-editor" disabled={disabled}>
        <div className="section-caption">
          <span>
            <PencilLine size={15} />
            初始资源
          </span>
          <button className="text-button" onClick={() => setDialog('resources')}>
            编辑资源与标题
          </button>
        </div>
        <div className="resource-inputs">
          {model.resources.map((resource, index) => (
            <label className="resource-input" key={resource.id}>
              <ResourceIcon index={index} />
              <span>{resource.name}</span>
              <Amount
                onInvalid={setEditorError}
                value={resource.initial}
                label={resource.name + '初始库存'}
                onChange={(n) =>
                  edit((d) => {
                    d.resources[index].initial = n;
                  })
                }
              />
            </label>
          ))}
        </div>
        <div className="section-caption action-caption">
          <span>
            交易与制造规则 <b>{model.actions.length}</b>
          </span>
          <button className="text-button" onClick={onJson} type="button">
            <Braces size={13} />
            完整规则
          </button>
        </div>
        <div className="rule-table">
          <div className="rule-table-head">
            <span>动作</span>
            <span>消耗</span>
            <span />
            <span>产出</span>
            <span />
          </div>
          {model.actions.map((action, i) => (
            <div className="rule-row" key={action.id}>
              <label className="action-name">
                <span>{String(i + 1).padStart(2, '0')}</span>
                <input
                  aria-label={'动作 ' + (i + 1) + ' 名称'}
                  value={action.name}
                  maxLength={40}
                  onChange={(e) =>
                    edit((d) => {
                      d.actions[i].name = e.target.value;
                    })
                  }
                />
              </label>
              <div className="vector">
                {Object.entries(action.cost).map(([id, amount]) => (
                  <label key={id}>
                    <Amount
                      onInvalid={setEditorError}
                      label={action.name + '消耗' + name(id)}
                      value={amount}
                      onChange={(n) =>
                        edit((d) => {
                          d.actions[i].cost[id] = n;
                        })
                      }
                    />
                    <span>{name(id)}</span>
                  </label>
                ))}
                {!Object.keys(action.cost).length && <span className="muted">无消耗</span>}
              </div>
              <ArrowRight size={14} className="rule-arrow" />
              <div className="vector">
                {Object.entries(action.gain).map(([id, amount]) => (
                  <label key={id}>
                    <Amount
                      onInvalid={setEditorError}
                      label={action.name + '产出' + name(id)}
                      value={amount}
                      onChange={(n) =>
                        edit((d) => {
                          d.actions[i].gain[id] = n;
                        })
                      }
                    />
                    <span>{name(id)}</span>
                  </label>
                ))}
                {!Object.keys(action.gain).length && <span className="muted">无产出</span>}
              </div>
              <div className="action-tools">
                <button
                  className="icon-button"
                  title="编辑消耗和产出资源"
                  aria-label={'编辑' + action.name + '资源'}
                  onClick={() => {
                    setActionId(action.id);
                    setDialog('action');
                  }}
                >
                  <PencilLine size={14} />
                </button>
                <button
                  className="icon-button delete-action"
                  title="移除此动作"
                  aria-label={'删除' + action.name}
                  disabled={model.actions.length <= 1 || disabled}
                  onClick={() => {
                    const dependencies = (model.playtests ?? []).filter((t) =>
                      t.actions.includes(action.id),
                    );
                    if (dependencies.length) {
                      setEditorError(
                        '该动作被保留用例引用：' +
                          dependencies.map((t) => t.name).join('、') +
                          '。请先编辑相关用例。',
                      );
                      return;
                    }
                    edit((d) => {
                      d.actions.splice(i, 1);
                    });
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          className="add-action"
          disabled={model.actions.length >= 16 || disabled}
          onClick={() => {
            setActionId(null);
            setDialog('action');
          }}
        >
          <Plus size={14} />
          添加动作
        </button>
        {editorError && (
          <p className="form-error" role="alert">
            {editorError}
          </p>
        )}
      </fieldset>
      {dialog === 'resources' && (
        <ResourcesDialog model={model} onSave={onChange} onClose={close} />
      )}
      {dialog === 'action' && (
        <ActionDialog model={model} actionId={actionId} onSave={onChange} onClose={close} />
      )}
    </>
  );
}
