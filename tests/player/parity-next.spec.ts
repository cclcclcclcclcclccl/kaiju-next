import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const folder = 'evidence/tianyuan-parity-v021/browser';
test.beforeEach(async ({ page }) => {
  mkdirSync(folder, { recursive: true });
  await page.route('**/api/source-plus?*', async (route) => {
    const q = Object.fromEntries(new URL(route.request().url()).searchParams);
    try {
      const raw = readFileSync('tests/fixtures/source-plus/' + q.kind + '.json', 'utf8'),
        data = JSON.parse(raw);
      await route.fulfill({
        json: {
          source: '天元之弈（固定真实来源回归数据）',
          sourceClass: 'third-party-public',
          url: 'https://tianyuanzhiyi.com',
          query: q,
          fetchedAt: '2026-10-19T06:00:00Z',
          rawSha256: createHash('sha256').update(raw).digest('hex'),
          cache: 'cached',
          data: q.kind === 'allStats' ? { rows: data } : data,
        },
      });
    } catch {
      await route.fulfill({ status: 502, json: { error: '本测试未提供该来源夹具' } });
    }
  });
  await page.goto('/');
});
const dataHub = async (page: any) =>
  page.locator('nav').getByRole('button', { name: '数据与工具', exact: true }).click();
const seriesRoom = async (page: any) => {
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  await page.getByText('系列赛全局 BP · BO3 / BO5 / BO7 / BO9', { exact: true }).click();
  return page.locator('.series-bp');
};
test('real skin history supports comparison, table export and mobile width', async ({ page }) => {
  await dataHub(page);
  await page.getByRole('button', { name: '全皮肤库', exact: true }).click();
  await page.getByLabel('搜索皮肤库', { exact: true }).fill('诸葛亮 星域');
  await page.locator('.plus-skin-card').click();
  const cmp = page.locator('.skin-comparison');
  await expect(cmp.getByRole('combobox', { name: '选择皮肤', exact: true })).toHaveValue('19006');
  await cmp.locator('fieldset input[type=checkbox]').first().check();
  await expect(cmp.locator('svg path')).toHaveCount(2);
  await expect(cmp.getByRole('table', { name: '皮肤趋势明细' }).locator('thead th')).toHaveCount(3);
  await cmp.getByText('显示列与表格导出', { exact: true }).click();
  const download = page.waitForEvent('download');
  await cmp.getByRole('button', { name: '导出当前筛选表格 CSV' }).click();
  expect((await download).suggestedFilename()).toContain('皮肤趋势');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: folder + '/skin-comparison-mobile.png' });
  await cmp.getByRole('button', { name: '只看主选皮肤' }).click();
  await expect(cmp.locator('svg path')).toHaveCount(1);
});
test('player summary has declared denominator, search, navigation and accessible controls', async ({
  page,
}) => {
  await dataHub(page);
  await page.getByRole('button', { name: '巅峰玩家', exact: true }).click();
  const panel = page.locator('.player-hero-distribution');
  await expect(panel).toContainText('不代表全服英雄出场率');
  await expect(
    panel.getByRole('table', { name: '上榜英雄分布' }).locator('tbody tr').first(),
  ).toBeVisible();
  const issues = (
    await new AxeBuilder({ page }).include('.player-hero-distribution').analyze()
  ).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(issues).toEqual([]);
  await panel.screenshot({ path: folder + '/player-distribution.png' });
  await panel.locator('tbody button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
test('counter role and sample filters operate on captured data without pretending to change the time window', async ({
  page,
}) => {
  const data = JSON.parse(
    readFileSync('evidence/tianyuan-parity-v021/reference/analysis-0.json', 'utf8'),
  );
  await page.route('**/api/tianyuan?*', async (route) => {
    const q = Object.fromEntries(new URL(route.request().url()).searchParams);
    if (q.kind !== 'analysis') {
      await route.fulfill({ status: 502, json: { error: '其他数据不在本用例范围' } });
      return;
    }
    await route.fulfill({
      json: {
        query: q,
        url: 'https://tianyuanzhiyi.com/api/hero/analysis?heroId=190',
        fetchedAt: '2026-10-20T00:00:00Z',
        rawSha256: 'fixture',
        cache: 'cached',
        data,
      },
    });
  });
  await dataHub(page);
  await page.getByRole('button', { name: '全英雄指标', exact: true }).click();
  await page.getByLabel('筛选全英雄详细统计').fill('诸葛亮');
  await page.getByRole('button', { name: '诸葛亮', exact: true }).click();
  await page.getByRole('button', { name: '克制与组合', exact: true }).click();
  const panel = page.locator('.relation-explorer');
  await expect(panel).toContainText('接口不提供历史日期切换');
  await panel.getByRole('combobox', { name: '关联英雄分路' }).selectOption('中路');
  await panel.getByRole('combobox', { name: '最低样本场次' }).selectOption('5000');
  const values = await panel.locator('tbody tr').allTextContents();
  expect(values.some((s) => s.includes('沈梦溪'))).toBe(true);
  expect(values.some((s) => s.includes('庄周'))).toBe(false);
  await panel.screenshot({ path: folder + '/counter-filters.png' });
});
test('BP clock expires once, pauses, restarts and resets on the next move without selecting heroes', async ({
  page,
}) => {
  await page.clock.install();
  const series = await seriesRoom(page);
  await series.getByRole('button', { name: '开始新系列赛', exact: true }).click();
  await series.getByRole('combobox', { name: '每手计时' }).selectOption('30');
  await series.getByRole('button', { name: '继续 BP', exact: true }).click();
  await page.clock.fastForward(31000);
  await expect(series.getByLabel('本手剩余时间')).toHaveText('0 秒 · 暂停');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('kaiju.bp.series.v1')!).games[0].session.moves.length,
    ),
  ).toBe(0);
  await series.getByRole('button', { name: '重新计时并继续' }).click();
  await page.clock.fastForward(3000);
  await expect(series.getByLabel('本手剩余时间')).toHaveText('27 秒');
  const select = series.getByLabel('本轮英雄', { exact: true });
  await select.selectOption((await select.locator('option').nth(1).getAttribute('value'))!);
  await series.getByRole('button', { name: '确认本轮', exact: true }).click();
  await expect(series.getByLabel('本手剩余时间')).toHaveText('30 秒');
  await series.getByRole('button', { name: '暂停 BP 计时' }).click();
  await page.clock.fastForward(10000);
  await expect(series.getByLabel('本手剩余时间')).toHaveText('30 秒 · 暂停');
});
test('series edits cancel safely, validate incomplete history and preserve a restorable original; server save detects conflicts', async ({
  page,
}) => {
  test.setTimeout(90000);
  const series = await seriesRoom(page);
  await series.getByRole('combobox', { name: '新系列赛赛制' }).selectOption('3');
  await series.getByRole('combobox', { name: '新系列赛决胜局规则' }).selectOption('reset');
  await series.getByRole('button', { name: '开始新系列赛', exact: true }).click();
  for (let i = 0; i < 20; i++) {
    const select = series.getByLabel('本轮英雄', { exact: true });
    await select.selectOption((await select.locator('option').nth(1).getAttribute('value'))!);
    await series.getByRole('button', { name: '确认本轮', exact: true }).click();
  }
  await series.getByRole('button', { name: '记录 队伍 1 本局获胜', exact: true }).click();
  await series.getByRole('button', { name: '进入下一局', exact: true }).click();
  const before = await page.evaluate(() => localStorage.getItem('kaiju.bp.series.v1'));
  await series.getByText('查看各局选禁记录', { exact: true }).click();
  await series.getByRole('button', { name: '修改第 1 局', exact: true }).click();
  await series.getByRole('button', { name: '撤回一步', exact: true }).click();
  await series.getByRole('button', { name: '校验并保留后续局' }).click();
  await expect(series.locator('.series-editor [role=alert]')).toContainText('历史 BP 不完整');
  await series.getByRole('button', { name: '取消修改' }).click();
  expect(await page.evaluate(() => localStorage.getItem('kaiju.bp.series.v1'))).toBe(before);
  await series.getByText('查看各局选禁记录', { exact: true }).click();
  await series.getByRole('button', { name: '修改第 1 局', exact: true }).click();
  await series.getByRole('combobox', { name: '修改本局结果' }).selectOption('1');
  await series.getByRole('button', { name: '校验并保留后续局' }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('kaiju.bp.series.v1')!).games[0].winner,
    ),
  ).toBe(1);
  await series.getByRole('button', { name: '恢复修改前备份' }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('kaiju.bp.series.v1')!).games[0].winner,
    ),
  ).toBe(0);
  await series.locator('.series-server-save summary').click();
  await series.getByRole('button', { name: '保存当前系列赛到服务器' }).click();
  await expect(series.locator('.series-server-save')).toContainText('BO3 / 2 局');
  await page.evaluate(async () => {
    const r = await (await fetch('/api/pro/bp-series')).json();
    await fetch('/api/pro/bp-series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: r.owner, expected: r.revision, series: r.series }),
    });
  });
  await series.getByRole('button', { name: '保存当前系列赛到服务器' }).click();
  await expect(series.locator('.series-server-save [role=alert]')).toContainText('另一窗口');
  const invalid = await page.evaluate(async () => {
    const r = await (await fetch('/api/pro/bp-series')).json();
    const post = async (body: unknown) =>
      (
        await fetch('/api/pro/bp-series', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).status;
    return {
      bad: await post({ owner: r.owner, expected: r.revision, series: { ...r.series, games: [] } }),
      wrongOwner: await post({ owner: 'other-account', expected: r.revision, series: r.series }),
      before: r.revision,
      after: (await (await fetch('/api/pro/bp-series')).json()).revision,
    };
  });
  expect(invalid.bad).toBe(400);
  expect(invalid.wrongOwner).toBe(409);
  expect(invalid.after).toBe(invalid.before);
  await series.screenshot({ path: folder + '/series-edit-and-save.png' });
});
test('synthetic OCR layout suggestions require explicit confirmation and never alter the hero pool', async ({
  page,
}) => {
  const before = await page.evaluate(
    async () => (await (await fetch('/api/workspace')).json()).pool,
  );
  await dataHub(page);
  await page.getByRole('button', { name: '对位与推荐', exact: true }).click();
  await page.locator('.match-screenshot summary').first().click();
  await page.route('**/api/pro/recognize-profile', (r) =>
    r.fulfill({
      json: {
        width: 1000,
        height: 600,
        sha256: 'synthetic-layout-test',
        engine: 'test-only',
        lines: [
          {
            text: '诸葛亮',
            confidence: 0.95,
            box: [
              [100, 100],
              [150, 100],
              [150, 120],
              [100, 120],
            ],
          },
          {
            text: '赵怀真',
            confidence: 0.95,
            box: [
              [700, 100],
              [750, 100],
              [750, 120],
              [700, 120],
            ],
          },
        ],
      },
    }),
  );
  await page
    .getByLabel('选择阵容截图', { exact: true })
    .setInputFiles('evidence/tianyuan-parity-v020/reference/bp-full-game.png');
  await page.getByRole('button', { name: '生成待核对位置草稿' }).click();
  await expect(page.getByLabel('查询阵营1中路', { exact: true })).toHaveValue('');
  await page.getByLabel('核对诸葛亮位置').selectOption('1:1');
  await page.getByLabel('核对赵怀真位置').selectOption('2:3');
  await page.getByRole('button', { name: '确认采用所选位置（替换对应查询条件）' }).click();
  await expect(page.getByLabel('查询阵营1中路', { exact: true })).toHaveValue('190');
  await expect(page.getByLabel('查询阵营2打野', { exact: true })).toHaveValue('544');
  expect(
    await page.evaluate(async () => (await (await fetch('/api/workspace')).json()).pool),
  ).toEqual(before);
});
