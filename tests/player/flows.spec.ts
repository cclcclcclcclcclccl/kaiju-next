import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { heroes, heroByName } from '../../src/player/catalog.ts';
import { emptyDraft } from '../../src/player/model.ts';
const id = (n: string) => heroByName(n).id;
test.beforeEach(async ({ page, request }) => {
  await request.post('/api/pool', { data: [] });
  await request.post('/api/draft', { data: emptyDraft() });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '下一局，从这里开始。' })).toBeVisible();
});
test('hero discovery uses real skills and persists the personal hero pool', async ({ page }) => {
  await page.locator('nav').getByRole('button', { name: '英雄图鉴', exact: true }).click();
  await expect(page.locator('.hero-card')).toHaveCount(heroes.length);
  await page.getByLabel('搜索英雄', { exact: true }).fill('小乔');
  await expect(page.locator('.hero-card')).toHaveCount(1);
  await page.getByRole('button', { name: '查看小乔资料', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('技能资料');
  await expect(page.locator('.skill-tabs')).toContainText(heroByName('小乔').skills[0].name);
  await page.getByRole('button', { name: '加入我的英雄池', exact: true }).click();
  await expect(page.getByLabel('英雄熟练度', { exact: true })).toBeVisible();
  await page.getByLabel('英雄熟练度', { exact: true }).selectOption('main');
  await expect(page.getByRole('status')).toContainText('英雄池已保存');
  await page.keyboard.press('Escape');
  await page.reload();
  await page
    .locator('nav')
    .getByRole('button', { name: /我的英雄池/ })
    .click();
  await expect(page.getByLabel('小乔熟练度')).toHaveValue('main');
});
test('draft changes and bans change candidates; a real plan exports and reopens', async ({
  page,
  request,
}) => {
  await request.post('/api/pool', {
    data: [
      { heroId: id('王昭君'), level: 'main' },
      { heroId: id('小乔'), level: 'comfortable' },
    ],
  });
  await page.reload();
  await page.getByRole('button', { name: '体验一局示例', exact: true }).click();
  await expect(page.locator('.recommend-card').first()).toContainText('王昭君');
  await page.getByRole('checkbox', { name: '只从我的英雄池里选' }).check();
  await expect(page.locator('.recommend-card')).toHaveCount(2);
  await page.getByRole('button', { name: '添加禁用英雄' }).click();
  await page.getByLabel('查找待选英雄').fill('王昭君');
  await page.locator('.hero-picker button').filter({ hasText: '王昭君' }).click();
  await expect(page.locator('.recommend-card')).toHaveCount(1);
  await expect(page.locator('.recommend-card')).toContainText('小乔');
  await page.getByRole('button', { name: '保存阵容', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('阵容已保存');
  await page.getByRole('button', { name: '保存备战卡', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('备战卡已保存');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出卡片', exact: true }).click();
  const file = await waiting;
  const text = readFileSync((await file.path())!, 'utf8');
  expect(text).toContain('小乔');
  expect(text).toContain('不是胜率预测');
  await page.getByRole('button', { name: 'AI 解读 · 未连接' }).click();
  await expect(page.getByRole('dialog')).toContainText('当前尚未配置');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '只从我的英雄池里选' })).toBeChecked();
  await expect(page.getByRole('button', { name: '取消禁用王昭君' })).toBeVisible();
  await page.getByRole('button', { name: '备战档案', exact: true }).click();
  await page.locator('.dialog .plan-list button').filter({ hasText: '小乔' }).first().click();
  await expect(page.locator('.recommend-card')).toContainText('小乔');
});
test('a match journal drives a real practice target, can be edited and survives refresh', async ({
  page,
}) => {
  await page.locator('nav').getByRole('button', { name: '对局手记', exact: true }).click();
  await page.getByRole('button', { name: '记录一局', exact: true }).click();
  await page.getByLabel('使用英雄', { exact: true }).selectOption(String(id('王昭君')));
  await page.getByLabel('击杀', { exact: true }).fill('6');
  await page.getByLabel('死亡', { exact: true }).fill('3');
  await page.getByLabel('助攻', { exact: true }).fill('12');
  await page.getByLabel('这局的复盘').fill('团战前没有等队友到场。');
  await page.getByLabel('下一局行动').fill('每次开团前看小地图，确认队友位置。');
  await page.getByRole('button', { name: '保存手记', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.match-entry').first()).toContainText('6');
  await page.getByRole('button', { name: '开局首页', exact: true }).click();
  await expect(page.locator('.focus-card')).toContainText('每次开团前看小地图');
  await page.locator('nav').getByRole('button', { name: '对局手记', exact: true }).click();
  await page
    .locator('.match-entry')
    .first()
    .getByRole('button', { name: /完成目标/ })
    .click();
  await expect(page.locator('.match-entry').first().locator('.next-action')).toHaveClass(
    /complete/,
  );
  await page
    .locator('.match-entry')
    .first()
    .getByRole('button', { name: '编辑王昭君对局' })
    .click();
  await page.getByLabel('下一局行动').fill('先等队友控制，再接二技能。');
  await page.getByRole('button', { name: '保存手记', exact: true }).click();
  await expect(page.locator('.match-entry').first().locator('.next-action')).not.toHaveClass(
    /complete/,
  );
  await page.reload();
  await page.locator('nav').getByRole('button', { name: '对局手记', exact: true }).click();
  await expect(page.locator('.match-entry').first()).toContainText('先等队友控制，再接二技能。');
});
test('mobile navigation, atlas and draft fit a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '展开导航' }).click();
  await page.locator('nav').getByRole('button', { name: '英雄图鉴', exact: true }).click();
  await page.getByLabel('搜索英雄', { exact: true }).fill('李白');
  await page.getByRole('button', { name: '查看李白资料' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '展开导航' }).click();
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  await page.getByRole('button', { name: '载入教学阵容' }).click();
  await page.getByRole('button', { name: '选择我方中路' }).click();
  await page.getByLabel('查找待选英雄').fill('小乔');
  await page.locator('.hero-picker button').filter({ hasText: '小乔' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mkdirSync('evidence/reference-informed/screenshots', { recursive: true });
  await page.screenshot({
    path: 'evidence/reference-informed/screenshots/draft-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '展开导航' }).click();
  await page.getByRole('button', { name: '开局首页', exact: true }).click();
  await expect(page.getByRole('heading', { name: '下一局，从这里开始。' })).toBeVisible();
  await expect(page.locator('.focus-card')).toBeVisible();
});
test('accessibility audits cover homepage, draft and mobile hero detail', async ({ page }) => {
  const audits: {
    stage: string;
    violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'];
    incomplete: number;
  }[] = [];
  const audit = async (stage: string) => {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    audits.push({ stage, violations: result.violations, incomplete: result.incomplete.length });
    writeFileSync(
      'evidence/reference-informed/accessibility-core.json',
      JSON.stringify(audits, null, 2),
    );
    expect(result.violations, stage).toEqual([]);
  };
  await audit('desktop home');
  await page.getByRole('button', { name: '体验一局示例', exact: true }).click();
  await audit('desktop draft');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '查看技能与练习笔记' }).click();
  await audit('mobile hero dialog');
});

test('reopening a saved alternative preserves the chosen candidate', async ({ page }) => {
  await page.getByRole('button', { name: '体验一局示例', exact: true }).click();
  const alternative = page.locator('.recommend-card').nth(1);
  const name = (await alternative.locator('h3').innerText()).trim();
  await alternative.click();
  await page.getByRole('button', { name: '保存备战卡', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('备战卡已保存');
  await page.locator('.recommend-card').first().click();
  await page.getByRole('button', { name: '备战档案', exact: true }).click();
  await page.locator('.dialog .plan-list button').filter({ hasText: name }).first().click();
  await expect(page.locator('.recommend-card.selected')).toContainText(name);
});

test('AI feedback displays valid output and discards a response for an outdated lineup', async ({
  page,
}) => {
  await page.route('**/api/status', (route) =>
    route.fulfill({
      json: {
        product: '开局 NEXT',
        version: '0.3.0',
        heroCount: heroes.length,
        modelConfigured: true,
      },
    }),
  );
  let release!: () => void;
  const pending = new Promise<void>((r) => {
    release = r;
  });
  let calls = 0;
  await page.route('**/api/coach', async (route) => {
    if (++calls === 1) await pending;
    await route.fulfill({
      json: {
        headline: '受控模拟解读',
        steps: ['先处理兵线', '等队友跟进', '开团前看地图'],
        caution: '这是浏览器协议测试',
        source: heroByName('王昭君').source,
      },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: '体验一局示例', exact: true }).click();
  await page.getByRole('button', { name: 'AI 展开解读', exact: true }).click();
  await expect(page.getByRole('button', { name: '正在生成解读…', exact: true })).toBeDisabled();
  await page.locator('.recommend-card').nth(1).click();
  const response = page.waitForResponse('**/api/coach');
  release();
  await response;
  await expect(page.locator('.ai-result')).toHaveCount(0);
  await page.getByRole('button', { name: 'AI 展开解读', exact: true }).click();
  await expect(page.locator('.ai-result')).toContainText('受控模拟解读');
  await page.getByLabel('我的位置', { exact: true }).selectOption('游走');
  await expect(page.locator('.ai-result')).toHaveCount(0);
});
