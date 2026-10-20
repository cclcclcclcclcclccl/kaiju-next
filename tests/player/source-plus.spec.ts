import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const folder = process.env.KAIJU_EVIDENCE_DIR ?? 'evidence/tianyuan-parity-v020/browser';
const manifest = JSON.parse(readFileSync('tests/fixtures/source-plus/manifest.json', 'utf8'));
test.beforeEach(async ({ page }) => {
  mkdirSync(folder, { recursive: true });
  await page.clock.setFixedTime(new Date('2026-10-19T06:00:00Z'));
  await page.route('**/api/source-plus?*', async (route) => {
    const q = Object.fromEntries(new URL(route.request().url()).searchParams);
    if (!manifest[q.kind]) {
      await route.fulfill({ status: 502, json: { error: '本用例未采集此查询的真实夹具' } });
      return;
    }
    const raw = readFileSync(
        'tests/fixtures/source-plus/' +
          (q.kind === 'heroEquip' && q.s1 ? 'heroEquipLocked' : q.kind) +
          '.json',
        'utf8',
      ),
      data = JSON.parse(raw);
    await route.fulfill({
      json: {
        source: '天元之弈数据站（固定真实来源测试夹具）',
        sourceClass: 'third-party-public',
        url: manifest[q.kind].url,
        query: q,
        fetchedAt: '2026-10-19T06:00:00Z',
        rawSha256: createHash('sha256').update(raw).digest('hex'),
        cache: 'cached',
        data: q.kind === 'allStats' ? { rows: data } : data,
      },
    });
  });
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '数据与工具', exact: true }).click();
});
test('public dashboard, full stats, equipment drilldown and library display captured values with provenance', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.locator('.data-hub')).toContainText('48.85%');
  for (const label of ['红蓝选禁榜', '英雄战力榜', '五路巅峰门槛', '巅峰玩家', '召唤师技能']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.data-hub tbody tr').first()).toBeVisible();
  }
  await page.getByRole('button', { name: '闪现', exact: true }).click();
  await expect(page.getByRole('table', { name: '闪现使用英雄' })).toBeVisible();
  await page.getByRole('button', { name: '全英雄指标', exact: true }).click();
  await page.getByLabel('指标组').selectOption('fight');
  await expect(page.getByRole('table', { name: '全英雄详细统计' })).toContainText('分均输出');
  await page.getByRole('button', { name: '装备全局数据', exact: true }).click();
  await expect(page.locator('.data-hub')).toContainText('498.08');
  await page.getByRole('button', { name: '抵抗之靴', exact: true }).click();
  await expect(page.getByRole('table', { name: '全局装备栏位' })).toContainText('77.02%');
  for (const label of ['英雄使用', '历史趋势', '英雄异动']) {
    await page
      .locator('.equipment-source-detail')
      .getByRole('button', { name: label, exact: true })
      .click();
    await expect(page.locator('.equipment-source-detail tbody tr').first()).toBeVisible();
  }
  await page.screenshot({ path: folder + '/equipment-detail.png', animations: 'disabled' });
  await page.getByRole('button', { name: '全皮肤库', exact: true }).click();
  await page.getByLabel('搜索皮肤库', { exact: true }).fill('诸葛亮 星域');
  await expect(page.locator('.plus-skin-card')).toHaveCount(1);
  await expect(page.locator('.plus-skin-card')).toContainText('50.73%');
  await page.locator('.plus-skin-card').click();
  await expect(page.getByRole('dialog')).toContainText('星域神启');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
test('public matchup distinguishes total matches from returned details and renders actual ten-player builds', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.getByRole('button', { name: '对位与推荐', exact: true }).click();
  await page.getByLabel('查询阵营1中路', { exact: true }).selectOption('190');
  await page.getByLabel('查询阵营2中路', { exact: true }).selectOption('521');
  await page.getByRole('button', { name: '查询真实样本', exact: true }).click();
  await expect(page.locator('.plus-metrics')).toContainText('2,022');
  await expect(page.locator('.plus-metrics')).toContainText('51.19%');
  await page
    .getByRole('button', { name: /查看对局/ })
    .first()
    .click();
  await expect(page.locator('.match-detail details')).toHaveCount(10);
  await page.locator('.match-detail details summary').first().click();
  await expect(page.locator('.match-detail .plus-item-list').first()).toContainText('圣杯');
  await page.screenshot({ path: folder + '/real-match.png', animations: 'disabled' });
  await page.getByLabel('查询阵营2中路', { exact: true }).selectOption('');
  await expect(page.locator('.match-detail')).toHaveCount(0);
  await expect(page.locator('.public-match-explorer .plus-metrics')).toHaveCount(0);
  await page.getByRole('button', { name: '共同克制与组合', exact: true }).click();
  await page.getByLabel('查询阵营1中路', { exact: true }).selectOption('190');
  await page.getByLabel('查询阵营1发育路', { exact: true }).selectOption('111');
  await page.getByRole('button', { name: '查询真实样本', exact: true }).click();
  await expect(page.getByRole('table', { name: '共同克制推荐' })).toContainText('露娜');
});
test('hero deep data handles eight real source panels and null jungle timing', async ({ page }) => {
  test.setTimeout(60000);
  await page.getByRole('button', { name: '全英雄指标', exact: true }).click();
  await page.getByLabel('筛选全英雄详细统计').fill('诸葛亮');
  await page.getByRole('button', { name: '诸葛亮', exact: true }).click();
  const panel = page.locator('.hero-source-details');
  await expect(panel.locator('svg')).toBeVisible();
  for (const label of [
    '选人顺序表现',
    '实战行为',
    '真实刷野路线',
    '调整历史',
    '战力门槛',
    '高光类型',
    '皮肤使用趋势',
  ]) {
    await panel.getByRole('button', { name: label, exact: true }).click();
    await expect(panel.locator('.source-proof').last()).toContainText('天元之弈');
    if (label === '真实刷野路线') await expect(panel).toContainText('未公布');
  }
  await panel.getByRole('button', { name: '条件出装', exact: true }).click();
  await panel
    .getByRole('table', { name: '条件出装第1栏', exact: true })
    .getByRole('button', { name: '噬神之书', exact: true })
    .click();
  await expect(panel.locator('.conditional-builds')).toContainText('59,524');
  await expect(panel.getByRole('table', { name: '条件出装第2栏', exact: true })).toContainText(
    '84.73%',
  );
  await panel.getByRole('button', { name: '清除装备条件', exact: true }).click();
  await expect(panel.locator('.conditional-builds .pro-notice')).toHaveCount(0);
  await panel.getByRole('button', { name: '长期趋势', exact: true }).click();
  await panel.screenshot({ path: folder + '/hero-trends.png', animations: 'disabled' });
});
test('activity window, calculator, source failure and phone layout remain explicit and usable', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.getByRole('button', { name: '活动动态', exact: true }).click();
  await expect(page.getByRole('table', { name: '返场投票榜' })).toContainText('愿照·众生和');
  await page.getByLabel('返场曲线指标').selectOption('ranks');
  await expect(page.locator('.plus-chart')).toBeVisible();
  await page.getByRole('button', { name: '活动互助口令', exact: true }).click();
  await expect(page.getByRole('table', { name: '活动互助口令' })).toContainText('孙策');
  await page.getByRole('button', { name: '战力试算', exact: true }).click();
  await expect(page.locator('.plus-metrics')).toContainText('12,584');
  await page.getByLabel('挑战赛胜场', { exact: true }).fill('13');
  await expect(page.locator('.data-hub')).toContainText('0–12');
  await page.getByLabel('挑战赛胜场', { exact: true }).fill('12');
  await expect(page.locator('.plus-metrics')).toContainText('19.2%');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: folder + '/calculator-mobile.png', animations: 'disabled' });
  expect(
    (
      await new AxeBuilder({ page })
        .include('.data-hub')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole('button', { name: '全局与榜单', exact: true }).click();
  await page.route('**/api/source-plus?*', (r) =>
    r.fulfill({ status: 502, json: { error: '测试来源暂不可用' } }),
  );
  await page.getByLabel('全局统计日').fill('2026-10-17');
  await expect(page.locator('.data-hub')).toContainText('测试来源暂不可用');
  await expect(page.locator('.plus-metrics')).toHaveCount(0);
});
test('BO series completes a game, persists scores and restricts heroes for the same team after swapping sides', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  await page.getByText('系列赛全局 BP · BO3 / BO5 / BO7 / BO9', { exact: true }).click();
  const series = page.locator('.series-bp');
  await series.getByRole('button', { name: '开始新系列赛', exact: true }).click();
  const panel = series.locator('.bp-rounds');
  for (let i = 0; i < 20; i++) {
    const select = panel.getByLabel('本轮英雄', { exact: true });
    await select.selectOption((await select.locator('option').nth(1).getAttribute('value'))!);
    await panel.getByRole('button', { name: '确认本轮', exact: true }).click();
  }
  await series.getByRole('button', { name: '记录 队伍 1 本局获胜', exact: true }).click();
  await series.getByRole('button', { name: '进入下一局', exact: true }).click();
  await expect(
    series.getByRole('heading', { name: '第 2 局 · 蓝方 队伍 2 / 红方 队伍 1', exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kaiju.bp.series.v1')!));
  expect(saved.games[1].session.unavailable.allies).toHaveLength(5);
  expect(saved.games[1].session.unavailable.enemies).toHaveLength(5);
  await page.reload();
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  await page.getByText('系列赛全局 BP · BO3 / BO5 / BO7 / BO9', { exact: true }).click();
  await expect(series).toContainText('第 2 局');
  await series.screenshot({ path: folder + '/series-game2.png', animations: 'disabled' });
});

test('extended controls retain query windows, trend fields, column visibility and explicit OCR failure', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.getByRole('button', { name: '五路巅峰门槛', exact: true }).click();
  await page.getByText('五路巅峰门槛历史', { exact: true }).click();
  await expect(page.getByRole('table', { name: '门槛历史明细' })).toContainText('2,704');
  await page.getByRole('button', { name: '全英雄指标', exact: true }).click();
  const requestPromise = page.waitForRequest(
    (r) => r.url().includes('/api/source-plus?') && r.url().includes('gameMode=8'),
  );
  await page.getByRole('combobox', { name: '统计分段', exact: true }).selectOption('8');
  await requestPromise;
  await page.getByText('显示列与表格导出', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'KDA', exact: true }).uncheck();
  await expect(page.getByRole('columnheader', { name: 'KDA', exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'KDA', exact: true }).check();
  await page.getByRole('button', { name: '活动动态', exact: true }).click();
  await page.getByRole('button', { name: '前 3 名曲线', exact: true }).click();
  await expect(page.locator('.plus-chart')).toHaveCount(3);
  await page.getByLabel('返场曲线指标').selectOption('share');
  await page.getByRole('button', { name: '清空曲线', exact: true }).click();
  await expect(page.locator('.plus-chart')).toHaveCount(0);
  await page.getByRole('button', { name: '对位与推荐', exact: true }).click();
  await page.locator('.match-screenshot summary').first().click();
  await page.route('**/api/pro/recognize-profile', (r) =>
    r.fulfill({ status: 503, json: { error: '识别服务测试失败' } }),
  );
  await page
    .getByLabel('选择阵容截图', { exact: true })
    .setInputFiles('evidence/tianyuan-parity-v020/reference/bp-full-game.png');
  await expect(page.locator('.match-screenshot [role=alert]')).toContainText('识别服务测试失败');
  await expect(page.getByLabel('查询阵营1中路', { exact: true })).toHaveValue('');
});
