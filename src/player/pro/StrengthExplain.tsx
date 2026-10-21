import type { StrengthRow } from './strength.ts';
import { STRENGTH_VERSION } from './strength.ts';
const signed = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2);
export function StrengthExplanation({ item, role }: { item: StrengthRow; role: string }) {
  return (
    <section className="strength-explanation" aria-label="弈境强度评分解释">
      <h4>
        {STRENGTH_VERSION} · {item.tier}{' '}
        {item.score === null ? '' : '· ' + item.score.toFixed(2) + ' 分'}
      </h4>
      <p>
        {item.reason}。{item.rank !== null && `同定位对比：${role} · 第 ${item.rank} 名。`}
      </p>
      {item.score !== null && (
        <>
          <div className="metric-strip">
            {[
              ['胜率表现', item.components.win],
              ['选用压力', item.components.pick],
              ['禁用压力', item.components.ban],
            ].map(([label, value]) => (
              <div key={label}>
                <strong>{signed(Number(value))}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p>
            基准 50 分，加上三项贡献后截取到 0–100。采用胜率 {item.winRateUsed?.toFixed(2)}
            %；低使用影响衰减系数 {item.attenuation.toFixed(2)}。
          </p>
          <p>
            27 组参数检查：{item.range?.map((n) => n.toFixed(1)).join('–')} 分，排名{' '}
            {item.rankRange?.join('–')}，可能梯度 {item.possibleTiers.join(' / ')}。
            {item.sensitive ? '处于分档边界，建议结合英雄池判断。' : '本轮参数检查未跨档。'}
          </p>
        </>
      )}
      <small>
        评分是公开统计下的可解释判断，不是胜率概率；参数检查不是统计置信区间。来源未公布总体样本量，权重尚未经过真实对局效果校准。
      </small>
    </section>
  );
}
export function StrengthMethod({ mode }: { mode: number }) {
  return (
    <details className="environment-method">
      <summary>我们的梯度怎么算 · {STRENGTH_VERSION}</summary>
      <p>
        在所选定位的完整英雄集合内计算，搜索与显示排序不会改变分数。胜率以中位数为基准，用 MAD
        稳健尺度标准化；选用、禁用率先做 log(1+x)
        再标准化并限幅，避免单项极端值支配结果。李信形态不重复进入基础英雄集合。
      </p>
      <p>
        评分 = 50 + 18 ×（
        {mode === 5
          ? '60% 胜率表现 + 24% 选用压力 + 16% 禁用压力'
          : '70% 胜率表现 + 18% 选用压力 + 12% 禁用压力'}
        ），截取到 0–100。胜率项乘以 √(出场率 / (出场率 + k))，k 为参考出场率中位数的一半且至少为
        1；这是保守启发式，不是假造样本量。缺失胜率或可比英雄不足五位不评级。
      </p>
      <p>
        T0 ≥70，T0.5 ≥62，T1 ≥54，T2 ≥46，T3 ≥38，其余 T4；不强行按人数分档。27
        组权重与衰减设置给出分数、排名与梯度的变化范围。国服战力受玩家与系数影响，暂不当作强度证据。
      </p>
      <p>
        {mode === 5
          ? '千强采用同查询日顶端排位胜率作代理，结合千强选禁；不会把来源全量人群胜率写成千强胜率。'
          : '采用该分段来源三率；完整采样窗口及样本量尚未公开。'}
        分路筛选为定位英雄比较，并非分路独立胜率。数据来源天元之弈，计算不读取它的梯度标签或评分。
      </p>
    </details>
  );
}
