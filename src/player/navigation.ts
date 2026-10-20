import type { Page } from './Dashboard.tsx';
export const taskLinks: {
  label: string;
  description: string;
  keywords: string;
  page: Page;
  tool?: string;
}[] = [
  {
    label: '英雄横向对比',
    description: '同一天、同分段比较 2–4 位英雄',
    keywords: '对比 比较 谁强 compare',
    page: 'datahub',
    tool: 'compare',
  },
  {
    label: '分段梯度',
    description: '查看来源梯度和各分段表现',
    keywords: '梯度 强度 t0 排行 胜率',
    page: 'tier',
  },
  {
    label: '全英雄指标',
    description: '筛选输出、经济、前中后期表现',
    keywords: '数据 统计 指标',
    page: 'datahub',
    tool: 'stats',
  },
  {
    label: '全皮肤库',
    description: '皮肤使用率、同图趋势对比',
    keywords: '皮肤 使用率 趋势',
    page: 'datahub',
    tool: 'skins',
  },
  {
    label: '装备全局数据',
    description: '装备使用率、英雄使用与历史',
    keywords: '装备 出装 六神装',
    page: 'datahub',
    tool: 'equipment',
  },
  {
    label: '对位与截图识别',
    description: '历史对位样本、截图位置草稿',
    keywords: '克制 对位 截图 识别 ocr',
    page: 'datahub',
    tool: 'matches',
  },
  {
    label: '阵容备战与系列赛',
    description: '逐手 BP、摇摆位、计时和历史局',
    keywords: 'bp 禁选 阵容 模拟 系列赛 bo3 bo5',
    page: 'draft',
  },
  {
    label: '我的英雄池',
    description: '管理常用英雄与熟练度记录',
    keywords: '英雄池 熟练度 保存',
    page: 'pool',
  },
  {
    label: '玩家档案',
    description: '截图导入个人数据和打法偏好',
    keywords: '个人 战力 巅峰分 截图 导入 档案',
    page: 'profile',
  },
  {
    label: '体系练习',
    description: '按自己与好友的英雄池匹配体系',
    keywords: '体系 配合 队友 练习',
    page: 'systems',
  },
  {
    label: '录像复盘',
    description: '复盘实际片段、记录证据与改进动作',
    keywords: '复盘 视频 录像 ai',
    page: 'replay',
  },
  {
    label: '教学资料与练习',
    description: '高播放教学候选、来源和分英雄决策检查卡',
    keywords: '教学 学习 课程 博主 视频 攻略',
    page: 'datahub',
    tool: 'teaching',
  },
  {
    label: '好友与组队',
    description: '登录账号、查看好友分享的英雄池',
    keywords: '好友 登录 注册 组队',
    page: 'social',
  },
  {
    label: '战力试算',
    description: '按公开参数估算，不改游戏账号',
    keywords: '战力 系数 计算',
    page: 'datahub',
    tool: 'power',
  },
];
export function searchTasks(query: string) {
  const q = query.trim().toLocaleLowerCase();
  return taskLinks
    .filter((t) => !q || (t.label + t.description + t.keywords).toLocaleLowerCase().includes(q))
    .slice(0, 6);
}
