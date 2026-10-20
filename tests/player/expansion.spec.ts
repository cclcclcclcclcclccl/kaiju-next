import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { heroes, heroByName } from '../../src/player/catalog.ts';
import { emptyDraft } from '../../src/player/model.ts';
import { emptyProfile } from '../../src/player/pro/model.ts';
const id = (n: string) => heroByName(n).id;
test.beforeEach(async ({ page, request }) => {
  await request.post('/api/pool', { data: [] });
  await request.post('/api/draft', { data: emptyDraft() });
  await request.post('/api/pro/profile', { data: emptyProfile() });
  const data = await (await request.get('/api/pro')).json();
  for (const s of data.snapshots)
    await request.post('/api/pro/snapshot-remove', { data: { id: s.id } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '下一局，从这里开始。' })).toBeVisible();
});
test.afterEach(async ({ request }) => {
  await request.post('/api/pro/profile', { data: emptyProfile() });
  const data = await (await request.get('/api/pro')).json();
  for (const s of data.snapshots)
    await request.post('/api/pro/snapshot-remove', { data: { id: s.id } });
});
test('tier import is real, keeps provenance and supplies per-hero metrics', async ({ page }) => {
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByRole('button', { name: '历史快照与官方榜', exact: true }).click();
  await expect(page.getByText('这个分段还没有可靠统计')).toBeVisible();
  await page.getByRole('button', { name: '导入统计快照' }).click();
  await page.getByRole('button', { name: 'JSON 导入', exact: true }).click();
  const rows = heroes
    .filter((h) => h.roles.includes('中路'))
    .slice(0, 8)
    .map((h, i) => ({
      heroId: h.id,
      role: '中路',
      winRate: 48 + i * 0.5,
      pickRate: 5 + i,
      banRate: i,
      games: 5000,
    }));
  await page.getByLabel('统计 JSON').fill(
    JSON.stringify({
      title: '浏览器合成测试',
      segment: '巅峰1800+',
      patch: 'TEST-ONLY',
      startDate: '2026-10-01',
      endDate: '2026-10-07',
      sourceName: '合成协议测试，不代表实际胜率',
      sourceUrl: 'https://example.invalid/data',
      denominator: 'match',
      winRateScope: 'segment',
      winRateWindow: 'range',
      rows,
    }),
  );
  await page.getByRole('button', { name: '核验并导入' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.pro-table tbody tr')).toHaveCount(8);
  await expect(page.locator('.source-strip')).toContainText('TEST-ONLY');
  await page.locator('.pro-table tbody tr').first().getByRole('button').click();
  await expect(page.getByLabel('历史英雄统计分段', { exact: true })).toHaveValue('巅峰1800+');
  await expect(page.getByLabel('英雄统计分路')).toHaveValue('中路');
  await expect(page.getByRole('dialog').locator('details[open] .metric-strip')).not.toContainText(
    '待接入',
  );
  await expect(page.getByRole('dialog')).toContainText('官方搭配与克制说明');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByRole('button', { name: '历史快照与官方榜', exact: true }).click();
  await page.getByLabel('统计分段', { exact: true }).selectOption('巅峰1800+');
  await expect(page.locator('.pro-table tbody tr')).toHaveCount(8);
});
test('player profile persists real inputs and practice route records a personal timing', async ({
  page,
}) => {
  await page.locator('nav').getByRole('button', { name: '玩家档案' }).click();
  await page.locator('.manual-profile > summary').click();
  await page.getByRole('button', { name: '添加英雄记录' }).click();
  await page.getByLabel('记录英雄1', { exact: true }).selectOption(String(id('李白')));
  await page.getByLabel('游戏内战力1', { exact: true }).fill('8500');
  await page.getByLabel('总场次1', { exact: true }).fill('200');
  await page.getByLabel('总胜场1', { exact: true }).fill('115');
  await page.getByLabel('近期场次1', { exact: true }).fill('20');
  await page.getByLabel('近期胜场1', { exact: true }).fill('12');
  await page.getByRole('button', { name: '保存玩家档案' }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存');
  await page.reload();
  await page.locator('nav').getByRole('button', { name: '玩家档案' }).click();
  await page.locator('.manual-profile > summary').click();
  await expect(page.getByLabel('游戏内战力1', { exact: true })).toHaveValue('8500');
  await page.locator('nav').getByRole('button', { name: '英雄图鉴', exact: true }).click();
  await page.getByLabel('搜索英雄', { exact: true }).fill('李白');
  await page.getByRole('button', { name: '查看李白资料' }).click();
  await expect(page.locator('.relation-grid article')).toHaveCount(6);
  await page.getByLabel('版本 / 赛季', { exact: true }).fill('UI-test');
  await page.getByLabel('出野时游戏计时（秒）', { exact: true }).fill('95');
  await page.getByLabel('实测条件', { exact: true }).fill('合成测试记录，不是游戏实测');
  await page.getByRole('button', { name: '保存一次真实测量' }).click();
  await expect(page.locator('.jungle-section').getByRole('status')).toContainText('已保存');
  await expect(page.locator('.jungle-section .metric-strip')).toContainText('1:35');
});
test('a system loads its core picks and round BP can ban, advance and undo', async ({ page }) => {
  await page.locator('nav').getByRole('button', { name: '体系练习' }).click();
  await page.locator('.system-card').first().getByRole('button').click();
  await page.getByRole('button', { name: '带入阵容备战' }).click();
  await expect(page.getByRole('button', { name: '选择我方游走' })).toContainText('孙膑');
  await page.getByLabel('选人侧重', { exact: true }).selectOption('comfort');
  await page.getByLabel('BP规则', { exact: true }).selectOption('classic');
  await page.getByRole('button', { name: '开始新演练' }).click();
  await page.getByLabel('本轮英雄', { exact: true }).selectOption(String(id('李白')));
  await page.getByRole('button', { name: '确认本轮' }).click();
  await expect(page.locator('.bp-rounds')).toContainText('第 2 / 16 步');
  await expect(page.locator('.bp-bans')).toContainText(['李白', '']);
  await expect(page.getByRole('button', { name: '选择我方游走' })).toContainText('孙膑');
  await page.getByRole('button', { name: '撤回一步', exact: true }).click();
  await expect(page.locator('.bp-rounds')).toContainText('第 1 / 16 步');
  await expect(page.getByRole('button', { name: '取消禁用李白' })).toHaveCount(0);
});
test('real video playback captures a frame and preserves evidence-based review on reopen', async ({
  page,
}) => {
  await page.locator('nav').getByRole('button', { name: '录像复盘' }).click();
  await page
    .getByLabel('打开对局录像')
    .setInputFiles('tests/player/fixtures/synthetic-replay.webm');
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.locator('video').evaluate((v: HTMLVideoElement) => v.play());
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.3);
  await page.locator('video').evaluate((v: HTMLVideoElement) => v.pause());
  await page.getByRole('button', { name: '截取当前决策点' }).click();
  await expect(page.locator('.review-frame')).toBeVisible();
  const brightness = await page.locator('.review-frame').evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
    return sum / (c.width * c.height * 3);
  });
  expect(brightness).toBeGreaterThan(10);
  await page.getByLabel('实际观察').fill('这是一段合成视频，仅验证截帧与记录流程。');
  await page.getByLabel('附近我方人数', { exact: true }).fill('2');
  await page.getByLabel('附近敌方人数', { exact: true }).fill('3');
  await expect(page.locator('.finding-grid')).toContainText('我方 2 人、敌方 3 人');
  await page.getByRole('button', { name: '保存这份复盘' }).click();
  await expect(page.getByRole('status')).toContainText('已保存');
  await page.reload();
  await page.locator('nav').getByRole('button', { name: '录像复盘' }).click();
  await page.locator('.saved-reviews button').first().click();
  await expect(page.getByLabel('实际观察')).toHaveValue('这是一段合成视频，仅验证截帧与记录流程。');
  await expect(page.locator('.review-frame')).toBeVisible();
  const savedCount = await page.locator('.saved-reviews button').count();
  await page.getByLabel('实际观察').fill('重新打开后修订的合成测试观察。');
  await page.getByRole('button', { name: '保存这份复盘' }).click();
  await expect(page.getByRole('status')).toContainText('已保存');
  await expect(page.locator('.saved-reviews button')).toHaveCount(savedCount);
  await page.getByRole('button', { name: 'AI 关键帧分析 · 未连接' }).click();
  await expect(page.getByRole('status')).toContainText('尚未连接视觉模型');
});
test('two browser accounts become friends only after acceptance and can use shared pools in BP', async ({
  browser,
  baseURL,
}) => {
  const ca = await browser.newContext({ baseURL }),
    cb = await browser.newContext({ baseURL }),
    a = await ca.newPage(),
    b = await cb.newPage();
  try {
    const stamp = Date.now().toString(36);
    for (const [p, name] of [
      [a, 'a'],
      [b, 'b'],
    ] as const) {
      await p.goto('/');
      await p.locator('nav').getByRole('button', { name: '好友与组队' }).click();
      await p.getByLabel('用户名', { exact: true }).fill('test_' + stamp + '_' + name);
      await p.getByLabel('玩家昵称', { exact: true }).fill('测试玩家' + name);
      await p.getByLabel('开局账号密码', { exact: true }).fill('test-password-123');
      await p.getByRole('button', { name: '创建并登录' }).click();
      await expect(p.getByRole('heading', { name: '下一局，从这里开始。' })).toBeVisible();
    }
    await a.locator('nav').getByRole('button', { name: '英雄图鉴', exact: true }).click();
    await a.getByLabel('搜索英雄', { exact: true }).fill('李白');
    await a.getByRole('button', { name: '查看李白资料' }).click();
    await a.getByRole('button', { name: '加入我的英雄池', exact: true }).click();
    await expect(a.getByLabel('英雄熟练度')).toBeVisible();
    await a.keyboard.press('Escape');
    await a.locator('nav').getByRole('button', { name: '玩家档案' }).click();
    await a.locator('.manual-profile > summary').click();
    await a.getByRole('checkbox', { name: '向已接受的好友展示英雄池及本页记录' }).check();
    await a.getByRole('button', { name: '保存玩家档案' }).click();
    await expect(a.locator('main').getByRole('status')).toContainText('档案已保存');
    await b.locator('nav').getByRole('button', { name: '好友与组队' }).click();
    const code = (await b.locator('.social-identity .gold').innerText()).trim();
    await a.locator('nav').getByRole('button', { name: '好友与组队' }).click();
    await a.getByLabel('对方好友码').fill(code);
    await a.getByRole('button', { name: '发送好友申请' }).click();
    await expect(a.locator('.social-grid')).toContainText('等待对方确认');
    await b.reload();
    await b.locator('nav').getByRole('button', { name: '好友与组队' }).click();
    await b.getByRole('button', { name: '接受申请' }).click();
    await expect(b.locator('.friend-pool')).toContainText('李白');
    await b.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
    await b.getByLabel('为谁选英雄').selectOption({ label: '测试玩家a · 已共享' });
    await b.getByLabel('我的位置', { exact: true }).selectOption('打野');
    await b.getByRole('checkbox', { name: '只从我的英雄池里选' }).check();
    await expect(b.locator('.recommend-card')).toHaveCount(1);
    await expect(b.locator('.recommend-card')).toContainText('李白');
    await b.getByRole('button', { name: '保存备战卡', exact: true }).click();
    await expect(b.getByRole('status')).toContainText('备战卡已保存');
  } finally {
    await ca.close();
    await cb.close();
  }
});
test('new modules pass automatic accessibility checks and fit a mobile viewport', async ({
  page,
}) => {
  const audits = [];
  for (const name of ['分段梯度', '玩家档案', '体系练习', '录像复盘', '好友与组队']) {
    await page.locator('nav').getByRole('button', { name, exact: true }).click();
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    audits.push({ page: name, violations: r.violations, incomplete: r.incomplete.length });
    expect(r.violations, name).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['分段梯度', '玩家档案', '录像复盘', '好友与组队']) {
    await page.getByRole('button', { name: '展开导航' }).click();
    await page.locator('nav').getByRole('button', { name, exact: true }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      name,
    ).toBe(true);
  }
  mkdirSync('evidence/reference-informed', { recursive: true });
  writeFileSync('evidence/reference-informed/accessibility.json', JSON.stringify(audits, null, 2));
});
