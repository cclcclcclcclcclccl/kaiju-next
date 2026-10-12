import { useEffect, useRef, useState } from 'react';
import { heroes, heroById } from '../catalog.ts';
import { download } from '../../api.ts';
import type { ArenaResult } from './arena.ts';
export default function Arena() {
  const [seed, setSeed] = useState(20261012),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [result, setResult] = useState<ArenaResult>(),
    [error, setError] = useState('');
  const worker = useRef<Worker | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = () => {
    worker.current?.terminate();
    worker.current = null;
    clearTimeout(timer.current);
    setBusy(false);
  };
  useEffect(
    () => () => {
      worker.current?.terminate();
      clearTimeout(timer.current);
    },
    [],
  );
  const run = () => {
    stop();
    setBusy(true);
    setError('');
    setResult(undefined);
    setProgress(0);
    const w = new Worker(new URL('./arena.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e) => {
      if (e.data.progress) setProgress(e.data.progress);
      if (e.data.result) {
        setResult(e.data.result);
        stop();
      }
      if (e.data.error) {
        setError(e.data.error);
        stop();
      }
    };
    w.onerror = () => {
      setError('模拟未完成，请重试');
      stop();
    };
    timer.current = setTimeout(() => {
      setError('模拟超过 60 秒，已停止；可更换种子重试。');
      stop();
    }, 60000);
    w.postMessage({ seed, heroes });
  };
  return (
    <details className="surface bp-arena">
      <summary>BP 模拟训练场 · 自动完成双方十手选人</summary>
      <p>
        在固定种子、两次练习禁用下，搜索策略与随机 /
        贪心对手进行完整选人。用于发现漏算位置、非法选人和耗时问题；不会从自己给自己的分数得出“职业级”结论，也不代表完整赛事禁用流程。
      </p>
      <div className="pro-toolbar">
        <label>
          模拟种子
          <input
            type="number"
            min={1}
            max={2147483647}
            value={seed}
            disabled={busy}
            onChange={(e) =>
              setSeed(Math.max(1, Math.min(2147483647, Number(e.target.value) || 1)))
            }
          />
        </label>
        <button className="btn primary" disabled={busy} onClick={run}>
          模拟完整 BP
        </button>
        {busy && (
          <button className="btn secondary" onClick={stop}>
            停止模拟
          </button>
        )}
      </div>
      {busy && <p role="status">已完成 {progress} / 10 手，计算在后台线程进行…</p>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p className="pro-notice">
            {result.legal ? '10 手合法，无重复与禁用冲突' : '发现选人约束问题'} · 完整分路{' '}
            {result.coverage}/5 · 搜索 {result.nodes.toLocaleString()} 节点 ·{' '}
            {(result.elapsedMs / 1000).toFixed(1)} 秒
          </p>
          <ol className="arena-moves">
            {result.moves.map((m, i) => (
              <li key={i}>
                <span>{m.team === 'allies' ? '我方' : '对方'}</span>
                <strong>{heroById(m.heroId)?.name}</strong>
                <small>{m.role}</small>
              </li>
            ))}
          </ol>
          <button
            className="btn secondary"
            onClick={() =>
              download('开局-BP模拟-' + seed + '.json', JSON.stringify(result, null, 2))
            }
          >
            导出模拟记录
          </button>
          <p className="data-caption">
            尚未用职业比赛 BP、独立教练标注或真实赛果评估。模拟不会覆盖你的当前阵容。
          </p>
        </>
      )}
    </details>
  );
}
