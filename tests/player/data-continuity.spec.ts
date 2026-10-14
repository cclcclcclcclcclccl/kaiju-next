import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('update status separates dates, stale records and missing scopes; reference retains alternate source roles', async ({
  page,
}) => {
  await page.route('**/api/official/update-status', (route) =>
    route.fulfill({
      json: {
        automatic: true,
        running: false,
        intervalMinutes: 35,
        completedAt: '2026-10-13T08:00:00Z',
        nextCheckAt: '2026-10-13T08:35:00Z',
        results: [
          { segment: 1, position: 1, state: 'fresh', sourceDate: '2026-10-12', rows: 10 },
          { segment: 3, position: 2, state: 'stale', sourceDate: '2026-10-11', rows: 10 },
          { segment: 4, position: 5, state: 'error', rows: 0 },
        ],
      },
    }),
  );
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByRole('button', { name: '历史快照与官方榜', exact: true }).click();
  await page.locator('.data-updates summary').click();
  await expect(page.locator('.data-updates')).toContainText('营地 1/15 路更新可用');
  await expect(page.locator('.data-updates')).toContainText('更新失败，保留旧数据');
  await expect(page.locator('.data-updates')).toContainText('未取得数据');
  await expect(page.locator('.data-updates')).toContainText('此批次不自动改写');
  await page.getByLabel('统计分段', { exact: true }).selectOption('巅峰千强');
  await page.getByLabel('数据批次', { exact: true }).selectOption('public-tianyuan-2026-10-12');
  await expect(page.locator('.rank-coverage')).toContainText('133 / 133');
  await page.getByLabel('搜索全部英雄').fill('盾山');
  await expect(page.locator('.tier-portrait')).toContainText('54.0%');
  await expect(page.locator('.tier-portrait')).toContainText('85.5%');
  await page.getByLabel('搜索全部英雄').fill('');
  await page.getByLabel('数据批次', { exact: true }).selectOption('public-tianyuan-2026-10-11');
  await expect(page.locator('.rank-coverage')).toContainText('100 / 133');
  await page.getByLabel('搜索全部英雄').fill('张良');
  await expect(page.locator('.tier-portrait')).toContainText('52.0%');
  await page
    .locator('.all-hero-ranks')
    .getByRole('button', { name: '打开张良图鉴', exact: true })
    .click();
  await expect(page.getByLabel('英雄统计分路')).toHaveValue('游走');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page
    .locator('.data-updates')
    .screenshot({ path: 'evidence/data-continuity/update-status-mobile.png' });
});
