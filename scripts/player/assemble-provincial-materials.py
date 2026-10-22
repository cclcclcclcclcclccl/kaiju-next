"""Create the 2026-10-22 provincial delivery from a committed, verified source snapshot."""
from pathlib import Path
import subprocess,hashlib,json,zipfile,shutil,sys
R=Path(__file__).resolve().parents[2];sys.path.insert(0,str(R/'data/pdf-tools'))
from pypdf import PdfReader
OUT=R/'submission/省赛完整交付-20261022';PACK=OUT/'完整作品内容';UPLOAD=OUT/'单独上传';RELEASE=R/'submission/release-provincial-20261022'
for p in [PACK,UPLOAD]:p.mkdir(parents=True,exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,s):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s.strip()+'\n',encoding='utf8')
git=['git','-c','safe.directory='+R.as_posix()];head=subprocess.check_output(git+['rev-parse','HEAD'],text=True).strip();count=int(subprocess.check_output(git+['rev-list','--count','HEAD'],text=True))
run=json.loads((RELEASE/'package-runtime-verification.json').read_text(encoding='utf8'));assert run['gitHead']==head and run['coreTests'] and run['productionBuild']
for src,dst in [('output/pdf/自在弈境-预指导作品介绍.pdf','01-作品介绍.pdf'),('output/pdf/自在弈境-技术文档.pdf','02-技术文档.pdf'),('output/pdf/自在弈境-省赛评测与验证补充.pdf','03-省赛评测与验证补充.pdf'),('submission/release-v026/video/自在弈境-演示与真实协作记录.mp4','04-演示视频.mp4'),('submission/release-provincial-20261022/自在弈境-v0.26.0-参赛作品.zip','06-源码.zip'),('submission/release-provincial-20261022/自在弈境-v0.26.0-history.bundle','07-完整Git历史.bundle')]:shutil.copy2(R/src,PACK/dst)
with zipfile.ZipFile(PACK/'05-原始AI对话链.zip','w',zipfile.ZIP_DEFLATED)as z:
 for p in (R/'submission/prompt-chains').rglob('*'):
  if p.is_file():z.write(p,'prompt-chains/'+p.relative_to(R/'submission/prompt-chains').as_posix())
with zipfile.ZipFile(PACK/'05-原始AI对话链.zip')as z:
 m=json.loads(z.read('prompt-chains/manifest.json'));assert len(m['chains'])==3
 for c in m['chains']:assert hashlib.sha256(z.read('prompt-chains/'+c['id']+'.json')).hexdigest()==c['sha256']
shutil.copytree(R/'submission/provincial-kit-20261022',PACK/'09-答辩与真人试用',dirs_exist_ok=True)
put(PACK/'08-开发历史与恢复.txt',f'''材料源码固定提交：{head}\nHEAD可达真实提交：{count}\n恢复：git clone 07-完整Git历史.bundle zizai-review\n进入目录执行：git checkout {head}\n原始历史与旧名保留，不倒填时间。\n\n'''+subprocess.check_output(git+['log','HEAD','--date=iso-strict','--format=%H%n%ad%n%s%n'],encoding='utf8'))
checks=PACK/'10-验证依据';checks.mkdir(exist_ok=True)
for source in ['evidence/provincial-20261022/bp-protocol.json','evidence/provincial-20261022/bp-scenarios.json','evidence/provincial-20261022/bp-comparison.json','evidence/provincial-20261022/materials-browser.json','evidence/provincial-20261022/github-ci.json','evidence/provincial-20261022/history-audit.json','evidence/provincial-20261022/build.txt','submission/release-provincial-20261022/package-runtime-verification.json','submission/release-provincial-20261022/archive-verification.json','submission/release-v026/video/verification.json']:
 p=R/source
 if p.exists():shutil.copy2(p,checks/p.name)
form=R/'private/pre-guidance-20261021/form-access.json'
if form.exists():
 f=json.loads(form.read_text(encoding='utf8'));put(checks/'预指导表单原文.txt','读取时间2026-10-21\n来源：'+f['url']+'\n'+f['text'])
put(PACK/'README.md',f'''# 自在弈境 · 2026-10-22省赛材料\n\n软件仍v0.26.0，新增工程评测/试用/答辩准备和登录分享恢复。固定源码：{head}。\n\n先看09-答辩与真人试用/开始查看.html。源码解压06-源码.zip后，在package.json所在目录用Node24.16或更新Node24执行npm ci、npm run build、npm start，打开http://127.0.0.1:4318/。首次安装依赖需网络。个人数据库不包含在内。\n\n文档01是预指导单独上传文件，02/03为技术和评测补充；视频04沿用2026-10-21实机录屏，1080p、386.46秒，135秒为真实历史协作回看。不是2026-10-22新录。\n\n当前没有视频平台投稿、网盘链接或赛事提交回执。预指导表单第5项需主流网盘链接，第6项单个介绍文档≤100MB，第7项公开视频平台链接；GitHub不替代上述两种发布。预指导截至2026-10-31 15:00（北京时间），最终省赛另行提交。本人UID、手机号与官方确认见09目录06号清单。\n\n本轮100次BP工程调用使用24构造局面+1边界，不是真人战绩。真实试用及独立推荐评价仍0份，随包模板留空。固定选手池与自动摇摆模式未联合，不声称职业级效果或官方私有接口。\n''')
put(PACK/'00-版本与状态.json',json.dumps({'applicationVersion':'0.26.0','materialsDate':'2026-10-22','sourceCommit':head,'commits':count,'realParticipants':0,'independentRecommendationReviews':0,'videoRecordedDate':'2026-10-21','contestSubmitted':False,'paidServicesPurchased':False,'needsHuman':['cross-network access','real participants and independent reviews','UID and official acceptance','netdisk/video publication when ready','contest submission']},ensure_ascii=False,indent=2))
for src,dst in [('01-作品介绍.pdf','自在弈境-作品介绍.pdf'),('04-演示视频.mp4','自在弈境-演示视频.mp4')]:shutil.copy2(PACK/src,UPLOAD/dst)
shutil.copy2(R/'submission/自在弈境-预指导提交-v026/单独上传/视频封面.jpg',UPLOAD/'视频封面.jpg')
shutil.copy2(R/'submission/provincial-kit-20261022/08-表单可复制文本.md',OUT/'表单和视频发布文案.md')
shutil.copy2(R/'submission/provincial-kit-20261022/06-本人剩余操作逐步清单.md',OUT/'本人剩余步骤.md')
# Personal application reference remains local-only and outside the shared archive.
privateGuide=R/'submission/预指导提交-20261021/逐栏填写清单-仅供本人使用.txt'
if privateGuide.exists():put(OUT/'个人字段核对-勿公开.txt','本文件沿用本人已提供报名信息，仅核对字段使用。当前文件路径与材料版本请以本目录为准。\n\n'+privateGuide.read_text(encoding='utf8'))
assert [len(PdfReader(PACK/n).pages)for n in ['01-作品介绍.pdf','02-技术文档.pdf','03-省赛评测与验证补充.pdf']]==[6,9,3]
with zipfile.ZipFile(PACK/'06-源码.zip')as z:
 assert z.testzip()is None;m=json.loads(z.read('submission/文件校验清单.json'));assert m['head']==head
 for row in m['files']:assert hashlib.sha256(z.read(row['path'])).hexdigest()==row['sha256']
assert sha(PACK/'04-演示视频.mp4')==sha(R/'submission/release-v026/video/自在弈境-演示与真实协作记录.mp4')
manifest={'sourceCommit':head,'commits':count,'files':[{'path':p.relative_to(PACK).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}for p in sorted(PACK.rglob('*'))if p.is_file()and p.name!='文件校验清单.json']}
put(PACK/'文件校验清单.json',json.dumps(manifest,ensure_ascii=False,indent=2))
archive=OUT/'自在弈境-省赛完整材料-20261022.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=4)as z:
 for p in sorted(PACK.rglob('*')):
  if p.is_file():z.write(p,'自在弈境省赛作品/'+p.relative_to(PACK).as_posix(),compress_type=zipfile.ZIP_STORED if p.suffix in ['.zip','.bundle','.mp4','.pdf']else zipfile.ZIP_DEFLATED)
with zipfile.ZipFile(archive)as z:
 assert z.testzip()is None
 for row in manifest['files']:assert hashlib.sha256(z.read('自在弈境省赛作品/'+row['path'])).hexdigest()==row['sha256']
result={'sourceCommit':head,'commits':count,'archive':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive),'allOuterHashesVerified':True,'nestedSourceHashesVerified':True,'threePromptChainHashesVerified':True,'pdfPages':[6,9,3],'sourceRuntimeVerified':True,'videoUnchangedAndPreviouslyDecoded':True,'personalChecklistExcluded':True,'blindMappingExcluded':True,'realTrials':0,'contestSubmitted':False}
put(OUT/'完整包校验.json',json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
