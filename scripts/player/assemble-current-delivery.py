from pathlib import Path
import json,zipfile,hashlib,shutil,subprocess,html,sys
R=Path(__file__).resolve().parents[2];sys.path.insert(0,str(R/'data/pdf-tools'))
from pypdf import PdfReader
O=R/'submission/提交整合-20261025';C=O/'完整作品';U=O/'单独上传';S=R/'submission/release-v0262'
for p in [C,U]:p.mkdir(parents=True,exist_ok=True)
git=['git','-c','safe.directory='+R.as_posix()];head=subprocess.check_output(git+['rev-parse','HEAD'],text=True).strip()
runtime=json.loads((S/'package-runtime-verification.json').read_text(encoding='utf8'));assert runtime['gitHead']==head and runtime['coreTests'] and runtime['productionBuild']
version=json.loads((R/'package.json').read_text(encoding='utf8'))['version']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def copy(src,dst):shutil.copy2(R/src,dst)
items=[('output/pdf/20261025/自在弈境-作品介绍.pdf','01-作品介绍.pdf'),('output/pdf/20261025/自在弈境-技术文档.pdf','02-技术文档.pdf'),('output/pdf/自在弈境-省赛评测与验证补充.pdf','03-BP工程评测-20261022.pdf'),('submission/release-v0262/video/自在弈境-演示与协作-更新版.mp4','04-演示视频.mp4'),(f'submission/release-v0262/自在弈境-v{version}-参赛作品.zip','06-源码.zip'),(f'submission/release-v0262/自在弈境-v{version}-history.bundle','07-Git完整历史.bundle')]
for src,name in items:copy(src,C/name)
with zipfile.ZipFile(C/'05-真实AI对话链.zip','w',zipfile.ZIP_DEFLATED)as z:
 for p in (R/'submission/prompt-chains').rglob('*'):
  if p.is_file():z.write(p,'prompt-chains/'+p.relative_to(R/'submission/prompt-chains').as_posix())
with zipfile.ZipFile(C/'05-真实AI对话链.zip')as z:
 m=json.loads(z.read('prompt-chains/manifest.json'));assert len(m['chains'])>=3
 for row in m['chains']:assert hashlib.sha256(z.read('prompt-chains/'+row['id']+'.json')).hexdigest()==row['sha256']
shutil.copytree(R/'submission/current-kit-20261025',C/'08-答辩与操作清单',dirs_exist_ok=True)
V=C/'09-验证记录';V.mkdir(exist_ok=True)
for name in ['archive-check.json','preservation.json','form-check.json','core-tests.txt','github-ci.json','refresh-summary.json']:
 if (R/'evidence/refresh-20261025'/name).exists():copy('evidence/refresh-20261025/'+name,V/name)
for src,name in [('evidence/refresh-20261025/browser/browser-verification.json','静态浏览器验证.json'),('evidence/refresh-20261025/public/verification.json','公网验证.json'),('submission/release-v0262/package-runtime-verification.json','源码复现.json'),('submission/release-v0262/archive-verification.json','源码包校验.json'),('submission/release-v0262/video/verification.json','视频校验.json')]:copy(src,V/name)
copy('evidence/provincial-20261022/bp-comparison.json',V/'历史BP逐条输出.json')
video=json.loads((V/'视频校验.json').read_text(encoding='utf8'));assert 300<=video['durationSeconds']<=480 and video['fullDecodePassed'] and video['collaborationSeconds']==135
public=json.loads((V/'公网验证.json').read_text(encoding='utf8'));assert public['passed'] and public['defaultDataDate']=='2026-10-24'
status={'applicationVersion':version,'sourceCommit':head,'materialsDate':'2026-10-25','site':'https://cclcclcclcclcclccl.github.io/kaiju-next/','defaultDataDate':public['defaultDataDate'],'publicQueryCount':public['archiveQueries'],'realParticipants':0,'contestSubmitted':False,'paidServicesPurchased':False,'videoOriginalDate':'2026-10-21','videoUpdateDate':'2026-10-25'}
(C/'版本与交付状态.json').write_text(json.dumps(status,ensure_ascii=False,indent=2),encoding='utf8')
log=subprocess.check_output(git+['log','HEAD','--date=iso-strict','--format=%H %ad %s'],encoding='utf8')
(C/'开发历史与恢复.txt').write_text('固定源码：'+head+'\n恢复：git clone 07-Git完整历史.bundle zizai\n进入目录后 git checkout '+head+'\n\n'+log,encoding='utf8')
for src,name in [('01-作品介绍.pdf','自在弈境-作品介绍.pdf'),('04-演示视频.mp4','自在弈境-演示视频.mp4')]:shutil.copy2(C/src,U/name)
copy('submission/自在弈境-预指导提交-v026/单独上传/视频封面.jpg',U/'视频封面.jpg')
for src,name in [('06-本人剩余操作逐步清单.md','本人下一步.md'),('08-表单可复制文本.md','表单可复制文本.md')]:copy('submission/current-kit-20261025/'+src,O/name)
(O/'打开网站.url').write_text('[InternetShortcut]\nURL='+status['site']+'\n',encoding='utf8')
readme=f'''# 自在弈境 · 本次完整提交材料

版本v{version}，材料2026-10-25；源码提交{head}。
固定在线网址：{status['site']}
默认真实数据日：{status['defaultDataDate']}，公开查询{status['publicQueryCount']}项。

主流网盘请上传根目录的“自在弈境-完整提交材料-20261025.zip”。表单第6项单独上传“单独上传/自在弈境-作品介绍.pdf”；第7项须先把视频发到B站/抖音等平台，再填写公开播放链接。

完整作品/06-源码.zip解压后，在package.json所在目录执行npm ci、npm run build、npm start。需预装Node24.16或更新Node24及首次下载网络。打开127.0.0.1:4318。个人数据库和密钥未打包。

原BP工程报告与原视频段落保留真实日期；原视频135秒AI协作回看仍在，更新片段标明2026-10-25。固定在线版没有好友联机、服务器OCR或自动视觉模型，不声称职业训练效果。

尚未向赛事提交，尚未生成本人网盘分享和公开视频平台链接。须本人确认UID、手机、账号登录和提交回执。预指导截至2026-10-31 15:00（北京时间），最终省赛另交。详见本人下一步.md。
'''
(O/'README.md').write_text(readme,encoding='utf8')
links=[('打开固定在线网站',status['site']),('作品介绍PDF','单独上传/自在弈境-作品介绍.pdf'),('演示视频MP4','单独上传/自在弈境-演示视频.mp4'),('技术文档','完整作品/02-技术文档.pdf'),('答辩与操作台','完整作品/08-答辩与操作清单/开始查看.html'),('本人下一步','本人下一步.md'),('表单可复制文本','表单可复制文本.md'),('完整源码ZIP','完整作品/06-源码.zip')]
page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>自在弈境提交整合</title><style>body{max-width:960px;margin:40px auto;padding:0 20px;background:#101925;color:#e9eef5;font:18px/1.8 system-ui}a{display:block;padding:12px;margin:12px 0;background:#21334a;color:#edce92;border-radius:8px}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>自在弈境 · 完整提交材料</h1><p>2026-10-25 | v'+version+' | 零新增费用 | 尚未提交赛事</p>'+''.join('<a href="'+html.escape(u,quote=True)+'">'+html.escape(label)+'</a>'for label,u in links)+'<pre>'+html.escape(readme)+'</pre></html>'
(O/'开始查看.html').write_text(page,encoding='utf8')
for label,u in links:
 if not u.startswith('https:'):assert (O/u).is_file(),u
pdfs=[{'file':p.relative_to(O).as_posix(),'pages':len(PdfReader(p).pages)}for p in C.glob('*.pdf')];assert sum(p['pages']for p in pdfs)<=30
files=[p for p in O.rglob('*')if p.is_file()and p.suffix!='.zip' or p.is_file()and p.parent==C and p.suffix=='.zip']
# Explicitly exclude the generated outer archive and verification files from themselves.
files=[p for p in files if p.name not in ['材料校验.json','发布记录.json']]
rows=[{'path':p.relative_to(O).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}for p in sorted(files)]
report={'sourceCommit':head,'files':rows,'pdfs':pdfs,'video':video,'privateDataIncluded':False}
(O/'材料校验.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
archive=O/'自在弈境-完整提交材料-20261025.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=5)as z:
 for p in files+[O/'材料校验.json']:z.write(p,p.relative_to(O).as_posix())
with zipfile.ZipFile(archive)as z:
 assert z.testzip()is None
 for row in rows:assert hashlib.sha256(z.read(row['path'])).hexdigest()==row['sha256']
summary={'archive':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive),'sourceCommit':head,'files':len(rows),'allHashesVerified':True,'pages':pdfs,'videoSeconds':video['durationSeconds']}
(S/'complete-verification.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(summary,ensure_ascii=False))
