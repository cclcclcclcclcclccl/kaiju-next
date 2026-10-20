import fs from 'node:fs/promises';
import { chromium } from 'playwright';
const dir = 'evidence/tianyuan-parity-v021';
await fs.mkdir(dir + '/reference', {recursive:true});
const before = {};
for (const key of ['workspace','pro']) {
  const r = await fetch('http://127.0.0.1:4318/api/' + key);
  if (!r.ok) throw Error('Baseline unavailable');
  before[key] = await r.json();
}
try { await fs.writeFile(dir + '/before.json', JSON.stringify(before,null,2), {flag:'wx'}); } catch(e) { if(e.code !== 'EEXIST') throw e; }
const browser = await chromium.launch({channel:'msedge'});
try {
 const page = await browser.newPage();
 const pending=[]; const requests=[];
 page.on('response', r => {
   if (r.url().includes('/api/hero/analysis?')) pending.push((async()=>{
     const body=await r.text(); const i=requests.length;
     requests.push({url:r.url(),status:r.status(),file:'analysis-'+i+'.json'});
     await fs.writeFile(dir+'/reference/analysis-'+i+'.json',body);
   })());
 });
 await page.goto('https://tianyuanzhiyi.com/hero/190',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(8000);
 await fs.writeFile(dir+'/reference/hero.txt',await page.locator('body').innerText());
 const controls=await page.locator('select,button[role="combobox"],button').evaluateAll(els=>els.map(e=>({tag:e.tagName,role:e.getAttribute('role'),text:e.textContent?.slice(0,100)})));
 await fs.writeFile(dir+'/reference/controls.json',JSON.stringify(controls,null,2));
 await Promise.allSettled(pending);
 await fs.writeFile(dir+'/reference/network.json',JSON.stringify(requests,null,2));
 console.log(JSON.stringify({url:page.url(),requests,controls:controls.filter(c=>/30|分路|天/.test(c.text))},null,2));
} finally {await browser.close();}
