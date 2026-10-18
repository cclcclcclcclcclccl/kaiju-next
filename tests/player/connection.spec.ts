import { test, expect } from '@playwright/test';
test('service interruption is explicit and recovery keeps the current page and typed input', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '英雄图鉴', exact: true }).click();
  await page.getByLabel('搜索英雄', { exact: true }).fill('赵怀真');
  await page.route('**/api/status', (route) => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByLabel('本地服务连接提示')).toContainText('start-kaiju.cmd');
  await expect(page.getByLabel('搜索英雄', { exact: true })).toHaveValue('赵怀真');
  await page.unroute('**/api/status');
  await page.getByRole('button', { name: '检查服务连接', exact: true }).click();
  await expect(page.getByLabel('本地服务连接提示')).toHaveCount(0);
  await expect(page.getByLabel('搜索英雄', { exact: true })).toHaveValue('赵怀真');
});
