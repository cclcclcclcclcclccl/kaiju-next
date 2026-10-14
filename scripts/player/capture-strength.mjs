import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strengthRanks } from '../../src/player/pro/strength.ts';
const dir = 'evidence/strength-v2',
  base = 'http://127.0.0.1:4318',
  date = '2026-10-13';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
  page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
try {
  await page.goto(base);
  const status = await (await page.request.get(base + '/api/status')).json();
  if (status.version !== '0.13.0') throw Error('Version not updated');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByLabel('联网数据日期').fill(date);
  const stats = await (
    await page.request.get(base + '/api/tianyuan?kind=stats&mode=5&date=' + date)
  ).json();
  const top = await (
    await page.request.get(base + '/api/tianyuan?kind=stats&mode=4&date=' + date)
  ).json();
  const expected = strengthRanks(stats.data, 5, '全部', top.data),
    first = expected.rows[0];
  const panel = page.locator('.tianyuan-live');
  await panel
    .locator('.tier-portrait .tier-score')
    .first()
    .filter({ hasText: first.score.toFixed(1) })
    .waitFor();
  if ((await panel.locator('.tier-portrait').count()) !== 133) throw Error('Roster mismatch');
  await panel.locator('.tier-band').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/live-own-strength.png' });
  await page.getByLabel('联网英雄搜索').fill(first.row.heroName);
  if ((await panel.locator('.tier-portrait .tier-score').innerText()) !== first.score.toFixed(1))
    throw Error('Search changed strength');
  await page
    .getByRole('button', { name: '查看' + first.row.heroName + '公开详情', exact: true })
    .click();
  const explanation = page.getByLabel('开局强度评分解释');
  await explanation.getByText(first.score.toFixed(2) + ' 分', { exact: false }).waitFor();
  await explanation.scrollIntoViewIfNeeded();
  await page.getByRole('dialog').screenshot({ path: dir + '/live-strength-explained.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await explanation.scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/live-strength-mobile.png' });
  const detailAudit = (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  ).violations;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.keyboard.press('Escape');
  await page.getByLabel('联网英雄搜索').fill('');
  await page.getByLabel('联网排序').selectOption('ban');
  const banHero = [...expected.rows].sort((a, b) => b.row.banRate - a.row.banRate)[0].row.heroName;
  if (!(await panel.locator('.tier-portrait').first().innerText()).includes(banHero))
    throw Error('Metric sort mismatch');
  await page.getByLabel('联网排序').selectOption('strength');
  const boardAudit = (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  ).violations;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('nav').getByRole('button', { name: '录像复盘', exact: true }).click();
  await page.getByRole('heading', { name: '交给当前 Codex 对话复盘', exact: true }).waitFor();
  await page.screenshot({ path: dir + '/live-codex-review.png' });
  const after = {};
  for (const name of ['workspace', 'pro'])
    after[name] = hash(await (await page.request.get(base + '/api/' + name)).json());
  const before = JSON.parse(readFileSync('data/strength-v2-before.json', 'utf8'));
  const result = {
    verifiedAt: new Date().toISOString(),
    status,
    defaultSort: 'strength',
    heroCoverage: 133,
    example: {
      hero: first.row.heroName,
      score: first.score,
      tier: first.tier,
      rankRange: first.rankRange,
    },
    sourceHashes: [stats.rawSha256, top.rawSha256],
    sourceCaches: [stats.cache, top.cache],
    sourceFetchedAt: [stats.fetchedAt, top.fetchedAt],
    searchPreservesScore: true,
    metricSortVerified: true,
    axeViolations: detailAudit.length + boardAudit.length,
    mobileOverflow: overflow,
    pageErrors: errors,
    playerDataUnchanged: JSON.stringify(before) === JSON.stringify(after),
    before,
    after,
    realGameReviewPerformed: false,
  };
  writeFileSync(dir + '/live-check.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (errors.length || overflow || result.axeViolations || !result.playerDataUnchanged)
    throw Error('Live check failed');
} finally {
  await browser.close();
}
