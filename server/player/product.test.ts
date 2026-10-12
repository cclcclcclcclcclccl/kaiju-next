import { createServer } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import type { Hero, MatchInput } from '../../src/player/model.ts';
import { emptyDraft, draftSchema, matchSchema } from '../../src/player/model.ts';
import { recommend, notes } from '../../src/player/tactics.ts';
import { createPlayerStore } from './store.ts';
import { createPlayerApp } from './app.ts';
const heroes = JSON.parse(
  readFileSync(new URL('../../src/player/data/heroes.json', import.meta.url), 'utf8'),
).heroes as Hero[];
const id = (name: string) => heroes.find((h) => h.name === name)!.id;

test('published catalog has unique heroes, source links and known tactical note names', () => {
  assert.ok(heroes.length > 100);
  assert.equal(new Set(heroes.map((h) => h.id)).size, heroes.length);
  for (const name of Object.keys(notes))
    assert.ok(
      heroes.some((h) => h.name === name),
      name,
    );
  for (const h of heroes) {
    assert.match(h.source, /^https:\/\/pvp\.qq\.com\//);
    assert.ok(h.roles.length);
    assert.ok(h.skills.every((s) => s.name && s.description));
  }
});
test('recommendations respect official lane, all ten slots, bans and actual personal pool', () => {
  const draft = emptyDraft();
  draft.pool = [
    { heroId: id('王昭君'), level: 'main' },
    { heroId: id('小乔'), level: 'comfortable' },
  ];
  draft.onlyPool = true;
  assert.equal(recommend(draft, heroes)[0].hero.id, id('王昭君'));
  draft.enemies['中路'] = id('王昭君');
  assert.deepEqual(
    recommend(draft, heroes).map((r) => r.hero.name),
    ['小乔'],
  );
  draft.banned = [id('小乔')];
  assert.deepEqual(recommend(draft, heroes), []);
  draft.onlyPool = false;
  const available = recommend(draft, heroes);
  assert.ok(available.length);
  assert.ok(
    available.every(
      (r) =>
        r.hero.roles.includes('中路') &&
        !draft.banned.includes(r.hero.id) &&
        r.hero.id !== id('王昭君'),
    ),
  );
});
test('new enemy mobility adds a conditional protection reason; unknown teammates are explicit', () => {
  const draft = emptyDraft();
  draft.pool = [{ heroId: id('张良'), level: 'main' }];
  draft.onlyPool = true;
  assert.ok(!recommend(draft, heroes)[0].reasons.some((r) => r.includes('对方有机动')));
  draft.enemies['打野'] = id('兰陵王');
  draft.allies['游走'] = id('朵莉亚');
  const r = recommend(draft, heroes)[0];
  assert.ok(r.reasons.some((r) => r.includes('对方有机动')));
  assert.ok(r.risks.some((r) => r.includes('不完整')));
});
test('duplicate picks, fake dates and nonsensical statistics cannot be saved', () => {
  const draft = emptyDraft();
  draft.allies['中路'] = id('小乔');
  draft.enemies['中路'] = id('小乔');
  assert.equal(draftSchema.safeParse(draft).success, false);
  const input: MatchInput = {
    heroId: id('小乔'),
    role: '中路',
    outcome: 'win',
    kills: 5,
    deaths: 2,
    assists: 8,
    minutes: 20,
    focus: '站位与生存',
    note: '等待队友再开团',
    nextAction: '开团前看小地图',
    playedOn: '2026-10-12',
  };
  assert.equal(matchSchema.safeParse(input).success, true);
  for (const change of [
    { playedOn: '2026-02-30' },
    { deaths: -1 },
    { minutes: 0 },
    { nextAction: '' },
  ])
    assert.equal(matchSchema.safeParse({ ...input, ...change }).success, false);
});
test('personal pool and match edits persist across database reopen; a changed target resets completion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaiju-store-'));
  const path = join(dir, 'test.sqlite');
  let store = createPlayerStore(path);
  try {
    store.pool([{ heroId: id('小乔'), level: 'main' }]);
    const m = store.addMatch({
      heroId: id('小乔'),
      role: '中路',
      outcome: 'loss',
      kills: 3,
      deaths: 5,
      assists: 9,
      minutes: 18,
      focus: '站位与生存',
      note: '切入太早',
      nextAction: '等控制交完',
      playedOn: '2026-10-12',
    });
    store.toggleMatch(m.id, true);
    store.close();
    store = createPlayerStore(path);
    assert.equal(store.workspace().pool[0].level, 'main');
    assert.equal(store.workspace().matches[0].done, true);
    const { id: mid, createdAt, done, ...input } = m;
    const changed = store.updateMatch(mid, { ...input, nextAction: '开团前看小地图' });
    assert.equal(changed!.done, false);
    assert.equal(store.workspace().matches.length, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('API validates input, persists an actual plan, prevents cross-origin writes and reports unconfigured AI', async (t) => {
  const keys = ['MODEL_BASE_URL', 'MODEL_API_KEY', 'MODEL_NAME'];
  const env = keys.map((k) => process.env[k]);
  keys.forEach((k) => delete process.env[k]);
  const store = createPlayerStore(':memory:');
  const app = createPlayerApp(store, heroes);
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise<void>((r) => app.close(() => r()));
    store.close();
    keys.forEach((k, i) =>
      env[i] === undefined ? delete process.env[k] : (process.env[k] = env[i]),
    );
  });
  const base = 'http://127.0.0.1:' + (app.address() as AddressInfo).port;
  const post = (path: string, data: unknown, headers = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
  assert.equal((await (await fetch(base + '/api/status')).json()).heroCount, heroes.length);
  assert.equal((await post('/api/pool', [{ heroId: 9999, level: 'main' }])).status, 400);
  const draft = emptyDraft(),
    candidate = recommend(draft, heroes)[0];
  const payload = { name: '我的备战', draft, heroId: candidate.hero.id };
  assert.equal((await post('/api/plans', payload)).status, 201);
  const workspace = await (await fetch(base + '/api/workspace')).json();
  assert.equal(workspace.plans.length, 1);
  assert.ok(workspace.plans[0].summary.includes('取舍'));
  assert.equal((await post('/api/coach', payload)).status, 503);
  assert.equal((await post('/api/pool', [], { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await post('/api/matches', { invalid: true })).status, 400);
});

test('configured coach uses draft context, validates provider output and recovers after failure', async (t) => {
  let mode: 'valid' | 'malformed' | 'unavailable' = 'valid';
  const captured: any[] = [];
  const provider = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    captured.push({
      path: req.url,
      authorization: req.headers.authorization,
      body: JSON.parse(raw),
    });
    if (mode === 'unavailable') {
      res.writeHead(503);
      res.end('Unavailable');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                mode === 'malformed'
                  ? '{"headline":"missing required steps"}'
                  : JSON.stringify({
                      headline: '模拟服务解读',
                      steps: ['先处理兵线', '等队友跟进', '开团前看小地图'],
                      caution: '仅为协议测试内容',
                    }),
            },
          },
        ],
      }),
    );
  });
  await new Promise<void>((r) => provider.listen(0, '127.0.0.1', r));
  const keys = ['MODEL_BASE_URL', 'MODEL_API_KEY', 'MODEL_NAME'];
  const env = keys.map((k) => process.env[k]);
  process.env.MODEL_BASE_URL =
    'http://127.0.0.1:' + (provider.address() as AddressInfo).port + '/v1';
  process.env.MODEL_API_KEY = 'local-protocol-fixture';
  process.env.MODEL_NAME = 'test-coach';
  const store = createPlayerStore(':memory:');
  const app = createPlayerApp(store, heroes);
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise<void>((r) => app.close(() => r()));
    await new Promise<void>((r) => provider.close(() => r()));
    store.close();
    keys.forEach((k, i) =>
      env[i] === undefined ? delete process.env[k] : (process.env[k] = env[i]),
    );
  });
  const base = 'http://127.0.0.1:' + (app.address() as AddressInfo).port;
  const draft = emptyDraft();
  draft.enemies['打野'] = id('兰陵王');
  const hero = recommend(draft, heroes)[0].hero;
  const post = () =>
    fetch(base + '/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '协议测试', draft, heroId: hero.id }),
    });
  assert.equal((await (await fetch(base + '/api/status')).json()).modelConfigured, true);
  const response = await post();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, hero.source);
  assert.equal(result.steps.length, 3);
  assert.equal(captured[0].path, '/v1/chat/completions');
  assert.equal(captured[0].authorization, 'Bearer local-protocol-fixture');
  const prompt = JSON.parse(captured[0].body.messages[1].content);
  assert.equal(prompt.hero.name, hero.name);
  assert.deepEqual(prompt.enemies, ['兰陵王']);
  mode = 'malformed';
  assert.equal((await post()).status, 502);
  mode = 'unavailable';
  assert.equal((await post()).status, 502);
  mode = 'valid';
  assert.equal((await post()).status, 200);
  assert.equal(store.workspace().plans.length, 0);
});
