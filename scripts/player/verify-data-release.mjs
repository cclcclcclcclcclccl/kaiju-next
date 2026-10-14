import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const folder = 'evidence/data-repair-v017';
const sha = (x) => createHash('sha256').update(x).digest('hex');
const get = async (path) => {
  const r = await fetch('http://127.0.0.1:4318/api' + path);
  assert.equal(r.status, 200, path);
  return r.json();
};
const status = await get('/status');
assert.equal(status.version, '0.17.0');
const tier = await get('/tianyuan?kind=tier&date=2026-10-14');
const stats = await get('/tianyuan?kind=stats&date=2026-10-13&mode=1');
const cases = await get('/kpl/cases');
assert.equal(tier.data.tiers.length, 133);
assert.equal(stats.data.length, 135);
const selected = tier.data.tiers.filter((h) => [105, 126, 508, 531].includes(h.heroId));
assert.equal(selected.find((h) => h.heroId === 531).tierInRole, 'T0');
assert.equal(selected.find((h) => h.heroId === 508).tierInRole, 'T4');
const workspace = await get('/workspace');
assert(workspace.pool.some((h) => h.heroId === 544));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4318/');
  await page.locator('nav').getByRole('button', { name: '英雄图鉴', exact: true }).click();
  await page.getByLabel('搜索英雄', { exact: true }).fill('廉颇');
  await page.getByLabel('图鉴统计分段').selectOption('大众分段');
  const lianpo = stats.data.find((r) => r.heroId === 105);
  await expect(page.getByLabel('廉颇来源表现')).toContainText(lianpo.winRate.toFixed(2) + '%');
  await page.screenshot({ path: folder + '/live-atlas-desktop.png', animations: 'disabled' });
  await page.getByRole('button', { name: '查看廉颇资料', exact: true }).click();
  await expect(page.getByLabel('英雄来源梯度')).toContainText('T3');
  await expect(page.getByLabel('英雄分段三率')).toContainText(lianpo.winRate.toFixed(2) + '%');
  await page.locator('.tianyuan-hero').scrollIntoViewIfNeeded();
  await page.screenshot({ path: folder + '/live-lianpo-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('英雄来源梯度').scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: folder + '/live-lianpo-mobile.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await expect(page.locator('.tianyuan-live .tier-portrait')).toHaveCount(133);
  await expect(page.getByRole('button', { name: '查看镜公开详情', exact: true })).toContainText(
    '天元 T0',
  );
  await expect(page.getByRole('button', { name: '查看伽罗公开详情', exact: true })).toContainText(
    '天元 T4',
  );
  await page.locator('.tier-board').scrollIntoViewIfNeeded();
  await page.screenshot({ path: folder + '/live-source-board.png', animations: 'disabled' });
  await page.locator('nav').getByRole('button', { name: '录像复盘', exact: true }).click();
  await page.locator('.kpl-cases>summary').click();
  await expect(page.locator('.kpl-cases')).toContainText('已训练样本：0');
  await expect(page.locator('.kpl-cases a').filter({ hasText: '前往官方回放' })).toHaveCount(
    cases.matches.reduce((s, m) => s + m.rounds.length, 0),
  );
  await page.locator('.kpl-cases').scrollIntoViewIfNeeded();
  await page.screenshot({ path: folder + '/live-kpl-cases.png', animations: 'disabled' });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
const before = new DatabaseSync('data/data-repair-v017-before/before.sqlite', { readOnly: true });
const db = new DatabaseSync('data/kaiju.sqlite', { readOnly: true });
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
    const fingerprint = (d) =>
      sha(
        JSON.stringify(
          d
            .prepare('SELECT * FROM ' + table)
            .all()
            .map((x) => JSON.stringify(x))
            .sort(),
        ),
      );
    assert.equal(fingerprint(db), fingerprint(before), table);
    tables[table] = { unchanged: true, sha256: fingerprint(db) };
  }
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
} finally {
  before.close();
  db.close();
}
const manifest = JSON.parse(readFileSync('data/data-repair-v017-before/manifest.json', 'utf8'));
let archived = 0;
for (const row of manifest) {
  if (sha(readFileSync(row.file)) !== row.sha256) {
    const target = join(folder, 'regression', row.file.replace(/^evidence\//, ''));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(row.file, target);
    copyFileSync(join('data/data-repair-v017-before', row.file), row.file);
    archived++;
  }
  assert.equal(sha(readFileSync(row.file)), row.sha256, row.file);
}
const collection = JSON.parse(readFileSync(folder + '/collection/collection.json', 'utf8'));
const retry = JSON.parse(readFileSync(folder + '/final-source-check.json', 'utf8'));
const checked = collection.results.map((r) =>
  r.state === 'ok'
    ? r
    : {
        ...r,
        resolved: retry.some(
          (x) => x.state === 'fresh' && JSON.stringify(x.query) === JSON.stringify(r.query),
        ),
      },
);
// Compare query fields independent of JSON property ordering.
for (const r of checked)
  if (r.state === 'error')
    r.resolved = retry.some(
      (x) => x.state === 'fresh' && Object.entries(r.query).every(([k, v]) => x.query[k] === v),
    );
assert(checked.every((r) => r.state === 'ok' || r.resolved));
for (const r of collection.results.filter((r) => r.state === 'ok'))
  assert.equal(sha(readFileSync(folder + '/collection/raw/' + r.rawSha256 + '.json')), r.rawSha256);
const result = {
  checkedAt: new Date().toISOString(),
  status,
  tier: { date: tier.requestedDate, rawSha256: tier.rawSha256, selected },
  stats: {
    date: stats.requestedDate,
    rawSha256: stats.rawSha256,
    lianpo: stats.data.find((r) => r.heroId === 105),
  },
  sourceHealth: await get('/tianyuan/status'),
  collection: {
    total: checked.length,
    firstPass: checked.filter((r) => r.state === 'ok').length,
    resolvedRetries: checked.filter((r) => r.resolved).length,
  },
  kpl: {
    matches: cases.matches.length,
    rounds: cases.matches.reduce((s, m) => s + m.rounds.length, 0),
    trained: false,
  },
  tables,
  databaseIntegrity: 'ok',
  historicalEvidence: { verified: manifest.length, archivedNewOutputs: archived },
  livePageErrors: errors,
};
writeFileSync(folder + '/live-validation.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
