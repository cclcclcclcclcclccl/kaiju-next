import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { heroByName } from '../../src/player/catalog.ts';
import { emptyProfile } from '../../src/player/pro/model.ts';
const id = (name: string) => heroByName(name).id;
test('a player can enter a sourced table without JSON and keep an unpublished sample count unknown', async ({
  page,
  request,
}) => {
  const initial = await (await request.get('/api/pro')).json();
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '分段梯度', exact: true }).click();
  await page.getByRole('button', { name: '导入统计快照' }).click();
  await page.getByLabel('批次名称', { exact: true }).fill('表格流程测试（非实际游戏数据）');
  await page.getByLabel('游戏版本', { exact: true }).fill('TEST-TABLE');
  await page.getByLabel('数据发布者', { exact: true }).fill('合成验收数据');
  await page.getByLabel('统计来源', { exact: true }).fill('#小程序://天元之弈/u6nCjaHUkuIRe6u');
  await page.getByLabel('录入英雄1', { exact: true }).selectOption('王昭君');
  await page.getByLabel('胜率 %第1行', { exact: true }).fill('50.25');
  await page.getByLabel('出场率 %第1行', { exact: true }).fill('12');
  await page.getByLabel('禁用率 %第1行', { exact: true }).fill('3');
  await page.getByRole('button', { name: '预览并核对' }).click();
  await expect(page.locator('.import-preview')).toContainText('未公布');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mkdirSync('evidence/reference-informed/screenshots', { recursive: true });
  await page.screenshot({
    path: 'evidence/reference-informed/screenshots/table-import-mobile.png',
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '确认保存统计' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.pro-table tbody')).toContainText('王昭君');
  await expect(page.locator('.pro-table tbody')).toContainText('场次未知');
  await expect(page.getByRole('button', { name: '复制小程序来源口令' })).toBeVisible();
  const current = await (await request.get('/api/pro')).json();
  const row = current.snapshots.find((s: any) => s.patch === 'TEST-TABLE');
  expect(row.rows[0].games).toBeUndefined();
  for (const s of current.snapshots.filter(
    (s: any) => !initial.snapshots.some((old: any) => old.id === s.id),
  ))
    await request.post('/api/pro/snapshot-remove', { data: { id: s.id } });
  writeFileSync(
    'evidence/reference-informed/accessibility-import.json',
    JSON.stringify({ violations: axe.violations, incomplete: axe.incomplete.length }, null, 2),
  );
});
test('five accepted and sharing accounts produce a persistent visible squad result that loads into BP', async ({
  page,
  request,
}) => {
  const stamp = Date.now().toString(36),
    accounts: any[] = [];
  const names = ['吕布', '李白', '王昭君', '后羿', '张飞'];
  const call = async (path: string, token: string, data?: unknown) => {
    const r = await request.fetch('/api' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + token },
      ...(data === undefined ? {} : { data }),
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  for (let i = 0; i < 5; i++) {
    const r = await request.post('/api/auth/register', {
      data: {
        username: 'squad_' + stamp + '_' + i,
        name: '测试队友' + i,
        password: 'squad-fixture-123',
      },
    });
    expect(r.ok()).toBe(true);
    const a = await r.json();
    accounts.push(a);
    await call('/pool', a.token, [{ heroId: id(names[i]), level: 'main' }]);
    await call('/pro/profile', a.token, {
      ...emptyProfile(),
      name: '测试队友' + i,
      sharePool: true,
    });
    if (i) {
      await call('/social/request', accounts[0].token, { code: a.user.code });
      const social = await call('/social', a.token);
      await call('/social/respond', a.token, { id: social.friends[0].id, accept: true });
    }
  }
  await page.addInitScript((a) => {
    localStorage.setItem('kaiju-token', a.token);
    localStorage.setItem('kaiju-user', a.user.id);
  }, accounts[0]);
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '体系练习', exact: true }).click();
  for (let i = 1; i < 5; i++)
    await page.getByRole('checkbox', { name: new RegExp('测试队友' + i) }).check();
  await page.getByRole('button', { name: '生成五人起始阵容' }).click();
  await expect(page.locator('.squad-plans article')).toHaveCount(1);
  for (const n of names) await expect(page.locator('.squad-assignments')).toContainText(n);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  mkdirSync('evidence/reference-informed/screenshots', { recursive: true });
  await page.locator('.squad-plans').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'evidence/reference-informed/screenshots/squad-test-accounts.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '带入五人阵容', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择我方打野' })).toContainText('李白');
  await expect(page.getByRole('button', { name: '选择我方游走' })).toContainText('张飞');
  writeFileSync(
    'evidence/reference-informed/accessibility-squad.json',
    JSON.stringify({ violations: audit.violations, incomplete: audit.incomplete.length }, null, 2),
  );
});
