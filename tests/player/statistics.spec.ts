import { test as base, expect, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { heroes } from '../../src/player/catalog.ts';

const dir = 'evidence/reference-informed';
const test = base.extend<{ owner: APIRequestContext }>({
  owner: async ({ request, page, playwright }, use) => {
    const registered = await request.post('/api/auth/register', {
      data: {
        username: 'scope_' + Date.now().toString(36),
        name: '口径测试账号',
        password: 'scope-test-only-123',
      },
    });
    expect(registered.ok()).toBe(true);
    const account = await registered.json();
    await page.addInitScript((a) => {
      localStorage.setItem('kaiju-token', a.token);
      localStorage.setItem('kaiju-user', a.user.id);
    }, account);
    const owner = await playwright.request.newContext({
      baseURL: 'http://127.0.0.1:4319',
      extraHTTPHeaders: { Authorization: 'Bearer ' + account.token },
    });
    await use(owner);
    await owner.dispose();
  },
});

test('mixed source metrics stay visible but cannot masquerade as a segment tier or a BP rate', async ({
  page,
  owner,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByRole('button', { name: '导入统计快照' }).click();
  await page.getByLabel('批次名称', { exact: true }).fill('混合口径测试（合成）');
  await page.getByLabel('录入数据分段').selectOption('巅峰千强');
  await page.getByLabel('游戏版本', { exact: true }).fill('TEST-ONLY');
  await page.getByLabel('数据发布者', { exact: true }).fill('自动化测试，不是真实数据');
  await page.getByLabel('统计来源', { exact: true }).fill('https://example.invalid/mixed');
  await page.getByLabel('胜率统计人群').selectOption('all');
  await page.getByLabel('胜率时间范围').selectOption('version');
  await page.getByLabel('录入英雄1', { exact: true }).selectOption('王昭君');
  await page.getByLabel('胜率 %第1行', { exact: true }).fill('52');
  await page.getByLabel('出场率 %第1行', { exact: true }).fill('80');
  await page.getByLabel('禁用率 %第1行', { exact: true }).fill('30');
  await page.getByLabel('场次（可空）第1行', { exact: true }).fill('5000');
  await page.getByRole('button', { name: '预览并核对' }).click();
  await expect(page.locator('.import-preview')).toContainText('胜率使用全分段样本');
  await page.getByRole('button', { name: '确认保存统计' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const row = page.locator('.pro-table tbody tr').first();
  await expect(row).toContainText('口径待核对');
  await expect(row.locator('td').nth(5)).toHaveText('—');
  await expect(row).not.toContainText('110.00%');
  const data = await (await owner.get('/api/pro')).json();
  expect(data.snapshots[0].winRateScope).toBe('all');
  expect(data.snapshots[0].denominator).toBe('unknown');
  await row.getByRole('button').click();
  await expect(page.getByRole('dialog')).toContainText('不生成分段梯度或参与 BP 评分');
  await expect(page.locator('.metric-strip')).toContainText('口径待核对');
});

test('history shows sourced percentage-point changes, excludes incompatible batches and works on a phone', async ({
  page,
  owner,
}) => {
  const mids = heroes.filter((h) => h.roles.includes('中路')).slice(0, 6);
  for (const [day, patch, delta] of [
    ['09', 'OTHER-PATCH', 12],
    ['10', 'TEST', 0],
    ['11', 'TEST', 2],
  ] as const) {
    const result = await owner.post('/api/pro/snapshot', {
      data: {
        title: '历史对比验收（合成） ' + day,
        segment: '巅峰千强',
        patch,
        startDate: '2026-10-' + day,
        endDate: '2026-10-' + day,
        sourceName: '合成测试，非游戏统计',
        sourceUrl: 'https://example.invalid/history',
        denominator: 'match',
        winRateScope: 'segment',
        winRateWindow: 'range',
        rows: mids.map((h, i) => ({
          heroId: h.id,
          role: '中路',
          winRate: 50 + i + delta,
          pickRate: i === 0 ? 1 : 10,
          banRate: 5,
          games: 5000,
        })),
      },
    });
    expect(result.ok(), await result.text()).toBe(true);
  }
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByLabel('统计分段', { exact: true }).selectOption('巅峰千强');
  const history = page.locator('.stat-history');
  await expect(history.locator('.history-deltas')).toContainText('+2.00');
  await expect(history.locator('.history-deltas')).toContainText('个百分点');
  await expect(
    page.getByLabel('历史对比基准').locator('option').filter({ hasText: '游戏版本不同' }),
  ).toHaveJSProperty('disabled', true);
  await expect(history.getByRole('img')).toHaveAttribute('aria-label', /2个已导入日期/);
  await page.getByLabel('历史趋势指标').selectOption('banRate');
  await expect(history.getByRole('img')).toHaveAttribute('aria-label', /禁用率历史/);
  await page.getByLabel('搜索梯度英雄').fill(mids[0].name + '，' + mids[1].name);
  const ranking = page.locator('main .pro-table').first().locator('tbody tr');
  await expect(ranking).toHaveCount(2);
  await page.getByRole('checkbox', { name: /隐藏出场率低于/ }).check();
  await expect(ranking).toHaveCount(1);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  mkdirSync(dir + '/screenshots', { recursive: true });
  await history.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: dir + '/screenshots/history-synthetic-desktop.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await history.scrollIntoViewIfNeeded();
  await history.screenshot({
    path: dir + '/screenshots/history-synthetic-mobile.png',
    animations: 'disabled',
  });
  writeFileSync(
    dir + '/accessibility-history.json',
    JSON.stringify({ violations: audit.violations, incomplete: audit.incomplete.length }, null, 2),
  );
  await ranking.first().getByRole('button').click();
  await expect(page.getByRole('dialog').locator('.stat-history .history-deltas')).toContainText(
    '+2.00',
  );
});
