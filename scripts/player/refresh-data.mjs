import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const catalogUrl = 'https://pvp.qq.com/web201605/js/herolist.json';
const fetchedAt = new Date().toISOString();
const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error('Catalog unavailable: ' + response.status);
const raw = await response.text();
const list = JSON.parse(raw);
const clean = (s) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
const roles = { 1: '对抗路', 2: '打野', 3: '中路', 4: '发育路', 5: '游走' };
const types = { 1: '战士', 2: '法师', 3: '坦克', 4: '刺客', 5: '射手', 6: '辅助' };
let index = 0;
const heroes = [];
const failures = [];
async function worker() {
  while (index < list.length) {
    const h = list[index++];
    const url = 'https://pvp.qq.com/web201605/herodetail/' + h.ename + '.shtml';
    let skills = [];
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const bytes = await res.arrayBuffer();
      const html = new TextDecoder('gb18030').decode(bytes);
      skills = [
        ...html.matchAll(
          /<p class="skill-name">\s*<b>([^<]*)<\/b>([\s\S]*?)<\/p>\s*<p class="skill-desc">([\s\S]*?)<\/p>/g,
        ),
      ]
        .map((m) => ({ name: clean(m[1]), description: clean(m[3]) }))
        .filter((s) => s.name && s.description);
      if (!skills.length) failures.push({ id: h.ename, reason: 'No published skill text parsed' });
    } catch (e) {
      failures.push({ id: h.ename, reason: e.message });
    }
    heroes.push({
      id: h.ename,
      name: h.cname,
      slug: h.id_name,
      title: h.title,
      roles: String(h.roles ?? '')
        .split('|')
        .map((r) => roles[r])
        .filter(Boolean),
      classes: [types[h.hero_type], types[h.hero_type2]].filter(Boolean),
      portrait:
        'https://game.gtimg.cn/images/yxzj/img201606/heroimg/' + h.ename + '/' + h.ename + '.jpg',
      cover:
        'https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/' +
        h.ename +
        '/' +
        h.ename +
        '-bigskin-1.jpg',
      source: url,
      skills,
    });
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
heroes.sort((a, b) => a.id - b.id);
const snapshot = {
  source: catalogUrl,
  fetchedAt,
  catalogSha256: createHash('sha256').update(raw).digest('hex'),
  note: '官网公开资料快照；页面未提供统一版本号，技能数值请以游戏内为准。',
  heroes,
};
await mkdir('src/player/data', { recursive: true });
await mkdir('evidence/player', { recursive: true });
await writeFile('src/player/data/heroes.json', JSON.stringify(snapshot, null, 2));
await writeFile(
  'evidence/player/data-fetch.json',
  JSON.stringify(
    {
      fetchedAt,
      source: catalogUrl,
      count: heroes.length,
      skillPages: heroes.filter((h) => h.skills.length).length,
      failures,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    count: heroes.length,
    skills: heroes.filter((h) => h.skills.length).length,
    failures,
  }),
);
