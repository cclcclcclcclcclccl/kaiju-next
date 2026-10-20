import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const base = 'http://127.0.0.1:4318',
  dir = 'evidence/tianyuan-parity-v020/live';
await fs.mkdir(dir, { recursive: true });
const read = async (name) => {
  const r = await fetch(base + '/api/' + name);
  assert.equal(r.status, 200);
  return r.json();
};
const baseline = JSON.parse(await fs.readFile('data/parity-before/live.json', 'utf8'));
const before = { workspace: await read('workspace'), pro: await read('pro') };
assert.deepEqual(before, baseline);
const status = await read('status');
assert.equal(status.version, '0.20.0');
const browser = await chromium.launch({ channel: 'msedge' }),
  errors = [],
  checks = {},
  requests = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(25000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().includes('/api/source-plus')) requests.push({ url: r.url(), status: r.status() });
  });
  await page.goto(base);
  await page.locator('nav').getByRole('button', { name: '数据与工具', exact: true }).click();
  await page.locator('.plus-metrics').waitFor();
  checks.defaultOverview = await page.locator('.plus-metrics').innerText();
  await page.screenshot({ path: dir + '/overview.png', animations: 'disabled' });
  await page.getByRole('button', { name: '全英雄指标', exact: true }).click();
  await page.getByLabel('英雄统计日', { exact: true }).fill('2026-10-18');
  await page.getByRole('table', { name: '全英雄详细统计' }).waitFor();
  await page.getByLabel('筛选全英雄详细统计', { exact: true }).fill('诸葛亮');
  await page.getByRole('button', { name: '诸葛亮', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '深入数据', exact: true }).click();
  const panel = page.locator('.hero-source-details');
  await panel.locator('.plus-chart svg').waitFor();
  await panel.getByRole('button', { name: '条件出装', exact: true }).click();
  await panel.getByLabel('出装统计日', { exact: true }).fill('2026-10-18');
  await panel
    .getByRole('table', { name: '条件出装第1栏', exact: true })
    .getByRole('button', { name: '噬神之书', exact: true })
    .click();
  await panel.locator('.conditional-builds .pro-notice').waitFor();
  checks.conditional = await panel.locator('.conditional-builds .pro-notice').innerText();
  assert.match(checks.conditional, /59,524/);
  await panel.screenshot({ path: dir + '/conditional-builds.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '全皮肤库', exact: true }).click();
  await page.getByLabel('搜索皮肤库', { exact: true }).fill('诸葛亮 星域');
  await page.locator('.plus-skin-card').waitFor();
  checks.skin = await page.locator('.plus-skin-card').innerText();
  await page.locator('.plus-skin-card').click();
  await page.getByRole('dialog').getByRole('table', { name: '皮肤趋势明细' }).waitFor();
  checks.skinSelection = await page
    .getByRole('dialog')
    .getByRole('combobox', { name: '选择皮肤', exact: true })
    .locator('option:checked')
    .innerText();
  assert.equal(checks.skinSelection, '星域神启');
  await page
    .getByRole('dialog')
    .screenshot({ path: dir + '/skin-history.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '装备全局数据', exact: true }).click();
  await page.getByLabel('装备统计日', { exact: true }).fill('2026-10-18');
  await page.getByRole('button', { name: '抵抗之靴', exact: true }).click();
  const detail = page.locator('.equipment-source-detail');
  await detail.getByRole('table', { name: '全局装备栏位' }).waitFor();
  await detail.scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/equipment.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '战力试算', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: dir + '/mobile.png', animations: 'disabled' });
  assert.deepEqual(errors, []);
} catch (e) {
  await fs.writeFile(
    dir + '/failed-' + Date.now() + '.json',
    JSON.stringify({ checks, requests, errors, error: e.message }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
const after = { workspace: await read('workspace'), pro: await read('pro') };
assert.deepEqual(after, baseline);
const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
await fs.writeFile(
  dir + '/verification.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      status,
      checks,
      requests,
      errors,
      personalDataPreserved: true,
      beforeHash: hash(before),
      afterHash: hash(after),
      zhaohuaizhenInPool: after.workspace.pool.some((h) => h.heroId === 544),
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ version: status.version, checks, errors, personalDataPreserved: true }, null, 2),
);
