import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { heroes, heroByName } from '../../src/player/catalog.ts';
const out = 'evidence/revision-20261110/browser';
await mkdir(out, { recursive: true });
const root = resolve('dist-review');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith('/kaiju-next/')) throw Error();
    const p = resolve(root, pathname.slice('/kaiju-next/'.length) || 'index.html');
    if (!p.startsWith(root + sep)) throw Error();
    res.writeHead(200, { 'Content-Type': mime[extname(p)] ?? 'application/octet-stream' });
    res.end(await readFile(p));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/kaiju-next/`;
const browser = await chromium.launch({ channel: 'msedge' });
const report = {
  checkedAt: new Date().toISOString(),
  mode: 'isolated browser with constructed personal records; no live user database',
  checks: [],
  errors: [],
  failedRequests: [],
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().startsWith(base) && r.status() >= 400) report.failedRequests.push(r.url());
  });
  await page.goto(base);
  await page.getByText('固定在线版 · 浏览器存储', { exact: false }).waitFor();
  const moduleUrl = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((x) => x.name)
      .find((u) => /\/browserApi-[^/]+\.js$/.test(u)),
  );
  assert.ok(moduleUrl);
  const ids = ['妲己', '诸葛亮'].map((n) => heroByName(n).id);
  await page.evaluate(
    async ({ url, ids }) => {
      const api = (await import(url)).browserApi;
      await api('/pool-edit', {
        changes: ids.map((heroId) => ({ heroId, expected: null, level: 'main' })),
      });
    },
    { url: moduleUrl, ids },
  );
  const seed = {
    version: 1,
    format: 'classic',
    mode: 'manual',
    moves: heroes
      .filter((h) => !ids.includes(h.id))
      .slice(0, 6)
      .map((h) => ({ heroId: h.id, role: '中路' })),
  };
  await page.evaluate((seed) => {
    localStorage.setItem('kaiju.bp.rehearsal.v1', JSON.stringify(seed));
    localStorage.setItem(
      'zizai.bp.preferences.v1',
      JSON.stringify({ enabled: true, role: '中路', team: 'allies' }),
    );
  }, seed);
  await page.goto(base + '#/draft');
  await page.reload();
  const panel = page.getByRole('region', { name: '红蓝双方BP操作台' });
  await panel.getByText(/已读取 2 位英雄/).waitFor();
  assert.match(await panel.getByText(/已读取 2 位英雄/).innerText(), /蓝方中路/);
  report.checks.push('current personal pool and saved side/lane preferences are actually read');
  const advice = page.getByRole('region', { name: '当前回合个性化建议' });
  await advice.getByRole('button', { name: '分析这一手', exact: true }).click();
  const choice = advice.getByRole('button', { name: /^选中.*等待确认$/ }).first();
  await choice.waitFor({ state: 'visible', timeout: 30000 });
  assert.ok((await advice.locator('article').count()) > 0);
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('kaiju.bp.rehearsal.v1')).moves.length,
  );
  assert.equal(before, 6);
  report.checks.push(
    'real Web Worker returns candidate explanations and opponent replies without auto-picking',
  );
  await advice.screenshot({ path: out + '/advice-desktop.png' });
  await choice.click();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('kaiju.bp.rehearsal.v1')).moves.length,
    ),
    6,
  );
  await panel.getByRole('button', { name: '确认本轮', exact: true }).click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('kaiju.bp.rehearsal.v1')).moves.length === 7,
  );
  await page.reload();
  await panel.getByText(/已读取 2 位英雄/).waitFor();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('kaiju.bp.rehearsal.v1')).moves.length,
    ),
    7,
  );
  report.checks.push('explicit confirmation applies exactly one move and survives reload');
  await panel.getByLabel('我的一方', { exact: true }).selectOption('enemies');
  await panel.getByLabel('我的分路', { exact: true }).selectOption('打野');
  await page.reload();
  assert.equal(await panel.getByLabel('我的一方', { exact: true }).inputValue(), 'enemies');
  assert.equal(await panel.getByLabel('我的分路', { exact: true }).inputValue(), '打野');
  report.checks.push('red-side profile selection and lane survive reload');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `overflow ${width}`,
    );
    await panel.screenshot({ path: `${out}/bp-${width}.png` });
  }
  report.checks.push('1440/768/390px layouts have no horizontal overflow');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failedRequests, []);
  report.passed = true;
} finally {
  await writeFile(out + '/verification.json', JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise((r) => server.close(r));
}
console.log(JSON.stringify(report, null, 2));
