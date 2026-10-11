import type { Economy } from './model.ts';
export type Scenario = { id: string; label: string; subtitle: string; tag: string; model: Economy };
export const scenarios: Scenario[] = [
  {
    id: 'foundry',
    label: '雾港炼金坊',
    subtitle: '制造与回收之间，藏着一条盈利回路。',
    tag: '制造经济',
    model: {
      schemaVersion: 1,
      title: '雾港炼金坊',
      description:
        '一个合成的工坊经济：玩家购买矿石，熔炼金属，再卖回商店。设计者希望封闭交易不会凭空增加金币。',
      resources: [
        { id: 'gold', name: '金币', initial: 12 },
        { id: 'ore', name: '矿石', initial: 0 },
        { id: 'ingot', name: '金属锭', initial: 0 },
      ],
      actions: [
        { id: 'buy', name: '购买矿石', cost: { gold: 3 }, gain: { ore: 1 } },
        { id: 'smelt', name: '熔炼金属', cost: { ore: 2 }, gain: { ingot: 1 } },
        { id: 'sell', name: '出售金属', cost: { ingot: 1 }, gain: { gold: 7 } },
      ],
      contract: { target: 'gold', restore: ['ore', 'ingot'], allowedProfit: 0 },
    },
  },
  {
    id: 'exchange',
    label: '三角兑换所',
    subtitle: '逐笔看似合理的汇率，组合后会发生什么？',
    tag: '兑换经济',
    model: {
      schemaVersion: 1,
      title: '三角兑换所',
      description: '合成案例：金币、晶石与徽记可以相互兑换。检查其他库存恢复原状后的金币净增。',
      resources: [
        { id: 'gold', name: '金币', initial: 10 },
        { id: 'crystal', name: '晶石', initial: 0 },
        { id: 'token', name: '徽记', initial: 0 },
      ],
      actions: [
        { id: 'exchange_a', name: '购入晶石', cost: { gold: 10 }, gain: { crystal: 7 } },
        { id: 'exchange_b', name: '兑换徽记', cost: { crystal: 7 }, gain: { token: 5 } },
        { id: 'exchange_c', name: '回兑金币', cost: { token: 5 }, gain: { gold: 12 } },
      ],
      contract: { target: 'gold', restore: ['crystal', 'token'], allowedProfit: 0 },
    },
  },
  {
    id: 'inventory',
    label: '旅人的行囊',
    subtitle: '卖出已有物资，是否真的等于经济漏洞？',
    tag: '误报检验',
    model: {
      schemaVersion: 1,
      title: '旅人的行囊',
      description:
        '合成对照案例：旅人持有初始木材，卖出后金币增加，但库存没有恢复。这不符合闭合套利的定义。',
      resources: [
        { id: 'gold', name: '金币', initial: 4 },
        { id: 'wood', name: '木材', initial: 2 },
      ],
      actions: [
        { id: 'buy', name: '购入木材', cost: { gold: 3 }, gain: { wood: 1 } },
        { id: 'sell', name: '出售木材', cost: { wood: 1 }, gain: { gold: 2 } },
      ],
      contract: { target: 'gold', restore: ['wood'], allowedProfit: 0 },
    },
  },
];
