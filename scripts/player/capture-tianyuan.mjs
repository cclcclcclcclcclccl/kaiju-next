import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
const base = 'http://127.0.0.1:4318';
const dir = 'evidence/tianyuan-public-api/browser';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
  const before = {};
  for (const name of ['workspace', 'pro'])
    before[name] = hash(await (await page.request.get(base + '/api/' + name)).json());
  await page.goto(base);
  const status = await (await page.request.get(base + '/api/status')).json();
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByLabel('联网数据日期').fill('2026-10-13');
  await page.locator('.tianyuan-live .tier-portrait').first().waitFor();
  const coverage = await page.locator('.rank-coverage').innerText();
  if ((await page.locator('.tianyuan-live .tier-portrait').count()) !== 133)
    throw Error('hero coverage');
  await page.getByRole('button', { name: '天元来源梯度', exact: true }).click();
  await page.locator('.tianyuan-live .tier-score').first().waitFor();
  await page.locator('.tianyuan-live').scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/live-full-board.png' });
  await page.locator('.tianyuan-live .tier-band').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/live-source-tiers.png' });
  await page.getByLabel('联网英雄搜索').fill('海月');
  await page.getByRole('button', { name: '查看海月公开详情', exact: true }).click();
  await page.locator('.tianyuan-hero .metric-strip').waitFor();
  const source = await (
    await page.request.get(base + '/api/tianyuan?kind=stats&date=2026-10-13&mode=5')
  ).json();
  const row = source.data.find((r) => r.heroId === 521);
  const heroText = await page.locator('.tianyuan-hero').innerText();
  for (const field of ['winRate', 'pickRate', 'banRate'])
    if (!heroText.includes(row[field].toFixed(2) + '%')) throw Error('hero source mismatch');
  const detail = page.locator('.tianyuan-hero');
  await detail.getByRole('button', { name: '皮肤使用率', exact: true }).click();
  await detail.getByRole('cell', { name: '真言先知', exact: true }).waitFor();
  await detail.getByRole('cell', { name: '真言先知', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('dialog').screenshot({ path: dir + '/live-skins.png' });
  await detail.getByRole('button', { name: '对局时长胜率', exact: true }).click();
  await detail.getByRole('cell', { name: '0-12分钟', exact: true }).waitFor();
  await detail.getByRole('cell', { name: '0-12分钟', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('dialog').screenshot({ path: dir + '/live-duration.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await detail.getByRole('cell', { name: '0-12分钟', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('dialog').screenshot({ path: dir + '/live-duration-mobile.png' });
  const violations = (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  ).violations;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.keyboard.press('Escape');
  await page.getByLabel('联网英雄搜索').fill('');
  await page.locator('.tianyuan-live .tier-band').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/live-tiers-mobile.png' });
  const after = {};
  for (const name of ['workspace', 'pro'])
    after[name] = hash(await (await page.request.get(base + '/api/' + name)).json());
  const restartFile = 'data/source-audit-20261014/player-before.json';
  const beforeRestart = existsSync(restartFile)
    ? JSON.parse(readFileSync(restartFile, 'utf8'))
    : null;
  const report = {
    checkedOn: new Date().toISOString(),
    status,
    coverage,
    heroSource: {
      heroId: row.heroId,
      winRate: row.winRate,
      pickRate: row.pickRate,
      banRate: row.banRate,
    },
    playerDataUnchanged: JSON.stringify(before) === JSON.stringify(after),
    restartDataUnchanged: beforeRestart
      ? JSON.stringify(beforeRestart) === JSON.stringify(after)
      : null,
    before,
    after,
    pageErrors: errors,
    mobileOverflow: overflow,
    axeViolations: violations.length,
  };
  writeFileSync(dir + '/live-check.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (
    errors.length ||
    overflow ||
    violations.length ||
    !report.playerDataUnchanged ||
    report.restartDataUnchanged === false
  )
    throw Error('live validation failed');
} finally {
  await browser.close();
}
