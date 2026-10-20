import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { heroes } from '../../src/player/catalog.ts';
import { personalizedGuide } from '../../src/player/pro/personalization.ts';
import {
  lessonPacket,
  lessonsFor,
  teachingSources,
  teachingLessons,
  teachingSearchUrl,
  teachingCoverage,
  sourcesForTeaching,
} from '../../src/player/pro/teaching.ts';

test('teaching defaults put reviewed sources first and keep hero-specific evidence ahead of generic text', () => {
  const hero = heroes.find((h) => h.id === 544)!;
  const result = sourcesForTeaching(hero);
  assert.equal(result[0].id, 'official-544');
  assert.ok(
    result.findIndex((s) => s.status === 'frames') <
      result.findIndex((s) => s.status === 'metadata'),
  );
  assert.ok(!result.some((s) => s.id === 'BV1eZ421U78i'));
  assert.ok(sourcesForTeaching(hero, '打野', 'metadata').every((s) => s.status === 'metadata'));
  const popular = sourcesForTeaching(hero, '', '', 'popular');
  assert.ok(popular.every((s, i) => !i || (popular[i - 1].views ?? -1) >= (s.views ?? -1)));
  const common = lessonPacket({ id: 0, roles: ['打野', '游走', '中路', '发育路', '对抗路'] });
  assert.equal(common.cards.length, 3);
  assert.ok(common.cards.every((c) => c.heroIds.length === 0));
  assert.equal(lessonPacket({ id: 0, roles: ['中路'] }, '中路').cards.length, 0);
});

test('published teaching sources bind to saved public evidence; no invented lesson from titles or previews', async () => {
  assert.equal(new Set(teachingSources.map((s) => s.id)).size, teachingSources.length);
  for (const s of teachingSources) {
    assert.ok(['metadata', 'preview', 'text', 'frames'].includes(s.status));
    const raw = await readFile(s.evidenceFile, 'utf8');
    assert.equal(createHash('sha256').update(raw).digest('hex'), s.evidenceSha256);
    assert.ok(['www.bilibili.com', 'pvp.qq.com'].includes(new URL(s.url).hostname));
    if (s.kind === 'video') assert.notEqual(s.status, 'text');
    if (s.status === 'frames') {
      assert.ok(s.frames?.length);
      for (const frame of s.frames!)
        assert.equal(
          createHash('sha256')
            .update(await readFile(frame.file))
            .digest('hex'),
          frame.sha256,
        );
    }
  }
  for (const l of teachingLessons) {
    assert.equal(teachingSources.find((s) => s.id === l.sourceId)?.status, 'text');
    assert.ok(l.anchor && l.counterexample && l.drill);
  }
});
test('all 74 discovered heroes have exactly one specific grounded card and verified identity', async () => {
  const inventory = JSON.parse(await readFile('evidence/teaching-v024/inventory.json', 'utf8'));
  assert.equal(teachingCoverage.length, 74);
  assert.equal(teachingLessons.filter((l) => l.heroIds.length).length, 74);
  assert.deepEqual(
    new Set(teachingCoverage.map((h) => h.heroId)),
    new Set(inventory.heroes.map((h: { heroId: number }) => h.heroId)),
  );
  for (const h of teachingCoverage) {
    const cards = lessonPacket({
      id: h.heroId,
      roles: h.roles as (typeof heroes)[number]['roles'],
    }).cards.filter((c) => c.heroIds.length);
    assert.equal(cards.length, 1, h.name);
    assert.ok(cards[0].checks.length >= 2);
    assert.ok(cards[0].evidenceExcerpts?.length);
    const s = teachingSources.find((s) => s.id === h.sourceId)!;
    const raw = JSON.parse(JSON.parse(await readFile(s.evidenceFile, 'utf8')).raw);
    assert.equal(Number(raw.ename), h.heroId);
    assert.equal(raw.cname, h.name);
    for (const excerpt of h.excerpts) assert.ok(excerpt.text.trim().length);
    assert.ok(h.mentions.every((m) => new URL(m.url).hostname === 'www.bilibili.com'));
  }
});
test('conflicting official tips are carried into review packets and not promoted as current facts', () => {
  assert.equal(teachingCoverage.filter((h) => h.conflict).length, 11);
  const get = (id: number) =>
    lessonPacket(heroes.find((h) => h.id === id)!).cards.find((c) => c.heroIds.includes(id))!;
  assert.match(get(184).sourceConflict!, /清空敌方双抗/);
  assert.match(get(184).takeaway, /最低/);
  assert.doesNotMatch(get(184).takeaway, /清空/);
  assert.match(get(525).sourceConflict!, /墙体位移/);
  assert.match(get(549).takeaway, /可被打断/);
  assert.match(get(196).sourceConflict!, /不暴击/);
  for (const h of teachingCoverage.filter((h) => h.conflict))
    assert.ok(get(h.heroId).source.versionNote.includes(h.conflict));
});
test('hero-titled videos do not leak to unrelated heroes as general jungle teaching', () => {
  assert.deepEqual(teachingSources.find((s) => s.id === 'BV1eZ421U78i')!.heroIds, [193]);
  assert.deepEqual(teachingSources.find((s) => s.id === 'BV1MS411P72q')!.heroIds, [130]);
  assert.deepEqual(teachingSources.find((s) => s.id === 'BV1iZ4y1x71g')!.heroIds, [171]);
  assert.ok(teachingSources.find((s) => s.id === 'BV1YhWYeNEqh')!.roles.includes('对抗路'));
});
test('personal training guides prefer audited hero content over conflicting historical tips', () => {
  const hero = heroes.find((h) => h.id === 184)!;
  const guide = personalizedGuide(
    hero,
    { name: '测试', season: '测试', peakScore: 0, sharePool: false, heroes: [] },
    '游走',
  );
  assert.match(guide.roleTask, /最低/);
  assert.doesNotMatch(guide.roleTask, /清空/);
  assert.match(guide.skillTip, /治疗目标/);
});
test('hero-specific retrieval never transfers one hero mechanics to another; selected lane gates macro lessons', () => {
  assert.ok(lessonsFor(190, ['中路', '打野'], '中路').some((l) => l.id === 'zhuge-reset'));
  assert.ok(!lessonsFor(190, ['中路', '打野'], '中路').some((l) => l.id === 'invasion'));
  assert.ok(lessonsFor(190, ['中路', '打野'], '打野').some((l) => l.id === 'invasion'));
  assert.ok(!lessonsFor(544, ['打野']).some((l) => l.id === 'zhuge-reset'));
  assert.deepEqual(lessonsFor(9999, ['发育路']), []);
  for (const hero of heroes) {
    const packet = lessonPacket(hero);
    for (const card of packet.cards) {
      if (card.heroIds.length) assert.ok(card.heroIds.includes(hero.id));
      assert.equal(card.source.url, teachingSources.find((s) => s.id === card.sourceId)!.url);
      assert.match(card.source.evidenceSha256, /^[a-f0-9]{64}$/);
    }
  }
});
test('all catalog heroes have encoded discovery links; discovery is not claimed as reviewed coverage', () => {
  for (const hero of heroes) {
    const u = new URL(teachingSearchUrl(hero.name));
    assert.equal(u.searchParams.get('keyword'), '王者荣耀 ' + hero.name + ' 教学');
    assert.equal(u.searchParams.get('order'), 'click');
  }
  assert.equal(new URL(teachingSearchUrl('诸葛亮', true)).searchParams.get('order'), 'pubdate');
});
