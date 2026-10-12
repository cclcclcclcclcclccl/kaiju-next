import type { Hero } from '../model.ts';
import { emptyHeroMetric, profileSchema } from './model.ts';
import type { Profile, HeroMetric } from './model.ts';
export type OcrLine = { text: string; confidence: number; box: number[][] };
export type OcrData = {
  width: number;
  height: number;
  lines: OcrLine[];
  sha256: string;
  engine: string;
};
export type ScreenshotScope = 'lifetime' | 'season' | 'recent' | 'power' | 'account';
export type ExtractedField = {
  key: string;
  label: string;
  value: number;
  confidence: number;
  evidence: string;
  ambiguous: boolean;
};
export type ScreenshotDraft = { heroId?: number; fields: ExtractedField[]; warnings: string[] };
const clean = (s: string) => s.replace(/[\s,，]/g, '').replace(/％/g, '%');
const numeric = (s: string) => {
  const m = clean(s).match(/^([+]?\d+(?:\.\d+)?)(万|%|分|场|胜)?$/);
  return m ? Number(m[1]) * (m[2] === '万' ? 10000 : 1) : undefined;
};
const bounds = (l: OcrLine) => ({
  x: Math.min(...l.box.map((p) => p[0])),
  y: Math.min(...l.box.map((p) => p[1])),
  right: Math.max(...l.box.map((p) => p[0])),
  bottom: Math.max(...l.box.map((p) => p[1])),
});
export function extractProfile(
  data: OcrData,
  scope: ScreenshotScope,
  heroes: Hero[],
): ScreenshotDraft {
  const heroHits = heroes.filter((h) => data.lines.some((l) => clean(l.text) === clean(h.name)));
  const mappings: [string, string, string[], number][] =
    scope === 'account'
      ? [
          ['seasonPeakScore', '赛季最高巅峰分', ['本赛季最高巅峰分', '赛季最高分'], 5000],
          ['peakScore', '当前巅峰分', ['当前巅峰分', '巅峰积分', '巅峰分数', '巅峰分'], 5000],
          ['peakEnergy', '巅峰能量', ['巅峰能量'], 10000],
          ['peakCoefficient', '巅峰加成 %', ['巅峰加成'], 500],
          ['challengeCoefficient', '挑战赛加成 %', ['挑战赛加成'], 500],
        ]
      : [
          [
            'historicalPeakPower',
            '历史最高战力',
            ['历史最高战力', '最高历史战力', '历史最高'],
            100000,
          ],
          ['power', '当前战力', ['当前战力', '荣耀战力', '英雄战力', '战力'], 100000],
          ['performanceScore', '表现分合计', ['表现分合计', '表现战力', '表现分'], 100000],
          ['rankPerformanceScore', '排位表现分', ['排位表现分', '排位表现战力'], 100000],
          ['peakPerformanceScore', '巅峰表现分', ['巅峰表现分', '巅峰表现战力'], 100000],
          ['peakCoefficient', '英雄巅峰加成 %', ['巅峰加成'], 500],
          ['challengeCoefficient', '英雄挑战赛加成 %', ['挑战赛加成'], 500],
          ['proficiencyPoints', '游戏内熟练度', ['英雄熟练度', '熟练度'], 10000000],
          [
            scope === 'recent' ? 'recentGames' : scope === 'season' ? 'seasonGames' : 'games',
            scope === 'recent' ? '近期场次' : scope === 'season' ? '本赛季场次' : '累计场次',
            ['总场次', '总场数', '对局场次', '使用场次', '场次', '场数'],
            100000,
          ],
          [
            scope === 'recent' ? 'recentWinRate' : scope === 'season' ? 'seasonWinRate' : 'winRate',
            scope === 'recent' ? '近期胜率 %' : scope === 'season' ? '本赛季胜率 %' : '累计胜率 %',
            ['总胜率', '胜率'],
            100,
          ],
          [
            scope === 'recent' ? 'recentRating' : 'averageRating',
            scope === 'recent' ? '近期评分' : '平均评分',
            ['综合评分', '平均评分', '评分'],
            16,
          ],
        ];
  const found = new Map<string, ExtractedField[]>();
  for (const line of data.lines) {
    const text = clean(line.text);
    if (scope === 'account' && /历史最高/.test(text)) continue;
    const matches = mappings
      .flatMap((m) => m[2].filter((alias) => text.includes(alias)).map((alias) => ({ m, alias })))
      .sort((a, b) => b.alias.length - a.alias.length);
    if (!matches.length) continue;
    const {
      m: [key, label, , max],
      alias,
    } = matches[0];
    // Never turn a full coefficient such as 206.30% into an additive 206.30% bonus.
    if (/系数/.test(text)) continue;
    const suffix = text.slice(text.indexOf(alias) + alias.length).replace(/^[:：]/, '');
    let value = numeric(suffix),
      evidence = line.text,
      confidence = line.confidence,
      ambiguous = false;
    if (value === undefined) {
      const b = bounds(line),
        height = Math.max(10, b.bottom - b.y),
        center = (b.x + b.right) / 2;
      const candidates = data.lines
        .flatMap((other) => {
          if (other === line) return [];
          const n = numeric(other.text);
          if (n === undefined || n > max) return [];
          const o = bounds(other),
            cy = (o.y + o.bottom) / 2,
            bcy = (b.y + b.bottom) / 2;
          const sameRow =
            Math.abs(cy - bcy) < height * 0.6 &&
            o.x >= b.right - 5 &&
            o.x - b.right < Math.max(160, data.width * 0.25);
          const aboveBelow =
            Math.abs((o.x + o.right) / 2 - center) < Math.max(40, (b.right - b.x) * 0.65) &&
            Math.abs(cy - bcy) < height * 3.5;
          if (!sameRow && !aboveBelow) return [];
          return [
            {
              value: n,
              text: other.text,
              confidence: other.confidence,
              distance: sameRow ? Math.max(0, o.x - b.right) : Math.abs(cy - bcy) + height,
            },
          ];
        })
        .sort((a, b) => a.distance - b.distance);
      if (!candidates.length) continue;
      value = candidates[0].value;
      evidence = line.text + ' → ' + candidates[0].text;
      confidence = Math.min(confidence, candidates[0].confidence);
      ambiguous = candidates.length > 1 && candidates[1].distance - candidates[0].distance < height;
    }
    if (
      value > max ||
      value < 0 ||
      (!/Rate|Rating|Coefficient|Score/.test(key) && !Number.isInteger(value))
    )
      continue;
    const entry = { key, label, value, confidence, evidence, ambiguous };
    found.set(key, [...(found.get(key) ?? []), entry]);
  }
  const fields = [...found.values()].map((entries) => ({
    ...entries[0],
    ambiguous: entries[0].ambiguous || new Set(entries.map((e) => e.value)).size > 1,
  }));
  const warnings: string[] = [];
  const scopeText = data.lines.map((l) => clean(l.text)).join('\n');
  const conflict =
    (scope === 'lifetime' && /本赛季|近\d+场|最近\d+场/.test(scopeText)) ||
    (scope === 'season' && /累计战绩|全部赛季/.test(scopeText));
  if (conflict) {
    warnings.push(
      '截图文字与所选统计范围可能不一致，所有指标已取消默认采用。请先切换到正确范围重新识别。',
    );
    for (const f of fields) f.ambiguous = true;
  }
  if (heroHits.length !== 1 && scope !== 'account')
    warnings.push('没有唯一识别出英雄名，请选择截图中的英雄。');
  if (data.lines.some((l) => /系数/.test(l.text)))
    warnings.push('截图含“系数”：倍数与加成百分数不是同一口径，未自动写入加成字段。');
  if (scope === 'power') warnings.push('战力只能作辅助参考；建议再上传同一英雄的战绩页。');
  if (scope === 'season') warnings.push('本赛季评分暂不混入累计评分：请核对评分对应范围。');
  return {
    heroId: heroHits.length === 1 ? heroHits[0].id : undefined,
    fields: scope === 'season' ? fields.filter((f) => f.key !== 'averageRating') : fields,
    warnings,
  };
}
export function mergeScreenshot(
  profile: Profile,
  scope: ScreenshotScope,
  heroId: number | undefined,
  fields: ExtractedField[],
  sha: string,
  observedOn: string,
): Profile {
  if (!fields.length) throw new Error('请至少勾选一个已核对字段');
  let next: Profile = { ...profile, heroes: profile.heroes.map((h) => ({ ...h })) };
  const values = Object.fromEntries(fields.map((f) => [f.key, f.value]));
  if (scope === 'account') {
    const allowed = [
      'peakScore',
      'seasonPeakScore',
      'peakEnergy',
      'peakCoefficient',
      'challengeCoefficient',
    ];
    if (fields.some((f) => !allowed.includes(f.key))) throw new Error('账号字段无效');
    next = { ...next, ...values };
  } else {
    if (!heroId) throw new Error('请先确认英雄');
    const allowed = [
      'games',
      'winRate',
      'averageRating',
      'recentGames',
      'recentWinRate',
      'recentRating',
      'seasonGames',
      'seasonWinRate',
      'power',
      'historicalPeakPower',
      'performanceScore',
      'rankPerformanceScore',
      'peakPerformanceScore',
      'peakCoefficient',
      'challengeCoefficient',
      'proficiencyPoints',
    ];
    if (fields.some((f) => !allowed.includes(f.key))) throw new Error('英雄字段无效');
    const original = next.heroes.find((h) => h.heroId === heroId) ?? emptyHeroMetric(heroId);
    const record = {
      ...original,
      ...values,
      observedOn,
      dataSource: 'screenshot' as const,
      evidence: `截图识别后人工核对；SHA256 ${sha.slice(0, 16)}；${scope}`,
    } as HeroMetric;
    for (const [rate, wins] of [
      ['winRate', 'wins'],
      ['recentWinRate', 'recentWins'],
      ['seasonWinRate', 'seasonWins'],
    ] as const)
      if (values[rate] !== undefined) record[wins] = undefined;
    // Do not invent lifetime games from a season or recent screenshot.
    if ((record.seasonGames ?? 0) > record.games || record.recentGames > record.games)
      throw new Error(
        '尚缺累计场次，或已有累计场次小于这张截图中的赛季/近期场次。先上传累计战绩页，或在下方补录累计场次后再导入。',
      );
    next.heroes = next.heroes.some((h) => h.heroId === heroId)
      ? next.heroes.map((h) => (h.heroId === heroId ? record : h))
      : [...next.heroes, record];
  }
  return profileSchema.parse(next);
}
