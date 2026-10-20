import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
const output = 'evidence/flex-bp-v019/browser';
test('ordinary BP flow retains flex picks, accepts cross-lane reply, reassigns and persists manual swaps', async ({
  page,
}) => {
  test.setTimeout(90000);
  mkdirSync(output, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  const panel = page.locator('.bp-rounds'),
    blue = panel.getByRole('region', { name: '蓝方阵容' });
  await panel.getByRole('button', { name: '开始新演练', exact: true }).click();
  const pick = async (name: string) => {
    await panel.getByRole('button', { name: 'BP选择' + name, exact: true }).click();
    await panel.getByRole('button', { name: '确认本轮', exact: true }).click();
  };
  for (const name of ['廉颇', '小乔', '赵云', '墨子']) await pick(name);
  await panel.getByLabel('英雄分路筛选', { exact: true }).selectOption('中路');
  await pick('诸葛亮');
  const z = blue.locator('.bp-pick-slot').filter({ hasText: '诸葛亮' });
  await expect(z).toContainText('仍可摇摆');
  await expect(z).toContainText('中路');
  await expect(z).toContainText('打野');
  await expect(panel.getByLabel('英雄分路筛选', { exact: true })).toHaveValue('全部');
  await pick('孙尚香');
  await pick('刘禅');
  await expect(z).toContainText('仍可摇摆');
  await pick('妲己');
  await expect(z.locator('.bp-role-status')).toHaveText('当前推断：打野');
  await expect(z.locator('.bp-flex-options')).toHaveCount(0);
  const mage = blue.locator('.bp-pick-slot').filter({ hasText: '妲己' });
  await expect(mage.locator('.bp-role-status')).toHaveText('当前推断：中路');
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/auto-reassign-desktop.png', animations: 'disabled' });
  await panel.getByLabel('蓝方诸葛亮分路', { exact: true }).selectOption('中路');
  await expect(z.locator('.bp-role-status')).toHaveText('手动锁定：中路');
  await expect(mage.locator('.bp-role-status')).toHaveText('手动锁定：打野');
  await expect(mage.locator('.bp-role-warning')).toBeVisible();
  await page.reload();
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  await expect(panel.getByLabel('蓝方诸葛亮分路', { exact: true })).toHaveValue('中路');
  await expect(panel.getByLabel('蓝方妲己分路', { exact: true })).toHaveValue('打野');
  await blue.getByRole('button', { name: '本方全部恢复自动分路', exact: true }).click();
  await expect(z.locator('.bp-role-status')).toHaveText('当前推断：打野');
  await panel.getByRole('button', { name: '撤回一步', exact: true }).click();
  await expect(z).toContainText('仍可摇摆');
  await pick('李白');
  await expect(z.locator('.bp-role-status')).toHaveText('当前推断：中路');
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/auto-reassign-mobile.png', animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include('.bp-rounds')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
});
