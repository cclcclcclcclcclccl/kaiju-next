import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { scenarios } from '../src/core/scenarios.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('本地服务已连接', { exact: true })).toBeVisible();
});
test('complete workflow: verify, replay, compare, apply, reverify, save and reopen history', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: '开始验证', exact: true }).click();
  await expect(page.getByRole('heading', { name: '4 步之后，金币多出了 1。' })).toBeVisible();
  await page.locator('.trace-step').last().click();
  await expect(page.locator('.inventory-row').first()).toContainText('13');
  await page.getByRole('button', { name: '比较修复方案' }).click();
  await expect(page.locator('.repair-card')).toHaveCount(2);
  await expect(page.locator('.repair-card').first()).toContainText('原路径不再违反约束');
  mkdirSync('evidence/screenshots', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'evidence/screenshots/desktop-workbench.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.locator('.repair-card').first().getByRole('button', { name: '载入此方案' }).click();
  await expect(page.getByLabel('出售金属产出金币')).toHaveValue('6');
  await expect(page.locator('.stale-notice')).toBeVisible();
  await page.getByRole('button', { name: '重新验证', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '在本次搜索范围内，没有找到违规路径。' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '保存规则', exact: true }).click();
  await expect(page.getByText('实验规则已保存，可在「我的规则」中重新打开。')).toBeVisible();
  await page
    .locator('.main-nav')
    .getByRole('button', { name: /实验记录/ })
    .click();
  await expect(page.locator('.history-table > button').first()).toContainText('范围内未发现反例');
  await page.locator('.history-table > button').first().click();
  await expect(page.getByLabel('出售金属产出金币')).toHaveValue('6');
  await expect(
    page.getByRole('heading', { name: '在本次搜索范围内，没有找到违规路径。' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('imports a genuinely changed economy, rejects malformed input and exports an evidence report', async ({
  page,
}) => {
  await page.getByRole('button', { name: '导入 / 编辑' }).click();
  await page.getByLabel('完整规则 JSON').fill('{ broken');
  await page.getByRole('button', { name: '载入规则', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('JSON 格式不完整');
  const model = structuredClone(scenarios[0].model);
  model.title = '新的工坊规则';
  model.actions[0].cost.gold = 2;
  await page.getByLabel('完整规则 JSON').fill(JSON.stringify(model));
  await page.getByRole('button', { name: '载入规则', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '开始验证', exact: true }).click();
  await expect(page.getByRole('heading', { name: '4 步之后，金币多出了 3。' })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出报告' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toContain('验证报告.md');
  const report = readFileSync((await download.path())!, 'utf8');
  expect(report).toContain('规则 SHA-256');
  expect(report).toContain('新的工坊规则');
  expect(report).toContain('15');
  await page.getByLabel('出售金属产出金币').fill('4');
  await expect(page.locator('.stale-notice')).toBeVisible();
  await expect(page.getByRole('button', { name: '比较修复方案' })).toBeDisabled();
});
test('mobile layout, false-positive control and honest disconnected model state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /旅人的行囊/ }).click();
  await page.getByRole('button', { name: '开始验证', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '在本次搜索范围内，没有找到违规路径。' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: 'evidence/screenshots/mobile-workbench.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '从文字开始' }).click();
  await expect(page.getByText('模型服务尚未连接', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '生成候选规则' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('saved rules and the guide are navigable without losing the current draft', async ({
  page,
}) => {
  await page.getByLabel('购买矿石消耗金币').fill('4');
  await page.getByRole('button', { name: '保存规则', exact: true }).click();
  await expect(page.getByText('实验规则已保存，可在「我的规则」中重新打开。')).toBeVisible();
  await page
    .locator('.main-nav')
    .getByRole('button', { name: /我的规则/ })
    .click();
  await expect(page.getByRole('dialog', { name: '我的规则' })).toBeVisible();
  await page.locator('.saved-projects button').first().click();
  await expect(page.getByLabel('购买矿石消耗金币')).toHaveValue('4');
  await page.getByRole('button', { name: '查看使用指南' }).click();
  await expect(page.getByRole('heading', { name: '这些边界，要和结论一起看。' })).toBeVisible();
  await page
    .locator('.main-nav')
    .getByRole('button', { name: /规则实验室/ })
    .click();
  await expect(page.getByLabel('购买矿石消耗金币')).toHaveValue('4');
  await page.reload();
  await expect(page.getByLabel('购买矿石消耗金币')).toHaveValue('4');
});
