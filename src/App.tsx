import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Beaker, BookOpen, Check, ChevronRight, CircleHelp, Clock3, FileUp, FolderOpen, History, Layers3, LoaderCircle, RotateCcw, Save, Scale, ScanLine, Search, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { scenarios } from './core/scenarios.ts';
import { DEFAULT_BOUNDS, modelSchema } from './core/model.ts';
import type { Economy, Bounds, Comparison } from './core/model.ts';
import type { Project, Run, RunSummary } from './core/api-types.ts';
import { api, download } from './api.ts';
import { EconomyMap, Modal, Status } from './ui.tsx';
import RuleEditor from './RuleEditor.tsx';
import ResultPanel from './ResultPanel.tsx';
import ImportDialog from './ImportDialog.tsx';

type Source = 'sample' | 'custom' | 'model';
function readDraft(): { model: Economy; source: Source } {
  try {
    const raw = JSON.parse(localStorage.getItem('hengju-draft-v1') ?? 'null');
    if (raw && modelSchema.safeParse(raw.model).success) return { model: modelSchema.parse(raw.model), source: ['sample','custom','model'].includes(raw.source) ? raw.source : 'custom' };
  } catch { /* A damaged draft must not block the application. */ }
  return { model: structuredClone(scenarios[0].model), source: 'sample' };
}
export default function App() {
  const initial = useMemo(readDraft, []);
  const [model, setModel] = useState<Economy>(initial.model);
  const [source, setSource] = useState<Source>(initial.source);
  const [bounds, setBounds] = useState<Bounds>(DEFAULT_BOUNDS);
  const [view, setView] = useState<'lab'|'history'|'guide'>('lab');
  const [busy, setBusy] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [modal, setModal] = useState<'json'|'ai'|'projects'|null>(null);
  const [connected, setConnected] = useState(false);
  const [serviceReady, setServiceReady] = useState(false);
  const [query, setQuery] = useState('');
  const [previous, setPrevious] = useState<Economy | null>(null);
  const latestRequest = useRef(0);
  const closeModal = useCallback(() => setModal(null), []);
  const refresh = useCallback(async () => {
    const [status, history, saved] = await Promise.all([
      api<{ modelConfigured: boolean }>('/status'), api<RunSummary[]>('/runs'), api<Project[]>('/projects'),
    ]);
    setConnected(status.modelConfigured); setRuns(history); setProjects(saved); setServiceReady(true);
  }, []);
  useEffect(() => { refresh().catch(() => setToast({ text: '暂时无法连接本机服务。请确认服务已启动，再刷新页面。', error: true })); }, [refresh]);
  useEffect(() => {
    if (modelSchema.safeParse(model).success) {
      try { localStorage.setItem('hengju-draft-v1', JSON.stringify({ model, source })); } catch { /* Manual save remains available. */ }
    }
  }, [model, source]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const id = setTimeout(() => setToast(null), 4500); return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!playing || !run) return;
    if (step >= run.result.trace.length - 1) { setPlaying(false); return; }
    const id = setTimeout(() => setStep(s => s + 1), 850); return () => clearTimeout(id);
  }, [playing, step, run]);
  const stale = Boolean(run && (JSON.stringify(run.model) !== JSON.stringify(model) || JSON.stringify(run.result.bounds) !== JSON.stringify(bounds)));
  const changeModel = (next: Economy) => { setPrevious(model); setModel(next); setPlaying(false); };
  const load = (next: Economy, nextSource: Source = 'custom') => {
    latestRequest.current++; setPrevious(model); setModel(structuredClone(next)); setSource(nextSource); setRun(null); setComparisons([]); setStep(0); setPlaying(false); setProjectId(undefined); setView('lab'); setModal(null);
  };
  const analyze = async () => {
    const parsed = modelSchema.safeParse(model);
    if (!parsed.success) { setToast({ text: '请补全动作名称，并检查规则数量和资源引用。', error: true }); return; }
    const request = ++latestRequest.current;
    setBusy('run'); setPlaying(false); setComparisons([]);
    try {
      const result = await api<Run>('/analyze', { model: parsed.data, bounds });
      if (request !== latestRequest.current) return;
      setRun(result); setStep(0);
      setRuns(await api<RunSummary[]>('/runs'));
      setTimeout(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (error) { setToast({ text: (error as Error).message, error: true }); }
    finally { setBusy(''); }
  };
  const save = async () => {
    const parsed = modelSchema.safeParse(model);
    if (!parsed.success) { setToast({ text: '当前规则不完整，补全后再保存。', error: true }); return; }
    setBusy('save');
    try {
      const saved = await api<Project>('/projects', { model: parsed.data, ...(projectId ? { id: projectId } : {}) });
      setProjectId(saved.id); setProjects(await api<Project[]>('/projects')); setToast({ text: '实验规则已保存，可在「我的规则」中重新打开。' });
    } catch (error) { setToast({ text: (error as Error).message, error: true }); } finally { setBusy(''); }
  };
  const repairs = async () => {
    if (!run || stale) return; setBusy('repair');
    try { setComparisons(await api<Comparison[]>('/repairs', { runId: run.id })); }
    catch (error) { setToast({ text: (error as Error).message, error: true }); } finally { setBusy(''); }
  };
  const openRun = async (id: string) => {
    setBusy('history');
    try {
      const saved = await api<Run>('/runs/' + id);
      load(saved.model); setBounds(saved.result.bounds); setRun(saved); setStep(0);
    } catch (error) { setToast({ text: (error as Error).message, error: true }); } finally { setBusy(''); }
  };
  const restoredNames = model.contract.restore.map(id => model.resources.find(r => r.id === id)?.name).join('、');
  const targetName = model.resources.find(r => r.id === model.contract.target)?.name;
  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setView('lab')} aria-label="衡局首页"><span className="brand-mark"><Scale size={25} strokeWidth={1.6} /></span><span><strong>衡局<span>HENGJU</span></strong><small>规则的另一面</small></span></button>
      <div className="workspace-label">个人工作空间 <span>LOCAL</span></div>
      <nav className="main-nav" aria-label="主导航">
        <button className={view === 'lab' ? 'active' : ''} onClick={() => setView('lab')}><Beaker size={18} />规则实验室<span>01</span></button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><History size={18} />实验记录{runs.length > 0 && <span>{runs.length}</span>}</button>
        <button onClick={() => setModal('projects')}><FolderOpen size={18} />我的规则<span>{projects.length || ''}</span></button>
      </nav>
      <div className="sidebar-section-title">从一个问题开始 <span>EXAMPLES</span></div>
      <div className="scenario-list">{scenarios.map((scenario, i) => <button key={scenario.id} className={model.title === scenario.model.title && view === 'lab' ? 'selected' : ''} disabled={Boolean(busy)} onClick={() => { load(scenario.model, 'sample'); setBounds(DEFAULT_BOUNDS); }}>
        <span className={'scenario-icon scenario-icon-' + i}>{i === 0 ? <Layers3 size={17} /> : i === 1 ? <RotateCcw size={17} /> : <ShieldCheck size={17} />}</span><span><strong>{scenario.label}</strong><small>{scenario.tag}</small></span><ChevronRight size={13} />
      </button>)}</div>
      <div className="sidebar-note"><span className="note-orbit" /><p>好规则，<br />经得起多走一步。</p><small>先有意图，再有验证。</small></div>
      <div className="sidebar-bottom"><button className={view === 'guide' ? 'active' : ''} onClick={() => setView('guide')}><BookOpen size={17} />使用指南<ArrowRight size={14} /></button><div><i className={serviceReady ? 'online' : ''} /><span>{serviceReady ? '本地服务已连接' : '正在连接本地服务'}</span><small>v0.1</small></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><span>工作空间</span><ChevronRight size={13} /><strong>{view === 'lab' ? '规则实验室' : view === 'history' ? '实验记录' : '使用指南'}</strong></div><div className="topbar-right"><span className="local-badge"><span />数据保存在本机</span><button className="icon-button" aria-label="查看使用指南" onClick={() => setView('guide')}><CircleHelp size={19} /></button><span className="avatar">蔡</span></div></header>
      <main>
        {view === 'lab' && <>
          <section className="page-heading"><div><p className="eyebrow">DESIGN WITH INTENT. VERIFY WITH EVIDENCE.</p><h1>看见规则，<span>未曾预料的一面。</span></h1><p>把设计意图变成可验证的约束，让每一次修改都有依据。</p></div><button className="button button-secondary" disabled={Boolean(busy)} onClick={() => setModal('ai')}><Sparkles size={16} />从文字开始<ArrowRight size={15} /></button></section>
          <div className="experiment-header"><div><span className="experiment-index">01 / DESIGN</span><h2>{model.title}</h2><span className="source-tag">{source === 'sample' ? '合成示例' : source === 'model' ? '模型候选 · 已确认' : '自定义规则'}</span></div><div className="experiment-tools">
            <button className="icon-button" title="撤销上一次规则修改" aria-label="撤销修改" disabled={!previous || Boolean(busy)} onClick={() => { if (previous) { const current = model; setModel(previous); setPrevious(current); } }}><RotateCcw size={16} /></button>
            <button className="button button-quiet compact" disabled={Boolean(busy)} onClick={() => setModal('json')}><FileUp size={15} />导入 / 编辑</button>
            <button className="icon-button" title="导出规则 JSON" aria-label="导出规则" onClick={() => download('衡局-规则.json', JSON.stringify(model, null, 2))}><ArrowDownToLine size={16} /></button>
            <button className="button button-secondary compact" onClick={save} disabled={Boolean(busy)}>{busy === 'save' ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}保存规则</button>
          </div></div>
          <div className="workbench-grid"><section className="model-panel">
            <EconomyMap model={model} inventory={!stale && run?.result.trace.length ? run.result.trace[step]?.inventory : undefined} activeAction={!stale ? run?.result.trace[step]?.actionId : null} />
            <RuleEditor model={model} onChange={changeModel} disabled={Boolean(busy)} onJson={() => setModal('json')} />
          </section>
          <aside className="intent-panel"><div className="intent-heading"><span className="intent-icon"><ShieldCheck size={21} /></span><span>验证约束<small>DEFINE THE BOUNDARY</small></span><span className="intent-number" aria-hidden="true">01</span></div>
            <h3>你希望守住什么？</h3>
            <p className="intent-sentence">当 <strong>{restoredNames}</strong> 恢复初始库存时，<strong>{targetName}</strong> 净增不应超过 <strong>{model.contract.allowedProfit}</strong>。</p>
            <fieldset disabled={Boolean(busy)} className="intent-fields"><label><span>观察资源</span><select aria-label="观察资源" value={model.contract.target} onChange={e => changeModel({ ...model, contract: { ...model.contract, target: e.target.value, restore: model.resources.filter(r => r.id !== e.target.value).map(r => r.id) } })}>{model.resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label><span>允许净增</span><div className="unit-input"><input aria-label="允许净增" type="number" min="0" max="1000000" value={model.contract.allowedProfit} onChange={e => { const n = e.target.valueAsNumber; if (Number.isInteger(n) && n >= 0 && n <= 1000000) changeModel({ ...model, contract: { ...model.contract, allowedProfit: n } }); }} /><span>{targetName}</span></div></label></fieldset>
            <div className="scope-section"><div className="scope-heading"><Settings2 size={14} /><strong>推演多远</strong><span>搜索范围</span></div><label className="depth-label" htmlFor="depth"><span>最多连续操作</span><strong>{bounds.maxDepth}<small>步</small></strong></label><input id="depth" type="range" min="1" max="32" step="1" value={bounds.maxDepth} disabled={Boolean(busy)} onChange={e => setBounds({ ...bounds, maxDepth: Number(e.target.value) })} /><div className="range-labels"><span>1 步</span><span>32 步</span></div><label className="state-limit"><span>状态预算</span><select aria-label="状态预算" disabled={Boolean(busy)} value={bounds.maxStates} onChange={e => setBounds({ ...bounds, maxStates: Number(e.target.value) })}><option value={3000}>3,000</option><option value={12000}>12,000</option><option value={25000}>25,000</option></select></label></div>
            <button className="button button-primary run-button" disabled={Boolean(busy) || !serviceReady} onClick={analyze}>{busy === 'run' ? <LoaderCircle size={18} className="spin" /> : <ScanLine size={18} />}{busy === 'run' ? '正在搜索操作路径…' : run ? '重新验证' : '开始验证'}{!busy && <ArrowRight size={17} />}</button>
            <p className="scope-note">未找到反例，只说明本次范围内未发现。验证依据是你声明的约束。</p><div className="engine-tag"><i />确定性规则引擎<span>无需模型额度</span></div>
          </aside></div>
          <ResultPanel run={run} step={step} onStep={n => { setPlaying(false); setStep(n); }} playing={playing} onPlay={() => { if (!playing && run && step >= run.result.trace.length - 1) setStep(0); setPlaying(!playing); }} stale={stale} busy={busy} comparisons={comparisons} onRepair={repairs} onApply={comparison => {
            changeModel(comparison.patch.model); setSource('custom'); setPlaying(false);
            setToast({ text: '候选规则已载入。点击「重新验证」保存这次修改的正式结果。' });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }} />
          <footer className="page-footer"><span>衡局 HENGJU <i />让设计意图成为可验证的边界。</span><button onClick={() => setView('guide')}>了解验证范围<ArrowRight size={13} /></button></footer>
        </>}
        {view === 'history' && <section className="history-page"><div className="page-heading"><div><p className="eyebrow">AN AUDITABLE EXPERIMENT LOG</p><h1>每一个结论，<span>都有来路。</span></h1><p>每次验证保存独立快照，之后修改规则也不会覆盖已有证据。</p></div><button className="button button-secondary" onClick={() => setView('lab')}><Beaker size={16} />返回实验室</button></div>
          <div className="history-toolbar"><h2>实验记录 <span>{runs.length}</span></h2><label><Search size={16} /><input aria-label="搜索实验记录" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索规则名称" /></label></div>
          {!runs.length ? <div className="empty-history"><Clock3 size={35} /><h3>第一条实验记录，等你开始。</h3><p>在实验室中运行验证，结果会自动保存在这里。</p><button className="button button-primary" onClick={() => setView('lab')}>开始一次实验<ArrowRight size={15} /></button></div>
            : <div className="history-table">{runs.filter(r => r.title.includes(query.trim())).map(r => <button key={r.id} disabled={Boolean(busy)} onClick={() => openRun(r.id)}><span className="history-symbol"><Beaker size={18} /></span><div><strong>{r.title}</strong><small>{new Date(r.createdAt).toLocaleString('zh-CN')} · {r.modelHash.slice(0, 8)}</small></div><Status status={r.status} /><ArrowRight size={17} /></button>)}{!runs.some(r => r.title.includes(query.trim())) && <p className="empty-search">没有匹配的实验记录。</p>}</div>}
        </section>}
        {view === 'guide' && <section className="guide-page"><div className="page-heading"><div><p className="eyebrow">A SMALL GUIDE TO GOOD EXPERIMENTS</p><h1>先问对问题，<span>再相信结果。</span></h1><p>衡局帮助你检查明确的经济约束，并保留可以独立核对的操作路径。</p></div></div>
          <div className="guide-steps">{[
            ['01','建立规则','定义资源、初始库存，以及每个动作固定的消耗和产出。可以从合成示例开始，修改数值，或导入自己的规则文件。'],
            ['02','声明意图','选择观察的资源。当指定库存恢复原状时，这项资源最多允许净增多少？如果你的设计本来允许制造盈利，就应调整约束。'],
            ['03','核对证据','发现反例后逐步回放，检查每一步是否符合真实设计。路径最短是相对于当前模型而言，建模遗漏也会导致不恰当结论。'],
            ['04','对照修改','比较候选参数，重放原路径并重新搜索。载入方案后正式验证，再导出报告；同时检查正常收益和玩家体验是否被破坏。'],
          ].map(([n,title,text]) => <article key={n}><span aria-hidden="true">{n}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
          <div className="guide-boundaries"><div><h2>这些边界，要和结论一起看。</h2><p>当前支持固定成本、固定产出、非负整数资源的顺序动作。时间、概率、多人同时行为、外部奖励与隐藏状态尚未建模。</p><p>“范围内未发现反例”不代表全局安全；“发现反例”也不一定代表玩法不合理。判断取决于输入是否准确、约束是否符合设计意图。</p><p>资源流转图用于解释关系。完整数值以规则编辑器与回放表为准。</p></div><div className="guide-key"><ShieldCheck size={30} /><h3>可重放，才可核对。</h3><p>规则指纹、搜索范围、状态轨迹和时间一并保存在实验记录中。</p><button className="text-button" onClick={() => setView('history')}>查看实验记录<ArrowRight size={15} /></button></div></div>
          <div className="guide-model"><Sparkles size={23} /><div><h3>关于文字建模</h3><p>模型提供候选规则，程序检查格式和引文是否存在，你确认语义后才能载入。当前{connected ? '已配置模型服务' : '未配置模型服务'}；确定性验证与回放始终可独立使用。</p></div><button className="button button-secondary" onClick={() => setModal('ai')}>打开文字建模</button></div>
        </section>}
      </main>
    </div>
    {toast && <div className={'toast ' + (toast.error ? 'toast-error' : '')} role={toast.error ? 'alert' : 'status'}>{toast.error ? <CircleHelp size={18} /> : <Check size={18} />}<span>{toast.text}</span><button aria-label="关闭提示" onClick={() => setToast(null)}><X size={16} /></button></div>}
    {(modal === 'json' || modal === 'ai') && <ImportDialog model={model} mode={modal} configured={connected} onClose={closeModal} onImport={(m,s) => { load(m,s); setToast({ text: '规则已载入。确认验证约束后，就可以开始实验。' }); }} />}
    {modal === 'projects' && <Modal title="我的规则" eyebrow="YOUR SAVED MODELS" onClose={closeModal}><p className="dialog-lead">保存的规则可以继续编辑。每次验证的证据单独保存在实验记录中。</p><div className="saved-projects">{projects.length ? projects.map(p => <button key={p.id} onClick={() => { load(p.model); setProjectId(p.id); }}><span><strong>{p.title}</strong><small>{new Date(p.updatedAt).toLocaleString('zh-CN')}</small></span><ArrowRight size={17} /></button>) : <div className="empty-saved"><FolderOpen size={30} /><p>还没有保存规则。在实验室中点击「保存规则」。</p></div>}</div></Modal>}
  </div>;
}
