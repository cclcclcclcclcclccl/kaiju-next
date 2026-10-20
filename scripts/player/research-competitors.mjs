import fs from 'node:fs/promises';
import { chromium } from 'playwright';
const dir='evidence/product-comparison-v022';
await fs.mkdir(dir+'/reference',{recursive:true});
const before={};for(const k of ['workspace','pro']){const r=await fetch('http://127.0.0.1:4318/api/'+k);if(!r.ok)throw Error('baseline');before[k]=await r.json();}
await fs.writeFile(dir+'/before.json',JSON.stringify(before,null,2),{flag:'wx'});
const browser=await chromium.launch({channel:'msedge'});
const targets=[
 ['search','https://www.bing.com/search?q='+encodeURIComponent('王者荣耀 数据站 英雄 胜率 BP 工具')],
 ['tianyuan','https://tianyuanzhiyi.com/'],
 ['official','https://pvp.qq.com/web201605/herolist.shtml'],
 ['opgg','https://op.gg/lol/champions'],
 ['ugg','https://u.gg/lol/tier-list'],
 ['lolalytics','https://lolalytics.com/lol/tierlist/'],
];
const results=[];
try{
 for(let i=0;i<targets.length;i+=3){
  await Promise.allSettled(targets.slice(i,i+3).map(async([name,url])=>{
   const p=await browser.newPage({viewport:{width:1440,height:1000}});
   try{
    const r=await p.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await p.waitForTimeout(2500);
    const body=await p.locator('body').innerText();
    const links=await p.locator('a[href]').evaluateAll(els=>els.map(e=>({text:e.textContent?.trim().slice(0,120),href:e.href})).filter(x=>x.text));
    const controls=await p.locator('button,select,input').evaluateAll(els=>els.map(e=>({tag:e.tagName,role:e.getAttribute('role'),label:e.getAttribute('aria-label'),text:e.textContent?.trim().slice(0,100),placeholder:e.getAttribute('placeholder')})));
    await fs.writeFile(dir+'/reference/'+name+'.json',JSON.stringify({at:new Date().toISOString(),url:p.url(),title:await p.title(),status:r?.status(),body,links,controls},null,2));
    await p.screenshot({path:dir+'/reference/'+name+'.png'});
    results.push({name,url:p.url(),status:r?.status(),title:await p.title(),text:body.slice(0,1500)});
   }catch(e){results.push({name,url,error:e.message});}finally{await p.close();}
  }));
 }
 await fs.writeFile(dir+'/reference/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
