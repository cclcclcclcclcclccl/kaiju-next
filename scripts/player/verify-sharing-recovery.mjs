import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { expect } from '@playwright/test';

const folder = 'evidence/public-reliability-v0251';
await fs.mkdir(folder, { recursive: true });
const { origin } = JSON.parse(await fs.readFile('data/public-site/config.json', 'utf8'));
const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
try {
  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '复制分享网址' }).click();
  await expect(page.getByText('分享网址已复制', { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), origin);
  await page.getByRole('button', { name: '注册 / 登录与好友' }).click();
  await page.getByLabel('用户名', { exact: true }).fill('network_draft');
  await page.getByLabel('玩家昵称', { exact: true }).fill('断线输入验收');
  await page.getByLabel('开局账号密码', { exact: true }).fill('test-only-not-submitted');
  // Fault injection affects this browser only; the real public service remains running.
  await page.route('**/api/status', (route) =>
    route.fulfill({ status: 503, contentType: 'text/html', body: '<html>Temporary outage</html>' }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const warning = page.getByRole('alert', { name: '服务连接提示' });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('联系分享者');
  await expect(warning).not.toContainText('start-kaiju.cmd');
  await page.screenshot({ path: folder + '/mobile-offline.png', fullPage: true });
  await page.unroute('**/api/status');
  await page.getByRole('button', { name: '检查服务连接' }).click();
  await expect(page.getByRole('status', { name: '连接恢复提示' })).toBeVisible();
  await expect(page.getByLabel('用户名', { exact: true })).toHaveValue('network_draft');
  let posts = 0;
  await page.route('**/api/auth/register', (route) => {
    posts++;
    return route.fulfill({
      status: 502,
      contentType: 'text/html',
      body: '<html>Gateway error</html>',
    });
  });
  await page.getByRole('button', { name: '创建并登录', exact: true }).click();
  await expect(
    page.getByText('服务未返回有效的保存确认。请保留输入，恢复后先检查已保存记录。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel('用户名', { exact: true })).toHaveValue('network_draft');
  assert.equal(posts, 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: folder + '/mobile-recovered.png', fullPage: true });
  // Initial loading outage should recover without reloading away any user inputs.
  const second = await context.newPage();
  second.on('pageerror', (error) => errors.push(error.message));
  await second.route('**/api/**', (route) => route.abort('internetdisconnected'));
  await second.goto(origin, { waitUntil: 'domcontentloaded' });
  await expect(second.getByRole('alert', { name: '服务连接提示' })).toBeVisible();
  await second.unroute('**/api/**');
  await second.getByRole('button', { name: '检查服务连接' }).click();
  await expect(second.getByRole('button', { name: '注册 / 登录与好友' })).toBeVisible();
  assert.deepEqual(errors, []);
  const result = {
    at: new Date().toISOString(),
    origin,
    checks: [
      'public URL clipboard',
      'remote outage guidance',
      'form input survives reconnect',
      'HTML gateway error explained',
      'POST not automatically retried',
      'initial outage recovers',
      'mobile no overflow',
    ],
    errors,
    method:
      'Actual public page; outage and HTML gateway failures injected only in the verification browser.',
  };
  await fs.writeFile(folder + '/recovery-verification.json', JSON.stringify(result, null, 2));
  console.log(result);
} finally {
  await browser.close();
}
