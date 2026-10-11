import { useEffect, useState } from 'react';
import { ArrowRight, Plus, Trash2, Braces, PencilLine } from 'lucide-react';
import { ResourceIcon } from './ui.tsx';
import type { Economy } from './core/model.ts';

function Amount({ value, onChange, label, disabled = false }: { value: number; onChange: (value: number) => void; label: string; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return <input className="amount-input" type="number" min="0" max="1000000" step="1" value={text} aria-label={label} disabled={disabled}
    onChange={event => { setText(event.target.value); const n = Number(event.target.value); if (event.target.value !== '' && Number.isInteger(n) && n >= 0 && n <= 1000000) onChange(n); }}
    onBlur={() => setText(String(value))} />;
}
export default function RuleEditor({ model, onChange, disabled, onJson }: { model: Economy; onChange: (model: Economy) => void; disabled: boolean; onJson: () => void }) {
  const edit = (fn: (draft: Economy) => void) => { const draft = structuredClone(model); fn(draft); onChange(draft); };
  const name = (id: string) => model.resources.find(r => r.id === id)?.name ?? id;
  return <fieldset className="rule-editor" disabled={disabled}>
    <div className="section-caption"><span><PencilLine size={15} />初始资源</span><span>从这里开始每次推演</span></div>
    <div className="resource-inputs">{model.resources.map((resource, index) =>
      <label className="resource-input" key={resource.id}><ResourceIcon index={index} /><span>{resource.name}</span><Amount value={resource.initial} label={resource.name + '初始库存'} onChange={n => edit(d => { d.resources[index].initial = n; })} /></label>
    )}</div>
    <div className="section-caption action-caption"><span>交易与制造规则 <b>{model.actions.length}</b></span><button className="text-button" onClick={onJson} type="button"><Braces size={13} />完整规则</button></div>
    <div className="rule-table">
      <div className="rule-table-head"><span>动作</span><span>消耗</span><span /><span>产出</span><span /></div>
      {model.actions.map((action, i) => <div className="rule-row" key={action.id}>
        <label className="action-name"><span>{String(i + 1).padStart(2, '0')}</span><input aria-label={'动作 ' + (i + 1) + ' 名称'} value={action.name} maxLength={40} onChange={e => edit(d => { d.actions[i].name = e.target.value; })} /></label>
        <div className="vector">{Object.entries(action.cost).map(([id, amount]) => <label key={id}><Amount label={action.name + '消耗' + name(id)} value={amount} onChange={n => edit(d => { d.actions[i].cost[id] = n; })} /><span>{name(id)}</span></label>)}{!Object.keys(action.cost).length && <span className="muted">无消耗</span>}</div>
        <ArrowRight size={14} className="rule-arrow" />
        <div className="vector">{Object.entries(action.gain).map(([id, amount]) => <label key={id}><Amount label={action.name + '产出' + name(id)} value={amount} onChange={n => edit(d => { d.actions[i].gain[id] = n; })} /><span>{name(id)}</span></label>)}{!Object.keys(action.gain).length && <span className="muted">无产出</span>}</div>
        <button className="icon-button delete-action" title="移除此动作" aria-label={'删除' + action.name} disabled={model.actions.length <= 1 || disabled} onClick={() => edit(d => { d.actions.splice(i, 1); })}><Trash2 size={14} /></button>
      </div>)}
    </div>
    <button className="add-action" disabled={model.actions.length >= 16 || disabled} onClick={() => edit(d => { d.actions.push({ id: 'action_' + Date.now().toString(36), name: '新动作', cost: { [d.resources[0].id]: 1 }, gain: { [d.resources[1].id]: 1 } }); })}><Plus size={14} />添加动作</button>
  </fieldset>;
}
