import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { scenarios } from '../src/core/scenarios.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始验证', exact: true })).toBeEnabled();
});

test('designer creates a resource and multi-resource action visually; dependencies are protected', async ({
  page,
}) => {
  await page.getByRole('button', { name: '编辑资源与标题' }).click();
  await page.getByLabel('实验名称', { exact: true }).fill('含燃料的制造系统');
  await page.getByRole('button', { name: '添加资源', exact: true }).click();
  await page.getByLabel('资源 4 名称').fill('燃料');
  await page.getByLabel('资源 4 初始库存').fill('5');
  await page.getByRole('button', { name: '保存资源设置' }).click();
  await expect(page.getByRole('heading', { name: '含燃料的制造系统' })).toBeVisible();
  await page.getByRole('button', { name: '编辑熔炼金属资源' }).click();
  await page.getByLabel('动作消耗燃料').fill('1');
  await page.getByRole('button', { name: '保存动作', exact: true }).click();
  await expect(page.getByLabel('熔炼金属消耗燃料')).toHaveValue('1');
  await expect(page.locator('.restore-selector').getByLabel('燃料')).toBeChecked();
  await page.getByRole('button', { name: '编辑资源与标题' }).click();
  await page.getByRole('button', { name: '移除资源燃料' }).click();
  await expect(page.getByRole('alert')).toContainText('熔炼金属');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '删除购买矿石', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('保留用例引用');
  await page.locator('.restore-selector').getByLabel('燃料').uncheck();
  await expect(page.locator('.scope-warning')).toContainText('不等同于闭合套利');
  await page.getByRole('button', { name: '开始验证', exact: true }).click();
  await expect(page.getByRole('heading', { name: '4 步之后，金币多出了 1。' })).toBeVisible();
  await expect(page.locator('.result-scope')).toContainText('燃料');
  await page.locator('.trace-step').last().click();
  await expect(page.locator('.inventory-row').last()).toContainText('-1');
});

test('a custom preservation test exposes baseline failure and survives save, reload and undo', async ({
  page,
}) => {
  await page.getByRole('button', { name: '添加保留用例' }).click();
  await page.getByLabel('用例名称', { exact: true }).fill('一份矿石的购买成本');
  await page.getByLabel('用例初始金币').fill('3');
  await page.getByLabel('最低矿石').fill('2');
  await expect(page.locator('.playtest-preview')).toContainText('当前规则未通过');
  await expect(page.locator('.playtest-preview')).toContainText('实际 1');
  await page.getByLabel('最低矿石').fill('1');
  await expect(page.locator('.playtest-preview')).toContainText('当前规则通过');
  await page.getByRole('button', { name: '保存保留用例' }).click();
  await expect(page.locator('.playtest-row')).toHaveCount(2);
  await page.getByLabel('购买矿石消耗金币').fill('4');
  await expect(page.locator('.playtest-row').nth(1)).toContainText('当前未通过');
  await page.getByRole('button', { name: '撤销修改', exact: true }).click();
  await expect(page.getByLabel('购买矿石消耗金币')).toHaveValue('3');
  await page.getByRole('button', { name: '撤销修改', exact: true }).click();
  await expect(page.locator('.playtest-row')).toHaveCount(1);
  await page.getByLabel('最多连续操作').fill('8');
  await page.getByRole('button', { name: '保存规则', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('实验规则已保存');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hengju-draft-v1')!));
  await page.reload();
  await expect(page.getByLabel('最多连续操作')).toHaveValue('8');
  await page.getByLabel('购买矿石消耗金币').fill('4');
  await page.getByRole('button', { name: '保存规则', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('实验规则已保存');
  const resaved = await page.evaluate(() => JSON.parse(localStorage.getItem('hengju-draft-v1')!));
  expect(resaved.projectId).toBe(saved.projectId);
});

test('downloaded evidence is independently checked and imports its exact search bounds', async ({
  page,
}) => {
  await page.getByLabel('最多连续操作').fill('8');
  await page.getByRole('button', { name: '开始验证', exact: true }).click();
  await expect(page.getByRole('heading', { name: '4 步之后，金币多出了 1。' })).toBeVisible();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出实验凭证' }).click();
  const downloaded = await waiting;
  const file = (await downloaded.path())!;
  const checked = JSON.parse(
    execFileSync(process.execPath, ['scripts/verify-evidence.mjs', file], { encoding: 'utf8' }),
  );
  expect(checked.witnessReplayed).toBe(true);
  expect(checked.playtests[0].status).toBe('pass');
  const evidence = readFileSync(file, 'utf8');
  writeFileSync('evidence/checks/portable-evidence.json', evidence);
  writeFileSync(
    'evidence/checks/portable-evidence-verification.json',
    JSON.stringify(checked, null, 2),
  );
  await page.getByRole('button', { name: /旅人的行囊/ }).click();
  await page.getByRole('button', { name: '导入 \/ 编辑' }).click();
  await page.getByLabel('完整规则 JSON').fill(evidence);
  await page.getByRole('button', { name: '载入规则', exact: true }).click();
  await expect(page.getByLabel('最多连续操作')).toHaveValue('8');
  await expect(page.getByRole('button', { name: '开始验证', exact: true })).toBeVisible();
  await expect(page.locator('.result-card')).toHaveCount(0);
});

test('mobile authoring dialogs fit the viewport and pass automated accessibility checks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const audits = [];
  for (const name of ['编辑资源与标题', '编辑熔炼金属资源', '添加保留用例']) {
    await page.getByRole('button', { name, exact: true }).click();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    audits.push({
      stage: name,
      violations: result.violations,
      incomplete: result.incomplete.length,
    });
    expect(result.violations, name).toEqual([]);
    expect(
      await page.evaluate(() => {
        const dialog = document.querySelector('.modal')!;
        return (
          document.documentElement.scrollWidth <= innerWidth &&
          dialog.scrollWidth <= dialog.clientWidth + 1
        );
      }),
    ).toBe(true);
    await page.screenshot({
      path: 'evidence/screenshots/mobile-authoring-' + audits.length + '.png',
      fullPage: true,
    });
    await page.keyboard.press('Escape');
  }
  writeFileSync('evidence/checks/accessibility-authoring.json', JSON.stringify(audits, null, 2));
});

test('candidate preview exposes numbers and requires semantic review; in-flight input is stable', async ({
  page,
}) => {
  await page.route('**/api/status', (route) =>
    route.fulfill({ json: { version: '0.2.0', modelConfigured: true, storage: 'sqlite' } }),
  );
  let finish!: () => void;
  const released = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/generate', async (route) => {
    await released;
    await route.fulfill({
      json: {
        status: 'candidate',
        model: scenarios[0].model,
        notes: [],
        evidence: [{ path: 'actions.2.gain.gold', quote: '每次出售获得 7 金币' }],
      },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: '从文字开始' }).click();
  await page.getByLabel('你的规则与验证意图').fill('这里是合成测试输入，每次出售获得 7 金币');
  await page.getByRole('button', { name: '生成候选规则' }).click();
  await expect(page.getByLabel('你的规则与验证意图')).toBeDisabled();
  finish();
  await expect(page.locator('.candidate-model')).toContainText('3 金币 → 1 矿石');
  await expect(page.locator('.evidence-list')).toContainText('= 7');
  await expect(page.getByRole('button', { name: '确认并载入候选' })).toBeDisabled();
  await page.getByRole('checkbox', { name: '我已核对候选数值、动作和验证约束' }).check();
  await page.getByRole('button', { name: '确认并载入候选' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
