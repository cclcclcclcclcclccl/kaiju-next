import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir='evidence/public-access-v025';
await fs.mkdir(dir,{recursive:true});
const get=async p=>{const r=await fetch('http://127.0.0.1:4318/api/'+p);assert.equal(r.status,200);return r.json();};
await fs.writeFile(dir+'/private-before.json',JSON.stringify({workspace:await get('workspace'),pro:await get('pro')},null,2),{flag:'wx'});
await fs.mkdir('data/public-site',{recursive:true});
await fs.writeFile('data/public-site/config.json',JSON.stringify({origin:'https://pending.invalid'},null,2),{flag:'wx'});
// Copy only previously fetched public-source caches. Never copy SQLite or personal records.
for(const name of ['tianyuan','official-ranks','kpl','public-resources']) {
 const source=path.resolve('data',name),dest=path.resolve('data/public-site',name);
 await fs.cp(source,dest,{recursive:true,errorOnExist:true,force:false});
}
for(const file of ['package.json','package-lock.json','server/player/app.ts'])await fs.writeFile(file,(await fs.readFile(file,'utf8')).replaceAll('0.24.1','0.25.0'));
await fs.writeFile('src/player/App.tsx',(await fs.readFile('src/player/App.tsx','utf8')).replace('<small>v0.24.1</small>','<small>v0.25</small>'));
console.log('Independent public directory prepared. No owner database, accounts, recordings or model keys copied.');
