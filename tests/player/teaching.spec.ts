import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const dir = process.env.KAIJU_EVIDENCE_DIR
  ? process.env.KAIJU_EVIDENCE_DIR + '/teaching'
  : 'evidence/teaching-v024/browser';
test.beforeEach(async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  await page.goto('/');
  const search = page.getByRole('textbox', { name: '全局搜索英雄或功能' });
  await search.fill('教学');
  await search.press('Enter');
  await expect(page.getByRole('region', { name: '教学资料与决策练习' })).toBeVisible();
});

test('common cards are visible and exportable; hero changes clear incompatible lane filters', async ({
  page,
}) => {
  const panel = page.getByRole('region', { name: '教学资料与决策练习' });
  await expect(panel.getByRole('heading', { name: '通用决策检查卡 · 3' })).toBeVisible();
  await expect(panel.getByLabel('资料排序', { exact: true })).toHaveValue('studied');
  await expect(panel.locator('.teaching-sources article').first()).toContainText('已研读文字');
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出带出处的练习卡' }).click();
  const result = await download;
  expect(result.suggestedFilename()).toContain('通用');
  const packet = JSON.parse(readFileSync((await result.path())!, 'utf8'));
  expect(packet.cards).toHaveLength(3);
  expect(packet.cards.every((c: { heroIds: number[] }) => c.heroIds.length === 0)).toBe(true);
  await panel.getByLabel('学习英雄', { exact: true }).selectOption('190');
  await panel.getByLabel('学习分路', { exact: true }).selectOption('中路');
  await panel.getByLabel('学习英雄', { exact: true }).selectOption('184');
  await expect(panel.getByLabel('学习分路', { exact: true })).toHaveValue('');
  await expect(panel.locator('.teaching-lessons')).toContainText('蔡文姬：');
  await expect(panel.getByLabel('学习分路', { exact: true }).locator('option')).toHaveText([
    '全部分路',
    '游走',
  ]);
  await panel.getByLabel('研读范围', { exact: true }).selectOption('metadata');
  await panel.getByRole('button', { name: '重置教学筛选' }).click();
  await expect(panel.getByLabel('学习英雄', { exact: true })).toHaveValue('0');
  await expect(panel.getByLabel('研读范围', { exact: true })).toHaveValue('');
  await expect(panel.locator('.teaching-lessons > details')).toHaveCount(3);
});

test('hero tiles move focus to the selected learning content', async ({ page }) => {
  const panel = page.getByRole('region', { name: '教学资料与决策练习' });
  await panel.locator('.teaching-coverage > summary').click();
  await panel.getByLabel('查找已整理英雄').fill('镜');
  await panel.locator('.teaching-hero-grid button').click();
  await expect(panel.getByRole('heading', { name: /适合当前英雄与分路的检查卡/ })).toBeFocused();
  await expect(panel.locator('.teaching-lessons summary').first()).toContainText('镜：');
});
test('all discovered heroes can open their own card; conflicts and candidate-only boundaries are visible', async ({
  page,
}) => {
  const inventory = JSON.parse(readFileSync('evidence/teaching-v024/inventory.json', 'utf8'));
  const panel = page.getByRole('region', { name: '教学资料与决策练习' });
  await expect(panel).toContainText('74 / 74 位已整理基础检查卡');
  for (const h of inventory.heroes) {
    await panel.getByLabel('学习英雄', { exact: true }).selectOption(String(h.heroId));
    await expect(panel.locator('.teaching-lessons summary').first()).toContainText(h.name + '：');
  }
  await panel.locator('.teaching-coverage > summary').click();
  await panel.getByLabel('查找已整理英雄').fill('蔡文姬');
  await panel.locator('.teaching-hero-grid button').click();
  await expect(panel.getByLabel('学习英雄', { exact: true })).toHaveValue('184');
  await expect(panel.getByRole('complementary', { name: '资料版本冲突' })).toContainText(
    '不采纳旧说法',
  );
  await panel.locator('.teaching-lessons > details > summary').first().click();
  await expect(panel.locator('.teaching-lessons')).toContainText('最低血量');
  await panel.locator('.teaching-excerpts > summary').click();
  await expect(panel.locator('.teaching-excerpts')).toContainText('忘忧曲');
  await panel.locator('.teaching-candidates > summary').click();
  await expect(panel.locator('.teaching-candidates')).toContainText('不表示已观看');
  const d = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出带出处的练习卡' }).click();
  const packet = JSON.parse(readFileSync((await (await d).path())!, 'utf8'));
  expect(packet.cards[0].sourceConflict).toContain('不采纳旧说法');
  const issues = (
    await new AxeBuilder({ page }).include('.teaching-library').analyze()
  ).violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''));
  expect(issues).toEqual([]);
  await panel.screenshot({ path: dir + '/coverage-conflict.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await expect(page.locator('.sidebar')).toHaveAttribute('inert', '');
  await panel.locator('.teaching-coverage > summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/coverage-mobile.png', animations: 'disabled' });
  expect(
    await page.locator('.sidebar').evaluate((e) => e.getBoundingClientRect().right),
  ).toBeLessThanOrEqual(0);
});
test('discoverable teaching library retains source status, filters by hero/lane, exports evidence and fits mobile', async ({
  page,
  request,
}) => {
  const before = (await (await request.get('/api/workspace')).json()).pool;
  const panel = page.getByRole('region', { name: '教学资料与决策练习' });
  await expect(panel).toContainText('25 个视频资料');
  await panel.getByLabel('学习英雄', { exact: true }).selectOption('190');
  await panel.getByLabel('学习分路', { exact: true }).selectOption('中路');
  await expect(panel.locator('.teaching-lessons')).toContainText('诸葛亮：进场前检查印记');
  await expect(panel.locator('.teaching-lessons')).not.toContainText('赵怀真');
  await expect(panel.locator('.teaching-lessons')).not.toContainText('入侵前');
  await panel.locator('.teaching-lessons summary').first().click();
  await expect(panel.locator('.teaching-lessons')).toContainText('挡弹者');
  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出带出处的练习卡' }).click();
  const packet = JSON.parse(readFileSync((await (await downloadPromise).path())!, 'utf8'));
  expect(packet.cards).toHaveLength(1);
  expect(packet.cards[0].source.url).toContain('/190.json');
  expect(packet.cards[0].source.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
  await panel.getByLabel('学习分路', { exact: true }).selectOption('打野');
  await expect(panel.locator('.teaching-lessons')).toContainText('入侵前');
  await panel.getByLabel('研读范围').selectOption('metadata');
  await expect(panel.locator('.teaching-sources')).toContainText('待研读');
  await expect(panel.locator('.teaching-sources')).not.toContainText('已研读文字');
  const issues = (
    await new AxeBuilder({ page }).include('.teaching-library').analyze()
  ).violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''));
  expect(issues).toEqual([]);
  await panel.screenshot({ path: dir + '/desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sidebar')).toHaveAttribute('inert', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: dir + '/mobile.png', animations: 'disabled' });
  expect((await (await request.get('/api/workspace')).json()).pool).toEqual(before);
});
test('uncovered hero and role remain empty rather than borrowing another hero lesson', async ({
  page,
}) => {
  const panel = page.getByRole('region', { name: '教学资料与决策练习' });
  await panel.getByLabel('学习英雄', { exact: true }).selectOption({ label: '鲁班七号' });
  await panel.getByLabel('学习分路', { exact: true }).selectOption('发育路');
  await expect(panel).toContainText('还没有已研读的专属检查卡');
  await expect(panel.getByRole('link', { name: '高播放教学' })).toHaveAttribute(
    'href',
    /order=click/,
  );
  await expect(panel.getByRole('button', { name: '导出带出处的练习卡' })).toHaveCount(0);
});

test('hero guide and replay both surface matching lessons and reviewed video scope', async ({
  page,
}) => {
  const search = page.getByRole('textbox', { name: '全局搜索英雄或功能' });
  await search.fill('赵怀真');
  await search.press('Enter');
  const dialog = page.getByRole('dialog');
  const guide = dialog.getByRole('region', { name: '教学资料与决策练习' });
  await expect(guide).toContainText('赵怀真：把攻防循环');
  await guide.locator('.teaching-lessons summary').first().click();
  await expect(guide).toContainText('共 7 帧');
  await page.keyboard.press('Escape');
  await search.fill('录像复盘');
  await search.press('Enter');
  await page.getByLabel('复盘英雄', { exact: true }).selectOption('190');
  const panel = page.getByRole('region', { name: '教学资料与决策练习' });
  await expect(panel).toContainText('诸葛亮：进场前检查印记');
  await expect(panel.locator('.teaching-lessons')).not.toContainText('赵怀真');
});
