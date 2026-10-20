import { useState } from 'react';
import { valueText } from './SourceWidgets.tsx';
import { peakAnchors, referencePower } from './powerFormula.ts';
export default function PowerCalculator() {
  const [inputs, setInputs] = useState(['6100', '2100', '0', '2100']);
  let result: ReturnType<typeof referencePower> | undefined,
    error = '';
  try {
    if (inputs.some((v) => v.trim() === '')) throw Error('请填写四项参数');
    result = referencePower(...(inputs.map(Number) as [number, number, number, number]));
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <section>
      <h2>战力试算 · 可核对的参数</h2>
      <p>采用 2026-10-19 核对的天元公开计算器参数。与真实账号战力分开，不会自动改写你的档案。</p>
      <div className="pro-toolbar">
        {['表现分', '巅峰分数', '挑战赛胜场', '挑战赛开启巅峰分'].map((name, i) => (
          <label key={name}>
            {name}
            <input
              type="number"
              value={inputs[i]}
              onChange={(e) => setInputs((v) => v.map((x, j) => (i === j ? e.target.value : x)))}
            />
          </label>
        ))}
      </div>
      {error ? (
        <p role="status">{error}</p>
      ) : (
        result && (
          <div className="plus-metrics">
            <article>
              <span>估算战力</span>
              <strong>{valueText(Math.round(result.total), 0)}</strong>
            </article>
            <article>
              <span>巅峰系数</span>
              <strong>{valueText(result.peakCoefficient * 100)}%</strong>
            </article>
            <article>
              <span>挑战系数</span>
              <strong>{valueText(result.challengeCoefficient * 100)}%</strong>
              <small>每胜场 {valueText(result.perWin * 100)}%</small>
            </article>
          </div>
        )
      )}
      <details className="source-proof">
        <summary>查看公式、参数与局限</summary>
        <p>
          表现分 ×（巅峰系数＋挑战赛系数）。巅峰系数按公开分数节点插值；2501
          分以上采用来源的外推表达式。该表是第三方估算，赛季变化后需要再次对照游戏内规则。
        </p>
        <p>{peakAnchors.map(([score, percent]) => `${score}分：${percent}%`).join('；')}</p>
        <a href="https://tianyuanzhiyi.com/calculator" target="_blank" rel="noreferrer">
          核对天元计算器 ↗
        </a>
      </details>
    </section>
  );
}
