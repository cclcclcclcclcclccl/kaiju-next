import type { StatSnapshot } from './model.ts';

export function scopeIssue(snapshot: StatSnapshot): string | null {
  if (snapshot.winRateScope === 'all')
    return '胜率使用全分段样本，出场与禁用属于所选分段；保留原始指标，不生成分段梯度或参与 BP 评分。';
  if (!snapshot.winRateScope || snapshot.winRateScope === 'unknown')
    return '胜率人群尚未核对；保留原始指标，暂不生成梯度或参与 BP 评分。';
  if (snapshot.winRateWindow === 'version')
    return '胜率按版本累计，与所填统计区间不一致；保留原始指标，暂不混算梯度或参与 BP 评分。';
  if (snapshot.winRateWindow !== 'range')
    return '胜率时间范围尚未核对；暂不生成梯度或参与 BP 评分。';
  if (snapshot.denominator !== 'match')
    return '出场与禁用的分母尚未核对；不相加为 BP 率，也不生成梯度或参与 BP 评分。';
  return null;
}

export function scopeLabel(snapshot: StatSnapshot) {
  const population =
    snapshot.winRateScope === 'segment'
      ? '所选分段'
      : snapshot.winRateScope === 'all'
        ? '全分段'
        : '人群待核对';
  const window =
    snapshot.winRateWindow === 'range'
      ? '所填区间'
      : snapshot.winRateWindow === 'version'
        ? '版本累计'
        : '时间待核对';
  return `胜率：${population} · ${window}；选禁分母：${snapshot.denominator === 'match' ? '同一对局分母' : '待核对'}`;
}

export function comparisonIssue(current: StatSnapshot, previous: StatSnapshot): string | null {
  if (current.segment !== previous.segment) return '分段不同';
  if (current.patch !== previous.patch) return '游戏版本不同';
  if (current.sourceName !== previous.sourceName || current.sourceUrl !== previous.sourceUrl)
    return '数据来源不同';
  if (
    !current.winRateScope ||
    current.winRateScope === 'unknown' ||
    !previous.winRateScope ||
    previous.winRateScope === 'unknown'
  )
    return '胜率人群未核对';
  if (
    !current.winRateWindow ||
    current.winRateWindow === 'unknown' ||
    !previous.winRateWindow ||
    previous.winRateWindow === 'unknown'
  )
    return '胜率时间口径未核对';
  if (
    current.winRateScope !== previous.winRateScope ||
    current.winRateWindow !== previous.winRateWindow ||
    current.denominator !== previous.denominator
  )
    return '指标口径不同';
  if ((current.scopeNotes ?? '').trim() !== (previous.scopeNotes ?? '').trim())
    return '口径说明不同';
  const duration = (s: StatSnapshot) => Date.parse(s.endDate) - Date.parse(s.startDate);
  if (duration(current) !== duration(previous)) return '统计区间长度不同';
  return null;
}

export function historyFor(
  snapshots: StatSnapshot[],
  current: StatSnapshot,
  heroId: number,
  role: string,
) {
  const sorted = snapshots
    .filter((s) => s.endDate <= current.endDate && !comparisonIssue(current, s))
    .sort(
      (a, b) =>
        a.endDate.localeCompare(b.endDate) ||
        b.importedAt.localeCompare(a.importedAt) ||
        a.id.localeCompare(b.id),
    );
  const seen = new Set<string>();
  return sorted
    .flatMap((s) => {
      const row = s.rows.find((r) => r.heroId === heroId && r.role === role);
      if (!row || seen.has(s.endDate)) return [];
      // The selected batch is the anchor if several imports cover the same day.
      if (s.endDate === current.endDate && s.id !== current.id) return [];
      seen.add(s.endDate);
      return [{ snapshot: s, row }];
    })
    .slice(-30);
}
