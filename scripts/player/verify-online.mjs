import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const out = 'evidence/online-v0261';
await mkdir(out, { recursive: true });
const root = resolve('dist-review');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith('/kaiju-next/')) throw Error('outside site');
    const file = resolve(root, path.slice('/kaiju-next/'.length) || 'index.html');
    if (!file.startsWith(root + sep)) throw Error('outside site');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/kaiju-next/`;
const browser = await chromium.launch({ channel: 'msedge' });
const report = {
  checkedAt: new Date().toISOString(),
  backend: 'none; static files only',
  checks: [],
  pages: [],
  errors: [],
  failedRequests: [],
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().startsWith(base) && r.status() >= 400)
      report.failedRequests.push({ url: r.url(), status: r.status() });
  });
  await page.goto(base);
  await page.getByText('固定在线版 · 浏览器存储', { exact: false }).waitFor();
  const apiFile = (await readdir(root + '/assets')).find((f) => f.startsWith('browserApi-'));
  assert.ok(apiFile);
  const attach = async (p) =>
    p.evaluate(
      async (url) => {
        const module = await import(url);
        window.checkApi = module.browserApi;
      },
      base + 'assets/' + apiFile,
    );
  await attach(page);
  const call = (path, body) =>
    page.evaluate(
      async ({ path, body }) => {
        try {
          return { ok: true, data: await window.checkApi(path, body) };
        } catch (e) {
          return { ok: false, message: e.message, status: e.status };
        }
      },
      { path, body },
    );
  assert.equal((await call('/workspace')).data.pool.length, 0);
  assert.equal(
    (await call('/pool-edit', { changes: [{ heroId: 544, expected: null, level: 'main' }] })).ok,
    true,
  );
  assert.equal(
    (await call('/pool-edit', { changes: [{ heroId: 544, expected: null, level: 'learning' }] }))
      .status,
    409,
  );
  assert.equal(
    (await call('/pool-edit', { changes: [{ heroId: 9999, expected: null, level: 'main' }] })).ok,
    false,
  );
  assert.equal((await call('/workspace')).data.pool.length, 1);
  await page.reload();
  await page.getByText('固定在线版 · 浏览器存储', { exact: false }).waitFor();
  await attach(page);
  assert.equal((await call('/workspace')).data.pool[0].heroId, 544);
  report.checks.push('pool persists across reload; stale and invalid edits rejected atomically');
  const tab = await context.newPage();
  await tab.goto(base);
  await attach(tab);
  const results = await Promise.all(
    [page, tab].map((p) =>
      p.evaluate(async () => {
        try {
          await window.checkApi('/pool-edit', {
            changes: [{ heroId: 190, expected: null, level: 'comfortable' }],
          });
          return 'saved';
        } catch (e) {
          return e.status;
        }
      }),
    ),
  );
  assert.deepEqual(
    results.sort((a, b) => String(a).localeCompare(String(b))),
    [409, 'saved'],
  );
  await tab.close();
  report.checks.push('two simultaneous tabs serialize updates with one conflict');
  const emptyContext = await browser.newContext();
  const isolated = await emptyContext.newPage();
  await isolated.goto(base);
  await attach(isolated);
  assert.equal(
    await isolated.evaluate(async () => (await window.checkApi('/workspace')).pool.length),
    0,
  );
  await emptyContext.close();
  report.checks.push('separate visitors start with empty personal data');
  const profile = (await call('/pro')).data.profile;
  assert.equal(
    (
      await call('/pro/profile-save', {
        expected: profile,
        profile: { ...profile, name: '自动测试档案，非真实玩家' },
      })
    ).ok,
    true,
  );
  assert.equal((await call('/pro/profile-save', { expected: profile, profile })).status, 409);
  const backup = (await call('/backup')).data;
  const preview = (await call('/backup/preview', { backup })).data;
  assert.equal(
    (await call('/backup/restore', { backup, expectedRevision: preview.revision, confirmed: true }))
      .ok,
    true,
  );
  assert.deepEqual((await call('/backup/checkpoint')).data.data.pool, backup.data.pool);
  report.checks.push('profile conflict detection; personal backup preview/restore/checkpoint');
  const review = {
    title: '自动化存储校验，非真实对局',
    heroId: 544,
    videoName: '',
    events: [
      {
        id: crypto.randomUUID(),
        second: 0,
        label: '存储验证',
        observation: '仅验证保存，不代表游戏观察',
        decision: '',
        allies: null,
        enemies: null,
        allyGold: null,
        enemyGold: null,
        objectiveIn: null,
        ultimateReady: null,
      },
    ],
  };
  const savedReview = await call('/pro/review-save', { review, expectedRevision: null });
  assert.equal(savedReview.ok, true);
  assert.equal(
    (await call('/pro/review-get', { id: savedReview.data.id })).data.revision,
    savedReview.data.revision,
  );
  assert.equal(
    (await call('/pro/review-save', { id: savedReview.data.id, review, expectedRevision: null }))
      .status,
    409,
  );
  report.checks.push('manual review saves and reloads; stale revision rejected');
  const stats = await call('/tianyuan?kind=stats&date=2026-10-13&mode=5');
  assert.ok(stats.ok && stats.data.data.length >= 130);
  assert.equal(stats.data.query.date, '2026-10-13');
  assert.equal(stats.data.cache, 'stale');
  assert.equal((await call('/tianyuan?kind=stats&date=2026-10-01&mode=5')).status, 404);
  for (const kind of ['skin', 'equip', 'combined', 'analysis', 'duration']) {
    const packet = await call(
      `/tianyuan?kind=${kind}&heroId=544${['analysis', 'duration'].includes(kind) ? '' : '&date=2026-10-13'}`,
    );
    assert.equal(packet.ok, true, kind);
  }
  report.checks.push(
    'four-scope archive, Zhao Huaizhen skin/equipment/build/duration/analysis; absent date refused',
  );
  assert.equal((await call('/auth/register', { username: 'example' })).status, 503);
  assert.equal((await call('/pro/review-analyze', {})).status, 503);
  report.checks.push('unsupported account/model calls rejected explicitly');
  for (const [id, label] of [
    ['home', '备战首页'],
    ['heroes', '英雄图鉴'],
    ['tier', '分段梯度'],
    ['draft', '阵容备战'],
    ['pool', '我的英雄池'],
    ['profile', '玩家档案'],
    ['resources', '装备与版本'],
    ['systems', '体系练习'],
    ['replay', '录像复盘'],
    ['social', '好友与组队'],
  ]) {
    await page.locator('.sidebar').getByText(label, { exact: true }).click();
    await page.waitForTimeout(350);
    await page.locator('main h1').first().waitFor();
    assert.equal(await page.getByText('这个页面遇到了一点问题').count(), 0);
    report.pages.push({ id, heading: await page.locator('main h1').first().textContent() });
    if (id === 'draft') {
      await page.getByLabel('操作模式', { exact: true }).selectOption('blue');
      await page.getByRole('button', { name: '开始新演练', exact: true }).click();
      await page.getByLabel('本轮英雄', { exact: true }).selectOption('544');
      await page.getByRole('button', { name: '确认本轮', exact: true }).click();
      await page
        .locator('.bp-turn-banner')
        .filter({ hasText: '第 3 / 20 步' })
        .waitFor({ timeout: 30000 });
      report.checks.push(
        'human blue ban followed by real AI red worker computation, advanced to step 3',
      );
    }
    if (['tier', 'draft', 'pool'].includes(id))
      await page.screenshot({ path: `${out}/${id}-desktop.png`, fullPage: true });
  }
  await page.locator('.sidebar').getByRole('button', { name: '英雄图鉴', exact: true }).click();
  await page
    .getByRole('button', { name: /赵怀真/ })
    .first()
    .click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: out + '/hero-detail.png', fullPage: true });
  await page.keyboard.press('Escape');
  const images = await page
    .locator('img')
    .evaluateAll((images) => images.filter((i) => i.complete && i.naturalWidth > 0).length);
  assert.ok(images > 5);
  report.checks.push('catalog images load from repository subpath');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.getByText('固定在线版 · 浏览器存储', { exact: false }).waitFor({ state: 'attached' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: out + '/home-mobile.png', fullPage: true });
  report.checks.push('390px mobile page has no horizontal overflow');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failedRequests, []);
  report.passed = true;
} catch (e) {
  report.passed = false;
  report.failure = e.stack;
  throw e;
} finally {
  await writeFile(out + '/browser-verification.json', JSON.stringify(report, null, 2));
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(JSON.stringify(report, null, 2));
