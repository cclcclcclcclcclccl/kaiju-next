import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
const folder = resolve('submission/release-v0262/video');
await fs.mkdir(folder, { recursive: true });
const base = 'https://cclcclcclcclcclccl.github.io/kaiju-next/';
const browser = await chromium.launch({ channel: 'msedge' });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: folder, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage(),
  video = page.video();
const start = Date.now(),
  scenes = [];
async function caption(title, text) {
  await page.evaluate(
    ({ title, text }) => {
      document.getElementById('update-caption')?.remove();
      const div = document.createElement('div');
      div.id = 'update-caption';
      Object.assign(div.style, {
        position: 'fixed',
        zIndex: '99999',
        left: '0',
        right: '0',
        bottom: '0',
        padding: '20px 40px',
        background: '#0c172bf5',
        color: '#f1d49c',
        font: '24px/1.6 "Microsoft YaHei",sans-serif',
        borderTop: '2px solid #c9a15d',
      });
      const strong = document.createElement('strong');
      strong.textContent = title;
      const p = document.createElement('div');
      p.textContent = text;
      div.append(strong, p);
      document.body.append(div);
    },
    { title, text },
  );
  scenes.push({ title, second: (Date.now() - start) / 1000 });
}
try {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByText('固定在线版 · 浏览器存储', { exact: false }).waitFor();
  await caption(
    '2026-10-25 更新实录 · v0.26.2',
    '免费固定公网入口，无需作者电脑开机。前面的原片录于10月21日，保留真实历史协作过程。',
  );
  await page.waitForTimeout(10000);
  await page.locator('.sidebar').getByText('分段梯度', { exact: true }).click();
  await page.getByText('133 / 133', { exact: false }).waitFor();
  await caption(
    '完整公开数据更新 · 默认2026-10-24',
    '133位英雄、四个已取得分段；发布快照保留来源日期与校验值，未收录内容不补造。',
  );
  await page.waitForTimeout(10000);
  await page.locator('.sidebar').getByText('阵容备战', { exact: true }).click();
  await page.getByLabel('操作模式', { exact: true }).selectOption('blue');
  await page.getByRole('button', { name: '开始新演练', exact: true }).click();
  await page.getByLabel('本轮英雄', { exact: true }).selectOption('544');
  await page.getByRole('button', { name: '确认本轮', exact: true }).click();
  await page.locator('.bp-turn-banner').filter({ hasText: '第 3 / 20 步' }).waitFor();
  await page.locator('.bp-turn-banner').scrollIntoViewIfNeeded();
  await caption(
    '浏览器人机BP · 真实运行',
    '蓝方人工禁用后，红方Worker计算应对。个人记录保存在当前浏览器；未部署好友联机、OCR或自动视觉模型。',
  );
  await page.waitForTimeout(10000);
  await context.close();
  const file = await video.path();
  await fs.writeFile(
    folder + '/update-recording.json',
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        source: base,
        width: 1920,
        height: 1080,
        scenes,
        file,
        historicalOriginalDate: '2026-10-21',
        extraCollaborationClaim: false,
      },
      null,
      2,
    ),
  );
  console.log(file);
} finally {
  await browser.close();
}
