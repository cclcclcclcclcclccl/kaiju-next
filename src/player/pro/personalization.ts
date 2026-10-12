import type { Hero, Pool, Role } from '../model.ts';
import type { Profile } from './model.ts';
import { mastery, effectivePool } from './analytics.ts';
import { noteFor } from '../tactics.ts';
import { styleFit } from './playstyle.ts';

const lanePlans: Record<Role, string[]> = {
  对抗路: [
    '先确认兵线交汇与对位技能，保留安全的换血退路。',
    '准备支援前处理兵线，避免出现在团战却长期丢失边线。',
    '推进或资源团前明确自己负责边带、开团还是保护。',
  ],
  打野: [
    '按对面入侵能力和队友线权决定开野方向，首轮以完整发育为基准。',
    '出野区先看哪条线能配合，抓人失败及时回到刷野与控图。',
    '资源刷新前检查线权、队友状态和惩击，不把目标刷新等同于必须开打。',
  ],
  中路: [
    '在安全距离清线，记录对位关键技能是否交出。',
    '先确认两侧信息再转线，用可见人数决定跟进或回防。',
    '团战按技能射程站位，将第一轮技能留给明确目标。',
  ],
  发育路: [
    '优先保证补刀和血量，消失的敌人按可能来抓你处理。',
    '换线前确认安全路径和塔的状态，避免脱离保护单走。',
    '先攻击可安全触及的目标，保命技能用于应对真实切入。',
  ],
  游走: [
    '观察敌方动向和队友线权，先确定这一局优先协助谁。',
    '把开团或保护任务说清楚，再围绕下一处资源安排信息。',
    '进场前检查输出位能否跟进，关键保护技能不要无目的交掉。',
  ],
};
const focusDrills: Record<string, string> = {
  技能命中: '连续记录 5 次关键技能：目标是否可见、是否有控制铺垫、是否命中。',
  进场时机: '每次进场前口头确认队友距离与对手关键控制，复盘一次过早进场。',
  站位生存: '记录每次阵亡前最后一个安全位置，找出是否越过队伍可支援范围。',
  兵线发育: '每次游走前记录兵线状态，复盘因支援丢失的兵线与换回的收益。',
  地图意识: '每次进入河道或野区前数一次敌方可见人数，记录无信息走位。',
  资源转化: '每次击杀或逼退后立即选择塔、兵线、野区或撤退，不只记录人头。',
};
export function personalizedGuide(hero: Hero, profile: Profile, role: Role) {
  const note = noteFor(hero),
    fit = styleFit(hero, note.traits, profile);
  const samples = profile.heroes.find((h) => h.heroId === hero.id);
  return {
    fit,
    stages: lanePlans[role],
    skillTip: hero.skills.find((s) => s.tip)?.tip ?? note.drill,
    priorities: (profile.habits?.focus.length ? profile.habits.focus : ['地图意识', '站位生存'])
      .slice(0, 3)
      .map((f) => ({ name: f, action: focusDrills[f] })),
    sessionGames:
      profile.habits?.weeklyGames === 0
        ? 0
        : Math.min(5, Math.max(1, Math.floor((profile.habits?.weeklyGames ?? 10) / 3))),
    roleTask: hero.guide?.teamfight || note.tip,
    opening: note.tip,
    nextGoal:
      samples?.recentRating !== undefined && samples.recentRating < 7
        ? '先稳定技能与生存，再看胜负变化。'
        : '先观察训练目标完成率，再比较同分路、同模式的近期表现。',
  };
}
export function personalizedHeroes(heroes: Hero[], pool: Pool, profile: Profile, role?: Role) {
  const available = effectivePool(pool, profile);
  return heroes
    .filter((h) => !role || h.roles.includes(role))
    .map((hero) => {
      const note = noteFor(hero),
        fit = styleFit(hero, note.traits, profile);
      const readiness = mastery(hero.id, pool, profile),
        known = available.some((p) => p.heroId === hero.id);
      const expansion = profile.habits?.goal === '拓展英雄池';
      const score = expansion
        ? 0.35 * readiness.score + 0.5 * fit.score + (known ? 3 : 15)
        : 0.6 * readiness.score + 0.35 * fit.score + (known ? 5 : 0);
      const reasons = [
        ...fit.reasons,
        known
          ? `已登记英雄，准备度 ${readiness.score} · ${readiness.confidence}`
          : '作为拓展候选，当前没有足够的个人实战记录',
      ];
      return {
        hero,
        score: Math.round(score),
        readiness,
        fit,
        known,
        reasons,
        guide: personalizedGuide(hero, profile, (role ?? hero.roles[0]) as Role),
      };
    })
    .sort(
      (a, b) => b.score - a.score || b.readiness.score - a.readiness.score || a.hero.id - b.hero.id,
    )
    .slice(0, 6);
}
