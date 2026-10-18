"""Package tracked deliverables and verified Git history, excluding local user state."""
from pathlib import Path
import subprocess, hashlib, json, zipfile
ROOT=Path(__file__).resolve().parents[2]
git=['git','-c','safe.directory='+ROOT.as_posix()]
def run(*args):return subprocess.check_output(git+list(args),cwd=ROOT)
assert not run('status','--porcelain').strip(), 'Commit the reviewed changes before packaging.'
out=ROOT/'submission';out.mkdir(exist_ok=True)
bundle=out/'开局NEXT-history.bundle'
subprocess.run(git+['bundle','create',str(bundle),'--all'],cwd=ROOT,check=True,capture_output=True)
subprocess.run(git+['bundle','verify',str(bundle)],cwd=ROOT,check=True,capture_output=True)
files=[name.decode('utf-8') for name in run('ls-files','-z').split(b'\0') if name]
for name in files:
 assert not name.startswith(('data/','private/','evidence/raw-private/','node_modules/','.git/')), name
 assert not name.endswith(('.sqlite','.sqlite-wal','.sqlite-shm')), name
 assert Path(name).name!='.env', name
files.append(bundle.relative_to(ROOT).as_posix())
entries=[]
archive=out/'开局NEXT-参赛材料-20261018.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5) as z:
 for name in files:
  data=(ROOT/name).read_bytes()
  entries.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
  z.writestr(name,data)
 manifest={'head':run('rev-parse','HEAD').decode().strip(),'files':entries,'excludes':'Untracked data, credentials, local databases, dependencies and raw video intermediates. Git bundle preserves original commits.'}
 z.writestr('submission/文件校验清单.json',json.dumps(manifest,ensure_ascii=False,indent=2))
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for item in entries: assert hashlib.sha256(z.read(item['path'])).hexdigest()==item['sha256']
result={'archive':str(archive),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':len(entries)+1,'gitHead':manifest['head'],'crcVerified':True,'allFileHashesVerified':True,'gitBundleVerified':True}
(out/'archive-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
