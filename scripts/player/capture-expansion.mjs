import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:4318';
const dir = 'evidence/expansion/screenshots';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
});
const errors = [],
  failed = [],
  shots = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => failed.push({ url: r.url(), error: r.failure()?.errorText }));
  const settle = () =>
    page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images]
          .filter((i) => i.loading !== 'lazy' || i.getBoundingClientRect().top < innerHeight)
          .map((i) =>
            Promise.race([i.decode().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]),
          ),
      );
    });
  const shot = async (name, fullPage = false) => {
    await page.evaluate(() => scrollTo(0, 0));
    await settle();
    await page.screenshot({ path: dir + '/' + name + '.png', fullPage, animations: 'disabled' });
    shots.push({
      name,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    });
  };
  const nav = async (name) => {
    if (await page.getByRole('button', { name: '展开导航' }).isVisible())
      await page.getByRole('button', { name: '展开导航' }).click();
    await page.locator('nav').getByRole('button', { name, exact: true }).click();
  };
  await page.goto(base);
  await page.getByRole('heading', { name: '下一局，从这里开始。' }).waitFor();
  await shot('home-desktop');
  await page.getByRole('button', { name: '体验一局示例', exact: true }).click();
  if (await page.getByRole('button', { name: '关闭提示' }).count())
    await page.getByRole('button', { name: '关闭提示' }).click();
  await shot('draft-desktop', true);
  await nav('体系练习');
  await shot('systems-desktop', true);
  await nav('分段梯度');
  await page.getByRole('button', { name: '查看算法演示' }).click();
  await shot('tiers-synthetic-desktop', true);
  await nav('英雄图鉴');
  await page.getByLabel('搜索英雄', { exact: true }).fill('李白');
  await page.getByRole('button', { name: '查看李白资料' }).click();
  await shot('hero-skills-desktop');
  await page.locator('#hero-relations').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await shot('hero-relations-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.jungle-section').scrollIntoViewIfNeeded();
  await shot('jungle-mobile');
  await page.keyboard.press('Escape');
  await nav('玩家档案');
  await shot('profile-mobile', true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await nav('录像复盘');
  await page
    .getByLabel('打开对局录像')
    .setInputFiles('tests/player/fixtures/synthetic-replay.webm');
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  await page.locator('video').evaluate((v) => v.play());
  await page.waitForFunction(() => document.querySelector('video').currentTime > 0.4);
  await page.locator('video').evaluate((v) => v.pause());
  await page.getByRole('button', { name: '截取当前决策点' }).click();
  await page
    .getByLabel('实际观察')
    .fill('合成视频只用于验证播放、截帧和记录界面；这里不是实际游戏复盘。');
  await page.getByLabel('附近我方人数', { exact: true }).fill('2');
  await page.getByLabel('附近敌方人数', { exact: true }).fill('3');
  await shot('replay-synthetic-desktop', true);
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('replay-synthetic-mobile', true);
  const status = await (await page.request.get(base + '/api/status')).json();
  const report = {
    checkedAt: new Date().toISOString(),
    status,
    errors,
    failed,
    shots,
    note: 'Live local v0.4. Read-only API use; demo draft, synthetic statistics and video kept only in browser memory. No synthetic gameplay/profile saved to personal database. Screenshots are actual UI, not mockups.',
  };
  await writeFile('evidence/expansion/live-check.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
