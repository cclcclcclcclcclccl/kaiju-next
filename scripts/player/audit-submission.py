"""Scan the actual Git history before publishing. Reports paths, never matched secrets."""
import subprocess, re, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
GIT=['git','-c','safe.directory='+ROOT.as_posix()]
def git(*args): return subprocess.check_output(GIT+list(args),cwd=ROOT)
objects={}
for row in git('rev-list','--objects','--all').decode('utf8').splitlines():
    sha,_,name=row.partition(' ')
    if name: objects[sha]=name
patterns=[rb'gh[pousr]_[A-Za-z0-9]{30,}',rb'sk-(?:proj-)?[A-Za-z0-9_-]{30,}',rb'AKIA[A-Z0-9]{16}',rb'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----',rb'"(?:token|access_token|api_key)"\s*:\s*"[a-zA-Z0-9_-]{40,}"']
findings=[];large=[];forbidden=[]
process=subprocess.Popen(GIT+['cat-file','--batch'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
for sha,name in objects.items():
    process.stdin.write((sha+'\n').encode());process.stdin.flush()
    header=process.stdout.readline().decode().split()
    data=process.stdout.read(int(header[2]));process.stdout.read(1)
    if header[1]!='blob':continue
    if len(data)>90*1024*1024:large.append({'path':name,'bytes':len(data)})
    if name.startswith(('data/','private/','evidence/raw-private/')) or Path(name).name=='.env' or name.endswith(('.sqlite','.sqlite-wal','.sqlite-shm')):forbidden.append(name)
    if Path(name).suffix.lower() in ['.ts','.tsx','.mjs','.js','.py','.json','.jsonl','.md','.html','.txt','.yml','.yaml','.env']:
        for i,pattern in enumerate(patterns):
            if re.search(pattern,data):findings.append({'path':name,'blob':sha,'pattern':i})
process.stdin.close();process.wait()
report={'historyObjects':len(objects),'largeFiles':large,'forbiddenPaths':sorted(set(forbidden)),'credentialPatternFindings':findings,'scope':'Tracked reachable Git history, heuristic credential patterns; no secret values printed.'}
out=ROOT/'evidence/submission-v0251';out.mkdir(parents=True,exist_ok=True)
(out/'history-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
if forbidden or findings or large:raise SystemExit(1)
