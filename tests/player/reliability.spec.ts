import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { emptyProfile } from '../../src/player/pro/model.ts';
const folder = 'evidence/reliability-v014';
const openPool = async (page: import('@playwright/test').Page) => {
  await page
    .locator('nav')
    .getByRole('button', { name: /我的英雄池/ })
    .click();
};

test('guest pool is discoverable from a new account, merges without deleting guest and survives reload', async ({
  page,
  request,
}) => {
  mkdirSync(folder, { recursive: true });
  await request.post('/api/pool', {
    data: [
      { heroId: 544, level: 'main' },
      { heroId: 190, level: 'learning' },
    ],
  });
  await request.post('/api/pro/profile', { data: emptyProfile() });
  const auth = await (
    await request.post('/api/auth/register', {
      data: {
        username: 'recover' + Date.now(),
        name: '恢复流程测试',
        password: 'local-test-password',
      },
    })
  ).json();
  expect(auth.token).toBeTruthy();
  await page.goto('/');
  await page.evaluate((token) => localStorage.setItem('kaiju-token', token), auth.token);
  await page.reload();
  await openPool(page);
  const storage = page.getByRole('region', { name: '英雄池保存位置' });
  await expect(storage).toContainText('独立账号 · 恢复流程测试');
  await expect(storage).toContainText('赵怀真（本命）');
  await page.getByRole('button', { name: '复制访客英雄池到当前账号' }).click();
  await expect(page.getByRole('button', { name: '查看赵怀真资料', exact: true })).toBeVisible();
  await page.reload();
  await openPool(page);
  await expect(page.getByLabel('赵怀真熟练度')).toHaveValue('main');
  await page.getByLabel('搜索英雄', { exact: true }).fill('不会匹配的名字');
  await expect(page.getByText('当前筛选没有匹配英雄', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '清除英雄池筛选' }).click();
  await expect(page.getByLabel('赵怀真熟练度')).toHaveValue('main');
  expect((await (await request.get('/api/workspace')).json()).pool).toEqual([
    { heroId: 544, level: 'main' },
    { heroId: 190, level: 'learning' },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: folder + '/recovered-pool-mobile.png', fullPage: true });
});

test('two browser pages preserve independent hero additions and reject stale same-hero changes', async ({
  page,
  context,
  request,
}) => {
  await request.post('/api/pro/profile', { data: emptyProfile() });
  await request.post('/api/pool', { data: [{ heroId: 544, level: 'main' }] });
  const other = await context.newPage();
  await Promise.all([page.goto('/'), other.goto('/')]);
  for (const p of [page, other])
    await p.locator('nav').getByRole('button', { name: '英雄图鉴', exact: true }).click();
  await page.getByRole('button', { name: '加入英雄池诸葛亮', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('英雄池已写入本机数据库');
  await other.getByRole('button', { name: '加入英雄池赵云', exact: true }).click();
  await expect(other.getByRole('status')).toContainText('英雄池已写入本机数据库');
  expect(
    (await (await request.get('/api/workspace')).json()).pool
      .map((p: { heroId: number }) => p.heroId)
      .sort(),
  ).toEqual([107, 190, 544]);
  for (const p of [page, other]) await openPool(p);
  await page.getByLabel('赵怀真熟练度').selectOption('comfortable');
  await expect(page.getByRole('status')).toContainText('英雄池已写入本机数据库');
  await other.getByLabel('赵怀真熟练度').selectOption('learning');
  await expect(other.locator('.toast[role=alert]')).toContainText('另一个页面修改');
  await expect(other.getByLabel('赵怀真熟练度')).toHaveValue('comfortable');
  await other.reload();
  await openPool(other);
  await expect(other.getByRole('button', { name: '查看诸葛亮资料', exact: true })).toBeVisible();
  await expect(other.getByRole('button', { name: '查看赵云资料', exact: true })).toBeVisible();
  await other.close();
});

test('equipment rates have a direct entry, real fixture values, sorting and no stale data on query failure', async ({
  page,
}) => {
  mkdirSync(folder, { recursive: true });
  const equipment = JSON.parse(readFileSync('tests/fixtures/tianyuan/equip-521.json', 'utf8'));
  const resources = JSON.parse(
    readFileSync('tests/fixtures/official-resources-20261012.json', 'utf8'),
  );
  await page.route('**/api/resources', (r) =>
    r.fulfill({ json: { data: resources, stale: false } }),
  );
  await page.route('**/api/tianyuan?*', (r) => {
    const q = new URL(r.request().url()).searchParams;
    if (q.get('heroId') !== '521')
      return r.fulfill({ status: 502, json: { error: '测试：此英雄来源读取失败' } });
    return r.fulfill({
      json: {
        source: '天元之弈数据站',
        sourceClass: 'third-party-public',
        url: 'https://tianyuanzhiyi.com/api/hero/equip?heroId=521&date=2026-10-13',
        query: { kind: 'equip', heroId: 521, date: '2026-10-13' },
        requestedDate: '2026-10-13',
        fetchedAt: '2026-10-13T18:00:00Z',
        rawSha256: 'fixture-equip-521',
        cache: 'cached',
        data: equipment,
      },
    });
  });
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '装备与版本', exact: true }).click();
  await page.getByRole('button', { name: '查看装备出场率与胜率 →', exact: true }).click();
  await page.getByLabel('装备统计查询日').fill('2026-10-13');
  await page.getByLabel('统计英雄', { exact: true }).selectOption('521');
  await expect(page.locator('.equipment-statistics .roster-table tbody tr')).toHaveCount(10);
  const actual = equipment.equipmentWinRates.find(
    (r: { equipmentName: string }) => r.equipmentName === '日暮之流',
  );
  await expect(
    page.locator('.equipment-statistics .roster-table tr').filter({ hasText: '日暮之流' }),
  ).toContainText(actual.pickRate.toFixed(2) + '%');
  await expect(
    page.locator('.equipment-statistics .roster-table tr').filter({ hasText: '日暮之流' }),
  ).toContainText(actual.winRate.toFixed(2) + '%');
  await page.getByLabel('装备统计排序').selectOption('winRate');
  const ordered = [...equipment.equipmentWinRates].sort(
    (a, b) => (b.winRate ?? -1) - (a.winRate ?? -1),
  );
  await expect(page.locator('.equipment-statistics .roster-table tbody tr').first()).toContainText(
    ordered[0].equipmentName,
  );
  await page.screenshot({ path: folder + '/equipment-rates-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: folder + '/equipment-rates-mobile.png', fullPage: true });
  await page.getByLabel('统计英雄', { exact: true }).selectOption('544');
  await expect(page.locator('.equipment-statistics [role=alert]')).toContainText(
    '此英雄来源读取失败',
  );
  await expect(page.locator('.equipment-statistics .roster-table tbody tr')).toHaveCount(0);
});
