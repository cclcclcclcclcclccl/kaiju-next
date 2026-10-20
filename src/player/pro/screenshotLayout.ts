import type { OcrData } from './screenshot.ts';
import { heroes } from '../catalog.ts';
import { inferRoles } from './flexRoles.ts';
export type LayoutPick = { heroId: number; key: string; text: string; confidence: number };
export function suggestScreenshotLayout(ocr: OcrData, layout: 'lr' | 'tb'): LayoutPick[] {
  if (!(ocr.width > 0 && ocr.height > 0)) throw Error('图片尺寸无效');
  const found: { heroId: number; side: 1 | 2; text: string; confidence: number }[] = [];
  for (const l of ocr.lines) {
    if (
      l.confidence < 0.6 ||
      !l.box?.length ||
      l.box.some((p) => p.length < 2 || !p.every(Number.isFinite))
    )
      continue;
    const h = heroes.find((h) => h.name.replace(/\s/g, '') === l.text.replace(/\s/g, ''));
    if (!h) continue;
    const axis = layout === 'lr' ? 0 : 1,
      size = layout === 'lr' ? ocr.width : ocr.height;
    const center = l.box.reduce((sum, p) => sum + p[axis], 0) / l.box.length;
    if (center < 0 || center > size || Math.abs(center - size / 2) < size * 0.03) continue;
    found.push({
      heroId: h.id,
      side: center < size / 2 ? 1 : 2,
      text: l.text,
      confidence: l.confidence,
    });
  }
  const ids = found.map((r) => r.heroId);
  if (new Set(ids).size !== ids.length)
    throw Error('识别出重复英雄名字，无法确定是否为选人、禁用或说明文字。请逐个确认。');
  const picks: LayoutPick[] = [];
  for (const side of [1, 2] as const) {
    const list = found.filter((r) => r.side === side);
    if (list.length > 5)
      throw Error('一侧识别超过 5 位英雄，可能含禁用栏。请裁去禁用栏后重试，或逐个确认。');
    const { lineup } = inferRoles(
      list.map((r) => r.heroId),
      heroes,
      {},
    );
    for (const r of list) {
      const role = Object.entries(lineup).find(([, id]) => id === r.heroId)?.[0];
      const lane = ['对抗路', '中路', '发育路', '打野', '游走'].indexOf(role ?? '');
      if (lane >= 0) picks.push({ ...r, key: side + ':' + lane });
    }
  }
  if (!picks.length) throw Error('没有足够清晰的英雄名字，仍可逐个手动选择。');
  return picks;
}
