import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const folder = 'evidence/skin-equipment-repair';
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const packets = [];
page.on('response', async (response) => {
  if (!response.url().includes('/api/tianyuan?') || !response.ok()) return;
  const packet = await response.json().catch(() => undefined);
  if (packet && ['skin', 'equip'].includes(packet.query?.kind)) packets.push(packet);
});
const images = async (selector) => {
  const nodes = page.locator(selector);
  await nodes.first().scrollIntoViewIfNeeded();
  await nodes.evaluateAll(async (items) => {
    await Promise.all(items.slice(0, 3).map((item) => item.decode().catch(() => {})));
  });
  return nodes.evaluateAll((items) =>
    items.slice(0, 3).map((item) => ({
      src: item.src,
      loaded: item.complete && item.naturalWidth > 0,
      width: item.naturalWidth,
    })),
  );
};
try {
  await page.goto('http://127.0.0.1:4318/');
  await page.locator('nav').getByRole('button', { name: '装备与版本', exact: true }).click();
  await page.getByRole('button', { name: '皮肤使用率', exact: true }).click();
  await page.getByLabel('皮肤统计英雄').selectOption('521');
  await page.locator('.skin-usage-card').first().waitFor({ timeout: 60000 });
  const skinImages = await images('.skin-usage-card img');
  assert(skinImages.length && skinImages.every((image) => image.loaded));
  await page.screenshot({
    path: folder + '/live-skin-rates.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({
    path: folder + '/live-skin-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '装备出场率 / 胜率', exact: true }).click();
  await page.getByLabel('统计英雄', { exact: true }).selectOption('521');
  await page.locator('.equipment-statistics tbody tr').first().waitFor({ timeout: 60000 });
  const equipImages = await images('.equipment-statistics tbody img');
  assert(equipImages.length && equipImages.every((image) => image.loaded));
  await page.screenshot({
    path: folder + '/live-equipment-icons.png',
    fullPage: true,
    animations: 'disabled',
  });
  const database = new DatabaseSync('data/kaiju.sqlite', { readOnly: true });
  const before = JSON.parse(readFileSync('data/skin-equipment-before.json', 'utf8'));
  for (const [name, hash] of Object.entries(before)) {
    const current = createHash('sha256')
      .update(JSON.stringify(database.prepare('SELECT * FROM "' + name + '" ORDER BY rowid').all()))
      .digest('hex');
    assert.equal(current, hash, 'Existing player data changed: ' + name);
  }
  const integrity = database.prepare('PRAGMA integrity_check').get();
  database.close();
  assert.equal(errors.length, 0);
  const result = {
    checkedAt: new Date().toISOString(),
    skinImages,
    equipImages,
    errors,
    playerTablesPreserved: Object.keys(before),
    integrity,
    packets,
  };
  writeFileSync(folder + '/live-verification.json', JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        skinImages,
        equipImages,
        playerTablesPreserved: Object.keys(before),
        errors,
        queries: packets.map((p) => p.query),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
