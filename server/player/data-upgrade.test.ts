import test from 'node:test';
import assert from 'node:assert/strict';
import { extractProfile, mergeScreenshot } from '../../src/player/pro/screenshot.ts';
import type { OcrData, OcrLine } from '../../src/player/pro/screenshot.ts';
import { emptyProfile, emptyHeroMetric } from '../../src/player/pro/model.ts';
import { heroes, heroByName } from '../../src/player/catalog.ts';
import { cleanText, parseOfficialAssignment } from '../pro/resources.ts';
import { screenshotRequest } from '../pro/ocr.ts';
import { emptyDraft, ROLES } from '../../src/player/model.ts';
import { searchCoach } from '../../src/player/pro/coach.ts';
const line = (text: string, x = 20, y = 20): OcrLine => ({
  text,
  confidence: 0.99,
  box: [
    [x, y],
    [x + 120, y],
    [x + 120, y + 30],
    [x, y + 30],
  ],
});
const image = (texts: string[]): OcrData => ({
  width: 1200,
  height: 1000,
  sha256: 'a'.repeat(64),
  engine: 'fixture',
  lines: texts.map((t, i) => line(t, 20, 20 + i * 100)),
});
test('OCR separates lifetime/season/peak scopes and refuses coefficient ambiguity', () => {
  const d = extractProfile(
    image([
      '李白',
      '总场次：230',
      '胜率：57.83%',
      '综合评分：9.1',
      '荣耀战力：9500',
      '历史最高战力：12000',
      '巅峰系数206.3%',
    ]),
    'lifetime',
    heroes,
  );
  assert.equal(d.heroId, heroByName('李白').id);
  assert.equal(d.fields.find((f) => f.key === 'games')?.value, 230);
  assert.equal(d.fields.find((f) => f.key === 'historicalPeakPower')?.value, 12000);
  assert.equal(d.fields.find((f) => f.key === 'power')?.value, 9500);
  assert(!d.fields.some((f) => f.key === 'peakCoefficient'));
  const season = extractProfile(image(['场次：80', '胜率：60%', '评分：8.1']), 'season', heroes);
  assert(season.fields.some((f) => f.key === 'seasonGames'));
  assert(!season.fields.some((f) => f.key === 'averageRating'));
  const account = extractProfile(
    image(['历史最高巅峰分：2200', '当前巅峰分：1800']),
    'account',
    heroes,
  );
  assert.equal(account.fields.length, 1);
  assert.equal(account.fields[0].key, 'peakScore');
});
test('OCR geometrical ambiguity and conflicting values require confirmation', () => {
  const d = image([]);
  d.lines = [line('胜率', 300, 200), line('52%', 300, 150), line('63%', 300, 250)];
  assert.equal(extractProfile(d, 'lifetime', heroes).fields[0].ambiguous, true);
  const conflict = extractProfile(image(['胜率：52%', '胜率：63%']), 'lifetime', heroes);
  assert.equal(conflict.fields[0].ambiguous, true);
  assert.equal(extractProfile(image(['李白', '李信']), 'lifetime', heroes).heroId, undefined);
});
test('confirmed screenshot updates selected fields, preserves other data and rejects fabricated totals', () => {
  const id = heroByName('李白').id;
  const p = {
    ...emptyProfile(),
    heroes: [{ ...emptyHeroMetric(id), games: 230, power: 9000, winRate: 50, wins: 115 }],
  };
  const d = extractProfile(image(['胜率：57.83%', '荣耀战力：9500']), 'lifetime', heroes);
  const next = mergeScreenshot(p, 'lifetime', id, d.fields, 'a'.repeat(64), '2026-10-12');
  assert.equal(next.heroes[0].games, 230);
  assert.equal(next.heroes[0].wins, undefined);
  assert.equal(next.heroes[0].power, 9500);
  assert.equal(p.heroes[0].power, 9000);
  assert.equal(next.heroes[0].dataSource, 'screenshot');
  const season = extractProfile(image(['场次：80']), 'season', heroes);
  assert.throws(
    () => mergeScreenshot(emptyProfile(), 'season', id, season.fields, 'a', '2026-10-12'),
    /累计场次/,
  );
  assert.throws(
    () =>
      mergeScreenshot(p, 'lifetime', id, [{ ...d.fields[0], key: 'heroId' }], 'a', '2026-10-12'),
    /字段/,
  );
});
test('untrusted screenshot and official script responses are parsed without execution', () => {
  assert(!screenshotRequest.safeParse({ image: 'https://somewhere/image.png' }).success);
  assert(!screenshotRequest.safeParse({ image: 'data:image/svg+xml;base64,AAAA' }).success);
  assert.deepEqual(parseOfficialAssignment('var searchObj={"status":0,"msg":{"sTitle":"公告"}};'), {
    status: 0,
    msg: { sTitle: '公告' },
  });
  assert.throws(() => parseOfficialAssignment('var searchObj=process.exit()'));
  assert.equal(cleanText('<p>新版本</p><script>bad()</script><br>更新'), '新版本\n\n更新');
});
test('candidate beam retains all five open roles at width six', () => {
  const r = searchCoach(
    heroes,
    {
      draft: emptyDraft(),
      members: {},
      opponentPool: [],
      settings: {
        depth: 1,
        width: 6,
        strategy: 'robust',
        firstPick: 'allies',
        nextSide: 'auto',
        action: 'pick',
        respectPools: false,
      },
    },
    { maxMs: 30000 },
  );
  assert.equal(new Set(r.candidates.map((c) => c.move.role)).size, ROLES.length);
  assert.equal(
    new Set(r.candidates.map((c) => c.move.heroId + ':' + c.move.role)).size,
    r.candidates.length,
  );
});

test('official catalog cache survives failure and restart without changing source date', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { createResources, resourceSchema } = await import('../pro/resources.ts');
  const fixture = resourceSchema.parse(
    JSON.parse(await readFile('tests/fixtures/official-resources-20261012.json', 'utf8')),
  );
  const folder = await mkdtemp(join(tmpdir(), 'kaiju-resources-'));
  try {
    await writeFile(join(folder, 'resources.json'), JSON.stringify(fixture));
    let calls = 0;
    const fetcher = (async () => {
      calls++;
      throw new Error('offline');
    }) as typeof fetch;
    const service = createResources(heroes, folder, {
      fetcher,
      now: () => Date.parse(fixture.fetchedAt) + 3600000,
    });
    const [a, b] = await Promise.all([service.get(), service.get()]);
    assert(a.stale && b.stale);
    assert.equal(a.data.fetchedAt, fixture.fetchedAt);
    assert.equal(calls, 3);
    await service.get();
    assert.equal(calls, 3);
    const restarted = createResources(heroes, folder, {
      fetcher,
      now: () => Date.parse(fixture.fetchedAt) + 3600000,
    });
    assert((await restarted.get()).stale);
    assert(
      !resourceSchema.safeParse({
        ...fixture,
        skins: [{ ...fixture.skins[0], image: 'javascript:alert(1)' }],
      }).success,
    );
    await writeFile(
      join(folder, 'resources.json'),
      JSON.stringify({ ...fixture, equipment: [{ id: 1 }] }),
    );
    await assert.rejects(() => createResources(heroes, folder, { fetcher }).get());
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
