import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
const folder = resolve('submission/release-v0251/video');
const base = JSON.parse(readFileSync('data/public-site/config.json', 'utf8')).origin;
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: folder, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
const video = page.video();
const scenes = [];
const start = Date.now();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function scene(title, subtitle, seconds, action) {
  await action();
  await page.evaluate(
    ({ title, subtitle }) => {
      document.getElementById('demo-caption')?.remove();
      const bar = document.createElement('div');
      bar.id = 'demo-caption';
      Object.assign(bar.style, {
        position: 'fixed',
        bottom: '0',
        left: '0',
        right: '0',
        zIndex: '2147483647',
        background: '#08101ff5',
        color: '#fff',
        padding: '18px 40px',
        borderTop: '2px solid #c9ab70',
        fontFamily: 'Microsoft YaHei,sans-serif',
        fontSize: '25px',
        lineHeight: '1.6',
        pointerEvents: 'none',
      });
      const heading = document.createElement('strong');
      heading.textContent = title;
      const text = document.createElement('div');
      text.textContent = subtitle;
      text.style.fontSize = '20px';
      bar.append(heading, text);
      document.body.append(bar);
    },
    { title, subtitle },
  );
  const began = (Date.now() - start) / 1000;
  scenes.push({ title, subtitle, startSeconds: began, durationSeconds: seconds });
  console.log(title);
  for (let i = 0; i < (process.env.KAIJU_VIDEO_SMOKE === '1' ? 0 : seconds); i += 5) {
    await wait(5000);
    if (title.includes('真实 AI'))
      await page.evaluate(() => window.scrollBy({ top: 140, behavior: 'smooth' }));
  }
}
const nav = async (name) => page.locator('nav').getByRole('button', { name, exact: true }).click();
try {
  await page.goto(base);
  await scene(
    '开局 NEXT｜传智杯 AI创新应用挑战赛',
    '蔡晨霖 · 西安交通大学人工智能2501｜v0.25.1 公网体验实录，资料保留日期与出处。',
    25,
    async () => {},
  );
  await scene(
    '01 英雄图鉴：从普通入口看到数据',
    '133 位目录英雄；技能、定位、来源梯度和三率共同呈现。缺失数据不编造。',
    30,
    async () => {
      await nav('英雄图鉴');
      await page.getByLabel('搜索英雄', { exact: true }).fill('廉颇');
    },
  );
  await scene(
    '02 英雄详情：统计口径可核查',
    '综合梯度来自天元；分段三率独立查询。来源梯度不冒称自研，也不伪装成分段梯度。',
    30,
    async () => {
      await page.getByRole('button', { name: '查看廉颇资料', exact: true }).click();
      await page.getByLabel('英雄分段三率').waitFor({ timeout: 60000 });
    },
  );
  await scene(
    '03 全英雄梯度与真实指标排序',
    '数据来源：天元之弈公开接口，属于第三方统计；与腾讯官方公开部分榜分开。',
    35,
    async () => {
      await page.keyboard.press('Escape');
      await nav('分段梯度');
      await page.locator('.tier-portrait').first().waitFor({ timeout: 60000 });
    },
  );
  await scene(
    '04 装备统计：图标、出场率、胜率',
    '按英雄查询；展示来源截止时刻。装备相关胜率不等于购买该装备产生的因果收益。',
    30,
    async () => {
      await nav('装备与版本');
      await page.getByRole('button', { name: '装备出场率 / 胜率', exact: true }).click();
      await page.getByLabel('统计英雄', { exact: true }).selectOption('521');
      await page.locator('.equipment-statistics tbody tr').first().waitFor({ timeout: 60000 });
    },
  );
  await scene(
    '05 皮肤使用率：真实分布与来源图片',
    '按英雄与日期读取。原皮保留；来源未公布样本量、分段和皮肤胜率，这些字段不推算。',
    30,
    async () => {
      await page.getByRole('button', { name: '皮肤使用率', exact: true }).click();
      await page.getByLabel('皮肤统计英雄').selectOption('521');
      await page.locator('.skin-usage-card').first().waitFor({ timeout: 60000 });
    },
  );
  await scene(
    '06 逐手 BP：摇摆英雄随后续选择调整分路',
    '人工操作双方禁选；诸葛亮可以中野摇摆，后续选择确定分工。系统评分不是实际胜率。',
    40,
    async () => {
      await nav('阵容备战');
      const panel = page.locator('.bp-rounds');
      await panel.getByRole('button', { name: '开始新演练', exact: true }).click();
      for (const name of ['廉颇', '小乔', '赵云', '墨子', '诸葛亮', '孙尚香', '刘禅', '妲己']) {
        await panel.getByRole('button', { name: 'BP选择' + name, exact: true }).click();
        await panel.getByRole('button', { name: '确认本轮', exact: true }).click();
      }
      await panel.locator('.bp-board').first().scrollIntoViewIfNeeded();
    },
  );
  for (const [id, title, subtitle] of [
    [
      '01-persistence',
      '07 真实 AI 协作：保存问题',
      '原始历史记录回看：用户发现赵怀真不见了 → AI定位访客身份与保存冲突 → 修复与验证。',
    ],
    [
      '02-ranking',
      '08 真实 AI 协作：纠正错误梯度',
      '原始历史记录回看：用户否定不合理T档 → 停用未校准默认算法 → 接入来源梯度与普通图鉴入口。',
    ],
    [
      '03-skins',
      '09 真实 AI 协作：图标与使用率',
      '原始历史记录回看：用户指出入口缺失 → 找到被丢弃的图片字段 → 修复、回归测试和真实页面核对。',
    ],
  ])
    await scene(title, subtitle, 45, () =>
      page.goto(pathToFileURL(resolve('submission/prompt-chains', id + '.html')).href),
    );
  await scene(
    '提交说明与能力边界',
    '真实历史协作回看共 2 分 15 秒；公网为临时体验通道，支持独立账号。未宣称模型训练或 KPL 级效果。',
    20,
    () => page.goto(base),
  );
  await context.close();
  const input = await video.path(),
    output = resolve(
      folder,
      process.env.KAIJU_VIDEO_SMOKE === '1' ? 'smoke.mp4' : '开局NEXT-演示与真实协作记录.mp4',
    );
  await new Promise((accept, reject) => {
    const child = spawn(
      resolve(
        'data/submission-tools/imageio_ffmpeg/binaries',
        readdirSync('data/submission-tools/imageio_ffmpeg/binaries').find((name) =>
          name.endsWith('.exe'),
        ),
      ),
      [
        '-y',
        '-i',
        input,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-r',
        '24',
        '-movflags',
        '+faststart',
        '-an',
        output,
      ],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let tail = '';
    child.stderr.on('data', (b) => {
      tail = (tail + b).slice(-2500);
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? accept() : reject(Error(tail))));
  });
  writeFileSync(
    resolve(folder, process.env.KAIJU_VIDEO_SMOKE === '1' ? 'smoke.json' : 'recording.json'),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        width: 1920,
        height: 1080,
        elapsedSeconds: (Date.now() - start) / 1000,
        scenes,
        collaborationSeconds: 135,
        collaborationMode: 'Authentic historical dialogue playback, not a new live AI session',
        output,
      },
      null,
      2,
    ),
  );
  console.log(output);
} finally {
  await browser.close();
}
