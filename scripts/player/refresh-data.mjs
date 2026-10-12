import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source = 'https://pvp.qq.com/web201605/js/herolist.json';
const fetchedAt = new Date().toISOString();
const response = await fetch(source, { signal: AbortSignal.timeout(20000) });
if (!response.ok) throw new Error('Official catalog HTTP ' + response.status);
const raw = await response.text();
const list = JSON.parse(raw);
const dictionaries = await Promise.all(
  ['item', 'ming'].map(async (name) => {
    const response = await fetch(`https://pvp.qq.com/web201605/js/${name}.json`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Official ${name} HTTP ${response.status}`);
    return response.json();
  }),
);
const [items, runes] = dictionaries;
const clean = (s) =>
  String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
const roles = { 1: '对抗路', 2: '打野', 3: '中路', 4: '发育路', 5: '游走' };
const classes = { 1: '战士', 2: '法师', 3: '坦克', 4: '刺客', 5: '射手', 6: '辅助' };
const heroes = [],
  failures = [],
  proofs = [];
let cursor = 0;
async function worker() {
  while (cursor < list.length) {
    const h = list[cursor++];
    const url = 'https://pvp.qq.com/zlkdatasys/zsbd_herolist/' + h.ename + '.json';
    let d = {},
      skills = [],
      valid = false;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(18000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      d = JSON.parse(text);
      if (Number(d.ename) !== h.ename || clean(d.cname) !== h.cname)
        throw new Error('Official identity mismatch: ' + d.cname + ' / ' + h.cname);
      skills = Array.from({ length: 10 }, (_, i) => i + 1)
        .filter((i) => clean(d['skill' + i + '_name']) && clean(d['skill' + i + '_des']))
        .map((i) => ({
          name: clean(d['skill' + i + '_name']),
          description: clean(d['skill' + i + '_des']),
          tip: clean(d['skill' + i + '_tips']),
          cooldown: clean(d['skill' + i + '_cold']),
          cost: clean(d['skill' + i + '_use']),
        }));
      if (!skills.length) throw new Error('No skill text');
      valid = true;
      proofs.push({
        id: h.ename,
        source: url,
        sha256: createHash('sha256').update(text).digest('hex'),
        skills: skills.length,
      });
    } catch (e) {
      failures.push({ id: h.ename, name: h.cname, source: url, reason: e.message });
    }
    const relations = [];
    if (valid)
      for (const [type, key, tips] of [
        ['partner', 'partner', ['part_tip1', 'part_yip2']],
        ['counters', 'inhibit', ['in_tip1', 'in_tip2']],
        ['counteredBy', 'resist', ['re_tip1', 're_tip2']],
      ])
        for (let i = 1; i <= 2; i++) {
          const target = Number(d[key + i]);
          if (list.some((x) => x.ename === target) && clean(d[tips[i - 1]]))
            relations.push({ type, heroId: target, reason: clean(d[tips[i - 1]]), source: url });
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
      classes: [classes[h.hero_type], classes[h.hero_type2]].filter(Boolean),
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
      relations,
      difficulty: valid ? Number(d.difficulty_value) || null : null,
      mechanics: valid
        ? {
            survival: d.survive_value ? Number(d.survive_value) : null,
            attack: d.attack_value ? Number(d.attack_value) : null,
            skill: d.skill_value ? Number(d.skill_value) : null,
            tags: [
              ...new Set(
                ['survive_tag', 'attack_tag', 'skill_tag', 'difficulty_tag']
                  .flatMap((k) => clean(d[k]).split('|'))
                  .filter(Boolean),
              ),
            ],
          }
        : undefined,
      builds: valid
        ? [1, 2]
            .map((i) => ({
              unresolvedItemIds: clean(d['build' + i])
                .split('|')
                .filter(
                  (id) => /^\d+$/.test(id) && !items.some((item) => String(item.item_id) === id),
                )
                .map(Number),
              items: clean(d['build' + i])
                .split('|')
                .map((id) => items.find((item) => String(item.item_id) === id))
                .filter(Boolean)
                .map((item) => ({
                  id: item.item_id,
                  name: clean(item.item_name),
                  price: Number(item.total_price ?? 0),
                  description: [clean(item.des1), clean(item.des2)].filter(Boolean).join('\n'),
                })),
              note: clean(d['build_tip' + i]),
            }))
            .filter((b) => b.items.length)
        : [],
      runes: valid
        ? ['red', 'green', 'blue']
            .map((color) => {
              const rune = runes.find((r) => String(r.ming_id) === String(d['fuwenid_' + color]));
              return rune ? { ...rune, slotColor: color } : undefined;
            })
            .filter(Boolean)
            .map((r) => ({
              id: Number(r.ming_id),
              name: clean(r.ming_name),
              color: r.slotColor,
              description: clean(r.ming_des),
            }))
        : [],
      runeNote: clean(d.fuwenid_exp),
      guide: valid
        ? {
            play: clean(d.usetips),
            against: clean(d.resisttips),
            teamfight: clean(d.wartips),
            leveling: clean(d.add_skill1),
            buildNotes: [clean(d.build_tip1), clean(d.build_tip2)].filter(Boolean),
            source: url,
          }
        : null,
    });
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
heroes.sort((a, b) => a.id - b.id);
if (failures.length) throw new Error('Refusing incomplete refresh: ' + JSON.stringify(failures));
await mkdir('src/player/data', { recursive: true });
await mkdir('evidence/expansion', { recursive: true });
await writeFile(
  'src/player/data/heroes.json',
  JSON.stringify(
    {
      source,
      fetchedAt,
      catalogSha256: createHash('sha256').update(raw).digest('hex'),
      note: '官方公开资料快照；获取日期不是游戏版本日期，攻略可能滞后，以游戏内为准。',
      heroes,
    },
    null,
    2,
  ),
);
await writeFile(
  'evidence/expansion/hero-fetch.json',
  JSON.stringify(
    {
      fetchedAt,
      source,
      count: heroes.length,
      skillPages: heroes.filter((h) => h.skills.length).length,
      relations: heroes.reduce((s, h) => s + h.relations.length, 0),
      builds: {
        pages: heroes.filter((h) => h.builds.length).length,
        unresolved: heroes.flatMap((h) =>
          h.builds.flatMap((b, index) =>
            b.unresolvedItemIds.length
              ? [{ heroId: h.id, scheme: index + 1, itemIds: b.unresolvedItemIds }]
              : [],
          ),
        ),
      },
      runePages: heroes.filter((h) => h.runes.length).length,
      equipmentSource: 'https://pvp.qq.com/web201605/js/item.json',
      runeSource: 'https://pvp.qq.com/web201605/js/ming.json',
      proofs,
      failures,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    heroes: heroes.length,
    skills: heroes.filter((h) => h.skills.length).length,
    relations: heroes.reduce((s, h) => s + h.relations.length, 0),
    failures,
  }),
);
