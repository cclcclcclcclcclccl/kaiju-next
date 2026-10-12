import type { Draft, Hero, Pool } from './model.ts';
export type Trait =
  'frontline' | 'engage' | 'peel' | 'magic' | 'physical' | 'mobility' | 'poke' | 'sustain';
export const traitNames: Record<Trait, string> = {
  frontline: '前排承伤',
  engage: '先手控制',
  peel: '保护后排',
  magic: '法术输出',
  physical: '物理输出',
  mobility: '机动切入',
  poke: '远程消耗',
  sustain: '持续输出',
};
export type Note = { traits: Trait[]; tip: string; tradeoff: string; drill: string };
const entries: [string, Trait[], string, string, string][] = [
  [
    '廉颇',
    ['frontline', 'engage', 'peel'],
    '用控制给队友创造跟进窗口。',
    '位移交完后，回头保护后排的空间会变小。',
    '开团前看一次队友位置，确认能跟上再进。',
  ],
  [
    '白起',
    ['frontline', 'engage'],
    '优先寻找队友能跟进的嘲讽角度。',
    '先手距离与队友脱节时容易独自承伤。',
    '每次先手前确认附近至少一名输出能跟进。',
  ],
  [
    '夏侯惇',
    ['frontline', 'engage', 'peel'],
    '把控制用于接近目标或阻止对手突进。',
    '同时承担开团与保护时，要先确定这波的任务。',
    '团战开始前，决定这波保护谁或限制谁。',
  ],
  [
    '吕布',
    ['frontline', 'engage', 'sustain'],
    '大招适合分割战场，落点要兼顾队友。',
    '大招有明显预警，不能把命中当作必然。',
    '先等队友控制，再判断大招落点。',
  ],
  [
    '亚瑟',
    ['frontline', 'physical'],
    '利用沉默限制关键目标的技能衔接。',
    '追击过深会失去和队伍的联系。',
    '只追到队友能支援的位置。',
  ],
  [
    '孙策',
    ['frontline', 'engage', 'mobility'],
    '提前与队友沟通进场方向。',
    '远距离支援需要判断兵线损失。',
    '支援前处理兵线，并标记进场目标。',
  ],
  [
    '花木兰',
    ['physical', 'mobility'],
    '抓住侧翼空档切入，注意技能形态。',
    '连招与进场时机需要熟练度。',
    '训练场先练稳定连招，再练实战侧翼位置。',
  ],
  [
    '赵云',
    ['physical', 'mobility', 'engage'],
    '用位移寻找切入机会，控制衔接队友伤害。',
    '关键技能空掉后继续追击风险较高。',
    '入场前找好退路，不把所有位移用于追人。',
  ],
  [
    '澜',
    ['physical', 'mobility'],
    '等对手关键控制交出后再切入。',
    '缺少进场信息时很容易被反控。',
    '开团前先确认敌方控制英雄的位置。',
  ],
  [
    '镜',
    ['physical', 'mobility'],
    '用位移处理进退节奏。',
    '操作负担高，理论合适不等于实战能发挥。',
    '优先提高一套稳定连招的成功率。',
  ],
  [
    '李白',
    ['physical', 'mobility'],
    '围绕可用目标准备技能进场条件。',
    '没有可利用的进场条件时输出受限。',
    '进入战场前先确认可用目标与退场位置。',
  ],
  [
    '兰陵王',
    ['physical', 'mobility'],
    '给脆弱目标制造侧翼压力。',
    '敌方抱团并有保护时，独自切入代价很高。',
    '先观察保护技能，再决定是否切后排。',
  ],
  [
    '韩信',
    ['physical', 'mobility'],
    '通过转线与带线寻找空间。',
    '进场承伤能力有限，需要保持发育与退路。',
    '每次带线过河前先看敌方人数信息。',
  ],
  [
    '小乔',
    ['magic', 'engage', 'poke'],
    '用击飞衔接伤害，保持与前排的距离。',
    '关键控制交掉以后要留意侧翼。',
    '二技能空掉时先后撤，不急着补输出。',
  ],
  [
    '王昭君',
    ['magic', 'engage', 'peel', 'poke'],
    '用控制和范围技能限制通道。',
    '预判控制需要队友先手或地形帮助。',
    '先观察队友控制，再接自己的控制。',
  ],
  [
    '甄姬',
    ['magic', 'engage', 'peel'],
    '让技能覆盖聚集目标，配合队友控制。',
    '站位过近时容易被先手。',
    '团战先保证站位，再寻找多人命中机会。',
  ],
  [
    '张良',
    ['magic', 'engage', 'peel'],
    '把压制留给需要重点限制的目标。',
    '持续控制期间需要队友保护和跟进。',
    '每局开打前确定一个优先限制对象。',
  ],
  [
    '西施',
    ['magic', 'engage', 'peel'],
    '利用牵引为队友创造集火机会。',
    '队友不在场时，控制本身未必能转化收益。',
    '出手前观察谁能够补伤害。',
  ],
  [
    '不知火舞',
    ['magic', 'engage', 'mobility'],
    '从侧面切入，用控制打断对手节奏。',
    '进场连招和能量管理要求较高。',
    '先练稳定进退，再尝试极限切后排。',
  ],
  [
    '貂蝉',
    ['magic', 'mobility', 'sustain'],
    '在适合持续作战的位置展开。',
    '敌方控制密集时需要谨慎选择入场窗口。',
    '先数清关键控制是否已交，再进入人群。',
  ],
  [
    '嬴政',
    ['magic', 'poke', 'sustain'],
    '在安全距离持续压低对手状态。',
    '硬控制与位移不足，需要队友补足。',
    '放大前确认侧翼视野，边输出边调整位置。',
  ],
  [
    '干将莫邪',
    ['magic', 'poke'],
    '利用射程寻找安全消耗角度。',
    '远程技能命中不稳定时需要减少冒险。',
    '先练固定距离命中，再练移动目标预判。',
  ],
  [
    '沈梦溪',
    ['magic', 'poke'],
    '远程消耗后配合队友推进。',
    '消耗收益需要队伍跟进，不能只追求伤害。',
    '消耗命中后观察是否能转化为推塔空间。',
  ],
  [
    '安琪拉',
    ['magic', 'engage'],
    '控制命中后衔接爆发，避免暴露站位。',
    '核心技能空掉时正面威慑降低。',
    '技能未命中时先退到安全位置。',
  ],
  [
    '妲己',
    ['magic', 'engage'],
    '选择能够被队友集火的目标。',
    '技能交完后存在空档，需要队友补输出。',
    '出手前判断能否完成击杀或逼退。',
  ],
  [
    '后羿',
    ['physical', 'sustain', 'engage'],
    '在队友保护下持续输出，大招可提供先手机会。',
    '缺少主动位移，走位和保护很重要。',
    '团战先打安全范围内的目标。',
  ],
  [
    '孙尚香',
    ['physical', 'mobility'],
    '用翻滚调整输出位置，避免向危险方向滚动。',
    '位移同时是输出与生存工具，需要取舍。',
    '每次翻滚前先选安全落点。',
  ],
  [
    '公孙离',
    ['physical', 'mobility'],
    '围绕伞的位置安排输出与退路。',
    '多段位移需要较高操作熟练度。',
    '先记住每次回伞的位置。',
  ],
  [
    '马可波罗',
    ['physical', 'mobility', 'sustain'],
    '先消耗，再判断是否具备进场条件。',
    '大招进场容易受控制打断。',
    '敌方控制没交时不急着大招入场。',
  ],
  [
    '狄仁杰',
    ['physical', 'sustain'],
    '保持持续输出，并保留解控应对关键控制。',
    '解控交掉后要及时收缩站位。',
    '每次交解控后主动向队友靠近。',
  ],
  [
    '鲁班七号',
    ['physical', 'sustain'],
    '依靠队友保护，把持续火力转化成推进。',
    '没有主动位移，侧翼威胁需要提前处理。',
    '进入河道前先等队友提供信息。',
  ],
  [
    '伽罗',
    ['physical', 'sustain', 'poke'],
    '利用距离优势稳定输出。',
    '长距离输出仍需要前排和侧翼保护。',
    '始终与己方前排保持一段安全距离。',
  ],
  [
    '张飞',
    ['frontline', 'peel', 'engage'],
    '根据局势决定先手或保护核心。',
    '开团后位置前压，可能难以及时保护后排。',
    '开大前先判断本局谁最需要保护。',
  ],
  [
    '牛魔',
    ['frontline', 'engage', 'peel'],
    '为队友创造稳定的控制衔接。',
    '控制有预警，配合队友会更可靠。',
    '先确认队友跟进位置，再用大招封路。',
  ],
  [
    '东皇太一',
    ['frontline', 'engage', 'peel'],
    '用压制限制关键突进目标。',
    '换血与控制目标需要结合双方状态判断。',
    '优先观察突进者，而不是盲目向前压。',
  ],
  [
    '蔡文姬',
    ['peel'],
    '跟随需要保护的队友，发挥恢复和控制作用。',
    '队伍缺少前排时不能代替承伤角色。',
    '保持能覆盖核心队友、又不暴露自己的距离。',
  ],
  [
    '孙膑',
    ['peel', 'mobility'],
    '利用团队机动性帮助拉扯与转线。',
    '需要队伍有能够承伤与进场的角色。',
    '提前沟通拉扯时机，不在脱节后才交加速。',
  ],
  [
    '大乔',
    ['peel', 'mobility'],
    '通过团队调度创造人数与转线机会。',
    '队友沟通不足时，调度收益会下降。',
    '回城与集结前给队友明确提示。',
  ],
  [
    '瑶',
    ['peel'],
    '围绕队友提供保护，留意脱离与附身时机。',
    '队伍仍需要独立的前排与开团来源。',
    '观察保护对象的位置，避免一起进入无信息区域。',
  ],
  [
    '盾山',
    ['frontline', 'peel', 'engage'],
    '利用防御机制保护队友，注意控制衔接。',
    '面对绕侧和不同技能机制时需重新判断站位。',
    '先保护关键输出角度，再尝试先手。',
  ],
];
export const notes: Record<string, Note> = Object.fromEntries(
  entries.map(([name, traits, tip, tradeoff, drill]) => [name, { traits, tip, tradeoff, drill }]),
);
export type Recommendation = {
  hero: Hero;
  note: Note;
  reasons: string[];
  risks: string[];
  level: Pool[number]['level'] | null;
  improves: Trait[];
};
export function recommend(draft: Draft, heroes: Hero[]): Recommendation[] {
  const get = (id: number) => heroes.find((h) => h.id === id);
  const others = Object.entries(draft.allies)
    .filter(([role, id]) => role !== draft.role && id)
    .map(([, id]) => get(id!))
    .filter(Boolean) as Hero[];
  const enemies = Object.values(draft.enemies)
    .filter(Boolean)
    .map((id) => get(id!))
    .filter(Boolean) as Hero[];
  const taken = new Set([...others.map((h) => h.id), ...enemies.map((h) => h.id), ...draft.banned]);
  const coverage = new Set(others.flatMap((h) => notes[h.name]?.traits ?? []));
  const unknown = others.filter((h) => !notes[h.name]);
  const essential: Trait[] = ['frontline', 'engage', 'magic', 'physical'];
  const enemyDive = enemies.filter((h) => notes[h.name]?.traits.includes('mobility'));
  return heroes
    .filter(
      (h) =>
        h.roles.includes(draft.role) &&
        notes[h.name] &&
        !taken.has(h.id) &&
        (!draft.onlyPool || draft.pool.some((p) => p.heroId === h.id)),
    )
    .map((hero) => {
      const note = notes[hero.name],
        level = draft.pool.find((p) => p.heroId === hero.id)?.level ?? null;
      const improves = note.traits.filter((t) => essential.includes(t) && !coverage.has(t));
      const reasons = [
        ...improves.map((t) => '补充' + traitNames[t]),
        ...(enemyDive.length && note.traits.includes('peel')
          ? ['对方有机动切入，提供后排保护手段']
          : []),
        ...(level === 'main'
          ? ['你的本命英雄']
          : level === 'comfortable'
            ? ['已在你的熟练英雄池']
            : []),
      ];
      if (!reasons.length) reasons.push('符合当前分路，作为阵容取舍备选');
      const risks = [
        note.tradeoff,
        ...(!level || level === 'learning' ? ['熟练度尚未确认，建议先练习再用于关键对局。'] : []),
        ...(unknown.length ? ['部分队友尚无战术笔记，阵容判断不完整。'] : []),
        ...(enemies.some((h) => !notes[h.name])
          ? ['部分对手尚无战术笔记，对方威胁可能未完整识别。']
          : []),
      ];
      const score =
        improves.length * 4 +
        (level === 'main' ? 7 : level === 'comfortable' ? 5 : level === 'learning' ? 1 : 0) +
        (enemyDive.length && note.traits.includes('peel') ? 3 : 0);
      return { hero, note, reasons, risks, level, improves, score };
    })
    .sort((a, b) => b.score - a.score || a.hero.id - b.hero.id)
    .map(({ score, ...entry }) => entry)
    .slice(0, 3);
}
export function lineupTraits(ids: number[], heroes: Hero[]): Set<Trait> {
  return new Set(
    ids.flatMap((id) => {
      const h = heroes.find((x) => x.id === id);
      return h ? (notes[h.name]?.traits ?? []) : [];
    }),
  );
}
