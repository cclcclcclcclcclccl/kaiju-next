import type { ReviewEvent } from './model.ts';
// Local evidence inventory only. This does not call or train any model.
export function reviewEvidence(events: ReviewEvent[]) {
  const frames = events.filter((e) => e.frame).sort((a, b) => a.second - b.second);
  const gaps = frames.slice(1).map((e, i) => e.second - frames[i].second);
  return {
    frames: frames.length,
    firstSecond: frames[0]?.second ?? null,
    lastSecond: frames.at(-1)?.second ?? null,
    largestGap: gaps.length ? Math.max(...gaps) : null,
    notes: events.filter((e) => e.observation.trim()).length,
    unknownFields: events.reduce(
      (sum, e) =>
        sum +
        ['allies', 'enemies', 'allyGold', 'enemyGold', 'objectiveIn', 'ultimateReady'].filter(
          (k) => e[k as keyof ReviewEvent] === null,
        ).length,
      0,
    ),
    issues: [
      ...(!frames.length ? ['尚无画面证据，只能检查你填写的条件。'] : []),
      ...(frames.length === 1 ? ['只有一个画面，不能判断行动前后发生了什么。'] : []),
      ...(frames.length > 6
        ? ['现有视觉适配器最多使用前六个带截图的时间点；其他时间点不会进入本次分析。']
        : []),
      ...(gaps.some((g) => g > 30)
        ? ['相邻关键帧间隔超过30秒，中间过程未被观察，不能直接归因。']
        : []),
      ...(events.some((e) => !e.observation.trim())
        ? ['仍有未标注时间点，请注明看到什么或哪些内容无法辨认。']
        : []),
    ],
  };
}
