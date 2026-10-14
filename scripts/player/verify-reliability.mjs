// Read-only acceptance against the running local instance. Never logs account rows.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const folder = 'evidence/reliability-v014';
mkdirSync(folder, { recursive: true });
const before = new DatabaseSync('data/reliability-backup/before.sqlite', { readOnly: true });
const current = new DatabaseSync('data/kaiju.sqlite', { readOnly: true });
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tables = ['settings', 'matches', 'plans', 'accounts', 'sessions', 'friendships'];
const preservation = tables.map((table) => {
  const old = before.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all();
  const now = current.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all();
  assert.deepEqual(now, old, table + ' changed during upgrade');
  return { table, rows: now.length, sha256: digest(now), unchanged: true };
});
const integrity = current.prepare('PRAGMA integrity_check').get();
assert.equal(integrity.integrity_check, 'ok');
before.close();
current.close();
const base = 'http://127.0.0.1:4318';
const status = await (await fetch(base + '/api/status')).json();
assert.equal(status.version, '0.14.0');
const pool = await (await fetch(base + '/api/pool-status')).json();
assert.ok(pool.pool.some((p) => p.heroId === 544 && p.level === 'main'));
const samples = [];
for (const heroId of [544, 521]) {
  const response = await fetch(
    base + '/api/tianyuan?kind=equip&heroId=' + heroId + '&date=2026-10-13',
  );
  assert.equal(response.status, 200);
  const packet = await response.json();
  assert.equal(packet.data.heroId, heroId);
  assert.ok(packet.data.equipmentWinRates.length > 0);
  writeFileSync(folder + '/live-equipment-' + heroId + '.json', JSON.stringify(packet, null, 2));
  samples.push({
    heroId,
    count: packet.data.equipmentWinRates.length,
    cache: packet.cache,
    fetchedAt: packet.fetchedAt,
    rawSha256: packet.rawSha256,
  });
}
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await page
    .locator('nav')
    .getByRole('button', { name: /我的英雄池/ })
    .click();
  await page
    .getByRole('region', { name: '英雄池保存位置' })
    .getByText('当前身份：本机访客', { exact: true })
    .waitFor();
  assert.equal(await page.getByLabel('赵怀真熟练度').inputValue(), 'main');
  await page.screenshot({ path: folder + '/live-guest-pool.png', fullPage: true });
  await page.locator('nav').getByRole('button', { name: '装备与版本', exact: true }).click();
  await page.getByRole('button', { name: '装备出场率 / 胜率', exact: true }).click();
  await page.getByLabel('装备统计查询日').fill('2026-10-13');
  await page.locator('.equipment-statistics tbody tr').first().waitFor({ timeout: 55000 });
  assert.equal(await page.locator('.equipment-statistics tbody tr').count(), samples[0].count);
  await page.screenshot({ path: folder + '/live-equipment-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.querySelector('.sidebar').getBoundingClientRect().right <= 0,
  );
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: folder + '/live-equipment-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  const result = {
    checkedAt: new Date().toISOString(),
    status,
    preservation,
    integrity,
    guestHero544Retained: true,
    equipment: samples,
    browser: { scope: 'fresh guest context, read-only', pageErrors: errors, mobileOverflow: false },
  };
  writeFileSync(folder + '/live-check.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
