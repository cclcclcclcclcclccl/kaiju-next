import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseTianyuan, tianyuanUrl } from '../../src/player/pro/tianyuan.ts';
import type { TianyuanQuery } from '../../src/player/pro/tianyuan.ts';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T15:00:00Z'));
  await page.route('**/api/tianyuan?*', async (route) => {
    const p = new URL(route.request().url()).searchParams;
    const q = {
      kind: p.get('kind'),
      date: p.get('date') ?? undefined,
      mode: p.has('mode') ? Number(p.get('mode')) : undefined,
      heroId: p.has('heroId') ? Number(p.get('heroId')) : undefined,
    } as TianyuanQuery;
    if (!['stats', 'tier'].includes(q.kind))
      return route.fulfill({ status: 502, json: { error: '专项测试没有对应夹具' } });
    const raw = readFileSync(
      'tests/fixtures/tianyuan/' +
        (q.kind === 'tier' ? 'tier-20261014' : 'stats-' + q.mode) +
        '.json',
      'utf8',
    );
    await route.fulfill({
      json: {
        source: '天元之弈固定真实历史测试记录',
        sourceClass: 'third-party-public',
        url: tianyuanUrl(q),
        query: q,
        requestedDate: q.date,
        fetchedAt: '2026-10-14T14:00:00Z',
        rawSha256: createHash('sha256').update(raw).digest('hex'),
        cache: 'cached',
        data: parseTianyuan(JSON.parse(raw), q),
      },
    });
  });
});
test('rebrand and direct hero navigation survive reload and browser back without changing saved pool', async ({
  page,
  request,
}) => {
  const before = await (await request.get('/api/workspace')).json();
  await page.goto('/#/heroes?hero=544');
  await expect(page).toHaveTitle(/自在弈境/);
  await expect(page.getByRole('button', { name: '自在弈境首页' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('赵怀真');
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText('赵怀真');
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await expect(page).toHaveURL(/#\/heroes$/);
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await expect(page).toHaveURL(/#\/tier$/);
  await page.goBack();
  await expect(
    page.locator('nav').getByRole('button', { name: '英雄图鉴', exact: true }),
  ).toHaveClass(/active/);
  await page.goBack();
  await expect(page.getByRole('dialog')).toContainText('赵怀真');
  const after = await (await request.get('/api/workspace')).json();
  expect(after.pool).toEqual(before.pool);
  const status = await (await request.get('/api/status')).json();
  expect(status.product).toBe('自在弈境');
  expect(status.productId).toBe('kaiju-player-companion');
});
test('source ranking supports pinyin, rate bars, filter persistence, reset and mobile layout', async ({
  page,
}) => {
  await page.goto('/#/tier');
  const search = page.getByLabel('联网英雄搜索');
  await search.fill('zhaohuaizhen');
  const cards = page.locator('.tianyuan-live .tier-portrait');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('赵怀真');
  await page.getByRole('button', { name: '查看完整数据表', exact: true }).click();
  await expect(page.locator('.roster-table .portrait img')).toHaveCount(1);
  await expect(page.getByRole('meter', { name: '胜率', exact: true })).toHaveCount(1);
  await page.reload();
  await expect(search).toHaveValue('zhaohuaizhen');
  await expect(page.locator('.roster-table')).toBeVisible();
  await expect(page.getByLabel('榜单数据口径')).toContainText('来源未公布');
  await page.getByRole('button', { name: '重置榜单筛选' }).click();
  await expect(search).toHaveValue('');
  await page.getByLabel('最低出场率').selectOption('5');
  const values = await page.locator('.roster-table tbody tr td:nth-child(6)').allTextContents();
  expect(values.length).toBeGreaterThan(0);
  expect(values.every((v) => parseFloat(v) >= 5)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const violations = (
    await new AxeBuilder({ page })
      .include('.tianyuan-live')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
  ).violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(violations).toEqual([]);
  mkdirSync('evidence/final-v026/browser', { recursive: true });
  await page.screenshot({ path: 'evidence/final-v026/browser/ranking-mobile.png', fullPage: true });
});
test('tool link restores selected tool and navigation remains usable on source failure', async ({
  page,
}) => {
  await page.route('**/api/source-plus?*', (r) =>
    r.fulfill({ status: 502, json: { error: '受控来源不可用' } }),
  );
  await page.goto('/#/datahub?tool=power');
  await expect(page.getByRole('button', { name: '战力试算', exact: true })).toHaveClass(/active/);
  await page.getByRole('button', { name: '全皮肤库', exact: true }).click();
  await expect(page).toHaveURL(/tool=skins/);
  await page.reload();
  await expect(page.getByRole('button', { name: '全皮肤库', exact: true })).toHaveClass(/active/);
  await page.locator('nav').getByRole('button', { name: '备战首页' }).click();
  await expect(page.getByRole('heading', { name: '心有准备，选择自在。' })).toBeVisible();
});
