// Manually transcribed from the visible mini-program window, not an API feed.
// Evidence: evidence/data-upgrade/reference/mini-v09-skin-detail.png.
export default function SkinObservation({ heroId }: { heroId: number }) {
  if (heroId !== 547) return null;
  return (
    <aside className="skin-observation">
      <h4>第三方页面观察 · 卢雅那</h4>
      <p>
        2026-10-11 单日：烈焰狂欢 <strong>94.4%</strong>，原皮 <strong>5.6%</strong>。
      </p>
      <p className="data-caption">
        来源：天元之弈助手“皮肤趋势”页面，2026-10-12
        人工核对。样本量与玩家范围未公布；仅保留这一天的观察，不代表当前使用率，不补画历史曲线。
      </p>
      <details>
        <summary>小程序来源</summary>
        <p className="data-caption">#小程序://天元之弈/u6nCjaHUkuIRe6u</p>
      </details>
    </aside>
  );
}
