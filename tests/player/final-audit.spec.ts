import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { emptyProfile } from '../../src/player/pro/model.ts';
const folder = process.env.KAIJU_EVIDENCE_DIR ?? 'evidence/final-audit-v016';
test('expired login has an explicit recovery path and never deletes stored guest heroes', async ({
  page,
  request,
}) => {
  await request.post('/api/pool', { data: [{ heroId: 544, level: 'main' }] });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('kaiju-token', 'expired-session');
    localStorage.setItem('kaiju-user', 'expired-user');
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '登录已过期', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出失效登录，进入访客', exact: true }).click();
  await expect(page.getByRole('button', { name: '当前身份：访客', exact: true })).toBeVisible();
  await page
    .locator('nav')
    .getByRole('button', { name: /我的英雄池/ })
    .click();
  await expect(page.getByLabel('赵怀真熟练度')).toHaveValue('main');
});
test('profile draft survives navigation and refresh but retains stale baseline protection', async ({
  page,
  request,
}) => {
  await request.post('/api/pro/profile', { data: emptyProfile() });
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '玩家档案', exact: true }).click();
  await page.locator('.manual-profile>summary').click();
  await page.getByLabel('档案名称', { exact: true }).fill('未保存的测试草稿');
  await page.locator('nav').getByRole('button', { name: '备战首页', exact: true }).click();
  await request.post('/api/pro/profile', { data: { ...emptyProfile(), name: '别处保存的新版本' } });
  await page.reload();
  await page.locator('nav').getByRole('button', { name: '玩家档案', exact: true }).click();
  await page.locator('.manual-profile>summary').click();
  await expect(page.getByLabel('档案名称', { exact: true })).toHaveValue('未保存的测试草稿');
  await page.getByRole('button', { name: '保存玩家档案', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('档案已在另一个页面更新');
  await page.getByRole('button', { name: '读取已保存版本（替换当前草稿）', exact: true }).click();
  await expect(page.getByLabel('档案名称', { exact: true })).toHaveValue('别处保存的新版本');
});
test('complete backup round trip includes frames, previews changes and leaves a downloadable pre-restore checkpoint', async ({
  page,
  request,
}) => {
  mkdirSync(folder, { recursive: true });
  await request.post('/api/pro/profile', { data: { ...emptyProfile(), name: '备份里的档案' } });
  await request.post('/api/pool', { data: [{ heroId: 544, level: 'main' }] });
  await page.goto('/');
  const frame = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 4, 4);
    return c.toDataURL('image/jpeg');
  });
  const r = await (
    await request.post('/api/pro/review', {
      data: {
        title: '合成备份验收帧',
        heroId: 544,
        videoName: 'synthetic.webm',
        events: [
          {
            id: crypto.randomUUID(),
            second: 1,
            label: '测试',
            observation: '仅验证截图保存',
            decision: '',
            allies: null,
            enemies: null,
            allyGold: null,
            enemyGold: null,
            objectiveIn: null,
            ultimateReady: null,
            frame,
          },
        ],
      },
    })
  ).json();
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载完整个人备份', exact: true }).click();
  const file = readFileSync((await (await downloaded).path())!);
  const backup = JSON.parse(file.toString());
  expect(backup.data.reviews.find((x: { id: string }) => x.id === r.id).events[0].frame).toBe(
    frame,
  );
  expect(backup).not.toHaveProperty('accounts');
  await request.post('/api/pro/profile', { data: { ...emptyProfile(), name: '恢复前的档案' } });
  await request.post('/api/pool', { data: [] });
  await page
    .getByLabel('选择完整个人备份')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: file });
  await expect(page.getByRole('heading', { name: '恢复到：本机访客' })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认恢复完整备份', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: folder + '/backup-preview-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page
    .getByRole('checkbox', { name: '我已核对目标空间与数量，确认替换当前已保存内容' })
    .check();
  await page.getByRole('button', { name: '确认恢复完整备份', exact: true }).click();
  await expect(page.getByRole('heading', { name: '下一局，从这里开始。' })).toBeVisible();
  expect((await (await request.get('/api/pro')).json()).profile.name).toBe('备份里的档案');
  expect(
    (await (await request.post('/api/pro/review-get', { data: { id: r.id } })).json()).events[0]
      .frame,
  ).toBe(frame);
  const checkpoint = await (await request.get('/api/backup/checkpoint')).json();
  expect(checkpoint.data.profile.name).toBe('恢复前的档案');
  expect(checkpoint.data.pool).toEqual([]);
});
test('unsaved review navigation is explicit and cancel keeps the current editor', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '录像复盘', exact: true }).click();
  await page.getByRole('button', { name: '添加无截图时间点', exact: true }).click();
  await page.getByLabel('实际观察').fill('合成测试观察');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('nav').getByRole('button', { name: '备战首页', exact: true }).click();
  await expect(page.getByLabel('实际观察')).toHaveValue('合成测试观察');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('nav').getByRole('button', { name: '备战首页', exact: true }).click();
  await expect(page.getByRole('heading', { name: '下一局，从这里开始。' })).toBeVisible();
});
