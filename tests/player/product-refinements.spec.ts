import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const folder = 'evidence/product-comparison-v022/browser';
test.beforeEach(async ({ page }) => {
  mkdirSync(folder, { recursive: true });
  await page.route('**/api/source-plus?*', async (route) => {
    const q = Object.fromEntries(new URL(route.request().url()).searchParams);
    const kind = q.kind;
    try {
      const raw = readFileSync('tests/fixtures/source-plus/' + kind + '.json', 'utf8'),
        data = JSON.parse(raw);
      await route.fulfill({
        json: {
          source: '天元之弈（固定真实来源测试夹具）',
          sourceClass: 'third-party-public',
          query: q,
          url: 'https://tianyuanzhiyi.com/api/herostats',
          fetchedAt: '2026-10-19T06:00:00Z',
          rawSha256: createHash('sha256').update(raw).digest('hex'),
          cache: 'cached',
          data: kind === 'allStats' ? { rows: data } : data,
        },
      });
    } catch {
      await route.fulfill({ status: 502, json: { error: '本测试无该查询夹具' } });
    }
  });
  await page.goto('/');
});
test('search finds tools and heroes with keyboard and works on mobile', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const search = page.getByRole('textbox', { name: '全局搜索英雄或功能' });
  await expect(search).toBeFocused();
  await search.fill('皮肤');
  await search.press('Enter');
  await expect(page.getByLabel('搜索皮肤库', { exact: true })).toBeVisible();
  await search.fill('诸葛亮');
  await search.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('诸葛亮');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sidebar')).toHaveAttribute('inert', '');
  await search.fill('复盘');
  await expect(page.getByLabel('搜索结果')).toContainText('录像复盘');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: folder + '/mobile-search.png', animations: 'disabled' });
  await search.press('Escape');
  await expect(page.getByLabel('搜索结果')).toHaveCount(0);
});
test('hero comparison uses one source scope, exports evidence, does not synthesize BP and clears old results on failure', async ({
  page,
  request,
}) => {
  const before = (await (await request.get('/api/workspace')).json()).pool;
  await page
    .locator('.quick-grid')
    .getByRole('button', { name: /英雄横向对比/ })
    .click();
  const panel = page.locator('.hero-compare');
  while (await panel.getByRole('button', { name: /移除对比/ }).count())
    await panel
      .getByRole('button', { name: /移除对比/ })
      .first()
      .click();
  await panel.getByRole('combobox', { name: '加入对比' }).selectOption('190');
  await panel.getByRole('combobox', { name: '加入对比' }).selectOption('544');
  const table = panel.getByRole('table', { name: '英雄横向对比表' });
  await expect(table).toContainText('诸葛亮');
  await expect(table).toContainText('赵怀真');
  const source = JSON.parse(readFileSync('tests/fixtures/source-plus/allStats.json', 'utf8'));
  await expect(
    table
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: '胜率', exact: true }) }),
  ).toContainText(source.find((h: any) => h.heroId === 190).winRate.toFixed(2) + '%');
  await expect(panel.getByLabel('当前数据口径')).toContainText('巅峰千强');
  const dl = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出对比与出处' }).click();
  const exported = JSON.parse(readFileSync((await (await dl).path())!, 'utf8'));
  expect(exported.heroIds).toEqual([190, 544]);
  expect(exported.source.rawSha256).toBeTruthy();
  expect(exported.rows[0]).not.toHaveProperty('bpRate');
  const issues = (
    await new AxeBuilder({ page }).include('.hero-compare').analyze()
  ).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(issues).toEqual([]);
  await page.screenshot({ path: folder + '/hero-comparison.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: folder + '/hero-comparison-mobile.png' });
  await page.route('**/api/source-plus?*', (r) =>
    r.fulfill({ status: 502, json: { error: '测试切换数据失败' } }),
  );
  await panel.getByRole('combobox', { name: '对比分段' }).selectOption('1');
  await expect(panel).toContainText('测试切换数据失败');
  await expect(table).toHaveCount(0);
  await expect(panel.getByLabel('当前数据口径')).toHaveCount(0);
  expect((await (await request.get('/api/workspace')).json()).pool).toEqual(before);
});
test('full stats distinguishes pick and ban instead of adding incompatible rates', async ({
  page,
}) => {
  const search = page.getByRole('textbox', { name: '全局搜索英雄或功能' });
  await search.fill('全英雄指标');
  await search.press('Enter');
  const table = page.getByRole('table', { name: '全英雄详细统计' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: /BP率/ })).toHaveCount(0);
  await expect(page.locator('.data-hub')).toContainText('不把出场率与禁用率相加');
  await expect(page.getByLabel('当前数据口径')).toContainText('统计日');
});
test('complete backup download and restore round-trip the server BP with explicit counts', async ({
  page,
  request,
}) => {
  const series = {
    version: 1,
    bestOf: 3,
    names: ['备份测试甲', '备份测试乙'],
    games: [
      {
        blue: 0,
        session: {
          version: 1,
          format: 'staged',
          mode: 'manual',
          moves: [],
          unavailable: { allies: [], enemies: [] },
        },
      },
    ],
  };
  const current = await (await request.get('/api/pro/bp-series')).json();
  expect(
    (
      await request.post('/api/pro/bp-series', {
        data: { owner: current.owner, expected: current.revision, series },
      })
    ).ok(),
  ).toBe(true);
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载完整个人备份', exact: true }).click();
  const bytes = readFileSync((await (await downloaded).path())!),
    backup = JSON.parse(bytes.toString());
  expect(backup.data.bpSeries).toEqual(series);
  const second = await (await request.get('/api/pro/bp-series')).json();
  await request.post('/api/pro/bp-series', {
    data: {
      owner: second.owner,
      expected: second.revision,
      series: { ...series, names: ['另一个', '系列赛'] },
    },
  });
  await page
    .getByLabel('选择完整个人备份')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: bytes });
  await expect(page.locator('.backup-center')).toContainText('服务器系列赛局数');
  await page
    .getByRole('checkbox', { name: '我已核对目标空间与数量，确认替换当前已保存内容' })
    .check();
  await page.getByRole('button', { name: '确认恢复完整备份', exact: true }).click();
  await expect(page.getByRole('heading', { name: '下一局，从这里开始。' })).toBeVisible();
  expect((await (await request.get('/api/pro/bp-series')).json()).series).toEqual(series);
});
