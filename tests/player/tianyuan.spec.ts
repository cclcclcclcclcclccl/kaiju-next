import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseTianyuan, tianyuanUrl } from '../../src/player/pro/tianyuan.ts';
import type { TianyuanQuery } from '../../src/player/pro/tianyuan.ts';

test('public four-segment board preserves forms, source tiers, hero metrics and unknown dates on mobile', async ({
  page,
}) => {
  await page.route('**/api/tianyuan?*', async (route) => {
    const p = new URL(route.request().url()).searchParams;
    const q = {
      kind: p.get('kind'),
      date: p.get('date') ?? undefined,
      mode: p.has('mode') ? Number(p.get('mode')) : undefined,
      heroId: p.has('heroId') ? Number(p.get('heroId')) : undefined,
    } as TianyuanQuery;
    const file =
      q.kind === 'stats' ? 'stats-' + q.mode : q.kind === 'tier' ? 'tier' : q.kind + '-521';
    const raw = readFileSync('tests/fixtures/tianyuan/' + file + '.json', 'utf8');
    await route.fulfill({
      json: {
        source: '天元之弈数据站',
        sourceClass: 'third-party-public',
        url: tianyuanUrl(q),
        query: q,
        requestedDate: q.date,
        fetchedAt: '2026-10-14T05:00:00Z',
        rawSha256: createHash('sha256').update(raw).digest('hex'),
        cache: 'cached',
        data: parseTianyuan(JSON.parse(raw), q),
      },
    });
  });
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByLabel('联网数据日期').fill('2026-10-13');
  const panel = page.locator('.tianyuan-live');
  await expect(panel.locator('.tier-portrait')).toHaveCount(133);
  await page.getByLabel('联网榜单分段').selectOption('大众分段');
  await expect(panel.locator('.tier-portrait')).toHaveCount(135);
  await page.getByLabel('联网英雄搜索').fill('李信');
  await expect(panel.locator('.tier-portrait')).toHaveCount(3);
  await page.getByLabel('联网英雄搜索').fill('');
  await page.getByLabel('联网榜单分段').selectOption('巅峰千强');
  await page.getByRole('button', { name: '天元来源梯度', exact: true }).click();
  await expect(panel.locator('.tier-band')).toHaveCount(6);
  await expect(panel).toContainText('原站标注“算法测试中”');
  await page.getByLabel('联网英雄搜索').fill('海月');
  await panel.getByRole('button', { name: '查看海月公开详情', exact: true }).click();
  const detail = page.locator('.tianyuan-hero');
  await expect(detail).toContainText('天元公开统计');
  await detail.getByRole('button', { name: '皮肤使用率', exact: true }).click();
  await expect(detail).toContainText('真言先知');
  await expect(detail).toContainText('42.32%');
  await detail.getByRole('button', { name: '对局时长胜率', exact: true }).click();
  await expect(detail).toContainText('0-12分钟');
  await expect(detail).toContainText('48.89%');
  await expect(detail).toContainText('接口未提供日期选择');
  await detail.getByRole('button', { name: '实际出装统计', exact: true }).click();
  await expect(detail).toContainText('日暮之流');
  await expect(detail).toContainText('不能推导买该装备');
  await detail.getByRole('button', { name: '克制与组合', exact: true }).click();
  await expect(detail).toContainText('157');
  await expect(detail).toContainText('来源指数');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByLabel('联网英雄搜索').fill('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});

test('public query failure never shows another date or synthetic values', async ({ page }) => {
  await page.route('**/api/tianyuan?*', (route) =>
    route.fulfill({ status: 502, json: { error: '来源不可用' } }),
  );
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await expect(page.locator('.tianyuan-live')).toContainText('没有用其他日期或示例数据填充');
  await expect(page.locator('.tianyuan-live .tier-portrait')).toHaveCount(0);
  await page.getByRole('button', { name: '历史快照与官方榜', exact: true }).click();
  await expect(page.getByLabel('统计分段', { exact: true })).toBeVisible();
});
