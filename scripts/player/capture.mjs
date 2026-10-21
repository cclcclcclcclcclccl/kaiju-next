import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(15000);
  const scriptErrors = [],
    failedRequests = [];
  page.on('pageerror', (e) => scriptErrors.push(e.message));
  page.on('requestfailed', (r) =>
    failedRequests.push({ url: r.url(), error: r.failure()?.errorText }),
  );
  const settleImages = async () => {
    await page.evaluate(async () => {
      const height = document.documentElement.scrollHeight;
      for (let y = 0; y < height; y += 800) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      scrollTo(0, 0);
    });
    return page.evaluate(async () => {
      const urls = [
        ...new Set([
          ...[...document.querySelectorAll('img')].map((e) => e.src),
          ...[...document.querySelectorAll('[style]')].flatMap((el) =>
            [...getComputedStyle(el).backgroundImage.matchAll(/url\("?([^"\)]+)"?\)/g)].map(
              (m) => m[1],
            ),
          ),
        ]),
      ];
      return Promise.all(
        urls.map(async (url) => {
          const img = new Image();
          img.src = url;
          try {
            await Promise.race([
              img.decode(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
            ]);
            return { url, loaded: true, width: img.naturalWidth };
          } catch {
            return { url, loaded: false };
          }
        }),
      );
    });
  };
  const path = 'evidence/player/screenshots';
  await mkdir(path, { recursive: true });
  await page.goto('http://127.0.0.1:4318/');
  await page.getByRole('heading', { name: '下一局，从这里开始。' }).waitFor();
  const homeImages = await settleImages();
  await page.screenshot({ path: path + '/home-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '体验一局示例', exact: true }).click();
  if (await page.getByRole('button', { name: '关闭提示' }).count())
    await page.getByRole('button', { name: '关闭提示' }).click();
  const draftImages = await settleImages();
  await page.screenshot({ path: path + '/draft-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '查看技能与练习笔记' }).click();
  await settleImages();
  await page.screenshot({ path: path + '/hero-detail-desktop.png' });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await settleImages();
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  await page.screenshot({ path: path + '/draft-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '展开导航' }).click();
  await page.getByRole('button', { name: '自在弈境首页', exact: true }).click();
  await page.getByRole('heading', { name: '下一局，从这里开始。' }).waitFor();
  await settleImages();
  await page.screenshot({ path: path + '/home-mobile.png', fullPage: true });
  const status = await (await page.request.get('http://127.0.0.1:4318/api/status')).json();
  const report = {
    checkedAt: new Date().toISOString(),
    status,
    scriptErrors,
    failedRequests,
    mobileOverflow,
    mobilePracticeVisible: await page.locator('.focus-card').isVisible(),
    homeImages,
    draftImages,
    note: 'Real local service; only browser-local teaching draft loaded, no fabricated personal records.',
  };
  await writeFile('evidence/player/live-check.json', JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      status,
      scriptErrors,
      failedRequests,
      mobileOverflow,
      loadedImages: [...homeImages, ...draftImages].filter((x) => x.loaded).length,
      failedImages: [...homeImages, ...draftImages].filter((x) => !x.loaded).length,
    }),
  );
} finally {
  await browser.close();
}
