import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const dir='evidence/tianyuan-parity-v021/reference';
await fs.mkdir(dir,{recursive:true});
const b=await chromium.launch({channel:'msedge'});
const p=await b.newPage();
const requests=[];
p.on('request',r=>{if(r.url().includes('/api/hero/analysis')) requests.push(r.url());});
try {
 await p.goto('https://tianyuanzhiyi.com/hero/190',{waitUntil:'domcontentloaded'});
 const control=p.locator('button[role="combobox"]').filter({hasText:/^全部分路$/});
 await control.waitFor();
 await p.getByText('近30天',{exact:true}).waitFor();
 const period=await p.getByText('近30天',{exact:true}).evaluate(e=>e.outerHTML);
 await control.click();
 const options=await p.getByRole('option').allTextContents();
 await p.getByRole('option',{name:'中路',exact:true}).click();
 await p.waitForTimeout(1500);
 await fs.writeFile(dir+'/counter-middle.txt',await p.locator('body').innerText());
 await p.screenshot({path:dir+'/counter-middle.png',fullPage:true});
 await fs.writeFile(dir+'/counter-controls.json',JSON.stringify({period,options,requests},null,2));
 console.log({period,options,requests});
}finally{await b.close();}
