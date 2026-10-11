import { useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { Modal } from './ui.tsx';
import { modelSchema } from './core/model.ts';
import type { Economy } from './core/model.ts';

export function ResourcesDialog({
  model,
  onSave,
  onClose,
}: {
  model: Economy;
  onSave: (model: Economy) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(model));
  const [error, setError] = useState('');
  const edit = (fn: (draft: Economy) => void) => {
    const next = structuredClone(draft);
    fn(next);
    setDraft(next);
    setError('');
  };
  const remove = (id: string) => {
    const usage = draft.actions
      .filter((a) => (a.cost[id] ?? 0) > 0 || (a.gain[id] ?? 0) > 0)
      .map((a) => a.name);
    const tests = (draft.playtests ?? [])
      .filter((t) => Object.hasOwn(t.initial, id) || Object.hasOwn(t.minimum, id))
      .map((t) => t.name);
    if (draft.resources.length <= 2) {
      setError('至少保留两种资源。');
      return;
    }
    if (id === draft.contract.target) {
      setError('该资源是观察目标，请先在验证约束中选择其他目标。');
      return;
    }
    if (draft.contract.restore.includes(id) && draft.contract.restore.length <= 1) {
      setError('至少需要一种恢复库存，请先调整验证约束。');
      return;
    }
    if (usage.length || tests.length) {
      setError('请先修改对该资源的引用：' + [...usage, ...tests].join('、') + '。');
      return;
    }
    edit((d) => {
      d.resources = d.resources.filter((r) => r.id !== id);
      d.contract.restore = d.contract.restore.filter((r) => r !== id);
      d.actions.forEach((a) => {
        delete a.cost[id];
        delete a.gain[id];
      });
    });
  };
  return (
    <Modal title="编辑资源与实验信息" eyebrow="BUILD YOUR ECONOMY" onClose={onClose} wide>
      <p className="dialog-lead">
        最多 8 种资源。新增资源默认加入恢复库存约束；正在被动作或用例使用的资源会提示依赖。
      </p>
      <label className="form-field">
        实验名称
        <input
          aria-label="实验名称"
          maxLength={80}
          value={draft.title}
          onChange={(e) =>
            edit((d) => {
              d.title = e.target.value;
            })
          }
        />
      </label>
      <label className="form-field">
        设计说明
        <textarea
          aria-label="设计说明"
          maxLength={1200}
          rows={3}
          value={draft.description}
          onChange={(e) =>
            edit((d) => {
              d.description = e.target.value;
            })
          }
        />
      </label>
      <div className="resource-manager">
        {draft.resources.map((r, i) => (
          <div className="resource-manager-row" key={r.id}>
            <label className="form-field">
              资源名称
              <input
                aria-label={'资源 ' + (i + 1) + ' 名称'}
                maxLength={24}
                value={r.name}
                onChange={(e) =>
                  edit((d) => {
                    d.resources[i].name = e.target.value;
                  })
                }
              />
            </label>
            <label className="form-field">
              初始库存
              <input
                aria-label={'资源 ' + (i + 1) + ' 初始库存'}
                type="number"
                min={0}
                max={1000000}
                step={1}
                value={Number.isNaN(r.initial) ? '' : r.initial}
                onChange={(e) =>
                  edit((d) => {
                    d.resources[i].initial = e.target.valueAsNumber;
                  })
                }
              />
            </label>
            <button
              className="icon-button"
              aria-label={'移除资源' + r.name}
              onClick={() => remove(r.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="add-action"
        disabled={draft.resources.length >= 8}
        onClick={() =>
          edit((d) => {
            const id = 'r_' + Date.now().toString(36);
            d.resources.push({ id, name: '新资源', initial: 0 });
            d.contract.restore.push(id);
          })
        }
      >
        <Plus size={15} />
        添加资源
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <p>关闭窗口可放弃本次未保存的修改。</p>
        <button
          className="button button-primary"
          onClick={() => {
            const parsed = modelSchema.safeParse(draft);
            if (!parsed.success) {
              setError('请检查名称、数量和资源引用。库存必须是 0 到 1,000,000 的整数。');
              return;
            }
            onSave(parsed.data);
            onClose();
          }}
        >
          <Check size={15} />
          保存资源设置
        </button>
      </div>
    </Modal>
  );
}

export function ActionDialog({
  model,
  actionId,
  onSave,
  onClose,
}: {
  model: Economy;
  actionId: string | null;
  onSave: (model: Economy) => void;
  onClose: () => void;
}) {
  const [action, setAction] = useState<Economy['actions'][number]>(() =>
    structuredClone(
      model.actions.find((a) => a.id === actionId) ?? {
        id: 'action_' + Date.now().toString(36),
        name: '新动作',
        cost: { [model.resources[0].id]: 1 },
        gain: { [model.resources[1].id]: 1 },
      },
    ),
  );
  const [error, setError] = useState('');
  const apply = () => {
    const draft = structuredClone(model);
    const clean = {
      ...action,
      cost: Object.fromEntries(Object.entries(action.cost).filter(([, n]) => n !== 0)),
      gain: Object.fromEntries(Object.entries(action.gain).filter(([, n]) => n !== 0)),
    };
    draft.actions = actionId
      ? draft.actions.map((a) => (a.id === actionId ? clean : a))
      : [...draft.actions, clean];
    const parsed = modelSchema.safeParse(draft);
    if (!parsed.success) {
      setError('请填写动作名称和合法整数，至少需要一项非零消耗或产出。');
      return;
    }
    onSave(parsed.data);
    onClose();
  };
  return (
    <Modal
      title={actionId ? '编辑动作资源' : '添加交易或制造动作'}
      eyebrow="DEFINE A TRANSITION"
      onClose={onClose}
      wide
    >
      <p className="dialog-lead">
        可以同时消耗和产出多种资源。填 0 表示不涉及；只有支付全部成本后，动作才会执行。
      </p>
      <label className="form-field">
        动作名称
        <input
          aria-label="编辑动作名称"
          maxLength={40}
          value={action.name}
          onChange={(e) => setAction({ ...action, name: e.target.value })}
        />
      </label>
      <div className="action-matrix">
        <div className="action-matrix-row matrix-heading">
          <span>资源</span>
          <span>每次消耗</span>
          <span>每次产出</span>
        </div>
        {model.resources.map((r) => (
          <div className="action-matrix-row" key={r.id}>
            <strong>{r.name}</strong>
            {(['cost', 'gain'] as const).map((field) => (
              <input
                key={field}
                type="number"
                min={0}
                max={1000000}
                step={1}
                aria-label={(field === 'cost' ? '动作消耗' : '动作产出') + r.name}
                value={Number.isNaN(action[field][r.id]) ? '' : (action[field][r.id] ?? 0)}
                onChange={(e) =>
                  setAction({
                    ...action,
                    [field]: { ...action[field], [r.id]: e.target.valueAsNumber },
                  })
                }
              />
            ))}
          </div>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <p>对已有动作的修改会同步用于保留用例。</p>
        <button className="button button-primary" onClick={apply}>
          <Check size={15} />
          保存动作
        </button>
      </div>
    </Modal>
  );
}
