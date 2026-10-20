// Public calculator reference observed 2026-10-19. Third-party estimate, not an official account write.
export const peakAnchors = [
  [1200, 100],
  [1300, 104.1],
  [1400, 110],
  [1500, 117.9],
  [1600, 127.6],
  [1650, 133.1],
  [1700, 139.1],
  [1750, 145.6],
  [1800, 152.6],
  [1850, 160],
  [1900, 167.9],
  [1950, 176.3],
  [2000, 185.2],
  [2050, 195.7],
  [2100, 206.3],
  [2150, 216.9],
  [2200, 227.6],
  [2250, 238.2],
  [2300, 248.8],
  [2350, 259.4],
  [2400, 270],
  [2450, 284.7],
  [2501, 299.6],
];
export function referencePower(performance: number, peak: number, wins: number, start: number) {
  if (
    ![performance, peak, wins, start].every(Number.isFinite) ||
    performance < 0 ||
    performance > 6100 ||
    peak < 0 ||
    peak > 3000 ||
    start < 0 ||
    start > 3000 ||
    !Number.isInteger(wins) ||
    wins < 0 ||
    wins > 12
  )
    throw Error('表现分 0–6100，巅峰分 0–3000，挑战胜场为 0–12 的整数。');
  let percent = 100;
  for (let i = 1; i < peakAnchors.length; i++) {
    const [lo, lp] = peakAnchors[i - 1],
      [hi, hp] = peakAnchors[i];
    if (peak > lo && peak <= hi) percent = lp + ((hp - lp) * (peak - lo)) / (hi - lo);
  }
  if (peak > 2501) {
    const x = peak - 2501;
    percent = 299.6 + 0.2753 * x + 0.000096 * x * x;
  }
  const peakCoefficient = Math.round(percent * 10) / 1000;
  const perWin =
    start < 1500
      ? 0.008
      : start < 1800
        ? 0.01
        : start < 2000
          ? 0.012
          : start < 2100
            ? 0.014
            : start < 2200
              ? 0.016
              : start < 2300
                ? 0.018
                : start < 2400
                  ? 0.02
                  : 0.024;
  return {
    peakCoefficient,
    perWin,
    challengeCoefficient: perWin * wins,
    total: performance * (peakCoefficient + perWin * wins),
  };
}
