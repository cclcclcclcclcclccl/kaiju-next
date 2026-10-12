import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Hero } from '../../src/player/model.ts';
import { emptyDraft } from '../../src/player/model.ts';
import { recommend } from '../../src/player/tactics.ts';
import {
  tierList,
  mastery,
  reviewFindings,
  estimatePower,
  usableSnapshot,
  latestSnapshot,
} from '../../src/player/pro/analytics.ts';
import { snapshotSchema, profileSchema, emptyProfile } from '../../src/player/pro/model.ts';
import type { StatSnapshot, ReviewEvent } from '../../src/player/pro/model.ts';
import { createPlayerStore } from './store.ts';
import { createPlayerApp } from './app.ts';
const heroes = JSON.parse(
  readFileSync(new URL('../../src/player/data/heroes.json', import.meta.url), 'utf8'),
).heroes as Hero[];
const id = (n: string) => heroes.find((h) => h.name === n)!.id;
const fixture = (): StatSnapshot => ({
  id: randomUUID(),
  importedAt: new Date().toISOString(),
  title: '合成测试统计',
  segment: '巅峰1800+',
  patch: 'TEST',
  startDate: '2026-10-01',
  endDate: '2026-10-07',
  sourceName: '受控测试样本',
  sourceUrl: 'https://example.invalid/statistics',
  denominator: 'match',
  rows: heroes
    .filter((h) => h.roles.includes('中路'))
    .slice(0, 8)
    .map((h, i) => ({
      heroId: h.id,
      role: '中路',
      winRate: 48 + i * 0.5,
      pickRate: 5 + i,
      banRate: i,
      games: 5000,
    })),
});
const event = (): ReviewEvent => ({
  id: randomUUID(),
  second: 130,
  label: '河道决策',
  observation: '画面可见三名敌人，我方另一人尚在路上',
  decision: '准备进河道',
  allies: 2,
  enemies: 3,
  allyGold: null,
  enemyGold: null,
  objectiveIn: 20,
  ultimateReady: false,
});
test('all catalog heroes now have sourced skill text and valid official relation targets', () => {
  assert.equal(heroes.length, 133);
  for (const h of heroes) {
    assert.ok(h.skills.length >= 4, h.name);
    assert.match(h.source, /zsbd_herolist\/\d+\.json$/);
    for (const r of h.relations ?? []) assert.ok(heroes.some((x) => x.id === r.heroId));
  }
  assert.ok(heroes.reduce((s, h) => s + (h.relations?.length ?? 0), 0) >= 798);
});
test('statistics reject incompatible rates, duplicates, ungrounded opinions and impossible dates', () => {
  const s = fixture();
  const { id: _, importedAt: __, ...input } = s;
  assert.equal(snapshotSchema.safeParse(input).success, true);
  assert.equal(
    snapshotSchema.safeParse({ ...input, rows: [...input.rows, input.rows[0]] }).success,
    false,
  );
  assert.equal(snapshotSchema.safeParse({ ...input, startDate: '2026-02-30' }).success, false);
  assert.equal(
    snapshotSchema.safeParse({ ...input, rows: [{ ...input.rows[0], pickRate: 80, banRate: 40 }] })
      .success,
    false,
  );
  assert.equal(
    snapshotSchema.safeParse({ ...input, rows: [{ ...input.rows[0], opinion: 90 }] }).success,
    false,
  );
});
test('tier ranking shrinks small samples, withholds unproven tiers and keeps weights normalized', () => {
  const s = fixture();
  s.rows[0] = { ...s.rows[0], winRate: 100, games: 1 };
  const rows = tierList(s, '中路'),
    small = rows.find((r) => r.row.heroId === s.rows[0].heroId)!;
  assert.ok(small.adjustedWin < 50.2);
  assert.equal(small.tier, '待验证');
  for (const r of rows) {
    assert.ok(Math.abs(r.parts.reduce((sum, p) => sum + p.weight, 0) - 1) < 1e-10);
    assert.equal(r.bp, r.row.pickRate + r.row.banRate);
  }
  delete s.rows[1].games;
  assert.equal(tierList(s, '中路').find((r) => r.row.heroId === s.rows[1].heroId)!.tier, '待验证');
  assert.ok(
    tierList({ ...s, rows: s.rows.slice(0, 2) }, '中路').every((r) => r.tier === '样本不足'),
  );
  assert.equal(tierList(s, '游走').length, 0);
});
test('stat freshness follows observation dates, and incomplete optional signals do not bias comparisons', () => {
  const s = fixture();
  assert.equal(usableSnapshot(s, Date.parse('2026-10-12')), true);
  assert.equal(usableSnapshot(s, Date.parse('2026-11-12')), false);
  assert.equal(usableSnapshot(s, Date.parse('2026-10-01')), false);
  const older = { ...s, id: 'older', endDate: '2026-09-01', importedAt: '2026-12-01' };
  assert.equal(latestSnapshot([older, s], s.segment)?.id, s.id);
  s.rows.slice(0, 5).forEach((r, i) => {
    r.opinion = 90 - i;
    r.opinionSource = 'https://example.invalid/opinion';
  });
  assert.ok(tierList(s, '中路').every((r) => !r.parts.some((p) => p.label === '有来源的评价')));
  s.rows.forEach((r, i) => {
    r.opinion = 90 - i;
    r.opinionSource = 'https://example.invalid/opinion';
  });
  assert.ok(tierList(s, '中路').every((r) => r.parts.some((p) => p.label === '有来源的评价')));
  const d = emptyDraft();
  d.preference = 'meta';
  d.segment = s.segment;
  s.endDate = '2020-01-01';
  assert.ok(recommend(d, heroes, { snapshot: s }).every((r) => r.fit?.meta === null));
});
test('power alone cannot invent mastery; real recent samples influence it and age out', () => {
  const p = emptyProfile();
  p.heroes = [
    {
      heroId: id('李白'),
      power: 20000,
      games: 300,
      wins: 180,
      recentGames: 0,
      recentWins: 0,
      observedOn: '2026-10-12',
      evidence: '测试',
    },
  ];
  assert.equal(mastery(id('李白'), [], p, Date.parse('2026-10-12')).score, 20);
  p.heroes[0].recentGames = 50;
  p.heroes[0].recentWins = 35;
  const fresh = mastery(id('李白'), [], p, Date.parse('2026-10-12')).score;
  assert.ok(fresh > 20);
  assert.ok(mastery(id('李白'), [], p, Date.parse('2027-10-12')).score < fresh);
  assert.equal(
    profileSchema.safeParse({ ...p, heroes: [{ ...p.heroes[0], recentWins: 60 }] }).success,
    false,
  );
  assert.equal(
    estimatePower({
      base: 5000,
      peakScore: 1800,
      threshold: 1200,
      step: 20,
      stepPercent: 1,
      challengePercent: 10,
      activityPercent: 100,
    }).total,
    7000,
  );
});
test('every hero can be recommended as a legal single pool candidate; personal versus meta modes change tradeoffs', () => {
  for (const hero of heroes) {
    const d = emptyDraft();
    d.role = hero.roles[0] as typeof d.role;
    d.pool = [{ heroId: hero.id, level: 'main' }];
    d.onlyPool = true;
    assert.equal(recommend(d, heroes, { profile: emptyProfile() })[0]?.hero.id, hero.id, hero.name);
  }
  const s = fixture(),
    d = emptyDraft();
  s.endDate = new Date().toISOString().slice(0, 10);
  d.segment = s.segment;
  d.preference = 'comfort';
  d.pool = s.rows.map((r, i) => ({ heroId: r.heroId, level: i === 0 ? 'main' : 'learning' }));
  d.onlyPool = true;
  const comfort = recommend(d, heroes, { profile: emptyProfile(), snapshot: s });
  d.preference = 'meta';
  const meta = recommend(d, heroes, { profile: emptyProfile(), snapshot: s });
  assert.notEqual(comfort[0].hero.id, meta[0].hero.id);
});
test('review advice cites declared conditions and does not invent certainty for unknown events', () => {
  const e = event(),
    found = reviewFindings(e);
  assert.ok(found.some((f) => f.evidence.includes('2 人')));
  assert.ok(found.some((f) => f.evidence.includes('20 秒')));
  const unknown = { ...e, allies: null, enemies: null, objectiveIn: null, ultimateReady: null };
  assert.equal(reviewFindings(unknown)[0].title, '证据还不足以判断这次决策');
});
test('accounts, acceptance, sharing and deletion enforce isolation through real HTTP', async (t) => {
  const root = createPlayerStore(':memory:'),
    app = createPlayerApp(root, heroes);
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise<void>((r) => app.close(() => r()));
    root.close();
  });
  const base = 'http://127.0.0.1:' + (app.address() as AddressInfo).port;
  const call = async (path: string, data?: unknown, token = '') => {
    const r = await fetch(base + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: r.status, data: await r.json() };
  };
  const a = (
    await call('/api/auth/register', {
      username: 'player_a',
      name: '甲',
      password: 'test-password-123',
    })
  ).data;
  const b = (
    await call('/api/auth/register', {
      username: 'player_b',
      name: '乙',
      password: 'test-password-456',
    })
  ).data;
  await call('/api/pool', [{ heroId: id('李白'), level: 'main' }], a.token);
  const profile = { ...emptyProfile(), name: '甲', sharePool: true };
  await call('/api/pro/profile', profile, a.token);
  assert.equal((await call('/api/workspace', undefined, b.token)).data.pool.length, 0);
  assert.equal((await call('/api/workspace')).data.pool.length, 0);
  assert.equal((await call('/api/social/request', { code: b.user.code })).status, 401);
  await call('/api/social/request', { code: b.user.code }, a.token);
  const pending = (await call('/api/social', undefined, b.token)).data.friends[0];
  assert.equal(pending.shared, false);
  assert.deepEqual(pending.pool, []);
  assert.equal(
    (await call('/api/social/respond', { id: pending.id, accept: true }, a.token)).status,
    400,
  );
  await call('/api/social/respond', { id: pending.id, accept: true }, b.token);
  const accepted = (await call('/api/social', undefined, b.token)).data.friends[0];
  assert.equal(accepted.shared, true);
  assert.equal(accepted.pool[0].heroId, id('李白'));
  await call('/api/pro/profile', { ...profile, sharePool: false }, a.token);
  assert.equal((await call('/api/social', undefined, b.token)).data.friends[0].shared, false);
  const ev = event();
  const saved = (
    await call(
      '/api/pro/review',
      { title: '测试复盘', heroId: id('李白'), videoName: 'local.mp4', events: [ev] },
      a.token,
    )
  ).data;
  assert.equal((await call('/api/pro/review-get', { id: saved.id }, b.token)).status, 404);
  assert.equal(
    (await call('/api/pro/review-get', { id: saved.id }, a.token)).data.events[0].observation,
    ev.observation,
  );
  assert.equal(
    (
      await call(
        '/api/pro/profile',
        {
          ...profile,
          heroes: [
            {
              heroId: 99999,
              power: 1,
              games: 1,
              wins: 1,
              recentGames: 1,
              recentWins: 1,
              observedOn: '2026-10-12',
              evidence: '',
            },
          ],
        },
        a.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        '/api/pro/review',
        {
          id: saved.id,
          title: '非法覆盖',
          heroId: id('李白'),
          videoName: 'local.mp4',
          events: [ev],
        },
        b.token,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        '/api/pro/review',
        { id: saved.id, title: '已修订', heroId: id('李白'), videoName: 'local.mp4', events: [ev] },
        a.token,
      )
    ).status,
    200,
  );
  assert.equal((await call('/api/pro', undefined, a.token)).data.reviews.length, 1);
  assert.equal((await call('/api/pro/review-get', { id: saved.id }, a.token)).data.title, '已修订');
  await call('/api/social/remove', { id: pending.id }, a.token);
  assert.equal((await call('/api/social', undefined, b.token)).data.friends.length, 0);
  await call('/api/auth/logout', {}, a.token);
  assert.equal((await call('/api/pro', undefined, a.token)).status, 401);
});
test('vision adapter sends selected images, binds findings to real event IDs and rejects invented references', async (t) => {
  let bad = false,
    captured: any;
  const e = { ...event(), frame: 'data:image/jpeg;base64,/9j/2Q==' };
  const mock = createServer(async (req, res) => {
    let raw = '';
    for await (const part of req) raw += part;
    captured = JSON.parse(raw);
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                findings: [
                  {
                    eventId: bad ? randomUUID() : e.id,
                    observation: '受控画面测试',
                    advice: '先等待队友',
                    uncertainty: '只测试协议，不代表真实视觉判断',
                  },
                ],
              }),
            },
          },
        ],
      }),
    );
  });
  await new Promise<void>((r) => mock.listen(0, '127.0.0.1', r));
  const keys = ['MODEL_BASE_URL', 'MODEL_API_KEY', 'MODEL_NAME'],
    old = keys.map((k) => process.env[k]);
  process.env.MODEL_BASE_URL = 'http://127.0.0.1:' + (mock.address() as AddressInfo).port + '/v1';
  process.env.MODEL_API_KEY = 'fixture';
  process.env.MODEL_NAME = 'mock-vision';
  const store = createPlayerStore(':memory:'),
    app = createPlayerApp(store, heroes);
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise<void>((r) => app.close(() => r()));
    await new Promise<void>((r) => mock.close(() => r()));
    store.close();
    keys.forEach((k, i) =>
      old[i] === undefined ? delete process.env[k] : (process.env[k] = old[i]),
    );
  });
  const post = () =>
    fetch('http://127.0.0.1:' + (app.address() as AddressInfo).port + '/api/pro/review-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '视觉协议测试',
        heroId: id('李白'),
        videoName: 'fixture.mp4',
        events: [e],
      }),
    });
  assert.equal((await post()).status, 200);
  assert.ok(captured.messages[1].content.some((x: any) => x.type === 'image_url'));
  bad = true;
  assert.equal((await post()).status, 502);
});
