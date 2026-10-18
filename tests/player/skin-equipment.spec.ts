import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { parseTianyuan, tianyuanUrl } from '../../src/player/pro/tianyuan.ts';
import type { TianyuanQuery } from '../../src/player/pro/tianyuan.ts';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'));
  const resources = JSON.parse(
    readFileSync('tests/fixtures/official-resources-20261012.json', 'utf8'),
  );
  await page.route('**/api/resources', (route) =>
    route.fulfill({ json: { data: resources, stale: false } }),
  );
  await page.route('**/api/tianyuan?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const q = Object.fromEntries(params) as unknown as TianyuanQuery;
    if (params.has('heroId')) q.heroId = Number(params.get('heroId'));
    if (params.has('mode')) q.mode = Number(params.get('mode'));
    if (
      (q.heroId && q.heroId !== 521) ||
      (q.date && q.date !== (q.kind === 'tier' ? '2026-10-14' : '2026-10-13'))
    )
      return route.fulfill({ status: 502, json: { error: '该英雄或日期没有测试来源记录' } });
    const name =
      q.kind === 'tier'
        ? 'tier-20261014'
        : q.kind === 'stats'
          ? 'stats-' + q.mode
          : q.kind + '-521';
    const raw = readFileSync('tests/fixtures/tianyuan/' + name + '.json', 'utf8');
    return route.fulfill({
      json: {
        source: '天元之弈数据站',
        sourceClass: 'third-party-public',
        query: q,
        url: tianyuanUrl(q),
        requestedDate: q.date,
        fetchedAt: '2026-10-14T05:00:00Z',
        rawSha256: createHash('sha256').update(raw).digest('hex'),
        cache: 'cached',
        data: parseTianyuan(JSON.parse(raw), q),
      },
    });
  });
});

test('skin rates are directly accessible, sorted and cleared across unavailable dates or heroes', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '装备与版本', exact: true }).click();
  await page.getByRole('button', { name: '皮肤使用率', exact: true }).click();
  await page.getByLabel('皮肤统计英雄').selectOption('521');
  const panel = page.getByRole('region', { name: '英雄皮肤使用率' });
  await expect(panel.locator('.skin-usage-card')).toHaveCount(7);
  await expect(panel.locator('.skin-usage-card').first()).toContainText('真言先知');
  await expect(panel.locator('.skin-usage-card').first()).toContainText('42.32%');
  await expect(panel.locator('.skin-usage-card').first().locator('img')).toHaveAttribute(
    'src',
    /img\.pvp\.mcxssg\.net/,
  );
  await page.getByLabel('皮肤使用率排序').selectOption('name');
  await expect(panel.locator('.skin-usage-card').first()).toContainText('浮梦罗烟');
  await page.getByLabel('皮肤统计日期').fill('2026-10-12');
  await expect(panel.getByRole('alert')).toContainText('未能读取');
  await expect(panel.locator('.skin-usage-card')).toHaveCount(0);
  await page.getByLabel('皮肤统计日期').fill('2026-10-13');
  await expect(panel.locator('.skin-usage-card')).toHaveCount(7);
  await page.getByLabel('皮肤统计英雄').selectOption('544');
  await expect(panel.locator('.skin-usage-card')).toHaveCount(0);
  await page.getByLabel('皮肤统计英雄').selectOption('521');
  await expect(panel.locator('.skin-usage-card')).toHaveCount(7);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});

test('hero skin section shows source distribution and keeps top-level rates while tabs change', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '英雄图鉴', exact: true }).click();
  await page.getByLabel('搜索英雄', { exact: true }).fill('海月');
  await page.getByRole('button', { name: '查看海月资料', exact: true }).click();
  const detail = page.locator('.tianyuan-hero');
  await expect(page.getByLabel('英雄分段三率')).toBeVisible();
  const rates = (await page.getByLabel('英雄分段三率').textContent())!;
  await detail.getByRole('button', { name: '皮肤使用率', exact: true }).click();
  await expect(detail.locator('.skin-usage-card')).toHaveCount(7);
  await expect(page.getByLabel('英雄分段三率')).toHaveText(rates);
  await detail.getByRole('button', { name: '实际出装统计', exact: true }).click();
  await expect(detail.getByRole('img', { name: '日暮之流图标' })).toHaveAttribute(
    'src',
    'https://img.pvp.mcxssg.net/manage/custom_wzryequip/1727.png',
  );
  await expect(page.getByLabel('英雄分段三率')).toHaveText(rates);
  await page.getByRole('dialog').getByRole('button', { name: '皮肤', exact: true }).click();
  await expect(page.locator('#hero-skins .skin-usage-card')).toHaveCount(7);
  await expect(page.locator('#hero-skins')).not.toContainText('图录未关联统计');
});

test('equipment statistics show source icons, retain rates when images fail and skin catalog links to rates', async ({
  page,
}) => {
  await page.route('https://img.pvp.mcxssg.net/**', (route) => route.abort());
  await page.route('https://game.gtimg.cn/**', (route) => route.abort());
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '装备与版本', exact: true }).click();
  await page.getByRole('button', { name: '装备出场率 / 胜率', exact: true }).click();
  await page.getByLabel('统计英雄', { exact: true }).selectOption('521');
  const panel = page.getByRole('region', { name: '英雄装备出场率与胜率', exact: true });
  const first = panel.locator('tbody tr').first();
  await expect(first).toContainText('日暮之流');
  await first.scrollIntoViewIfNeeded();
  await expect(first.getByRole('img', { name: '日暮之流图片暂不可用' })).toBeVisible();
  await expect(first).toContainText('92.37%');
  await expect(first).toContainText('52.46%');
  await page.getByRole('button', { name: '皮肤图录', exact: true }).click();
  await page.getByLabel('皮肤所属英雄').selectOption('521');
  await expect(
    page.getByRole('region', { name: '英雄皮肤使用率' }).locator('.skin-usage-card'),
  ).toHaveCount(7);
});
