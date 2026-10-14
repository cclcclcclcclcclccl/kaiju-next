import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { OFFICIAL_RANK_API, OFFICIAL_RANK_PAGE } from '../../src/player/pro/official.ts';

test('official data stays attributed, partial and distinct from personal tiers across filters and hero details', async ({
  page,
}) => {
  await page.route('**/api/official/hero-rank?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    await route.fulfill({
      json: {
        cache: 'cached',
        data: {
          source: '王者营地官方公开分享榜',
          sourceUrl: OFFICIAL_RANK_PAGE,
          endpoint: OFFICIAL_RANK_API,
          query: {
            segment: Number(params.get('segment')),
            position: Number(params.get('position')),
          },
          sourceUpdatedOn: '2026-10-11',
          fetchedAt: '2026-10-12T09:00:00.000Z',
          coverage: 'partial',
          rows: [
            {
              heroId: 521,
              name: '海月',
              heat: 'T0',
              winRate: 49.88,
              pickRate: 5.9,
              banRate: 80.06,
            },
          ],
        },
      },
    });
  });
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByRole('button', { name: '历史快照与官方榜', exact: true }).click();
  const panel = page.getByRole('region', { name: '官方公开统计' });
  await expect(panel).toContainText('公开接口本次返回 1 位英雄');
  await expect(panel).toContainText('49.88%');
  await expect(panel).toContainText('官方更新日期：2026-10-11');
  await expect(panel).toContainText('统计起止日期');
  await expect(panel).toContainText('不直接生成开局梯度');
  await page.getByLabel('统计分段', { exact: true }).selectOption('巅峰1350+');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await panel.getByRole('button', { name: '海月' }).click();
  const detail = page.getByRole('dialog');
  await expect(detail.locator('.official-hero-stats')).toContainText('热度 T0 · 胜率 49.88%');
  await expect(detail.getByLabel('历史英雄统计分段')).toHaveValue('巅峰1350+');
  await page.keyboard.press('Escape');
  await page.getByLabel('搜索梯度英雄').fill('不存在');
  await expect(panel).toContainText('当前公开记录里没有符合筛选条件的英雄');
  await page.getByLabel('搜索梯度英雄').fill('');
  await page.getByLabel('统计分段', { exact: true }).selectOption('巅峰1800+');
  await expect(panel).toContainText('尚未找到可匿名获取');
  await expect(panel.locator('tbody')).toHaveCount(0);
  await page.getByLabel('统计分段', { exact: true }).selectOption('顶端排位');
  await expect(panel).toContainText('前 10 万场');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
});

test('official request failure is visible and can recover without synthetic substitution', async ({
  page,
}) => {
  let calls = 0,
    failing = true;
  await page.route('**/api/official/hero-rank?*', async (route) => {
    calls++;
    if (failing) {
      await route.fulfill({ status: 502, json: { error: '官方请求失败（测试）' } });
      return;
    }
    await route.fulfill({
      json: {
        cache: 'stale',
        warning: '更新失败，正在展示上次成功获取的记录（测试）',
        data: {
          source: '王者营地官方公开分享榜',
          sourceUrl: OFFICIAL_RANK_PAGE,
          endpoint: OFFICIAL_RANK_API,
          query: { segment: 1, position: 2 },
          sourceUpdatedOn: '2026-10-11',
          fetchedAt: '2026-10-12T09:00:00.000Z',
          coverage: 'partial',
          rows: [
            {
              heroId: 521,
              name: '海月',
              heat: 'T0',
              winRate: 49.88,
              pickRate: 5.9,
              banRate: 80.06,
            },
          ],
        },
      },
    });
  });
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByRole('button', { name: '历史快照与官方榜', exact: true }).click();
  const panel = page.getByRole('region', { name: '官方公开统计' });
  await expect(panel.getByRole('alert')).toContainText('官方请求失败');
  await expect(panel.locator('tbody')).toHaveCount(0);
  const initialCalls = calls;
  failing = false;
  await panel.getByRole('button', { name: '读取官方数据' }).click();
  await expect.poll(() => calls).toBeGreaterThan(initialCalls);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel).toContainText('上次成功获取的记录');
  await expect(panel).toContainText('49.88%');
});
