import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const dir = 'evidence/coach-upgrade';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/**', (route) =>
  route.request().method() === 'GET' ? route.continue() : route.abort(),
);
const settle = async () =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]),
      ),
    );
  });
try {
  const status = await (await page.request.get('http://127.0.0.1:4318/api/status')).json();
  if (status.version !== '0.8.0') throw new Error('Local server is not v0.8.0');
  await page.goto('http://127.0.0.1:4318/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByLabel('统计分段', { exact: true }).selectOption('巅峰1350+');
  await page.locator('.roster-table tbody tr').last().waitFor();
  const count = await page.locator('.roster-table tbody tr').count();
  if (count !== 133) throw new Error('Incomplete roster');
  await page
    .getByRole('region', { name: '官方公开统计' })
    .locator('tbody tr')
    .first()
    .waitFor({ timeout: 25000 });
  await settle();
  await page.locator('.all-hero-ranks').scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/live-roster-desktop.png', animations: 'disabled' });
  const desktop = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const publicStats = await (
    await page.request.get('http://127.0.0.1:4318/api/official/hero-rank?segment=3&position=2')
  ).json();
  await page.getByLabel('搜索全部英雄').fill('李白');
  await page.getByRole('button', { name: '打开李白图鉴' }).click();
  await page.getByRole('dialog').locator('#hero-builds').scrollIntoViewIfNeeded();
  await settle();
  await page.screenshot({ path: dir + '/live-hero-builds.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  const coach = page.getByRole('region', { name: '教练博弈 BP' });
  await coach.scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/live-coach-controls.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.sidebar')
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))));
  await coach.scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/live-coach-mobile.png', animations: 'disabled' });
  const mobile = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const report = {
    checkedAt: new Date().toISOString(),
    status,
    rosterCount: count,
    official: {
      date: publicStats.data?.sourceUpdatedOn,
      rows: publicStats.data?.rows.length,
      cache: publicStats.cache,
    },
    browserErrors: errors,
    overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    accessibility: { desktop: desktop.violations, mobile: mobile.violations },
    scope:
      'Read-only on real user database; no invented player data written. Worker/profile/social interactions validated separately on port 4319.',
  };
  writeFileSync(dir + '/live-check.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || report.overflow || desktop.violations.length || mobile.violations.length)
    process.exitCode = 1;
} finally {
  await browser.close();
}
