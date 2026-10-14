import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('complete source roster and environment tiers preserve identity, missing values, detail context and filter-independent scores', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByRole('button', { name: '历史快照与官方榜', exact: true }).click();
  await page.getByLabel('统计分段', { exact: true }).selectOption('巅峰千强');
  await page.getByLabel('数据批次', { exact: true }).selectOption('public-tianyuan-2026-10-12');
  const board = page.locator('.all-hero-ranks');
  await expect(board.locator('.tier-portrait')).toHaveCount(133);
  await page.getByLabel('搜索全部英雄').fill('元流之子');
  await expect(board.locator('.tier-portrait')).toHaveCount(5);
  await board.getByRole('button', { name: '打开元流之子(坦克)图鉴', exact: true }).click();
  await expect(page.locator('.aggregate-hero-stats')).toContainText('50.30%');
  await expect(page.locator('.aggregate-hero-stats')).toContainText('来源定位：游走');
  await page.keyboard.press('Escape');
  await page.getByLabel('搜索全部英雄').fill('明世隐');
  await expect(board.locator('.tier-portrait')).toContainText('胜率未公布');
  await expect(board.locator('.tier-portrait')).toContainText('出 0.4%');
  await page.getByLabel('看板依据').selectOption('environment');
  await expect(board.locator('.tier-band')).toHaveCount(5);
  const ma = board.getByRole('button', { name: '打开马超图鉴', exact: true });
  const score = await ma.locator('.tier-score').textContent();
  await page.getByLabel('总表分路').selectOption('对抗路');
  await expect(ma.locator('.tier-score')).toHaveText(score!);
  await ma.click();
  await expect(page.locator('.aggregate-hero-stats')).toContainText(score!);
  await page.getByText('查看得分依据与证据', { exact: true }).click();
  await expect(page.locator('.aggregate-hero-stats')).toContainText('不是统计置信区间');
  await page.keyboard.press('Escape');
  await page.getByLabel('总表分路').selectOption('全部');
  await page.locator('.environment-method summary').click();
  await page.screenshot({ path: 'evidence/data-continuity/environment-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'evidence/data-continuity/environment-mobile.png' });
  await board.getByRole('button', { name: '详细数据表', exact: true }).click();
  await expect(board.locator('tbody tr')).toHaveCount(133);
  await expect(board.locator('tbody tr').filter({ hasText: '明世隐' })).toContainText('未公布');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByLabel('数据批次', { exact: true }).selectOption('public-tianyuan-2026-10-11');
  await expect(board).toContainText('本批次尚无经过核对的完整总体数据');
  await expect(board.locator('.environment-board')).toHaveCount(0);
});
