import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const base = 'http://127.0.0.1:4318',
  dir = 'evidence/visual-bp-v018/live';
await fs.mkdir(dir, { recursive: true });
const read = async (path) => {
  const r = await fetch(base + '/api/' + path, { signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw Error(path + ' HTTP ' + r.status);
  return r.json();
};
const hash = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const before = JSON.parse(await fs.readFile('data/visual-bp-before/live.json', 'utf8'));
const status = await read('status');
if (status.version !== '0.18.0') throw Error('Wrong running version');
const date = new Date(Date.now() + 8 * 3600000 - 86400000).toISOString().slice(0, 10);
const equip = await read(`tianyuan?kind=equip&date=${date}&heroId=521`);
const combined = await read(`tianyuan?kind=combined&date=${date}&heroId=521`);
if (
  !equip.data.topItemsBySlot?.length ||
  !equip.data.topFullBuilds?.length ||
  !combined.data.summonerSkills.some((s) => s.skillIcon)
)
  throw Error('Live source fields missing');
await fs.writeFile(dir + '/equip-packet.json', JSON.stringify(equip, null, 2));
await fs.writeFile(dir + '/combined-packet.json', JSON.stringify(combined, null, 2));
const browser = await chromium.launch({ channel: 'msedge' }),
  errors = [];
const checks = {};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator('nav').getByRole('button', { name: '阵容备战', exact: true }).click();
  await page.getByRole('button', { name: '开始新演练', exact: true }).click();
  await page.getByRole('button', { name: 'BP选择赵怀真', exact: true }).click();
  await page.getByRole('button', { name: '确认本轮', exact: true }).click();
  await page.getByLabel('搜索待选英雄').fill('镜');
  await page.locator('.bp-rounds').scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/bp-current.png', animations: 'disabled' });
  checks.bpPortraits = await page
    .locator('.bp-rounds img')
    .evaluateAll((xs) => xs.every((x) => x.complete && x.naturalWidth > 0));
  await page.locator('nav').getByRole('button', { name: '英雄图鉴', exact: true }).click();
  await page.getByLabel('搜索英雄', { exact: true }).fill('海月');
  await page.getByRole('button', { name: '查看海月资料', exact: true }).click();
  const detail = page.getByRole('dialog'),
    stats = page.locator('.tianyuan-hero');
  await stats.getByRole('meter', { name: '胜率', exact: true }).waitFor({ timeout: 45000 });
  await page.screenshot({ path: dir + '/hero-rates.png', animations: 'disabled' });
  checks.rate = await stats
    .getByRole('meter', { name: '胜率', exact: true })
    .evaluate((el) => ({
      value: el.getAttribute('aria-valuenow'),
      color: getComputedStyle(el.firstElementChild).backgroundColor,
    }));
  await detail.locator('.skill-section').scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.skill-tabs img')].every(
      (i) => i.complete && i.naturalWidth > 0,
    ),
  );
  await page.screenshot({ path: dir + '/hero-skills.png', animations: 'disabled' });
  checks.skillIcons = await detail.locator('.skill-tabs img').count();
  await detail.locator('.hero-builds').scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/official-build-runes.png', animations: 'disabled' });
  await stats.getByRole('button', { name: '实际出装统计', exact: true }).click();
  await stats.locator('.equipment-breakdown').waitFor({ timeout: 45000 });
  await stats.locator('.equipment-breakdown').scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/equipment-current.png', animations: 'disabled' });
  await stats.locator('.full-build-list').scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/full-builds-current.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await stats.locator('.full-build-list').scrollIntoViewIfNeeded();
  await page.screenshot({ path: dir + '/full-builds-mobile.png', animations: 'disabled' });
  checks.mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (checks.mobileOverflow || errors.length || !checks.bpPortraits)
    throw Error('Live browser check failed');
} finally {
  await browser.close();
}
const after = {};
for (const key of ['workspace', 'pro']) {
  after[key] = hash(await read(key));
  if (before[key] !== after[key]) throw Error('Personal state changed: ' + key);
}
const workspace = await read('workspace');
await fs.writeFile(
  dir + '/verification.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      status,
      sourceDate: date,
      equipment: {
        cache: equip.cache,
        source: equip.url,
        slots: equip.data.topItemsBySlot.length,
        builds: equip.data.topFullBuilds.length,
      },
      checks,
      errors,
      personalDataPreserved: true,
      before,
      after,
      zhaohuaizhenInPool: workspace.pool.some((h) => h.heroId === 544),
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    version: status.version,
    date,
    slots: equip.data.topItemsBySlot.length,
    builds: equip.data.topFullBuilds.length,
    checks,
    errors,
    personalDataPreserved: true,
  }),
);
