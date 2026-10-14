import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { emptyProfile } from '../../src/player/pro/model.ts';
const folder = 'evidence/profile-recovery-v015';
test('stale profile edits preserve both server record and local draft until explicit reload', async ({
  page,
  context,
  request,
}) => {
  mkdirSync(folder, { recursive: true });
  await request.post('/api/pro/profile', { data: emptyProfile() });
  const other = await context.newPage();
  for (const p of [page, other]) {
    await p.goto('/');
    await p.locator('nav').getByRole('button', { name: '玩家档案', exact: true }).click();
    await p.locator('.manual-profile > summary').click();
  }
  await page.getByLabel('档案名称', { exact: true }).fill('先保存的档案');
  await other.getByLabel('档案名称', { exact: true }).fill('需要保留的草稿');
  await page.getByRole('button', { name: '保存玩家档案', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('档案已保存');
  await other.getByRole('button', { name: '保存玩家档案', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('档案已在另一个页面更新');
  await expect(other.getByLabel('档案名称', { exact: true })).toHaveValue('需要保留的草稿');
  expect((await (await request.get('/api/pro')).json()).profile.name).toBe('先保存的档案');
  const downloadPromise = other.waitForEvent('download');
  await other.getByRole('button', { name: '导出当前档案草稿', exact: true }).click();
  const download = await downloadPromise;
  expect(JSON.parse(readFileSync((await download.path())!, 'utf8')).name).toBe('需要保留的草稿');
  await other.screenshot({ path: folder + '/profile-conflict.png', fullPage: true });
  await other.getByRole('button', { name: '读取已保存版本（替换当前草稿）', exact: true }).click();
  await expect(other.getByLabel('档案名称', { exact: true })).toHaveValue('先保存的档案');
  await other.close();
});
test('exported pool restores after preview, preserves existing mastery, and rejects malformed backups', async ({
  page,
  request,
}) => {
  mkdirSync(folder, { recursive: true });
  await request.post('/api/pro/profile', { data: emptyProfile() });
  await request.post('/api/pool', {
    data: [
      { heroId: 544, level: 'main' },
      { heroId: 190, level: 'learning' },
    ],
  });
  await page.goto('/');
  await page
    .locator('nav')
    .getByRole('button', { name: /我的英雄池/ })
    .click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出自选英雄备份', exact: true }).click();
  const backup = readFileSync((await (await downloadPromise).path())!);
  await request.post('/api/pool', { data: [{ heroId: 544, level: 'comfortable' }] });
  await page.getByRole('button', { name: '重新读取英雄池', exact: true }).click();
  await expect(page.getByLabel('赵怀真熟练度')).toHaveValue('comfortable');
  await page.getByText('从自选英雄备份恢复', { exact: true }).click();
  await page
    .getByLabel('选择英雄池备份文件')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await expect(page.getByText(/预计补入 1 位/)).toBeVisible();
  expect((await (await request.get('/api/workspace')).json()).pool).toHaveLength(1);
  await page.getByRole('button', { name: '确认补入备份英雄', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看诸葛亮资料', exact: true })).toBeVisible();
  await expect(page.getByLabel('赵怀真熟练度')).toHaveValue('comfortable');
  await page.getByLabel('选择英雄池备份文件').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"unknown","pool":[]}'),
  });
  await expect(page.getByRole('alert')).toContainText('备份校验失败');
  await expect(page.getByRole('button', { name: '确认补入备份英雄', exact: true })).toHaveCount(0);
  await page.screenshot({ path: folder + '/pool-backup-validation.png', fullPage: true });
  await page.reload();
  await page
    .locator('nav')
    .getByRole('button', { name: /我的英雄池/ })
    .click();
  await expect(page.getByLabel('赵怀真熟练度')).toHaveValue('comfortable');
  await expect(page.getByRole('button', { name: '查看诸葛亮资料', exact: true })).toBeVisible();
});
