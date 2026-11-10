import { useEffect, useRef, useState } from 'react';
import { heroes, heroById } from '../catalog.ts';
import { Portrait } from '../ui.tsx';
import type { CoachInput, CoachResult } from './coach.ts';
import { download } from '../../api.ts';

export default function TurnAdvice({
  input,
  onChoose,
  disabled,
}: {
  input: CoachInput;
  onChoose: (heroId: number) => void;
  disabled: boolean;
}) {
  const [result, setResult] = useState<CoachResult | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fingerprint = JSON.stringify(input);
  const visibleCandidates =
    result?.candidates
      .filter(
        (candidate, index, all) =>
          all.findIndex((c) => c.move.heroId === candidate.move.heroId) === index,
      )
      .slice(0, 3) ?? [];
  const stop = () => {
    worker.current?.terminate();
    worker.current = null;
    clearTimeout(timer.current);
  };
  useEffect(() => {
    stop();
    setBusy(false);
    setResult(null);
    setError('');
    return stop;
  }, [fingerprint, disabled]);
  const run = () => {
    stop();
    setBusy(true);
    setError('');
    setResult(null);
    const instance = new Worker(new URL('./coach.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    timer.current = setTimeout(() => {
      if (worker.current === instance) {
        stop();
        setBusy(false);
        setError('计算超时，未采用不完整结果。请重试。');
      }
    }, 15000);
    instance.onmessage = (
      event: MessageEvent<{ ok: boolean; result?: CoachResult; error?: string }>,
    ) => {
      if (worker.current !== instance) return;
      stop();
      setBusy(false);
      if (event.data.ok && event.data.result) setResult(event.data.result);
      else setError(event.data.error ?? '没有可行方案，请检查英雄池和分路锁定。');
    };
    instance.onerror = () => {
      if (worker.current === instance) {
        stop();
        setBusy(false);
        setError('计算线程中断，请重试。');
      }
    };
    instance.postMessage({ heroes, input });
  };
  return (
    <section className="turn-advice" aria-label="当前回合个性化建议">
      <div className="section-title">
        <div>
          <h3>这一手，为什么选？</h3>
          <p className="muted">
            结合个人英雄池、摇摆分路和后续应对，比较可行选择。你确认后才落子。
          </p>
        </div>
        <button className="btn secondary" disabled={busy || disabled} onClick={run}>
          {busy ? '正在比较后续应对…' : '分析这一手'}
        </button>
      </div>
      {error && (
        <p role="alert" className="pro-notice">
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="data-caption">
            完成 {result.completedDepth} / {result.requestedDepth} 手 · {result.searchedNodes}{' '}
            个搜索节点 · {result.elapsedMs} ms
            {result.bounded ? ' · 达到计算预算，保留上一完整层结果' : ''}。方案值不是胜率。
          </p>
          <div className="turn-advice-options">
            {visibleCandidates.map((c, i) => (
              <article key={c.move.heroId + ':' + c.move.role}>
                <div className="section-title">
                  <Portrait hero={heroById(c.move.heroId)} />
                  <h4>
                    {heroById(c.move.heroId)?.name} · {c.move.kind === 'ban' ? '禁用' : c.move.role}
                  </h4>
                  <span>{i === 0 ? '优先比较' : '备选'}</span>
                </div>
                <p>
                  对本方方案值：{result.side === 'allies' ? c.value : -c.value}
                  {i > 0 && (
                    <small>
                      {' '}
                      · 比首选低{' '}
                      {Math.max(
                        0,
                        Math.round(
                          (result.side === 'allies' ? 1 : -1) *
                            (visibleCandidates[0].value - c.value) *
                            10,
                        ) / 10,
                      )}{' '}
                      分
                    </small>
                  )}
                </p>
                <ul>
                  {c.reasons.slice(0, 3).map((r, j) => (
                    <li key={j}>{r}</li>
                  ))}
                </ul>
                {c.line.length > 1 && (
                  <p>
                    后续推演：
                    {c.line
                      .slice(1)
                      .map(
                        (m) =>
                          `${m.team === 'allies' ? '蓝' : '红'}${m.kind === 'ban' ? '禁' : '选'}${heroById(m.heroId)?.name}`,
                      )
                      .join(' → ')}
                  </p>
                )}
                <details>
                  <summary>风险与适用条件</summary>
                  {c.risks.map((r, j) => (
                    <p key={j}>{r}</p>
                  ))}
                </details>
                <button
                  className="btn secondary"
                  disabled={disabled}
                  onClick={() => onChoose(c.move.heroId)}
                >
                  选中{heroById(c.move.heroId)?.name}，等待确认
                </button>
              </article>
            ))}
          </div>
          <details>
            <summary>计算依据与限制</summary>
            {result.assumptions.map((a, i) => (
              <p key={i}>{a}</p>
            ))}
          </details>
          <button
            className="text-btn"
            onClick={() =>
              download(
                '自在弈境-本手决策依据.json',
                JSON.stringify(
                  {
                    schemaVersion: 1,
                    createdAt: new Date().toISOString(),
                    input,
                    result,
                    notice: '包含你本次选择的个人档案；仅在本机导出，请自行决定是否分享。',
                  },
                  null,
                  2,
                ),
                'application/json',
              )
            }
          >
            导出本手依据（含所用个人资料）
          </button>
        </>
      )}
    </section>
  );
}
