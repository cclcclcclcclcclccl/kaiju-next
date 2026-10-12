import type { Hero } from '../model.ts';
import type { Profile } from './model.ts';
export function styleFit(hero: Hero, traits: string[], profile?: Profile) {
  const h = profile?.habits;
  if (!h) return { score: 50, reasons: [] as string[], risks: [] as string[] };
  let score = 50;
  const reasons: string[] = [],
    risks: string[] = [];
  const has = (trait: string) => traits.includes(trait);
  const matches: Record<string, boolean> = {
    稳健发育: has('sustain') || has('poke'),
    主动游走: has('mobility') || (hero.roles.includes('游走') && has('engage')),
    先手开团: has('engage'),
    保护队友: has('peel'),
    远程消耗: has('poke'),
    侧翼切入: has('mobility') && (has('physical') || has('magic')),
    边带牵制:
      hero.roles.some((r) => ['对抗路', '打野'].includes(r)) &&
      has('physical') &&
      (has('mobility') || has('sustain')),
  };
  const matching = h.styles.filter((style) => matches[style]);
  if (h.styles.length) {
    score += (matching.length / h.styles.length) * 25 - 8;
    if (matching.length) reasons.push('契合你的打法：' + matching.join('、'));
    else risks.push('与已选打法标签不同，需要适应新的任务');
  }
  if (h.roles.length) {
    const matchingRole = hero.roles.filter((r) => h.roles.includes(r as (typeof h.roles)[number]));
    score += matchingRole.length ? 12 : -20;
    if (matchingRole.length) reasons.push('属于你的偏好分路：' + matchingRole.join(' / '));
    else risks.push('不在你优先练习的分路');
  }
  if (hero.difficulty != null) {
    const excess = Math.max(0, hero.difficulty - h.mechanics * 2);
    score -= excess * 4;
    if (excess > 0)
      risks.push(`官网难度 ${hero.difficulty}/10，高于你的操作接受度，先练技能稳定性`);
  }
  if (
    h.risk === '稳健' &&
    (traits.includes('peel') || traits.includes('poke') || traits.includes('frontline'))
  )
    score += 6;
  if (h.risk === '主动' && (traits.includes('engage') || traits.includes('mobility'))) score += 6;
  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons, risks };
}
