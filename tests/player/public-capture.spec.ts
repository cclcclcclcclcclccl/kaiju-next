import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { extractPublicTable } from '../../src/player/pro/publicTable.ts';
import { heroes } from '../../src/player/catalog.ts';
const folder = process.env.PUBLIC_CAPTURE_EVIDENCE_DIR ?? 'evidence/public-capture';
async function openImport(page: any) {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByRole('button', { name: '导入统计快照', exact: true }).click();
  await page.getByRole('button', { name: '榜单截图识别', exact: true }).click();
  await page.getByLabel('选择榜单来源').selectOption('tianyuan');
}
test('real table screenshots merge without saving until review, then source stats persist and open correct atlas', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await openImport(page);
  const file = {
    name: 'page-a.png',
    mimeType: 'image/png',
    buffer: readFileSync('evidence/public-capture/source-table-20261011.png'),
  };
  await page.getByLabel('批量上传榜单截图').setInputFiles([file, { ...file, name: 'page-b.png' }]);
  await page.getByRole('button', { name: '识别 2 张榜单截图', exact: true }).click();
  await expect(page.locator('.table-capture')).toContainText('1 张重复图片', { timeout: 60000 });
  await expect(page.locator('.table-capture tbody tr')).toHaveCount(4);
  await expect(page.locator('.table-capture')).toContainText('2026-10-11');
  await expect(page.getByRole('button', { name: '将 4 行填入下方表格' })).toBeDisabled();
  await page.getByLabel('已核对榜单图片来源及数值').check();
  await page.getByRole('button', { name: '将 4 行填入下方表格' }).click();
  await expect(page.getByLabel('统计结束日期')).toHaveValue('2026-10-11');
  await page.getByLabel('录入数据分段').selectOption('巅峰千强');
  await page.getByLabel('胜率统计人群').selectOption('all');
  await page.getByLabel('胜率时间范围').selectOption('version');
  await page.getByLabel('批次名称', { exact: true }).fill('截图批次端到端验证');
  await page.getByRole('button', { name: '预览并核对', exact: true }).click();
  await expect(page.locator('.import-preview')).toContainText('4 行');
  await page.screenshot({ path: folder + '/batch-review.png', fullPage: true });
  await page.getByRole('button', { name: '确认保存统计', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = (await (await request.get('/api/pro')).json()).snapshots.find(
    (s: any) => s.title === '截图批次端到端验证',
  );
  expect(saved.rows).toHaveLength(4);
  expect(saved.rows.every((r: any) => r.games === undefined)).toBe(true);
  expect(saved.scopeNotes).toContain('SHA256');
  await page.getByLabel('看板依据').selectOption('source');
  await page.getByLabel('搜索全部英雄').fill('鲁班大师');
  await expect(page.locator('.tier-portrait')).toContainText('52.1%');
  await page.locator('.all-hero-ranks').getByRole('button', { name: '打开鲁班大师图鉴' }).click();
  await expect(page.getByRole('dialog').locator('.hero-insights')).toContainText('52.10%');
  await page.keyboard.press('Escape');
  await request.post('/api/pro/snapshot-remove', { data: { id: saved.id } });
});
test('conflicting values require an explicit selection; different dates cannot be merged', async ({
  page,
}) => {
  let count = 0;
  const base = extractPublicTable(
    JSON.parse(readFileSync('tests/fixtures/tianyuan-table-ocr.json', 'utf8')),
    heroes,
  );
  await page.route('**/api/pro/recognize-stat-table', async (route) => {
    count++;
    const r = structuredClone(base);
    r.sha256 = String(count).repeat(64);
    if (count % 2 === 0) r.rows[0].winRate = 49.1;
    if (count > 2 && count % 2 === 0) r.dataDates = ['2026-10-12'];
    await route.fulfill({ json: r });
  });
  await openImport(page);
  const file = {
    name: 'page-a.png',
    mimeType: 'image/png',
    buffer: readFileSync('evidence/public-capture/source-table-20261011.png'),
  };
  await page.getByLabel('批量上传榜单截图').setInputFiles([file, { ...file, name: 'page-b.png' }]);
  await page.getByRole('button', { name: '识别 2 张榜单截图' }).click();
  await expect(page.locator('.table-capture')).toContainText('待解决 1 项冲突');
  await expect(page.getByLabel('已核对榜单图片来源及数值')).toBeDisabled();
  await page.getByLabel('采用525:游走').selectOption('1');
  await page.getByLabel('已核对榜单图片来源及数值').check();
  await page.getByRole('button', { name: '将 4 行填入下方表格' }).click();
  await expect(page.getByLabel('胜率 %第1行', { exact: true })).toHaveValue('49.1');
  await page.getByRole('button', { name: '预览并核对', exact: true }).click();
  await expect(page.locator('.import-preview')).toContainText('4 行');
  await page.getByLabel('采用525:游走').selectOption('0');
  await expect(page.locator('.import-preview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '确认保存统计', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '识别 2 张榜单截图' }).click();
  await expect(page.locator('.table-capture')).toContainText('截图含不同数据日期');
  await expect(page.getByRole('button', { name: '将 4 行填入下方表格' })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: folder + '/conflict-mobile.png', fullPage: true });
});

test('bundled public observations are available with source date and correct hero detail', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByLabel('统计分段', { exact: true }).selectOption('巅峰千强');
  await page.getByLabel('数据批次', { exact: true }).selectOption('public-tianyuan-2026-10-11');
  await expect(page.locator('.all-hero-ranks')).toContainText('100 / 133');
  await page.getByLabel('搜索全部英雄').fill('镜');
  await expect(page.locator('.tier-portrait')).toContainText('52.4%');
  await page
    .locator('.all-hero-ranks')
    .getByRole('button', { name: '打开镜图鉴', exact: true })
    .click();
  await expect(page.getByRole('dialog').locator('.hero-insights')).toContainText('52.40%');
  await expect(page.getByRole('dialog').locator('.hero-insights')).toContainText('2026-10-11');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '详细数据表', exact: true }).click();
  await expect(page.locator('.roster-table tbody tr')).toContainText('52.40%');
  await page.getByLabel('看板依据').selectOption('heat');
  await expect(page.locator('.roster-table tbody tr')).not.toContainText('52.40%');
  await page.getByLabel('看板依据').selectOption('source');
  await expect(page.locator('.roster-table tbody tr')).toContainText('52.40%');
  await page.getByRole('button', { name: '梯度看板', exact: true }).click();
  await page.getByLabel('搜索全部英雄').fill('');
  await page.screenshot({ path: folder + '/source-board.png', fullPage: true });
});
