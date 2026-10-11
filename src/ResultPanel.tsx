import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Fingerprint,
  FlaskConical,
  Lightbulb,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { Run } from './core/api-types.ts';
import type { Comparison } from './core/model.ts';
import { ResourceIcon, Status } from './ui.tsx';
import { download } from './api.ts';

function BalanceChart({ run, selected }: { run: Run; selected: number }) {
  const target = run.model.contract.target;
  const values = run.result.trace.map((s) => s.inventory[target]);
  const max = Math.max(...values, 1) * 1.15;
  const x = (i: number) => 30 + (i * 510) / Math.max(values.length - 1, 1);
  const y = (value: number) => 125 - (value / max) * 105;
  const line = values.map((v, i) => (i ? 'L' : 'M') + x(i) + ',' + y(v)).join(' ');
  return (
    <svg
      className="balance-chart"
      viewBox="0 0 570 150"
      role="img"
      aria-label="每一步的目标资源库存"
    >
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9ba87a" stopOpacity=".28" />
          <stop offset="100%" stopColor="#9ba87a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((n) => (
        <g key={n}>
          <line x1="30" x2="540" y1={y(max * n)} y2={y(max * n)} className="chart-grid" />
          <text x="20" y={y(max * n) + 3} textAnchor="end">
            {Math.round(max * n)}
          </text>
        </g>
      ))}
      <path d={line + ' L540,125 L30,125Z'} fill="url(#chartFill)" />
      <path d={line} fill="none" stroke="#678066" strokeWidth="2.2" />
      {values.map((v, i) => (
        <g key={i}>
          <circle
            cx={x(i)}
            cy={y(v)}
            r={i === selected ? 5 : 3}
            fill={i === selected ? '#c46a42' : '#fff'}
            stroke={i === selected ? '#c46a42' : '#678066'}
            strokeWidth="2"
          />
          <text x={x(i)} y="145" textAnchor="middle">
            {i === 0 ? '初始' : '第 ' + i + ' 步'}
          </text>
        </g>
      ))}
    </svg>
  );
}
export default function ResultPanel({
  run,
  step,
  onStep,
  playing,
  onPlay,
  stale,
  busy,
  comparisons,
  onRepair,
  onApply,
}: {
  run: Run | null;
  step: number;
  onStep: (n: number) => void;
  playing: boolean;
  onPlay: () => void;
  stale: boolean;
  busy: string;
  comparisons: Comparison[];
  onRepair: () => void;
  onApply: (comparison: Comparison) => void;
}) {
  if (!run)
    return (
      <section className="empty-result" id="results">
        <div className="empty-result-icon">
          <FlaskConical size={26} strokeWidth={1.4} />
        </div>
        <div>
          <h3>每一次验证，都从一个清楚的意图开始。</h3>
          <p>检查上方规则，点击「开始验证」。结果会附带可回放的操作证据。</p>
        </div>
        <span className="empty-result-number" aria-hidden="true">
          02
        </span>
      </section>
    );
  const { result, model } = run;
  const selected = result.trace[step] ?? result.trace[0];
  const targetName = model.resources.find((r) => r.id === model.contract.target)!.name;
  const restoredNames = model.contract.restore
    .map((id) => model.resources.find((r) => r.id === id)!.name)
    .join('、');
  const excluded = model.resources.filter(
    (r) => r.id !== model.contract.target && !model.contract.restore.includes(r.id),
  );
  const exportEvidence = () =>
    download(
      '衡局-实验凭证.json',
      JSON.stringify(
        {
          format: 'hengju-evidence',
          formatVersion: 1,
          run,
        },
        null,
        2,
      ),
    );
  const exportReport = () => {
    const text = [
      '# 衡局验证报告',
      '',
      '项目：' + model.title,
      '时间：' + run.createdAt,
      '规则 SHA-256：' + run.modelHash,
      '引擎版本：' + (run.engineVersion ?? '旧记录未保存版本'),
      '',
      '结论：' +
        (result.status === 'counterexample'
          ? '发现反例'
          : result.status === 'bounded-clear'
            ? '范围内未发现反例'
            : '预算不足，无法下结论'),
      '范围：最大 ' +
        result.bounds.maxDepth +
        ' 步，最多 ' +
        result.bounds.maxStates +
        ' 个状态，时间预算 ' +
        result.bounds.maxMillis +
        ' ms。',
      '实际访问状态：' + result.visited,
      '',
      '约束：' +
        restoredNames +
        '恢复初始库存时，' +
        targetName +
        '净增不超过 ' +
        model.contract.allowedProfit +
        '。',
      '',
      ...(excluded.length
        ? [
            '未要求恢复的资源：' +
              excluded.map((r) => r.name).join('、') +
              '。可能消耗这些资源，不应解读为完整闭合套利。',
            '',
          ]
        : []),
      '## 操作证据',
      '| 步骤 | 操作 | ' + model.resources.map((r) => r.name).join(' | ') + ' |',
      '| --- | --- | ' + model.resources.map(() => '---').join(' | ') + ' |',
      ...result.trace.map(
        (s) =>
          '| ' +
          s.step +
          ' | ' +
          s.actionName.replaceAll('|', '/') +
          ' | ' +
          model.resources.map((r) => s.inventory[r.id]).join(' | ') +
          ' |',
      ),
      '',
      '## 正常玩法保留检查',
      ...(run.playtests?.length
        ? run.playtests.map(
            (t) =>
              '- ' + t.name + '：' + (t.status === 'pass' ? '通过' : '未通过') + '；' + t.message,
          )
        : ['未评估：此记录没有保留用例检查。']),
      '',
      '## 完整复现输入',
      '将以下 JSON 载入衡局，按记录中的搜索范围重新验证。也可以导出实验凭证，使用 node scripts/verify-evidence.mjs 文件路径 独立核对。',
      '```json',
      JSON.stringify({ model, bounds: result.bounds }, null, 2),
      '```',
      '',
      '## 解释范围',
      '这是固定整数资源模型的有界验证。未发现反例不等于全局安全，也不代表整体游戏平衡。样例库使用合成规则；自定义输入的准确性需由使用者确认。',
    ];
    download(
      '衡局-' + model.title.replace(/[<>:"/\\|?*]/g, '_') + '-验证报告.md',
      text.join('\n'),
      'text/markdown',
    );
  };
  return (
    <section className="result-section" id="results">
      <div className="result-title-row">
        <div>
          <p className="eyebrow">02 / OBSERVE & VERIFY</p>
          <h2>让结果自己说话。</h2>
        </div>
        <div className="result-exports">
          <button className="button button-secondary compact" onClick={exportEvidence}>
            <Fingerprint size={15} />
            导出实验凭证
          </button>
          <button className="button button-secondary compact" onClick={exportReport}>
            <Download size={15} />
            导出报告
          </button>
        </div>
      </div>
      {stale && (
        <div className="stale-notice" role="status">
          <RefreshCw size={15} />
          规则或搜索范围已改变。以下是上次实验，重新验证后才对应当前版本。
        </div>
      )}
      <div className={'result-card result-' + result.status}>
        <div className="result-summary">
          <div className="result-summary-main">
            <Status status={result.status} />
            <h3>
              {result.status === 'counterexample'
                ? result.actions.length +
                  ' 步之后，' +
                  targetName +
                  '多出了 ' +
                  result.profit +
                  '。'
                : result.status === 'bounded-clear'
                  ? '在本次搜索范围内，没有找到违规路径。'
                  : '当前搜索预算不足，结论仍然开放。'}
            </h3>
            <p>
              {result.status === 'counterexample'
                ? restoredNames + '均回到初始库存，这条操作序列违反了你声明的约束。'
                : result.status === 'bounded-clear'
                  ? '你可以增加搜索深度，或更换初始库存继续检验。这个结论不代表整个游戏已平衡。'
                  : '已触及' +
                    (result.reason === 'state-budget' ? '状态数量' : '运行时间') +
                    '上限。可以缩小模型，或调整预算后重试。'}
            </p>
          </div>
          <div className="run-stats">
            <div>
              <strong>{result.visited.toLocaleString()}</strong>
              <span>访问状态</span>
            </div>
            <div>
              <strong>
                {result.bounds.maxDepth}
                <small>步</small>
              </strong>
              <span>搜索上限</span>
            </div>
            <div>
              <strong>
                {result.elapsedMs}
                <small>ms</small>
              </strong>
              <span>引擎耗时</span>
            </div>
          </div>
        </div>
        {excluded.length > 0 && (
          <p className="scope-warning result-scope">
            本次未约束 {excluded.map((r) => r.name).join('、')}{' '}
            的期末库存；可能消耗这些资源换取净增。
          </p>
        )}
        {(run.playtests?.length ?? 0) > 0 && (
          <div className="run-playtests">
            <strong>正常玩法保留检查</strong>
            {run.playtests!.map((t) => (
              <p key={t.id} className={t.status === 'pass' ? 'check-pass' : 'check-fail'}>
                {t.name} · {t.status === 'pass' ? '通过' : '未通过'}：{t.message}
              </p>
            ))}
          </div>
        )}
        {selected && (
          <div className="witness-area">
            <div className="replay-heading">
              <h4>
                <Play size={14} />
                反例回放 <span>最短路径 · 当前模型</span>
              </h4>
              <div className="replay-controls">
                <button
                  className="icon-button"
                  aria-label="上一步"
                  disabled={step === 0}
                  onClick={() => onStep(step - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button className="button button-secondary compact" onClick={onPlay}>
                  {playing ? <Pause size={13} /> : <Play size={13} />}
                  {playing ? '暂停' : '播放'}
                </button>
                <button
                  className="icon-button"
                  aria-label="下一步"
                  disabled={step >= result.trace.length - 1}
                  onClick={() => onStep(step + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            <div className="trace-timeline">
              {result.trace.map((s, i) => (
                <button
                  key={i}
                  className={'trace-step ' + (i === step ? 'selected' : '')}
                  onClick={() => onStep(i)}
                  aria-pressed={i === step}
                >
                  <span>{i === 0 ? '起' : String(i).padStart(2, '0')}</span>
                  <b>{s.actionName}</b>
                  {i !== result.trace.length - 1 && <ArrowRight size={12} />}
                </button>
              ))}
            </div>
            <div className="replay-body">
              <div className="inventory-panel">
                <p className="small-label">
                  第 {step} 步 · {selected.actionName}
                </p>
                {model.resources.map((resource, i) => {
                  const delta = selected.inventory[resource.id] - resource.initial;
                  return (
                    <div className="inventory-row" key={resource.id}>
                      <ResourceIcon index={i} />
                      <span>{resource.name}</span>
                      <strong>{selected.inventory[resource.id]}</strong>
                      <small
                        className={delta > 0 ? 'delta-positive' : delta < 0 ? 'delta-negative' : ''}
                      >
                        {delta === 0 ? '与初始相同' : (delta > 0 ? '+' : '') + delta}
                      </small>
                    </div>
                  );
                })}
              </div>
              <div className="chart-panel">
                <p className="small-label">
                  {targetName}库存的变化 <span>点击上方步骤逐帧核对</span>
                </p>
                <BalanceChart run={run} selected={step} />
              </div>
            </div>
          </div>
        )}
        <div className="evidence-footer">
          <Fingerprint size={14} />
          <span>规则指纹 {run.modelHash.slice(0, 12)}</span>
          <span>
            实验已保存 ·{' '}
            {new Date(run.createdAt).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span>固定成本 / 整数资源 / 有界搜索</span>
        </div>
      </div>
      {result.status === 'counterexample' && (
        <div className="repair-section">
          <div className="repair-intro">
            <div className="repair-icon">
              <Lightbulb size={20} />
            </div>
            <div>
              <h3>小改一处，再做一次实验。</h3>
              <p>从反例推导参数调整，同时检查违规路径和必须保留的正常玩法。</p>
            </div>
            <button
              className="button button-primary compact"
              disabled={Boolean(busy) || stale}
              onClick={onRepair}
            >
              {busy === 'repair' ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Sparkles size={15} />
              )}
              比较修复方案
            </button>
          </div>
          {!!comparisons.length && (
            <>
              <div className="repair-grid">
                {comparisons.map((comparison) => (
                  <article
                    className={
                      'repair-card ' +
                      (comparison.playtests.after.some((t) => t.status !== 'pass')
                        ? 'repair-conflict'
                        : '')
                    }
                    key={comparison.patch.id}
                  >
                    <div className="repair-card-top">
                      <span>
                        候选方案 {String(comparisons.indexOf(comparison) + 1).padStart(2, '0')}
                      </span>
                      <Status status={comparison.result.status} />
                    </div>
                    <h4>{comparison.patch.title}</h4>
                    <div className="patch-delta">
                      <span>{comparison.patch.from}</span>
                      <ArrowRight size={20} />
                      <strong>{comparison.patch.to}</strong>
                      <small>{targetName} / 次</small>
                    </div>
                    <p>
                      <ShieldCheck size={13} />
                      {comparison.oldTrace.legal
                        ? comparison.oldTrace.violates
                          ? '原路径仍然违规'
                          : '原路径不再违反约束'
                        : '原路径已无法执行'}
                    </p>
                    <p>重新访问 {comparison.result.visited} 个状态 · 同一搜索范围</p>
                    <div className="repair-playtests">
                      <strong>正常玩法影响</strong>
                      {!comparison.playtests.after.length && <p>未设置保留用例 · 未评估玩法影响</p>}
                      {comparison.playtests.after.map((t, index) => {
                        const before = comparison.playtests.before[index];
                        const regressed = before?.status === 'pass' && t.status !== 'pass';
                        return (
                          <div
                            key={t.id}
                            className={t.status === 'pass' ? 'check-pass' : 'check-fail'}
                          >
                            <b>
                              {regressed
                                ? '破坏正常玩法'
                                : t.status === 'pass'
                                  ? '保留要求满足'
                                  : '原有要求仍未满足'}
                            </b>
                            <p>{t.name}</p>
                            <p>
                              修改前{before?.status === 'pass' ? '通过' : '未通过'} → 修改后
                              {t.status === 'pass' ? '通过' : '未通过'}
                            </p>
                            <p>{t.message}</p>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      className="button button-secondary"
                      disabled={
                        Boolean(busy) ||
                        stale ||
                        comparison.playtests.after.some((t) => t.status !== 'pass')
                      }
                      onClick={() => onApply(comparison)}
                    >
                      {comparison.playtests.after.some((t) => t.status !== 'pass')
                        ? '未满足保留要求'
                        : '载入此方案'}
                      <ArrowRight size={14} />
                    </button>
                  </article>
                ))}
              </div>
              <p className="repair-footnote">
                <AlertTriangle size={13} />
                保留检查只覆盖你声明的操作序列和最低库存。未发现违规路径、且保留用例通过，仍不等于整体游戏平衡。
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
