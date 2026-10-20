import fs from 'node:fs/promises';
import { chromium } from 'playwright';
const dir = 'evidence/teaching-v023/research';
const selections = [[0, '210公式'], [0, 'KPL野王'], [1, '几百场国服'], [2, '技能解析篇'], [2, 'S39超标教'], [3, '粉丝全局复盘系列']];
const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const [index, keyword] of selections) {
    const search = JSON.parse(await fs.readFile(`${dir}/bili-${index}.json`, 'utf8'));
    const link = search.links.find(x => x.text.includes(keyword) && x.url.includes('/video/'));
    const id = link.url.match(/BV\w+/)[0];
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const responses = [];
    page.on('response', async r => {
      if (/\/player\/|subtitle|\/view\?/.test(r.url()) && !/image|css/.test(r.headers()['content-type'] || '')) {
        try { responses.push({url:r.url(), status:r.status(), body:await r.text()}); } catch {}
      }
    });
    try {
      const response = await page.goto(link.url, {waitUntil:'domcontentloaded',timeout:35000});
      await page.waitForTimeout(6000);
      const data = { at:new Date().toISOString(), url:page.url(), status:response?.status(), title:await page.title(), text:await page.locator('body').innerText(), state:await page.evaluate(()=>window.__INITIAL_STATE__?.videoData ?? null), videos:await page.locator('video').evaluateAll(es=>es.map(v=>({src:v.currentSrc,duration:v.duration,paused:v.paused,currentTime:v.currentTime}))), responses };
      await fs.writeFile(`${dir}/${id}.json`,JSON.stringify(data,null,2));
      await page.screenshot({path:`${dir}/${id}.png`});
      console.log(JSON.stringify({id,...data,state:data.state ? {title:data.state.title,desc:data.state.desc,pubdate:data.state.pubdate,cid:data.state.cid,stat:data.state.stat} : null,responses:responses.map(x=>({url:x.url,status:x.status,body:x.body.slice(0,1200)})),text:data.text.slice(0,11000)}));
    } catch(e) {console.log(JSON.stringify({id,error:e.message}));}
    finally {await page.close();}
  }
} finally {await browser.close();}
