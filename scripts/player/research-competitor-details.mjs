import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const dir='evidence/product-comparison-v022/reference';
const b=await chromium.launch({channel:'msedge'});
try{
 const results=await Promise.allSettled([
  ['lolalytics-detail','https://lolalytics.com/lol/tierlist/',async p=>{await p.getByRole('link',{name:'Jinx',exact:true}).first().click();}],
  ['official-detail','https://pvp.qq.com/web201605/herolist.shtml',async p=>{await p.getByText('诸葛亮',{exact:true}).click();}],
  ['mobalytics','https://mobalytics.gg/lol/tier-list',async()=>{}],
 ].map(async([name,url,act])=>{
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  try{
   const r=await p.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await p.waitForTimeout(1500);await act(p);await p.waitForTimeout(2000);
   const result={at:new Date().toISOString(),url:p.url(),initialStatus:r?.status(),title:await p.title(),body:await p.locator('body').innerText()};
   await fs.writeFile(dir+'/'+name+'.json',JSON.stringify(result,null,2));await p.screenshot({path:dir+'/'+name+'.png'});
   return {...result,body:result.body.slice(0,2200)};
  }catch(e){return {name,url,error:e.message};}finally{await p.close();}
 }));results.forEach(r=>console.log(JSON.stringify(r)));
}finally{await b.close();}
