import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseTianyuan, tianyuanUrl } from '../../src/player/pro/tianyuan.ts';
import type { TianyuanQuery } from '../../src/player/pro/tianyuan.ts';
import { STAGED_ROUNDS } from '../../src/player/pro/bpSession.ts';
const evidence = 'evidence/visual-bp-v018/browser';
test.beforeEach(async ({ page }) => {
  mkdirSync(evidence, { recursive: true });
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'));
  await page.route('**/api/tianyuan?*', async (route) => {
    const p = new URL(route.request().url()).searchParams;
    const q = {
      kind: p.get('kind'),
      date: p.get('date') ?? undefined,
      mode: p.has('mode') ? Number(p.get('mode')) : undefined,
      heroId: p.has('heroId') ? Number(p.get('heroId')) : undefined,
    } as TianyuanQuery;
    if ((q.heroId && q.heroId !== 521) || (q.kind === 'tier' && q.date !== '2026-10-13')) {
      await route.fulfill({ status: 502, json: { error: '本用例只使用海月真实来源夹具' } });
      return;
    }
    const file =
      q.kind === 'stats' ? 'stats-' + q.mode : q.kind === 'tier' ? 'tier' : q.kind + '-521';
    const raw = readFileSync('tests/fixtures/tianyuan/' + file + '.json', 'utf8');
    await route.fulfill({
      json: {
        source: '天元之弈数据站',
        sourceClass: 'third-party-public',
        url: tianyuanUrl(q),
        query: q,
        requestedDate: q.date,
        fetchedAt: '2026-10-14T05:00:00Z',
        rawSha256: createHash('sha256').update(raw).digest('hex'),
        cache: 'cached',
        data: parseTianyuan(JSON.parse(raw), q),
      },
    });
  });
});
test('humans complete staged BP, refresh, undo final move, and apply only explicitly', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  const panel = page.locator('.bp-rounds');
  await panel.getByRole('button', { name: '开始新演练' }).click();
  for (let step = 0; step < 20; step++) {
    await expect(panel.locator('.bp-turn-banner')).toContainText(`第 ${step + 1} / 20 步`);
    const select = panel.getByLabel('本轮英雄', { exact: true });
    const value = await select.locator('option').nth(1).getAttribute('value');
    await select.selectOption(value!);
    await panel.getByRole('button', { name: '确认本轮' }).click();
  }
  await expect(panel).toContainText('选禁完成');
  await expect(panel.locator('.bp-verdict')).toContainText('结构评估');
  await expect(panel.locator('.bp-picks img')).toHaveCount(10);
  await expect(panel.locator('.bp-bans img')).toHaveCount(10);
  const snapshot = await page.evaluate(() => localStorage.getItem('kaiju.bp.rehearsal.v1'));
  await page.reload();
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  await expect(panel).toContainText('选禁完成');
  expect(await page.evaluate(() => localStorage.getItem('kaiju.bp.rehearsal.v1'))).toBe(snapshot);
  await panel.getByRole('button', { name: '撤回一步', exact: true }).click();
  await expect(panel.locator('.bp-turn-banner')).toContainText('第 20 / 20 步');
  await expect(panel.locator('.bp-verdict')).toHaveCount(0);
  const select = panel.getByLabel('本轮英雄', { exact: true });
  await select.selectOption((await select.locator('option').nth(1).getAttribute('value'))!);
  await panel.getByRole('button', { name: '确认本轮' }).click();
  await panel.getByRole('button', { name: '带入备战（红方为我方）', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择我方中路', exact: true })).not.toContainText(
    '选择英雄',
  );
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: evidence + '/bp-complete-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: evidence + '/bp-complete-mobile.png', animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .include('.bp-rounds')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  expect(errors).toEqual([]);
});
test('real AI worker advances its side and undo pauses auto play; both side choices work', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  const panel = page.locator('.bp-rounds');
  await panel.getByLabel('操作模式').selectOption('blue');
  await panel.getByRole('button', { name: '开始新演练' }).click();
  await panel.getByRole('button', { name: 'BP选择李白', exact: true }).click();
  await panel.getByRole('button', { name: '确认本轮' }).click();
  await expect(panel.locator('.bp-turn-banner')).toContainText('第 3 / 20 步', { timeout: 20000 });
  await expect(panel.locator('.bp-bans img')).toHaveCount(2);
  await expect(panel).toContainText('上一手 AI 的计算记录');
  while (true) {
    const count = await page.evaluate(
      () => JSON.parse(localStorage.getItem('kaiju.bp.rehearsal.v1')!).moves.length as number,
    );
    if (count === 20) break;
    if (STAGED_ROUNDS[count].team === 'enemies') {
      await expect
        .poll(
          () =>
            page.evaluate(
              () => JSON.parse(localStorage.getItem('kaiju.bp.rehearsal.v1')!).moves.length,
            ),
          { timeout: 20000 },
        )
        .toBeGreaterThan(count);
    } else {
      const select = panel.getByLabel('本轮英雄', { exact: true });
      await select.selectOption((await select.locator('option').nth(1).getAttribute('value'))!);
      await panel.getByRole('button', { name: '确认本轮' }).click();
    }
  }
  await expect(panel).toContainText('选禁完成');
  await panel.getByRole('button', { name: '撤回一步', exact: true }).click();
  await expect(panel.locator('.bp-turn-banner')).toContainText('第 20 / 20 步');
  await expect(panel.getByRole('button', { name: '继续 AI', exact: true })).toBeVisible();
  await panel.getByLabel('操作模式').selectOption('red');
  await panel.getByRole('button', { name: '开始新演练' }).click();
  await expect(panel.locator('.bp-turn-banner')).toContainText('第 2 / 20 步', { timeout: 20000 });
  await page.reload();
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  await expect(panel.getByRole('button', { name: '继续 AI', exact: true })).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: evidence + '/bp-human-ai.png', animations: 'disabled' });
});
test('real fixture displays skill, rune, summoner and counter icons, slot stats and six-item builds', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '英雄图鉴', exact: true }).click();
  await page.getByLabel('搜索英雄', { exact: true }).fill('海月');
  await page.getByRole('button', { name: '查看海月资料', exact: true }).click();
  const detail = page.getByRole('dialog');
  const stats = detail.locator('.tianyuan-hero');
  await expect(detail.locator('.skill-tabs img')).toHaveCount(4);
  await expect(detail.locator('.rune-grid img')).toHaveCount(3);
  await expect(detail.locator('.hero-builds .guide-stages img')).not.toHaveCount(0);
  await expect(stats.getByRole('meter', { name: '胜率', exact: true })).toHaveCount(1);
  await stats.getByRole('button', { name: '分路与召唤师技能', exact: true }).click();
  await expect(stats.getByRole('img', { name: '闪现图标', exact: true })).toBeVisible();
  await stats.getByRole('button', { name: '克制与组合', exact: true }).click();
  await expect(stats.locator('.pro-table img')).not.toHaveCount(0);
  await stats.getByRole('button', { name: '实际出装统计', exact: true }).click();
  const equip = stats.locator('.equipment-breakdown');
  await expect(equip).toContainText('72.78%');
  await expect(equip.locator('.full-build-items').first().locator('li')).toHaveCount(6);
  await equip.getByRole('button', { name: '第 6 栏', exact: true }).click();
  await expect(equip.getByRole('table')).toHaveAccessibleName('第 6 栏热门装备');
  await equip.scrollIntoViewIfNeeded();
  await page.screenshot({ path: evidence + '/equipment-slot.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await equip.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: evidence + '/equipment-slot-mobile.png', animations: 'disabled' });
  const audit = await new AxeBuilder({ page })
    .include('.equipment-breakdown')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '展开导航', exact: true }).click();
  await page.locator('nav').getByRole('button', { name: '装备与版本', exact: true }).click();
  await page.getByRole('button', { name: '装备出场率 / 胜率', exact: true }).click();
  await page.getByLabel('统计英雄', { exact: true }).selectOption('521');
  await expect(page.locator('.equipment-statistics .equipment-breakdown')).toContainText('72.78%');
});
