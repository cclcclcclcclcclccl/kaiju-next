import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = 'https://cclcclcclcclcclccl.github.io/kaiju-next/';
const out = process.argv[2] ?? 'evidence/refresh-20261025/public';
await fs.mkdir(out, { recursive: true });
const report = {
  url: base,
  checkedAt: new Date().toISOString(),
  network: 'normal browser DNS/TLS; no host overrides, no authentication, no local backend proxy',
  checks: [],
  errors: [],
  failedSiteRequests: [],
};
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().startsWith(base) && r.status() >= 400)
      report.failedSiteRequests.push({ url: r.url(), status: r.status() });
  });
  const home = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.equal(home.status(), 200);
  report.homeStatus = home.status();
  await page.getByText('固定在线版 · 浏览器存储', { exact: false }).waitFor();
  await page.screenshot({ path: out + '/home.png', fullPage: true });
  report.checks.push('anonymous homepage and app initialization');
  await page.locator('.sidebar').getByText('分段梯度', { exact: true }).click();
  await page.getByText('133 / 133', { exact: false }).waitFor();
  report.checks.push('133 hero ranking rendered from published snapshots');
  await page.locator('.sidebar').getByText('英雄图鉴', { exact: true }).click();
  await page
    .getByRole('button', { name: /赵怀真/ })
    .first()
    .click();
  await page.getByRole('dialog').waitFor();
  assert.ok((await page.getByRole('dialog').getByText('赵怀真', { exact: false }).count()) > 0);
  await page.keyboard.press('Escape');
  report.checks.push('hero detail and navigation');
  const moduleUrl = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .find((u) => /\/browserApi-[^/]+\.js$/.test(u)),
  );
  assert.ok(moduleUrl);
  await page.evaluate(async (url) => {
    window.checkApi = (await import(url)).browserApi;
  }, moduleUrl);
  await page.evaluate(async () => {
    await window.checkApi('/pool-edit', {
      changes: [{ heroId: 544, expected: null, level: 'main' }],
    });
  });
  await page.reload();
  await page.getByText('固定在线版 · 浏览器存储', { exact: false }).waitFor();
  await page.locator('.sidebar').getByText('我的英雄池', { exact: true }).click();
  await page.getByText('赵怀真', { exact: true }).first().waitFor();
  report.checks.push('visitor browser hero pool persists through public-site reload');
  await page.locator('.sidebar').getByText('阵容备战', { exact: true }).click();
  await page.getByLabel('操作模式', { exact: true }).selectOption('blue');
  await page.getByRole('button', { name: '开始新演练', exact: true }).click();
  await page.getByLabel('本轮英雄', { exact: true }).selectOption('544');
  await page.getByRole('button', { name: '确认本轮', exact: true }).click();
  await page.locator('.bp-turn-banner').filter({ hasText: '第 3 / 20 步' }).waitFor();
  report.checks.push('public deployment worker responds as red side after blue human ban');
  await page.screenshot({ path: out + '/bp.png', fullPage: true });
  const guide = await page.request.get(base + 'review/index.html');
  assert.equal(guide.status(), 200);
  report.checks.push('online guide loads');
  const manifest = await (await page.request.get(base + 'review-data/manifest.json')).json();
  assert.ok(Object.keys(manifest.entries).length >= 767);
  report.archiveQueries = Object.keys(manifest.entries).length;
  report.defaultDataDate = manifest.defaultDate;
  report.builtAt = manifest.builtAt;
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(base, { waitUntil: 'domcontentloaded' });
  await mobile
    .getByText('固定在线版 · 浏览器存储', { exact: false })
    .waitFor({ state: 'attached' });
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await mobile.screenshot({ path: out + '/mobile.png', fullPage: true });
  report.checks.push('390px mobile layout');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failedSiteRequests, []);
  report.passed = true;
} catch (e) {
  report.passed = false;
  report.failure = e.stack;
  throw e;
} finally {
  await fs.writeFile(out + '/verification.json', JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
