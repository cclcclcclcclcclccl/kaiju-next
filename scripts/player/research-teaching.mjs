import fs from 'node:fs/promises';
import { chromium } from 'playwright';
const dir =
  process.argv[2] ??
  'evidence/teaching-discovery-' + new Date().toISOString().replace(/[:.]/g, '-');
await fs.mkdir(dir, { recursive: true });
const queries = ['王者荣耀 打野 思路 教学', '赵怀真 教学', '诸葛亮 教学', '王者荣耀 复盘 意识'];
const targets = queries.map((q, i) => [
  'bili-' + i,
  'https://search.bilibili.com/all?keyword=' + encodeURIComponent(q) + '&order=click',
]);
for (const [name, q, order] of [
  ['lane', '王者荣耀 对抗路 教学', 'click'],
  ['carry', '王者荣耀 射手 教学', 'click'],
  ['support', '王者荣耀 辅助 意识 教学', 'click'],
  ['recent-zhao', '王者荣耀 赵怀真 教学', 'pubdate'],
  ['recent-zhuge', '王者荣耀 诸葛亮 教学', 'pubdate'],
])
  targets.push([
    name,
    'https://search.bilibili.com/all?keyword=' + encodeURIComponent(q) + '&order=' + order,
  ]);
targets.push([
  'bing',
  'https://www.bing.com/search?q=' +
    encodeURIComponent('王者荣耀 打野 教学 兵线 复盘 site:bilibili.com'),
]);
const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (let i = 0; i < targets.length; i += 3) {
    const results = await Promise.allSettled(
      targets.slice(i, i + 3).map(async ([name, url]) => {
        const page = await browser.newPage();
        try {
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
          await page.waitForTimeout(4000);
          const data = {
            at: new Date().toISOString(),
            requestedUrl: url,
            url: page.url(),
            status: response?.status(),
            title: await page.title(),
            text: await page.locator('body').innerText(),
            links: await page
              .locator('a[href]')
              .evaluateAll((es) =>
                es.map((e) => ({ text: e.textContent?.trim(), url: e.href })).filter((e) => e.text),
              ),
          };
          await fs.writeFile(`${dir}/${name}.json`, JSON.stringify(data, null, 2));
          await page.screenshot({ path: `${dir}/${name}.png` });
          return { name, ...data, links: undefined, text: data.text.slice(0, 16000) };
        } finally {
          await page.close();
        }
      }),
    );
    for (const result of results) console.log(JSON.stringify(result));
  }
} finally {
  await browser.close();
}
