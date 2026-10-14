import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
test('current-chat replay package is local, accepts tied results and exports an untrained evaluation sample', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: '录像复盘', exact: true }).click();
  await expect(page.getByRole('heading', { name: '交给当前 Codex 对话复盘' })).toBeVisible();
  await page
    .getByLabel('打开对局录像')
    .setInputFiles('tests/player/fixtures/synthetic-replay.webm');
  await page.locator('video').evaluate((v: HTMLVideoElement) => v.play());
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.3);
  await page.locator('video').evaluate((v: HTMLVideoElement) => v.pause());
  await page.getByRole('button', { name: '截取当前决策点', exact: true }).click();
  await page.getByRole('button', { name: '准备当前对话复盘包', exact: true }).click();
  const prompt = page.getByLabel('当前对话复盘指令');
  await expect(prompt).toBeVisible();
  const directory = (await prompt.inputValue()).match(/「(.+?)」/)![1];
  const packet = JSON.parse(readFileSync(join(directory, 'input.json'), 'utf8'));
  expect(packet.material.events[0].observation).toContain('未填写观察');
  await page.getByRole('button', { name: '读取 Codex 复盘结果' }).click();
  await expect(page.getByRole('status')).toContainText('尚未写入');
  const id = packet.material.events[0].id;
  writeFileSync(
    join(directory, 'result.json'),
    JSON.stringify({
      schema: 'kaiju-codex-review-v1',
      packetId: packet.id,
      inputSha256: packet.inputSha256,
      scope: '仅合成视频接口测试，未调用模型',
      findings: [
        {
          eventId: id,
          evidenceEventIds: [id],
          verdict: 'insufficient',
          observation: '合成流程测试画面',
          advice: '不能推断真实游戏决策',
          alternative: '使用真实对局补充证据',
          drill: '仅检查证据传递',
          uncertainty: '没有真实对局材料',
        },
      ],
      limitations: ['这是端到端协议验证，不是AI效果验证'],
    }),
  );
  await page.getByRole('button', { name: '读取 Codex 复盘结果' }).click();
  await expect(page.getByLabel('当前 Codex 对话复盘结果')).toContainText('证据不足，暂缓判断');
  await page.locator('.review-evaluation summary').click();
  await page.getByLabel('复盘人工核对').selectOption('证据不足，无法判断');
  await page.getByLabel('复盘校正依据').fill('这是合成视频，仅验证导出，不代表实际训练。');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出待审核评测样本' }).click();
  const download = await pending;
  const sample = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(sample.trainingPerformed).toBe(false);
  expect(sample.analysis.packetId).toBe(packet.id);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('当前 Codex 对话复盘结果').scrollIntoViewIfNeeded();
  mkdirSync('evidence/strength-v2', { recursive: true });
  await page.screenshot({ path: 'evidence/strength-v2/review-handoff-test-mobile.png' });
  await page.getByLabel('实际观察').fill('修订后需重新整理复盘包');
  await expect(prompt).toHaveCount(0);
  await expect(page.getByLabel('当前 Codex 对话复盘结果')).toHaveCount(0);
});
