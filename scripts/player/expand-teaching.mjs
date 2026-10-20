import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { heroes } from '../../src/player/catalog.ts';
const dir = 'evidence/teaching-v024';
await fs.mkdir(dir + '/official', { recursive: true });
const draft = JSON.parse(await fs.readFile(dir + '/inventory-draft.json', 'utf8'));
const entries = draft
  .filter((r) => !r.title.includes('国服千分王者进阶版教学'))
  .map((r) => ({
    ...r,
    heroes: r.heroes.filter(
      (n) => n !== '苍' && !(n === '鲁班大师' && r.title.includes('节奏大师')),
    ),
  }));
const names = [...new Set(entries.flatMap((r) => r.heroes))];
const inventory = names.map((name) => {
  const hero = heroes.find((h) => h.name === name);
  if (!hero) throw Error(name);
  return {
    heroId: hero.id,
    name,
    roles: hero.roles,
    mentions: entries
      .filter((r) => r.heroes.includes(name))
      .map(({ url, title }) => ({ url, title })),
  };
});
await fs.writeFile(
  dir + '/inventory.json',
  JSON.stringify(
    {
      scope:
        '上轮九组检索页面标题明确涉及的英雄，含对位对手；排除其他游戏、歧义词和节奏大师误匹配。不是视频内容覆盖声明。',
      heroes: inventory,
    },
    null,
    2,
  ),
);
const results = [];
for (let i = 0; i < inventory.length; i += 3) {
  const batch = await Promise.allSettled(
    inventory.slice(i, i + 3).map(async (h) => {
      const url = `https://pvp.qq.com/zlkdatasys/zsbd_herolist/${h.heroId}.json`,
        file = `${dir}/official/${h.heroId}.json`;
      let d;
      try {
        d = JSON.parse(await fs.readFile(file, 'utf8'));
      } catch {
        const response = await fetch(url, { signal: AbortSignal.timeout(18000) });
        if (!response.ok) throw Error(h.name + ' HTTP ' + response.status);
        const raw = await response.text(),
          data = JSON.parse(raw);
        if (Number(data.ename) !== h.heroId || data.cname !== h.name)
          throw Error('identity ' + h.name);
        d = {
          url,
          retrievedAt: new Date().toISOString(),
          rawSha256: createHash('sha256').update(raw).digest('hex'),
          raw,
        };
        await fs.writeFile(file, JSON.stringify(d, null, 2));
      }
      const raw = JSON.parse(d.raw),
        clean = (s) =>
          String(s ?? '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .trim();
      return {
        ...h,
        url,
        retrievedAt: d.retrievedAt,
        evidenceFile: file,
        evidenceSha256: createHash('sha256')
          .update(await fs.readFile(file))
          .digest('hex'),
        tips: {
          play: clean(raw.usetips),
          against: clean(raw.resisttips),
          teamfight: clean(raw.wartips),
        },
        skills: Array.from({ length: 10 }, (_, i) => ({
          name: raw[`skill${i + 1}_name`],
          tip: clean(raw[`skill${i + 1}_tips`]),
          description: clean(raw[`skill${i + 1}_des`]),
        })).filter((s) => s.name),
      };
    }),
  );
  for (const r of batch)
    if (r.status === 'fulfilled') results.push(r.value);
    else console.log('ERROR', r.reason.message);
  console.log('fetched', results.length, '/', inventory.length);
}
await fs.writeFile(dir + '/official-guides.json', JSON.stringify(results, null, 2));
await fs.writeFile(
  dir + '/reading.txt',
  results
    .map(
      (h) => `${h.heroId} ${h.name} [${h.roles.join('/')}]
使用：${h.tips.play}
对抗：${h.tips.against}
团战：${h.tips.teamfight}
技能提示：${h.skills.map((s) => s.name + '：' + s.tip).join('；')}`,
    )
    .join('\n\n'),
);
console.log({
  heroes: inventory.length,
  fetched: results.length,
  missing: inventory.filter((h) => !results.some((x) => x.heroId === h.heroId)).map((h) => h.name),
});
