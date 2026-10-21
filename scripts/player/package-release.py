"""Package the committed release, with exact Git history separately and no local account data."""
from pathlib import Path
import subprocess, json, hashlib, zipfile
ROOT=Path(__file__).resolve().parents[2]
GIT=['git','-c','safe.directory='+ROOT.as_posix()]
def git(*args):return subprocess.check_output(GIT+list(args),cwd=ROOT)
OUT=ROOT/'submission/release-v026';OUT.mkdir(parents=True,exist_ok=True)
head=git('rev-parse','HEAD').decode().strip()
files=[p.decode('utf8') for p in git('ls-tree','-r','--name-only','-z','HEAD').split(b'\0') if p]
selected=[]
for name in files:
    if name.startswith(('data/','private/','evidence/raw-private/')) or Path(name).name=='.env' or name.endswith(('.sqlite','.sqlite-wal','.sqlite-shm')):raise ValueError('Forbidden tracked path: '+name)
    if name.startswith(('submission/video/','submission/release-','output/')):continue
    if name.endswith(('.mp4','.webm')):continue
    if name.endswith(('.zip','.bundle')):continue
    selected.append(name)
archive=OUT/'自在弈境-v0.26.0-参赛作品.zip'
entries=[]
snapshot=OUT/'source-snapshot.zip'
subprocess.run(GIT+['archive','--format=zip','--output='+str(snapshot),'HEAD'],cwd=ROOT,check=True)
with zipfile.ZipFile(snapshot) as source, zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5) as z:
    for name in selected:
        content=source.read(name)
        z.writestr(name,content)
        entries.append({'path':name,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()})
    z.writestr('submission/文件校验清单.json',json.dumps({'head':head,'files':entries,'scope':'Exact committed files. Private data, untracked files, old video and archive artifacts excluded. Original Git history is available in the separate bundle and GitHub repository.'},ensure_ascii=False,indent=2))
snapshot.unlink()
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for row in entries:assert hashlib.sha256(z.read(row['path'])).hexdigest()==row['sha256']
bundle=OUT/'自在弈境-v0.26.0-history.bundle'
subprocess.run(GIT+['bundle','create',str(bundle),'--all'],cwd=ROOT,check=True,capture_output=True)
subprocess.run(GIT+['bundle','verify',str(bundle)],cwd=ROOT,check=True,capture_output=True)
report={'gitHead':head,'files':len(entries)+1,'crcVerified':True,'allFileHashesVerified':True,'gitBundleVerified':True,'artifacts':[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [archive,bundle]]}
(OUT/'archive-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
