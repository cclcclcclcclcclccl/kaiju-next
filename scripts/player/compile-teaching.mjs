// Rebuild only from saved public research. Never turns titles into tactical lessons.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = 'evidence/teaching-v023/research';
const sources = [];
const selections = [
  ['bili-0', ['210公式', 'KPL野王', '保姆级铠打刘备', '私人超雄波刚流宫本', '学的是技术']],
  ['bili-1', ['几百场国服', '对抗路打法！秒C连招']],
  ['bili-2', ['技能解析篇', 'S39超标教', '诸葛亮中路教学', '王者荣耀北笙']],
  ['bili-3', ['粉丝全局复盘系列', '打野位全网最顶级', '【巅峰赛复盘】', '对抗路转线技巧详解']],
  ['lane', ['《对抗路篇》']],
  ['carry', ['2100分马可教学', '2200分狄仁杰教学']],
  ['support', ['怎样成为一个', '史上最全辅助意识', '辅助上分指南', '国服张飞辅助意识']],
  ['recent-zhao', ['国服怀真必修的顶级思路']],
  ['recent-zhuge', ['如何度过前期的弱势']],
];
const roleFor = {
  'bili-0': ['打野'],
  'bili-1': ['打野', '对抗路'],
  'bili-2': ['中路', '打野'],
  'bili-3': [],
  lane: ['对抗路'],
  carry: ['发育路'],
  support: ['游走'],
  'recent-zhao': ['游走', '打野', '对抗路'],
  'recent-zhuge': ['打野'],
};
for (const [file, terms] of selections) {
  const raw = await fs.readFile(`${dir}/${file}.json`, 'utf8'),
    d = JSON.parse(raw);
  for (const term of terms) {
    const link = d.links.find((x) => x.url.includes('/video/') && x.text.includes(term));
    if (!link) {
      console.log('Skipped missing title:', file, term);
      continue;
    }
    const id = link.url.match(/BV\w+/)[0];
    if (sources.some((s) => s.id === id)) continue;
    const lines = d.text.split('\n').map((s) => s.trim());
    const pos = lines.indexOf(link.text);
    if (pos < 3) throw Error('Cannot locate title ' + term);
    const displayViews = lines[pos - 3],
      duration = lines[pos - 1];
    if (!/^[\d.]+万?$/.test(displayViews) || !/^\d+:\d+(?::\d+)?$/.test(duration))
      throw Error('Bad card parse ' + term);
    let detail;
    try {
      detail = JSON.parse(await fs.readFile(`${dir}/${id}.json`, 'utf8'));
    } catch {}
    const preview = ['BV17Y411j7Hg', 'BV14K411R73c', 'BV1pA411e725'].includes(id);
    sources.push({
      id,
      kind: 'video',
      title: link.text,
      url: `https://www.bilibili.com/video/${id}/`,
      author: detail?.state?.owner?.name ?? lines[pos + 1],
      published: detail?.state?.pubdate
        ? new Date(detail.state.pubdate * 1000).toISOString().slice(0, 10)
        : lines[pos + 2].replace(/^·\s*/, ''),
      retrievedAt: d.at,
      views:
        detail?.state?.stat?.view ??
        Number.parseFloat(displayViews) * (displayViews.endsWith('万') ? 10000 : 1),
      viewsLabel: detail?.state?.stat?.view
        ? String(detail.state.stat.view)
        : displayViews + '（页面约数）',
      duration,
      heroIds:
        file.includes('zhao') || file === 'bili-1'
          ? [544]
          : file.includes('zhuge') || file === 'bili-2'
            ? [190]
            : [],
      roles: roleFor[file],
      status: preview ? 'preview' : 'metadata',
      scope: preview
        ? '实际抽看 00:16、00:24 两帧；仅片头，未取得完整讲解。'
        : '已核对公开标题、作者和播放信息；未研读完整讲解。',
      versionNote: file.startsWith('recent')
        ? '近期发布候选；发布新不等于打法已验证，赛季与模式仍待核对。'
        : '跨赛季历史教学候选；出装、数值、刷野时点及标题强度结论均待当前版本复核。',
      evidenceFile: `${dir}/${file}.json`,
      evidenceSha256: createHash('sha256').update(raw).digest('hex'),
      discoveryUrl: d.requestedUrl ?? d.url,
    });
  }
}
for (const [id, author, published] of [
  ['cv18055168', '小黄人95-专业王者教学', '2022-08-12'],
  ['cv18092243', '小黄人95-专业王者教学', '2022-08-14'],
  ['cv33569442', '昊个羊毛', '2024-04-03'],
]) {
  const raw = await fs.readFile(`${dir}/${id}.json`, 'utf8'),
    d = JSON.parse(raw);
  sources.push({
    id,
    kind: 'article',
    title: d.title.replace(' - 哔哩哔哩', ''),
    url: d.url,
    author,
    published,
    retrievedAt: d.at,
    heroIds: [],
    roles: ['打野'],
    status: 'text',
    scope: '已研读公开正文；只提炼条件判断，不沿用旧版数值。',
    versionNote: '历史文章，未验证当前赛季效果。',
    evidenceFile: `${dir}/${id}.json`,
    evidenceSha256: createHash('sha256').update(raw).digest('hex'),
  });
}
for (const [id, name] of [
  [190, '诸葛亮'],
  [544, '赵怀真'],
]) {
  const raw = await fs.readFile(`${dir}/official-guide-${id}.json`, 'utf8'),
    d = JSON.parse(raw);
  sources.push({
    id: 'official-' + id,
    kind: 'official',
    title: name + '官方技能与使用建议',
    url: d.url,
    author: '腾讯王者荣耀官网',
    published: '页面未标注更新时间',
    retrievedAt: d.at,
    heroIds: [id],
    roles: id === 190 ? ['中路', '打野'] : ['打野', '对抗路', '游走'],
    status: 'text',
    scope: '已核对官方技能、使用建议和对抗建议；不作为实战效果证明。',
    versionNote: '官网不同页面数值可能不同步；本资料卡不采用精确伤害、冷却或当前梯度结论。',
    evidenceFile: `${dir}/official-guide-${id}.json`,
    evidenceSha256: createHash('sha256').update(raw).digest('hex'),
  });
}
{
  const file = `${dir}/tencent-video-829966.json`,
    raw = await fs.readFile(file, 'utf8'),
    d = JSON.parse(raw);
  const frames = [];
  for (const second of [45, 60, 80, 100, 120, 145, 165]) {
    const file = `${dir}/tencent-829966-${second}.png`;
    frames.push({
      second,
      file,
      sha256: createHash('sha256')
        .update(await fs.readFile(file))
        .digest('hex'),
    });
  }
  sources.push({
    id: 'tencent-829966',
    kind: 'video',
    title: d.title,
    url: d.url,
    author: '腾讯王者荣耀官网',
    published: '页面未标注发布日期',
    retrievedAt: d.at,
    views: 9043190,
    viewsLabel: '9043190',
    duration: '03:03',
    heroIds: [544],
    roles: ['打野', '对抗路'],
    status: 'frames',
    scope:
      '已核对 00:45、01:00、01:20、01:40、02:00、02:25、02:45 共 7 帧及画面文字；未核对完整音轨。',
    versionNote:
      '历史英雄介绍。00:45 与 02:00 展示精力及大招机制；02:45 的旧出装仅作历史记录，不推荐为当前出装。',
    frames,
    evidenceFile: file,
    evidenceSha256: createHash('sha256').update(raw).digest('hex'),
  });
}
await fs.writeFile(
  'src/player/data/teaching.json',
  JSON.stringify({ version: 1, researchedAt: new Date().toISOString(), sources }, null, 2) + '\n',
);
console.log(
  'compiled',
  sources.length,
  'sources; video',
  sources.filter((s) => s.kind === 'video').length,
  'text',
  sources.filter((s) => s.status === 'text').length,
);
// Keep the audited hero expansion when rebuilding the original discovery index.
await import('./compile-teaching-heroes.mjs');
