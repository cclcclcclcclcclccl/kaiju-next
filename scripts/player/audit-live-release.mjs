import { readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { get } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const output = 'evidence/final-audit-v016';
mkdirSync(output, { recursive: true });
const sha = (x) => createHash('sha256').update(x).digest('hex');
const json = async (path) => {
  const response = await fetch('http://127.0.0.1:4318' + path);
  assert.equal(response.status, 200, path);
  return response.json();
};
const status = await json('/api/status');
assert.equal(status.version, '0.16.0');
const workspace = await json('/api/workspace');
assert(workspace.pool.some((x) => x.heroId === 544 && x.level === 'main'));
const backup = await json('/api/backup');
assert.equal(backup.format, 'kaiju-personal-backup-v1');
assert.deepEqual(backup.data.pool, workspace.pool);
const sources = await json('/api/tianyuan/status');
const asset = readdirSync('dist/assets').find((x) => /^heroes-.*\.js$/.test(x));
assert(asset);
const compression = await new Promise((resolve, reject) => {
  get('http://127.0.0.1:4318/assets/' + asset, { headers: { 'Accept-Encoding': 'gzip' } }, (r) => {
    const chunks = [];
    r.on('data', (b) => chunks.push(b));
    r.on('end', () => {
      try {
        const wire = Buffer.concat(chunks);
        const raw = readFileSync(join('dist/assets', asset));
        assert.equal(r.headers['content-encoding'], 'gzip');
        assert.equal(sha(gunzipSync(wire)), sha(raw));
        resolve({
          asset,
          decodedBytes: raw.length,
          transferredBytes: wire.length,
          reductionPercent: Math.round((1 - wire.length / raw.length) * 1000) / 10,
        });
      } catch (e) {
        reject(e);
      }
    });
  }).on('error', reject);
});
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4318/');
  await expect(page.getByRole('button', { name: '当前身份：访客', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click();
  await expect(page.getByRole('button', { name: '下载完整个人备份', exact: true })).toBeVisible();
  await page.screenshot({ path: output + '/live-backup-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: output + '/live-backup-mobile.png', animations: 'disabled' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator('nav')
    .getByRole('button', { name: /我的英雄池/ })
    .click();
  await expect(page.getByLabel('赵怀真熟练度')).toHaveValue('main');
  await page.screenshot({ path: output + '/live-pool-desktop.png', animations: 'disabled' });
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByText(/四分段来源状态 ·/).click();
  await expect(page.getByRole('region', { name: '全榜来源状态', exact: true })).toBeVisible();
  await page.screenshot({ path: output + '/live-sources-desktop.png', animations: 'disabled' });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

const before = new DatabaseSync('data/final-audit-backup/before.sqlite', { readOnly: true });
const current = new DatabaseSync('data/kaiju.sqlite', { readOnly: true });
const tables = {};
try {
  for (const table of [
    'settings',
    'matches',
    'plans',
    'accounts',
    'sessions',
    'friendships',
    'pool_history',
  ]) {
    const canonical = (db) =>
      JSON.stringify(
        db
          .prepare('SELECT * FROM ' + table)
          .all()
          .map((x) => JSON.stringify(x))
          .sort(),
      );
    const oldHash = sha(canonical(before));
    const hash = sha(canonical(current));
    assert.equal(hash, oldHash, table + ' changed');
    tables[table] = {
      unchanged: true,
      sha256: hash,
      rows: current.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n,
    };
  }
  assert.equal(current.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
} finally {
  before.close();
  current.close();
}
const manifest = JSON.parse(readFileSync('data/final-audit-backup/manifest.json', 'utf8'));
let archived = 0;
for (const row of manifest) {
  if (sha(readFileSync(row.file)) !== row.sha256) {
    const archive = join(output, 'regression', row.file.replace(/^evidence\//, ''));
    mkdirSync(dirname(archive), { recursive: true });
    copyFileSync(row.file, archive);
    copyFileSync(join('data/final-audit-backup', row.file), row.file);
    archived++;
  }
  assert.equal(sha(readFileSync(row.file)), row.sha256, row.file);
}
const result = {
  checkedAt: new Date().toISOString(),
  status,
  guestZhaoHuaizhenPreserved: true,
  backupCounts: Object.fromEntries(
    Object.entries(backup.data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 'object']),
  ),
  compression,
  sources,
  liveBrowserErrors: errors,
  personalTables: tables,
  databaseIntegrity: 'ok',
  historicalEvidence: { verified: manifest.length, regressionOutputsArchived: archived },
};
writeFileSync(output + '/live-validation.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
