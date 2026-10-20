import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const dir='tools/public-access';
const release=JSON.parse(await fs.readFile(dir+'/release.json','utf8'));
const asset=release.assets.find(a=>a.name==='cloudflared-windows-amd64.exe');
if(!asset?.digest?.startsWith('sha256:')||!asset.browser_download_url.startsWith('https://github.com/cloudflare/cloudflared/'))throw Error('Official release identity missing');
const size=1024*1024,total=Math.ceil(asset.size/size);let next=0,done=0;
async function worker(){
 while(next<total){
  const i=next++,start=i*size,end=Math.min(asset.size-1,start+size-1),file=dir+'/part-'+i+'.bin';
  let ok=false;
  for(let attempt=0;attempt<3&&!ok;attempt++){
   const code=await new Promise((resolve,reject)=>{const p=spawn('curl.exe',['--ssl-revoke-best-effort','-L','--fail','--max-time','25','--silent','--show-error','--range',start+'-'+end,asset.browser_download_url,'-D',file+'.headers','-o',file],{windowsHide:true,stdio:['ignore','ignore','pipe']});p.on('error',reject);p.stderr.on('data',()=>{});p.on('exit',resolve);});
   const h=await fs.readFile(file+'.headers','utf8').catch(()=>''),stat=await fs.stat(file).catch(()=>null);
   ok=code===0&&stat?.size===end-start+1&&h.toLowerCase().includes('content-range: bytes '+start+'-'+end+'/');
  }
  if(!ok)throw Error('Range download failed '+i);
  if(++done%8===0||done===total)console.log('Downloaded',done,'/',total);
 }
}
await Promise.all([worker(),worker(),worker(),worker()]);
const chunks=await Promise.all(Array.from({length:total},(_,i)=>fs.readFile(dir+'/part-'+i+'.bin')));
const binary=Buffer.concat(chunks),digest=createHash('sha256').update(binary).digest('hex');
if('sha256:'+digest!==asset.digest)throw Error('Official release SHA-256 mismatch');
await fs.writeFile(dir+'/cloudflared.exe',binary);
console.log('Verified official release',release.tag_name,digest);
