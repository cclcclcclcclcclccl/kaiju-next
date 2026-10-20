import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rows, conflicts } from './teaching-hero-notes.mjs';

const dir = 'evidence/teaching-v024';
const guides = JSON.parse(await fs.readFile(dir + '/official-guides.json', 'utf8'));
const inventory = JSON.parse(await fs.readFile(dir + '/inventory.json', 'utf8'));
assert.equal(guides.length, 74);
assert.equal(rows.length, 72);
assert.equal(new Set(rows.map((r) => r.heroId)).size, 72);
assert.deepEqual(
  new Set([...rows.map((r) => r.heroId), 190, 544]),
  new Set(guides.map((h) => h.heroId)),
);
const snapshot = JSON.parse(await fs.readFile('src/player/data/teaching.json', 'utf8'));
snapshot.version = 2;
snapshot.sources = snapshot.sources.filter((s) => !s.id.startsWith('official-'));
const associations = {
  BV1eZ421U78i: [193],
  BV1MS411P72q: [130],
  BV11HNozAEgJ: [502, 195],
  BV1YhWYeNEqh: [125],
  BV1o1421t7tL: [132],
  BV1YWtYeCEdy: [133],
  BV1iZ4y1x71g: [171],
};
for (const source of snapshot.sources) {
  if (associations[source.id]) {
    source.heroIds = associations[source.id];
    source.roles = [
      ...new Set(source.heroIds.flatMap((id) => guides.find((h) => h.heroId === id).roles)),
    ];
    source.scope =
      source.scope.replace(/；标题关联已校正.*$/, '') + '；标题关联已校正，不据标题生成战术结论。';
  }
}
const heroes = [];
const lessons = [];
for (const h of guides) {
  const evidence = await fs.readFile(h.evidenceFile, 'utf8');
  assert.equal(createHash('sha256').update(evidence).digest('hex'), h.evidenceSha256);
  const raw = JSON.parse(JSON.parse(evidence).raw);
  assert.equal(Number(raw.ename), h.heroId);
  assert.equal(raw.cname, h.name);
  const conflict = conflicts[h.heroId] ?? '';
  const source = {
    id: 'official-' + h.heroId,
    kind: 'article',
    title: h.name + ' · 官方技能与使用建议',
    url: h.url,
    author: '王者荣耀官方网站',
    published: '页面未提供更新日期',
    retrievedAt: h.retrievedAt,
    heroIds: [h.heroId],
    roles: h.roles,
    status: 'text',
    scope: conflict
      ? '已核对技能正文与使用建议的冲突；按正文整理定性检查问题。'
      : '已研读使用、对抗、团战及技能提示，整理基础决策问题。',
    versionNote: '官方页面未标注对应游戏版本，不能据此确认当前补丁最优解。' + conflict,
    evidenceFile: h.evidenceFile,
    evidenceSha256: h.evidenceSha256,
  };
  snapshot.sources.push(source);
  const excerpts = conflict
    ? h.skills
        .map((s) => ({ label: s.name + ' · 技能正文', text: s.description }))
        .filter((s) => s.text)
    : [
        { label: '官方使用建议', text: h.tips.play },
        { label: '官方对抗建议', text: h.tips.against },
        { label: '官方团战建议', text: h.tips.teamfight },
      ].filter((s) => s.text);
  heroes.push({
    heroId: h.heroId,
    name: h.name,
    roles: h.roles,
    sourceId: source.id,
    conflict,
    excerpts,
    mentions: inventory.heroes.find((x) => x.heroId === h.heroId).mentions,
  });
  const note = rows.find((r) => r.heroId === h.heroId);
  if (note)
    lessons.push({
      id: 'hero-' + h.heroId,
      title: h.name + '：' + note.focus,
      heroIds: [h.heroId],
      roles: h.roles,
      sourceId: source.id,
      anchor: conflict ? '技能正文（与旧提示交叉核对）' : '官方使用建议、对抗建议、团战与技能提示',
      takeaway: note.takeaway,
      checks: note.checks,
      counterexample: note.counterexample,
      drill: note.drill,
    });
}
await fs.writeFile('src/player/data/teaching.json', JSON.stringify(snapshot, null, 2) + '\n');
await fs.writeFile(
  'src/player/data/teaching-heroes.json',
  JSON.stringify({ scope: inventory.scope, heroes, lessons }, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    heroes: heroes.length,
    newLessons: lessons.length,
    sources: snapshot.sources.length,
    conflicts: heroes.filter((h) => h.conflict).length,
  }),
);
