import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const catalog = JSON.parse(await fs.readFile('src/player/data/heroes.json', 'utf8'));
const output = 'evidence/visual-bp-v018/official-media';
await fs.mkdir(output, { recursive: true });
const result = {},
  proofs = [],
  failures = [];
let index = 0;
const clean = (s) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .trim();
async function worker() {
  while (index < catalog.heroes.length) {
    const hero = catalog.heroes[index++];
    const url = `https://pvp.qq.com/zlkdatasys/zsbd_herolist/${hero.id}.json`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw Error('HTTP ' + r.status);
      const raw = await r.text(),
        d = JSON.parse(raw);
      if (Number(d.ename) !== hero.id || clean(d.cname) !== hero.name) throw Error('身份不一致');
      const skills = {};
      for (let n = 1; n <= 10; n++) {
        const name = clean(d[`skill${n}_name`]),
          id = String(d[`skill${n}`] ?? '');
        if (/^\d+$/.test(id) && hero.skills.some((s) => s.name === name))
          skills[name] = `https://game.gtimg.cn/images/yxzj/img201606/heroimg/${hero.id}/${id}.png`;
      }
      result[hero.id] = skills;
      const sha256 = createHash('sha256').update(raw).digest('hex');
      await fs.writeFile(`${output}/${hero.id}.json`, raw);
      proofs.push({ heroId: hero.id, url, sha256, matchedSkills: Object.keys(skills).length });
    } catch (e) {
      failures.push({ heroId: hero.id, url, error: e.message });
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await fs.writeFile('src/player/data/hero-media.json', JSON.stringify(result, null, 2) + '\n');
await fs.writeFile(
  `${output}/manifest.json`,
  JSON.stringify(
    {
      fetchedAt: new Date().toISOString(),
      imagePatternSource: 'https://pvp.qq.com/web201605/herodetail/521.shtml',
      proofs,
      failures,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    heroes: proofs.length,
    skills: proofs.reduce((n, p) => n + p.matchedSkills, 0),
    failures,
  }),
);
