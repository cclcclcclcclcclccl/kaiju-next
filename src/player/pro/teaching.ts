import snapshot from '../data/teaching.json' with { type: 'json' };
import heroSnapshot from '../data/teaching-heroes.json' with { type: 'json' };
import type { Hero, Role } from '../model.ts';

export type TeachingSource = {
  id: string;
  kind: string;
  title: string;
  url: string;
  author: string;
  published: string;
  retrievedAt: string;
  views?: number;
  viewsLabel?: string;
  duration?: string;
  heroIds: number[];
  roles: string[];
  status: string;
  scope: string;
  versionNote: string;
  evidenceFile: string;
  evidenceSha256: string;
  frames?: { second: number; file: string; sha256: string }[];
};
export const teachingSources: TeachingSource[] = snapshot.sources;
export const teachingVersion = '教学资料 v2 · 2026-10-20';
export const teachingCoverage = heroSnapshot.heroes;
export const teachingStatus: Record<string, string> = {
  metadata: '待研读',
  preview: '仅片头抽帧',
  text: '已研读文字',
  frames: '已核对教学画面',
};
export type TeachingLesson = {
  id: string;
  title: string;
  heroIds: number[];
  roles: string[];
  sourceId: string;
  anchor: string;
  takeaway: string;
  checks: string[];
  counterexample: string;
  drill: string;
  relatedVideoId?: string;
};
// These are project-authored questions derived from the identified source passages,
// not quotations, ground-truth labels, trained weights or proven current-patch tactics.
export const teachingLessons: TeachingLesson[] = [
  ...heroSnapshot.lessons,
  {
    id: 'invasion',
    title: '入侵前，先比较谁能先到',
    heroIds: [],
    roles: ['打野'],
    sourceId: 'cv18055168',
    anchor: '“反野开局”及“自家中线开”的三项弊端',
    takeaway: '反野需要区分争抢和资源互换，并考虑中路线权与队友配合。',
    checks: [
      '此刻看到了哪些敌人？没有露头的人只能标为未知。',
      '队友能否先到，是否要付出丢线或掉状态的代价？',
      '争抢、换另一片资源、退回发育，哪一个条件更充分？',
    ],
    counterexample:
      '己方中单被压在塔下、队友无法跟进时，不能把“进野区”当成固定正确答案；敌人没露头也不证明另一片野区安全。',
    drill:
      '选一次入侵前的暂停画面，列出三个方案和到场条件；恢复播放后只检验预测，不用结果倒推当时必然正确。',
  },
  {
    id: 'conversion',
    title: '抓人结束，下一步怎样兑现收益',
    heroIds: [],
    roles: ['打野'],
    sourceId: 'cv18092243',
    anchor: '末尾“抓完人后优先考虑反野和推塔”及小地图支援判断',
    takeaway: '抓人后的推进与资源转换值得比较，回自家刷野不是唯一后续。',
    checks: [
      '兵线能否进塔？队友状态是否允许继续？',
      '敌人最后露头位置和复活情况是否支持继续推进？',
      '继续推塔、拿可见资源、回补，分别会错过什么？',
    ],
    counterexample:
      '无兵线、血量不足或敌方支援可能先到时，继续推进可能亏损；旧文章的刷新时间和经济数字不能直接套用。',
    drill: '复看一次击杀后的转线，写下继续推进与回补的停止条件，再检查当时小地图是否支持。',
  },
  {
    id: 'teamfight-job',
    title: '开团之前，先确定这波自己的职责',
    heroIds: [],
    roles: ['打野'],
    sourceId: 'cv33569442',
    anchor: '第二部分：先手或后手、团战人数差、关键队友',
    takeaway:
      '先手、收割与带线抓单需要结合阵容和当前队友位置判断。该文为玩家经验分享，权威性与效果未验证。',
    checks: [
      '我进场后队友能接上吗？本方缺少哪位关键成员？',
      '敌方关键控制已确认交掉，还是仅凭猜测？',
      '正面接团、拉开或先处理边线，各自需要什么条件？',
    ],
    counterexample:
      '即使英雄通常负责收割，也不能不看队友生存与资源压力而机械等待；缺少敌人信息时不臆测其技能。',
    drill: '在进场前暂停，用一句话写下本波职责，再写一个需要改变职责的触发条件。',
  },
  {
    id: 'zhuge-reset',
    title: '诸葛亮：进场前检查印记、退路与挡弹者',
    heroIds: [190],
    roles: ['中路', '打野'],
    sourceId: 'official-190',
    anchor: '官方使用建议、对抗建议、二技能与大招提示',
    takeaway: '官方提示强调印记、位移时机和元气弹可能被队友挡住；低血量目标不代表必定可收割。',
    checks: [
      '画面是否看得清当前印记、位移可用情况？',
      '目标与我之间是否有可见挡弹者？',
      '如果击杀失败，是否还有撤退路径和队友接应？',
    ],
    counterexample: '视野外有人可能挡弹、位移已耗尽或击杀线不明确时，不把“贴脸刷新”写成确定建议。',
    drill: '分别保留一次大招成功和一次失败的释放前画面，比较挡弹路径与退路；不猜看不清的斩杀数值。',
  },
  {
    id: 'zhao-cycle',
    title: '赵怀真：把攻防循环和进退窗口一起看',
    heroIds: [544],
    roles: ['打野', '对抗路', '游走'],
    sourceId: 'official-544',
    relatedVideoId: 'tencent-829966',
    anchor: '官方使用建议、对抗建议、二技能与大招提示',
    takeaway:
      '官方建议围绕普攻精力与防御状态交替，并提示二技能后的控制窗口、大招的保护和逃生用途。',
    checks: [
      '当前精力与二技能状态是否能从画面确认？',
      '对方的控制已经释放，还是未知？',
      '继续输出、保护队友或撤退，各自还能使用哪些已确认手段？',
    ],
    counterexample:
      '精力耗尽或二技能已交时，不能沿用满状态时的追击判断；大招也不应一律只用于补伤害。',
    drill: '回看一次追击结束前的暂停画面，记录精力、二技能和撤退路线，找出应该由进攻转防守的条件。',
  },
];

export function lessonsFor(heroId: number, roles: readonly string[], role?: string) {
  return teachingLessons
    .filter((l) => {
      const source = teachingSources.find((s) => s.id === l.sourceId);
      return (
        source?.status === 'text' &&
        (l.heroIds.length ? l.heroIds.includes(heroId) : true) &&
        (role ? l.roles.includes(role) : l.roles.some((r) => roles.includes(r)))
      );
    })
    .sort((a, b) => Number(b.heroIds.includes(heroId)) - Number(a.heroIds.includes(heroId)));
}

export function lessonPacket(hero: Pick<Hero, 'id' | 'roles'>, role?: Role) {
  return {
    version: teachingVersion,
    scope:
      '教学卡只提供待检查的思路，不是本局事实或当前版本的最优解。先核对角色、版本与画面，再决定是否适用。待研读视频不进入分析依据。不得把资料库访问量当作效果证据。',
    cards: lessonsFor(hero.id, hero.roles, role).map((l) => {
      const source = teachingSources.find((s) => s.id === l.sourceId)!;
      return {
        ...l,
        sourceConflict:
          teachingCoverage.find((h) => l.heroIds.includes(h.heroId))?.conflict || undefined,
        evidenceExcerpts: teachingCoverage.find((h) => l.heroIds.includes(h.heroId))?.excerpts,
        relatedVideo: teachingSources.find(
          (s) => s.id === l.relatedVideoId && s.status === 'frames',
        ),
        source: {
          title: source.title,
          url: source.url,
          author: source.author,
          published: source.published,
          retrievedAt: source.retrievedAt,
          versionNote: source.versionNote,
          evidenceSha256: source.evidenceSha256,
        },
      };
    }),
  };
}

export function teachingSearchUrl(heroName: string, newest = false) {
  return (
    'https://search.bilibili.com/all?keyword=' +
    encodeURIComponent('王者荣耀 ' + heroName + ' 教学') +
    '&order=' +
    (newest ? 'pubdate' : 'click')
  );
}

export function sourcesForTeaching(
  hero: Pick<Hero, 'id' | 'roles'> | undefined,
  role = '',
  status = '',
  sort = 'studied',
) {
  const priority: Record<string, number> = { text: 3, frames: 2, preview: 1, metadata: 0 };
  return teachingSources
    .filter(
      (s) =>
        (!hero ||
          s.heroIds.includes(hero.id) ||
          (!s.heroIds.length && s.roles.some((r) => hero.roles.includes(r)))) &&
        (!role || s.roles.includes(role)) &&
        (!status || s.status === status),
    )
    .sort((a, b) => {
      if (sort === 'popular') return (b.views ?? -1) - (a.views ?? -1);
      if (sort === 'retrieved') return b.retrievedAt.localeCompare(a.retrievedAt);
      return (
        (priority[b.status] ?? -1) - (priority[a.status] ?? -1) ||
        Number(!!hero && b.heroIds.includes(hero.id)) -
          Number(!!hero && a.heroIds.includes(hero.id)) ||
        b.retrievedAt.localeCompare(a.retrievedAt)
      );
    });
}
