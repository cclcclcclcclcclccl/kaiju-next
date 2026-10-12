import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { heroes, heroByName } from '../../src/player/catalog.ts';
import { emptyDraft } from '../../src/player/model.ts';
import { emptyProfile, emptyHeroMetric, emptyHabits } from '../../src/player/pro/model.ts';
const id = (name: string) => heroByName(name).id;
const folder = 'evidence/coach-upgrade';
test.beforeEach(async ({ page, request }) => {
  await request.post('/api/pool', { data: [] });
  await request.post('/api/draft', { data: emptyDraft() });
  await request.post('/api/pro/profile', { data: emptyProfile() });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '下一局，从这里开始。' })).toBeVisible();
  mkdirSync(folder, { recursive: true });
});

test('detailed profile saves rate-only input, drives pool cards and opens the correct editable record', async ({
  page,
  request,
}) => {
  await page.locator('nav').getByRole('button', { name: '玩家档案', exact: true }).click();
  await page.locator('.manual-profile > summary').click();
  await page.getByLabel('本赛季最高巅峰分', { exact: true }).fill('1900');
  await page.getByLabel('巅峰能量', { exact: true }).fill('35');
  await page.getByLabel('账号巅峰加成 %', { exact: true }).fill('30');
  await page.getByLabel('账号挑战赛加成 %', { exact: true }).fill('10');
  await page.getByRole('checkbox', { name: '主动游走', exact: true }).check();
  await page.getByRole('checkbox', { name: '地图意识', exact: true }).check();
  await page.getByRole('button', { name: '添加英雄记录' }).click();
  await page.getByLabel('记录英雄1', { exact: true }).selectOption(String(id('李白')));
  for (const [label, value] of [
    ['游戏内战力1', '9500'],
    ['历史最高战力1', '12000'],
    ['总场次1', '230'],
    ['总胜率 %1', '57.83'],
    ['平均评分1', '9.1'],
    ['近期场次1', '20'],
    ['近期胜率 %1', '65'],
    ['近期平均评分1', '9.5'],
    ['表现分合计1', '4000'],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: '保存玩家档案' }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存');
  const stored = (await (await request.get('/api/pro')).json()).profile;
  expect(stored.heroes[0].wins).toBeUndefined();
  expect(stored.heroes[0].recentWins).toBeUndefined();
  expect(stored.heroes[0].winRate).toBe(57.83);
  expect(stored.peakEnergy).toBe(35);
  await page.reload();
  await expect(page.locator('.pool-strip')).toContainText('李白');
  await page
    .locator('nav')
    .getByRole('button', { name: /我的英雄池/ })
    .click();
  await expect(page.locator('.hero-grid .hero-card')).toHaveCount(1);
  await expect(page.locator('.pool-record-summary')).toContainText('9500');
  await expect(page.locator('.pool-record-summary')).toContainText('12000');
  await expect(page.locator('.personal-recommendations')).toContainText('主动游走');
  await page.screenshot({
    path: folder + '/personal-pool-test.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '编辑李白详细数据' }).click();
  await expect(page.getByLabel('记录英雄1', { exact: true })).toHaveValue(String(id('李白')));
  await expect(page.getByLabel('总胜率 %1', { exact: true })).toHaveValue('57.83');
  await page.getByRole('checkbox', { name: '将这位英雄纳入我的备战英雄池' }).uncheck();
  await page.getByRole('button', { name: '保存玩家档案' }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存');
  await page.locator('nav').getByRole('button', { name: '我的英雄池', exact: true }).click();
  await expect(page.locator('.hero-grid .hero-card')).toHaveCount(0);
});

test('complete roster links to atlas, correct rune colors and personal guides on desktop and phone', async ({
  page,
}) => {
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await expect(page.locator('.tier-portrait')).toHaveCount(heroes.length);
  await page.getByRole('button', { name: '详细数据表', exact: true }).click();
  await expect(page.locator('.roster-table tbody tr')).toHaveCount(heroes.length);
  await page.getByLabel('搜索全部英雄').fill('李白');
  await page.getByRole('button', { name: '打开李白图鉴' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.skill-meta')).toContainText('冷却');
  await expect(dialog.locator('.rune-grid article').filter({ hasText: '鹰眼' })).toContainText(
    '绿色铭文',
  );
  await expect(dialog.locator('.rune-grid article').filter({ hasText: '隐匿' })).toContainText(
    '蓝色铭文',
  );
  await expect(dialog.locator('.hero-builds')).toContainText('方案 1');
  await expect(dialog.locator('#hero-personal-guide')).toBeAttached();
  await dialog.getByRole('button', { name: '我的打法', exact: true }).click();
  await expect(dialog.locator('#hero-personal-guide')).toBeInViewport();
  await page.screenshot({ path: folder + '/hero-personal-guide.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: folder + '/hero-mobile.png', animations: 'disabled' });
  writeFileSync(
    folder + '/accessibility-hero.json',
    JSON.stringify({ violations: audit.violations }, null, 2),
  );
});

test('real worker considers both sides, applies only one move and invalidates changed input', async ({
  page,
  request,
}) => {
  const profile = {
    ...emptyProfile(),
    habits: emptyHabits(),
    heroes: [
      {
        ...emptyHeroMetric(id('小乔')),
        games: 100,
        recentGames: 30,
        recentWinRate: 60,
        power: 6000,
      },
    ],
  };
  await request.post('/api/pro/profile', { data: profile });
  await page.reload();
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  const lab = page.getByRole('region', { name: '教练博弈 BP' });
  await lab.getByRole('button', { name: '开始教练推演' }).click();
  await expect(lab.locator('.coach-candidates article')).toHaveCount(3, { timeout: 16000 });
  await expect(lab.locator('.coach-metrics')).toContainText('4 / 4');
  const first = lab.locator('.coach-candidates article').first();
  await expect(first.locator('.coach-line li')).toHaveCount(4);
  await expect(first.locator('.coach-line')).toContainText('对方选');
  await expect(first.locator('.coach-line')).toContainText('我方选');
  const nodeCount = await lab.locator('.coach-metrics strong').nth(1).textContent();
  expect(Number(nodeCount!.replaceAll(',', ''))).toBeGreaterThan(6);
  await lab.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: folder + '/coach-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await first.getByRole('button', { name: '只应用这一步' }).click();
  await expect(lab.locator('.coach-results')).toHaveCount(0);
  const savedDraft = await page.evaluate(() => JSON.parse(localStorage.getItem('kaiju-draft-v1')!));
  expect(Object.keys(savedDraft.allies).length + Object.keys(savedDraft.enemies).length).toBe(1);
  await lab.getByRole('button', { name: '开始教练推演' }).click();
  await expect(lab.locator('.coach-results')).toBeVisible({ timeout: 16000 });
  await lab.getByLabel('推演深度').selectOption('2');
  await expect(lab.locator('.coach-results')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await lab.getByRole('button', { name: '开始教练推演' }).click();
  await expect(lab.locator('.coach-results')).toBeVisible({ timeout: 16000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await lab.locator('.coach-results').scrollIntoViewIfNeeded();
  await page.screenshot({ path: folder + '/coach-mobile.png', animations: 'disabled' });
  writeFileSync(
    folder + '/accessibility-coach.json',
    JSON.stringify({ violations: audit.violations }, null, 2),
  );
});

test('profile-only shared friend records produce a recommended system and disappear after sharing is revoked', async ({
  page,
  request,
}) => {
  const accounts: any[] = [];
  const call = async (path: string, token: string, data?: unknown) => {
    const response = await request.fetch('/api' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + token },
      ...(data === undefined ? {} : { data }),
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  for (const [index, name] of ['后羿', '张飞'].entries()) {
    const account = await (
      await request.post('/api/auth/register', {
        data: {
          username: 'coach_' + Date.now() + '_' + index,
          name: '适配测试' + index,
          password: 'fixture-only-123',
        },
      })
    ).json();
    accounts.push(account);
    await call('/pro/profile', account.token, {
      ...emptyProfile(),
      name: '适配测试' + index,
      sharePool: true,
      heroes: [
        {
          ...emptyHeroMetric(id(name)),
          games: 200,
          recentGames: 40,
          recentWinRate: 65,
          power: 8000,
        },
      ],
    });
  }
  await call('/social/request', accounts[0].token, { code: accounts[1].user.code });
  const pending = await call('/social', accounts[1].token);
  await call('/social/respond', accounts[1].token, { id: pending.friends[0].id, accept: true });
  await page.addInitScript((a) => {
    localStorage.setItem('kaiju-token', a.token);
    localStorage.setItem('kaiju-user', a.user.id);
  }, accounts[0]);
  await page.reload();
  await page.locator('nav').getByRole('button', { name: '体系练习', exact: true }).click();
  await page.getByRole('checkbox', { name: /适配测试1/ }).check();
  await expect(page.locator('.system-card').filter({ hasText: '保核反打' })).toContainText(
    '1/3 位在你的英雄池',
  );
  const candidate = page.locator('.squad-matches article').filter({ hasText: '自适配' }).first();
  await expect(candidate).toContainText('核心位置可组成');
  await expect(candidate).toContainText('适配测试0 → 后羿');
  await expect(candidate).toContainText('适配测试1 → 张飞');
  await page.screenshot({
    path: folder + '/adaptive-system-test.png',
    fullPage: true,
    animations: 'disabled',
  });
  await call('/pro/profile', accounts[1].token, { ...emptyProfile(), sharePool: false });
  await page.getByRole('button', { name: '刷新共享记录' }).click();
  await expect(page.locator('.squad-matches article').filter({ hasText: '自适配' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /适配测试1/ })).toHaveCount(0);
});
