import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { parseTianyuan, tianyuanUrl } from '../../src/player/pro/tianyuan.ts';
import type { TianyuanQuery } from '../../src/player/pro/tianyuan.ts';
const folder = 'evidence/data-repair-v017';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T15:00:00Z'));
  await page.route('**/api/tianyuan?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const q = {
      kind: params.get('kind'),
      date: params.get('date') ?? undefined,
      mode: params.has('mode') ? Number(params.get('mode')) : undefined,
      heroId: params.has('heroId') ? Number(params.get('heroId')) : undefined,
    } as TianyuanQuery;
    if (!['stats', 'tier'].includes(q.kind)) {
      await route.fulfill({ status: 502, json: { error: '本测试只核对梯度与三率' } });
      return;
    }
    const file = q.kind === 'tier' ? 'tier-20261014' : 'stats-' + q.mode;
    const raw = readFileSync('tests/fixtures/tianyuan/' + file + '.json', 'utf8');
    await route.fulfill({
      json: {
        source: '天元之弈数据站',
        sourceClass: 'third-party-public',
        url: tianyuanUrl(q),
        query: q,
        requestedDate: q.date,
        fetchedAt: '2026-10-14T14:00:00Z',
        rawSha256: createHash('sha256').update(raw).digest('hex'),
        cache: 'cached',
        data: parseTianyuan(JSON.parse(raw), q),
      },
    });
  });
});

test('atlas entry shows Lianpo published tier and selected segment metrics without manual import', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '英雄图鉴', exact: true }).click();
  await page.getByLabel('搜索英雄', { exact: true }).fill('廉颇');
  const card = page.getByLabel('廉颇来源表现');
  await expect(card).toContainText('天元 T3');
  await page.getByLabel('图鉴统计分段').selectOption('大众分段');
  const source = JSON.parse(readFileSync('tests/fixtures/tianyuan/stats-1.json', 'utf8')).find(
    (x: { heroId: number }) => x.heroId === 105,
  );
  await expect(card).toContainText(source.winRate.toFixed(2) + '%');
  await page.getByRole('button', { name: '查看廉颇资料', exact: true }).click();
  await expect(page.getByLabel('英雄来源梯度')).toContainText('T3');
  await expect(page.getByLabel('英雄来源梯度')).toContainText('28.89');
  await expect(page.getByLabel('英雄分段三率')).toContainText(source.winRate.toFixed(2) + '%');
  await expect(page.getByLabel('英雄统计分段', { exact: true })).toHaveValue('1');
  await expect(page.getByRole('dialog')).not.toContainText('待接入');
  await expect(page.getByLabel('弈境强度评分解释')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: folder + '/atlas-lianpo-mobile.png', animations: 'disabled' });
});

test('default source board matches every published label and score; metric sorting actually changes order', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  const cards = page.locator('.tianyuan-live .tier-portrait');
  await expect(cards).toHaveCount(133);
  await expect(page.getByLabel('联网排序')).toHaveValue('tier');
  const source = JSON.parse(
    readFileSync('tests/fixtures/tianyuan/tier-20261014.json', 'utf8'),
  ).tiers;
  const expected = source.toSorted(
    (a: any, b: any) =>
      b.finalNormalizedTierScore - a.finalNormalizedTierScore ||
      b.trueHeroPowerInRole - a.trueHeroPowerInRole ||
      a.heroId - b.heroId,
  );
  expect(await cards.locator('strong').allTextContents()).toEqual(
    expected.map((x: any) => x.heroName),
  );
  const contents = await cards.allTextContents();
  for (let i = 0; i < expected.length; i++) {
    expect(contents[i]).toContain(expected[i].finalNormalizedTierScore.toFixed(2));
    expect(contents[i]).toContain(expected[i].tierInRole);
  }
  await page.getByLabel('联网英雄搜索').fill('镜');
  const jing = page.getByRole('button', { name: '查看镜公开详情', exact: true });
  await expect(jing).toContainText('天元 T0');
  await expect(jing).toContainText('86.71');
  await jing.click();
  await expect(page.getByLabel('英雄来源梯度')).toContainText('86.71');
  await page.keyboard.press('Escape');
  await page.getByLabel('联网英雄搜索').fill('');
  await page.getByLabel('联网排序').selectOption('pick');
  const stats = JSON.parse(readFileSync('tests/fixtures/tianyuan/stats-5.json', 'utf8')).toSorted(
    (a: any, b: any) => b.pickRate - a.pickRate || a.heroId - b.heroId,
  );
  expect(await cards.locator('strong').allTextContents()).toEqual(
    stats.map((x: any) => x.heroName),
  );
  await page.getByLabel('联网榜单分段').selectOption('大众分段');
  await page.getByLabel('联网英雄搜索').fill('伽罗');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('天元 T4');
});

test('published tiers remain available when the separate statistics source fails', async ({
  page,
}) => {
  await page.route('**/api/tianyuan?kind=stats*', (route) =>
    route.fulfill({ status: 502, json: { error: '受控三率请求失败' } }),
  );
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await expect(page.locator('.tianyuan-live .tier-portrait')).toHaveCount(133);
  await expect(page.locator('.tianyuan-live')).toContainText('受控三率请求失败');
  await page.getByLabel('联网英雄搜索').fill('镜');
  await page.getByRole('button', { name: '查看镜公开详情', exact: true }).click();
  await expect(page.getByLabel('英雄来源梯度')).toContainText('T0');
  await expect(page.getByLabel('英雄分段三率')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('受控三率请求失败');
});
