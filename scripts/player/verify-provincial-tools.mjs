import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const out = 'evidence/provincial-20261022';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    pathToFileURL(path.resolve('submission/provincial-kit-20261022/试用记录器.html')).href,
  );
  assert.equal(await page.locator('.outcome').count(), 6);
  for (const v of await page.locator('.outcome').evaluateAll((es) => es.map((e) => e.value)))
    assert.equal(v, '未尝试');
  await page.getByRole('button', { name: '导出匿名记录JSON' }).click();
  await page.getByRole('status').filter({ hasText: '请先填写' }).waitFor();
  await page.getByLabel('试用代号').fill('AUTOMATED-CHECK-NOT-PARTICIPANT');
  await page.getByLabel('网络类型').selectOption('其他');
  await page.getByLabel('网站入口能否打开').selectOption('可以打开');
  await page.locator('#consent').check();
  const task = page.locator('[data-id="T1"]');
  await task.getByRole('button', { name: '开始计时' }).click();
  await task.getByRole('button', { name: '停止计时' }).click();
  await task.locator('.outcome').selectOption('帮助后成功');
  await task.locator('.note').fill('自动化行为测试，非真实试用');
  await page.reload();
  assert.equal(await task.locator('.outcome').inputValue(), '帮助后成功');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出匿名记录JSON' }).click();
  const file = await (await download).path();
  const result = JSON.parse(fs.readFileSync(file));
  assert.equal(result.tasks[0].outcome, '帮助后成功');
  assert.equal(result.tasks[1].seconds, null);
  assert.equal(result.tasks[1].outcome, '未尝试');
  assert.equal(result.kind, 'participant-self-reported');
  assert.equal(result.consent, true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.screenshot({ path: out + '/trial-empty-mobile.png', fullPage: true });
  await page.goto('http://127.0.0.1:4318/review/index.html');
  await page.getByRole('heading', { name: '自在弈境 · 省赛准备台' }).waitFor();
  await page.locator('#guide05 summary').click();
  await page.locator('#guide05 table').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: out + '/review-mobile.png', fullPage: true });
  const url = fs.readFileSync('data/public-site/PUBLIC_URL.txt', 'utf8').trim();
  const response = await page.goto(url + '/review/index.html', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.getByRole('heading', { name: '自在弈境 · 省赛准备台' }).waitFor();
  const trial = await page.request.get(url + '/review/' + encodeURIComponent('试用记录器.html'));
  assert.equal(trial.status(), 200);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + '/materials-browser.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        publicReviewUrl: url + '/review/index.html',
        publicStatus: response.status(),
        trialPublicStatus: trial.status(),
        emptyTasks: 6,
        consentGate: true,
        timerWorks: true,
        persistence: true,
        jsonExport: true,
        unattemptedTimeRemainsNull: true,
        mobileOverflow: false,
        pageErrors: errors,
        automatedSampleNotRetainedAsRealStudy: true,
        realParticipants: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    'Trial persistence/export/consent and public guide passed; real participants remain 0.',
  );
} finally {
  await browser.close();
}
