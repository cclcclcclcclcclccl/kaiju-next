import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:4318';
const dir = 'evidence/reference-informed/screenshots';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
});
const errors = [],
  failed = [],
  httpFailures = [],
  mutations = [],
  shots = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (r) => failed.push({ url: r.url(), error: r.failure()?.errorText }));
  page.on('response', (r) => {
    if (r.status() >= 400) httpFailures.push({ url: r.url(), status: r.status() });
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      mutations.push({ method: request.method(), url: request.url() });
      return route.abort();
    }
    await route.continue();
  });
  const shot = async (name) => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images]
          .filter((i) => i.getBoundingClientRect().top < innerHeight)
          .map((i) =>
            Promise.race([
              i.decode().catch(() => {}),
              new Promise((resolve) => setTimeout(resolve, 3000)),
            ]),
          ),
      );
    });
    await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' });
    shots.push({
      name,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    });
  };
  await page.goto(base);
  await page.getByRole('heading', { name: '下一局，从这里开始。' }).waitFor();
  await shot('home-live-desktop');
  await page.locator('nav').getByRole('button', { name: '体系练习', exact: true }).click();
  await page.getByRole('button', { name: '生成五人起始阵容' }).waitFor();
  await shot('systems-live-desktop');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByRole('button', { name: '导入统计快照' }).click();
  await page.getByRole('dialog').waitFor();
  await shot('table-empty-live-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('table-empty-live-mobile');
  await page.locator('.scope-fields').scrollIntoViewIfNeeded();
  await shot('scope-live-mobile');
  const status = await (await page.request.get(base + '/api/status')).json();
  if (status.version !== '0.6.0') throw new Error('Expected the live v0.6.0 server');
  const report = {
    checkedAt: new Date().toISOString(),
    status,
    errors,
    failed,
    httpFailures,
    mutations,
    shots,
    note: 'Live v0.6.0, clean browser session. Page API writes were blocked. No statistics, accounts, profiles or gameplay fixtures saved to the live database. Screenshots are actual UI.',
  };
  await writeFile('evidence/reference-informed/live-check.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || mutations.length || shots.some((s) => s.overflow)) process.exitCode = 1;
} finally {
  await browser.close();
}
