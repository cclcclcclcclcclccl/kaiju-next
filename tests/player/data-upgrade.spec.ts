import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { emptyProfile } from '../../src/player/pro/model.ts';
const folder = process.env.PLAYER_TEST_EVIDENCE_DIR ?? 'evidence/data-upgrade';
test('actual local screenshot OCR needs confirmation, persists records and feeds the pool', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  mkdirSync(folder, { recursive: true });
  await request.post('/api/pro/profile', { data: emptyProfile() });
  await request.post('/api/pool', { data: [] });
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '玩家档案', exact: true }).click();
  await expect(page.locator('.manual-profile')).not.toHaveAttribute('open');
  await page
    .getByLabel('上传英雄数据截图')
    .setInputFiles('evidence/data-upgrade/ocr-synthetic-fixture.png');
  await page.getByRole('button', { name: '识别这张截图', exact: true }).click();
  await expect(page.getByLabel('识别值累计场次', { exact: true })).toHaveValue('230', {
    timeout: 50000,
  });
  await expect(page.getByLabel('识别值累计胜率 %', { exact: true })).toHaveValue('57.83');
  await expect(page.getByLabel('确认截图英雄')).toHaveValue('131');
  await page.getByLabel('截图数据日期', { exact: true }).fill('2026-10-11');
  expect((await (await request.get('/api/pro')).json()).profile.heroes).toHaveLength(0);
  await page.screenshot({ path: folder + '/ocr-review.png', fullPage: true });
  await page.getByRole('button', { name: '确认并保存 5 个字段', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已将核对后的截图数据保存');
  const record = (await (await request.get('/api/pro')).json()).profile.heroes[0];
  expect(record.games).toBe(230);
  expect(record.power).toBe(9500);
  expect(record.dataSource).toBe('screenshot');
  expect(record.observedOn).toBe('2026-10-11');
  expect(record.wins).toBeUndefined();
  await page.reload();
  await page
    .locator('nav')
    .getByRole('button', { name: /我的英雄池/ })
    .click();
  await expect(page.locator('.pool-record-summary')).toContainText('9500');
});
test('official resource cache supports equipment comparison, skin hero links and separated update environments', async ({
  page,
}) => {
  const data = JSON.parse(readFileSync('tests/fixtures/official-resources-20261012.json', 'utf8'));
  await page.route('**/api/resources', (route) => route.fulfill({ json: { data, stale: false } }));
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '装备与版本', exact: true }).click();
  await expect(page.locator('.equipment-card')).toHaveCount(data.equipment.length);
  await page.getByLabel('搜索装备').fill('抵抗之靴');
  await expect(page.locator('.equipment-card')).toHaveCount(1);
  await page.locator('.equipment-card').getByRole('button', { name: '加入对比' }).click();
  await expect(page.getByRole('region', { name: '装备对比' })).toContainText('抵抗之靴');
  await page.screenshot({ path: folder + '/equipment.png', fullPage: true });
  await page.getByRole('button', { name: '皮肤图录', exact: true }).click();
  await page.getByLabel('搜索皮肤').fill('烈焰狂欢');
  await expect(page.locator('.skin-card')).toHaveCount(1);
  await expect(page.locator('.skin-card')).toContainText('查看卢雅那皮肤使用率');
  await page.locator('.skin-card').getByRole('button', { name: '卢雅那 · 查看图鉴 ↗' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '皮肤', exact: true }).click();
  await expect(page.locator('#hero-skins')).toContainText('烈焰狂欢');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '版本动态', exact: true }).click();
  await expect(page.locator('.updates-list')).toContainText('10月12日');
  await expect(page.locator('.updates-list .trial')).toHaveCount(0);
  await page.getByLabel('公告环境').selectOption('体验服');
  await expect(page.locator('.updates-list')).toContainText('体验服');
  await page.screenshot({ path: folder + '/official-updates.png', fullPage: true });
});
test('new interfaces remain usable on mobile with no accessibility violations', async ({
  page,
}) => {
  const data = JSON.parse(readFileSync('tests/fixtures/official-resources-20261012.json', 'utf8'));
  await page.route('**/api/resources', (route) => route.fulfill({ json: { data, stale: false } }));
  await page.goto('/');
  for (const name of ['玩家档案', '分段梯度', '装备与版本']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('nav').getByRole('button', { name, exact: true }).click();
    if (name === '装备与版本') await expect(page.locator('.equipment-card').first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: folder + '/' + name + '-mobile.png', fullPage: true });
  }
});
test('full BP arena produces ten legal moves without overwriting current draft', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  const before = (await (await request.get('/api/workspace')).json()).draft;
  await page.locator('.bp-arena>summary').click();
  await page.getByRole('button', { name: '模拟完整 BP', exact: true }).click();
  await expect(page.locator('.arena-moves li')).toHaveCount(10, { timeout: 20000 });
  await expect(page.locator('.bp-arena')).toContainText('10 手合法');
  const after = (await (await request.get('/api/workspace')).json()).draft;
  expect(after).toEqual(before);
  await page.screenshot({ path: folder + '/bp-arena.png', fullPage: true });
});
