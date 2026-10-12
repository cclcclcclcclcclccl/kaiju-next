import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

const dir = 'evidence/official-public-data';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/**', (route) =>
  route.request().method() === 'GET' ? route.continue() : route.abort(),
);
try {
  const status = await (await page.request.get('http://127.0.0.1:4318/api/status')).json();
  await page.goto('http://127.0.0.1:4318/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByLabel('统计分段', { exact: true }).selectOption('巅峰1350+');
  const panel = page.getByRole('region', { name: '官方公开统计' });
  await panel.locator('tbody tr').first().waitFor({ timeout: 20000 });
  const source = await (
    await page.request.get('http://127.0.0.1:4318/api/official/hero-rank?segment=3&position=2')
  ).json();
  if (source.data?.rows?.[0]?.heroId !== 521 || source.data.rows.length !== 10)
    throw new Error('官方榜已变化，检查当前响应后再更新截图验证');
  await panel.scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        Promise.race([
          image.decode().catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]),
      ),
    );
  });
  await panel.screenshot({ path: dir + '/app-official-desktop.png', animations: 'disabled' });
  const desktop = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  await panel.getByRole('button', { name: '海月' }).click();
  const detail = page.getByRole('dialog').locator('.official-hero-stats');
  await detail.getByText(/热度 T0/).waitFor();
  await detail.screenshot({ path: dir + '/app-hero-official.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.sidebar')
    .evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))),
    );
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/app-official-mobile.png', animations: 'disabled' });
  const mobile = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const result = {
    checkedAt: new Date().toISOString(),
    status,
    officialSource: {
      sourceUpdatedOn: source.data.sourceUpdatedOn,
      fetchedAt: source.data.fetchedAt,
      count: source.data.rows.length,
      first: source.data.rows[0],
    },
    overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    browserErrors: errors,
    accessibilityViolations: { desktop: desktop.violations, mobile: mobile.violations },
  };
  writeFileSync(dir + '/live-check.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
