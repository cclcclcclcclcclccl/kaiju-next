import type { Profile, StatRow, StatSnapshot, ReviewEvent } from './model.ts';
import type { Pool } from '../model.ts';
import { scopeIssue } from './statistics.ts';
export const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
export function wilson(rate: number, n: number) {
  const p = rate / 100,
    z = 1.96,
    d = 1 + (z * z) / n,
    mid = (p + (z * z) / (2 * n)) / d,
    delta = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, mid - delta) * 100, Math.min(1, mid + delta) * 100];
}
const percentile = (v: number, values: number[]) =>
  values.length < 2
    ? 50
    : (100 *
        (values.filter((x) => x < v).length + 0.5 * (values.filter((x) => x === v).length - 1))) /
      (values.length - 1);
export type TierResult = {
  row: StatRow;
  score: number;
  tier: string;
  bp: number | null;
  adjustedWin: number;
  interval: number[] | null;
  confidence: string;
  parts: { label: string; value: number; weight: number }[];
};
export const META_MAX_AGE_DAYS = 14;
export function snapshotAge(snapshot: StatSnapshot, now = Date.now()) {
  return Math.floor((now - Date.parse(snapshot.endDate + 'T00:00:00+08:00')) / 86400000);
}
export function usableSnapshot(snapshot: StatSnapshot, now = Date.now()) {
  const days = snapshotAge(snapshot, now);
  return days >= 0 && days <= META_MAX_AGE_DAYS;
}
export function sortedSnapshots(snapshots: StatSnapshot[], segment: string) {
  return snapshots
    .filter((s) => s.segment === segment)
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || b.importedAt.localeCompare(a.importedAt));
}
export function latestSnapshot(snapshots: StatSnapshot[], segment: string) {
  return sortedSnapshots(snapshots, segment)[0];
}
export function tierList(snapshot: StatSnapshot, role: string): TierResult[] {
  const issue = scopeIssue(snapshot);
  const rows = snapshot.rows.filter((r) => r.role === role);
  const adjusted = rows.map((r) =>
    r.games ? (r.winRate * r.games + 50 * 500) / (r.games + 500) : r.winRate,
  );
  const reference = rows.filter((r) => (r.games ?? 0) >= 500);
  const adjustedReference = reference.map(
    (r) => (r.winRate * r.games! + 50 * 500) / (r.games! + 500),
  );
  // A component must cover every eligible hero so all ranked heroes use the same weights.
  const usePower = reference.length >= 5 && reference.every((r) => r.powerRank !== undefined);
  const useOpinion = reference.length >= 5 && reference.every((r) => r.opinion !== undefined);
  return rows
    .map((row, i) => {
      const parts = [
        {
          label: '收缩胜率',
          value: clamp(percentile(adjusted[i], adjustedReference)),
          weight: 0.6,
        },
        {
          label: '出场率',
          value: percentile(
            row.pickRate,
            reference.map((r) => r.pickRate),
          ),
          weight: 0.15,
        },
        {
          label: '禁用率',
          value: percentile(
            row.banRate,
            reference.map((r) => r.banRate),
          ),
          weight: 0.15,
        },
      ];
      if (row.powerRank !== undefined && usePower)
        parts.push({
          label: '同口径战力排名',
          value: percentile(
            -row.powerRank,
            reference.map((r) => -r.powerRank!),
          ),
          weight: 0.05,
        });
      if (row.opinion !== undefined && useOpinion)
        parts.push({
          label: '有来源的评价',
          value: percentile(
            row.opinion,
            reference.map((r) => r.opinion!),
          ),
          weight: 0.05,
        });
      const total = parts.reduce((s, p) => s + p.weight, 0);
      parts.forEach((p) => (p.weight /= total));
      parts.forEach((p) => {
        p.value = clamp(p.value);
      });
      const score = parts.reduce((s, p) => s + p.value * p.weight, 0);
      const enough = reference.length >= 5,
        reliable = !!row.games && row.games >= 500;
      return {
        row,
        score: issue ? 0 : Math.round(score * 10) / 10,
        tier: issue
          ? '口径待核对'
          : !enough
            ? '样本不足'
            : !reliable
              ? '待验证'
              : score >= 85
                ? 'T0'
                : score >= 65
                  ? 'T1'
                  : score >= 40
                    ? 'T2'
                    : score >= 20
                      ? 'T3'
                      : 'T4',
        bp: snapshot.denominator === 'match' ? row.pickRate + row.banRate : null,
        adjustedWin: adjusted[i],
        interval: row.games && !issue ? wilson(row.winRate, row.games) : null,
        confidence: issue
          ? '口径待核对，场次暂不用于胜率区间'
          : !row.games
            ? '未提供场次'
            : row.games < 500
              ? '低样本'
              : '有场次记录',
        parts: issue ? [] : parts,
      };
    })
    .sort(
      (a, b) =>
        Number(b.tier.startsWith('T')) - Number(a.tier.startsWith('T')) ||
        b.score - a.score ||
        a.row.heroId - b.row.heroId,
    );
}
export function mastery(heroId: number, pool: Pool, profile?: Profile, now = Date.now()) {
  const level = pool.find((p) => p.heroId === heroId)?.level;
  const manual =
    level === 'main' ? 75 : level === 'comfortable' ? 60 : level === 'learning' ? 35 : 20;
  const m = profile?.heroes.find((h) => h.heroId === heroId);
  if (!m)
    return {
      score: manual,
      confidence: level ? '仅自报标签' : '未记录',
      games: 0,
      power: null,
      parts: [] as { label: string; value: number; weight: number; evidence: string }[],
      trust: 0,
    };
  const freshness = Math.exp(-Math.max(0, (now - Date.parse(m.observedOn)) / 86400000) / 90);
  const rate = (games: number | undefined, wins: number | undefined, rate: number | undefined) =>
    games && (wins !== undefined || rate !== undefined)
      ? (wins ?? (games * rate!) / 100) / games
      : undefined;
  const recent = rate(m.recentGames, m.recentWins, m.recentWinRate);
  const seasonal = rate(m.seasonGames, m.seasonWins, m.seasonWinRate);
  const lifetime = rate(m.games, m.wins, m.winRate);
  const n =
    recent !== undefined
      ? m.recentGames
      : seasonal !== undefined
        ? m.seasonGames!
        : lifetime !== undefined
          ? m.games
          : 0;
  const selectedWin = recent ?? seasonal ?? lifetime;
  const sampleWeight = recent !== undefined ? 1 : seasonal !== undefined ? 0.75 : 0.45;
  const win = selectedWin === undefined ? 0.5 : (selectedWin * n + 10) / (n + 20);
  const experience = clamp((Math.log1p(m.games) / Math.log1p(300)) * 100);
  const peakBonus = m.peakCoefficient ?? profile?.peakCoefficient;
  const challengeBonus = m.challengeCoefficient ?? profile?.challengeCoefficient;
  const basePower =
    peakBonus !== undefined && challengeBonus !== undefined
      ? m.power / (1 + (peakBonus + challengeBonus) / 100)
      : m.power;
  const parts: { label: string; value: number; weight: number; evidence: string }[] = [
    {
      label: '实战经验',
      value: experience,
      weight: 0.3,
      evidence: `累计 ${m.games} 场；经验按对数增长，避免堆场次无限加分`,
    },
  ];
  if (selectedWin !== undefined)
    parts.push({
      label: '平滑胜率',
      value: clamp(((win - 0.35) / 0.4) * 100),
      weight: 0.35,
      evidence: `${recent !== undefined ? '近期' : seasonal !== undefined ? '本赛季' : '累计'} ${n} 场，原始胜率 ${(selectedWin * 100).toFixed(1)}%；使用 20 场中立先验`,
    });
  const rating = m.recentRating ?? m.averageRating;
  if (rating !== undefined)
    parts.push({
      label: '个人评分',
      value: clamp(((rating - 4) / 8) * 100),
      weight: 0.2,
      evidence: `${m.recentRating !== undefined ? '近期' : '累计'}平均评分 ${rating} / 16；按同一评分口径使用`,
    });
  if (m.power > 0)
    parts.push({
      label: '战力参考',
      value: clamp((basePower / 15000) * 100),
      weight: 0.1,
      evidence:
        peakBonus !== undefined && challengeBonus !== undefined
          ? `输入加成 ${peakBonus}% + ${challengeBonus}%；仅为去加成的比较近似，不是官方战力公式`
          : `当前 ${m.power}；系数未齐，仅低权重参考，跨英雄并非严格可比`,
    });
  if (m.historicalPeakPower)
    parts.push({
      label: '历史保持度',
      value: clamp((m.power / m.historicalPeakPower) * 100),
      weight: 0.025,
      evidence: `当前 ${m.power} / 历史最高 ${m.historicalPeakPower}；不能用历史峰值代替当前发挥`,
    });
  const performance =
    m.performanceScore ??
    (m.rankPerformanceScore !== undefined || m.peakPerformanceScore !== undefined
      ? (m.rankPerformanceScore ?? 0) + (m.peakPerformanceScore ?? 0)
      : undefined);
  if (performance !== undefined)
    parts.push({
      label: '表现分参考',
      value: clamp((performance / 5000) * 100),
      weight: 0.015,
      evidence: `表现分 ${performance}；参考刻度未经当前版本校准，仅小权重参与`,
    });
  if (m.proficiencyPoints !== undefined)
    parts.push({
      label: '游戏内熟练度',
      value: clamp((Math.log1p(m.proficiencyPoints) / Math.log1p(10000)) * 100),
      weight: 0.01,
      evidence: `游戏内熟练度 ${m.proficiencyPoints}；与胜率分开使用`,
    });
  const weight = parts.reduce((sum, p) => sum + p.weight, 0);
  parts.forEach((p) => (p.weight /= weight));
  const measured = parts.reduce((sum, p) => sum + p.value * p.weight, 0);
  const evidenceGames = n || Math.min(m.games, 100);
  const trust = (evidenceGames / (evidenceGames + 20)) * freshness * (n ? sampleWeight : 0.4);
  return {
    score: Math.round((evidenceGames > 0 ? 50 : manual) * (1 - trust) + measured * trust),
    confidence:
      freshness < 0.5
        ? '记录较旧'
        : n < 20
          ? '有效样本偏少'
          : recent === undefined
            ? '缺少近期胜负'
            : '有近期记录',
    games: n,
    power: m.power,
    parts,
    trust,
  };
}
export function effectivePool(pool: Pool, profile?: Profile): Pool {
  const result = new Map(pool.map((p) => [p.heroId, p]));
  for (const record of profile?.heroes ?? []) {
    if (record.inPool === false) {
      result.delete(record.heroId);
      continue;
    }
    if (record.games > 0 || record.power > 0 || result.has(record.heroId)) {
      const score = mastery(record.heroId, pool, profile).score;
      result.set(record.heroId, {
        heroId: record.heroId,
        level: score >= 70 ? 'main' : score >= 45 ? 'comfortable' : 'learning',
      });
    }
  }
  return [...result.values()];
}
export function estimatePower(v: {
  base: number;
  peakScore: number;
  threshold: number;
  step: number;
  stepPercent: number;
  challengePercent: number;
  activityPercent: number;
}) {
  if (Object.values(v).some((n) => !Number.isFinite(n) || n < 0) || v.step <= 0)
    throw new Error('请填写有效的非负系数，步长须大于零');
  const peakPercent = Math.floor(Math.max(0, v.peakScore - v.threshold) / v.step) * v.stepPercent;
  return {
    peakPercent,
    total: Math.round(
      (v.base * (1 + (peakPercent + v.challengePercent) / 100) * v.activityPercent) / 100,
    ),
  };
}
export function reviewFindings(e: ReviewEvent) {
  const out: { title: string; evidence: string; advice: string; confidence: string }[] = [];
  if (e.allies !== null && e.enemies !== null && e.allies < e.enemies)
    out.push({
      title: '先核对人数再决定接团',
      evidence: `你标注附近我方 ${e.allies} 人、敌方 ${e.enemies} 人。`,
      advice: '如果没有明确的技能或地形优势，优先后撤、等队友到场，或换取另一侧兵线与资源。',
      confidence: '基于你的标注；不能据此判定这波一定打错',
    });
  if (e.allyGold !== null && e.enemyGold !== null && e.allyGold + 2000 < e.enemyGold)
    out.push({
      title: '经济落后时缩短正面交战',
      evidence: `标注经济差为 ${e.allyGold - e.enemyGold}。`,
      advice: '回看片段确认是否可以守塔清线、找落单或交换资源，避免把正面团战作为唯一选择。',
      confidence: '需结合人数、等级和装备节点',
    });
  if (e.objectiveIn !== null && e.objectiveIn <= 30)
    out.push({
      title: '资源即将刷新，检查准备顺序',
      evidence: `标注资源将在 ${e.objectiveIn} 秒后刷新。`,
      advice: '检查兵线、回城补给和河道信息是否提前完成；若队伍无法及时到场，明确交换目标。',
      confidence: '基于你填写的资源计时',
    });
  if (e.ultimateReady === false)
    out.push({
      title: '关键技能不可用时重新判断任务',
      evidence: '你标注此时大招未就绪。',
      advice: '核对是否能以清线、拉扯、保护或等待冷却替代强行进场。',
      confidence: '不同英雄对大招的依赖不同',
    });
  if (!out.length)
    out.push({
      title: '证据还不足以判断这次决策',
      evidence: e.observation,
      advice: '补充当时可见人数、经济、关键技能与目标，或选择这次行动前后的片段再比较替代选择。',
      confidence: '不从结果倒推过程，也不猜测不可见信息',
    });
  return out;
}
