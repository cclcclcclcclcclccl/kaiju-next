"""Assemble the verified v0.26 public material bundle; never include private account files."""
from pathlib import Path
import subprocess,json,zipfile,hashlib,shutil,sys
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'data/pdf-tools'))
from pypdf import PdfReader
from PIL import Image,ImageDraw,ImageFont
OUT=ROOT/'submission/自在弈境-预指导提交-v026';PACK=OUT/'完整作品内容';UPLOAD=OUT/'单独上传'
for p in [PACK,UPLOAD]:p.mkdir(parents=True,exist_ok=True)
GIT=['git','-c','safe.directory='+ROOT.as_posix()]
def git(*args):return subprocess.check_output(GIT+list(args),cwd=ROOT)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,s):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s.strip()+'\n',encoding='utf8')
head=git('rev-parse','HEAD').decode().strip();count=int(git('rev-list','--count','HEAD'))
release=ROOT/'submission/release-v026'
files=[('output/pdf/自在弈境-预指导作品介绍.pdf','01-作品介绍.pdf'),('output/pdf/自在弈境-技术文档.pdf','02-技术文档.pdf'),('submission/release-v026/video/自在弈境-演示与真实协作记录.mp4','03-演示视频.mp4'),('submission/release-v026/自在弈境-v0.26.0-参赛作品.zip','05-源码与完整作品.zip'),('submission/release-v026/自在弈境-v0.26.0-history.bundle','06-完整Git开发历史.bundle')]
for a,b in files:shutil.copy2(ROOT/a,PACK/b)
with zipfile.ZipFile(PACK/'04-AI对话历史与Prompt链.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted((ROOT/'submission/prompt-chains').rglob('*')):
  if p.is_file():z.write(p,'prompt-chains/'+p.relative_to(ROOT/'submission/prompt-chains').as_posix())
with zipfile.ZipFile(PACK/'04-AI对话历史与Prompt链.zip') as z:
 m=json.loads(z.read('prompt-chains/manifest.json'));assert len(m['chains'])==3
 for c in m['chains']:assert hashlib.sha256(z.read('prompt-chains/'+c['id']+'.json')).hexdigest()==c['sha256']
put(PACK/'07-开发提交日志.txt',git('log','--date=iso-strict','--format=%H%n%ad%n%an%n%s%n','HEAD').decode('utf8'))
put(PACK/'08-开发历史恢复说明.txt',f'''本包包含截至软件提交 {head} 的真实Git历史，HEAD可达{count}次提交。
原始旧名和原始日期保留，未倒填时间或改写历史。
离线恢复：git clone 06-完整Git开发历史.bundle zizai-review
进入目录后：git checkout {head}
查看历史：git log --oneline --all
首次npm依赖安装仍需网络，bundle不含个人账号数据库。''')
put(PACK/'README.md',(ROOT/'README.md').read_text(encoding='utf8')+'\n\n## 本整包运行\n先解压05-源码与完整作品.zip，在package.json所在目录运行上述命令。源码版本以本包校验清单为准；原始历史见06-完整Git开发历史.bundle。')
put(PACK/'00-先读我.txt',f'''自在弈境数据站 v0.26.0 · 传智杯AI创新应用挑战赛 · 蔡晨霖 · 西安交通大学
本轮更名源自赵怀真“自在之心”，旧名开局 NEXT保留于历史证据，项目持续开发而非新造历史。
固定源码：{head}；HEAD可达提交{count}次。当前未提交比赛，未购买托管。

包内有七项作品介绍、9页技术文档、1080p演示MP4、3条原始AI对话链、源码/依赖锁/.env.example、完整Git历史、日志、复现和验证材料。
预指导截止2026-10-31 15:00（北京时间），每人提交一次；最终省赛另行提交。
第5项：把本整包上传百度/夸克/阿里等主流网盘，填分享链接及提取码。
第6项：单独上传01-作品介绍.pdf（6页，≤100MB），覆盖表单7项内容。
第7项：将03-演示视频.mp4投稿B站/抖音等，审核后填公开播放链接。GitHub下载、本地地址或网盘不能替代该项。
表单：https://f.kdocs.cn/g/GZcCLbBV/
代码仓库：https://github.com/cclcclcclcclcclccl/kaiju-next

视频含135秒真实历史AI协作回看，不伪装现场输入；如组委会要求现场互动形式，需补充真实录屏。
没有官方私有后台同步、专项训练模型、实战胜率校准或KPL能力证明；未知数据不填造。当前公开梯度保留天元来源归属。
临时公网依赖电脑在线；本机核心功能不需付费API。外部统计需要网络，OCR另需本地Python依赖。
''')
checks=PACK/'依据与验证';checks.mkdir(exist_ok=True)
for source in ['evidence/final-v026/core.txt','evidence/final-v026/build-final.txt','evidence/final-v026/browser-fixed.txt','evidence/final-v026/regression.txt','evidence/final-v026/regression-fixed.txt','evidence/final-v026/reproduction.json','evidence/final-v026/preservation.json','evidence/final-v026/history-audit.json','evidence/final-v026/github-ci.json','submission/release-v026/archive-verification.json','submission/release-v026/package-runtime-verification.json','submission/release-v026/video/verification.json','docs/39-zizai-final-review-v026.md']:
 p=ROOT/source
 if p.exists():shutil.copy2(p,checks/p.name)
form=ROOT/'private/pre-guidance-20261021/form-access.json'
if form.exists():
 f=json.loads(form.read_text(encoding='utf8'));put(checks/'预指导表单原文.txt','公开表单读取日期2026-10-21\n来源：'+f['url']+'\n'+f['text'])
shutil.copy2(PACK/'01-作品介绍.pdf',UPLOAD/'自在弈境-预指导作品介绍.pdf');shutil.copy2(PACK/'03-演示视频.mp4',UPLOAD/'自在弈境-演示视频.mp4')
cover=Image.new('RGB',(1920,1080),'#101c2a');draw=ImageDraw.Draw(cover);font=lambda n:ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',n)
draw.rectangle((110,120,122,920),fill='#cfb078');draw.text((190,225),'自在弈境',font=font(145),fill='#f4f5f8');draw.text((200,430),'懂你的英雄池 · 从容应对每一局',font=font(58),fill='#cfb078');draw.text((200,670),'传智杯 AI创新应用挑战赛',font=font(45),fill='white');draw.text((200,760),'蔡晨霖 · 西安交通大学人工智能2501',font=font(39),fill='#c1cbd6');draw.text((200,850),'真实软件演示与 AI 协作记录 | v0.26.0',font=font(32),fill='#a8b8c8');cover.save(UPLOAD/'视频封面.jpg',quality=94)
put(OUT/'视频发布文案.txt','''标题：自在弈境｜懂你的英雄池的王者备战数据站｜传智杯AI创新应用挑战赛
简介：蔡晨霖，西安交通大学人工智能2501。用AI辅助编程完成王者荣耀玩家备战工作台，连接可追溯公开统计、个人英雄池、逐手BP、摇摆位分工与复盘证据。本视频为v0.26.0真实本地演示，包含135秒原始历史协作回看（保留当时旧名），非现场重新输入Prompt。没有专项训练模型，不宣称KPL水平或实际胜率提升。英雄及游戏素材归相应权利人所有，公开统计注明腾讯/天元等来源，与来源方无隶属关系。
代码：https://github.com/cclcclcclcclcclccl/kaiju-next
标签：传智杯、AI创新应用、AI编程、王者荣耀、软件开发、自在弈境
投稿前核对实际分区、可见性和平台AI声明，审核通过后复制普通观看页链接。''')
put(OUT/'免费上传操作.txt','''当前只准备文件，按本人要求尚不投稿或提交。决定提交时：
1. 用已有免费百度/夸克/阿里云盘上传本目录整合ZIP；生成有效分享链接和提取码，未登录核验文件及期限。不要购买会员。
2. 向B站/抖音投稿单独上传目录中的视频，使用视频发布文案和封面；审核后未登录测试普通观看页。不要填投稿后台链接，也不要买推广。
3. 表单第6项只传作品介绍PDF，不把整包上传100MB文档栏目。
4. 核实UID与手机号，检查7项后提交一次，保存回执。预指导截止2026-10-31 15:00，最终省赛另行提交。
本包没有已生成的网盘/视频平台链接或赛事提交回执。''')
# Private form checklist is outside the public archive.
old=ROOT/'submission/预指导提交-20261021/逐栏填写清单-仅供本人使用.txt'
if old.exists():put(OUT/old.name,old.read_text(encoding='utf8').replace('开局NEXT','自在弈境').replace('约2.5MB','小于100MB').replace('自在弈境-省赛预指导完整作品-20261021.zip','自在弈境-v0.26.0-完整提交材料.zip'))
assert len(PdfReader(PACK/'01-作品介绍.pdf').pages)==6;assert len(PdfReader(PACK/'02-技术文档.pdf').pages)==9
with zipfile.ZipFile(PACK/'05-源码与完整作品.zip') as z:
 assert z.testzip() is None
 for n in ['README.md','package.json','package-lock.json','.env.example','server/index.ts','src/player/App.tsx']:assert n in z.namelist()
 manifest=json.loads(z.read('submission/文件校验清单.json'));assert manifest['head']==head
 for row in manifest['files']:assert hashlib.sha256(z.read(row['path'])).hexdigest()==row['sha256']
m={'softwareCommit':head,'commits':count,'sourceFileHashesVerified':True,'promptChainHashesVerified':3,'pdfPages':[6,9],'video':json.loads((release/'video/verification.json').read_text()),'files':[{'path':p.relative_to(PACK).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}for p in sorted(PACK.rglob('*'))if p.is_file()and p.name!='文件校验清单.json']}
put(PACK/'文件校验清单.json',json.dumps(m,ensure_ascii=False,indent=2))
archive=OUT/'自在弈境-v0.26.0-完整提交材料.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=4) as z:
 for p in sorted(PACK.rglob('*')):
  if p.is_file():z.write(p,'自在弈境完整作品/'+p.relative_to(PACK).as_posix(),compress_type=zipfile.ZIP_STORED if p.suffix in ['.zip','.pdf','.mp4','.bundle']else zipfile.ZIP_DEFLATED)
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for row in m['files']:assert hashlib.sha256(z.read('自在弈境完整作品/'+row['path'])).hexdigest()==row['sha256']
result={'softwareCommit':head,'commits':count,'archive':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive),'outerCrcAndHashesVerified':True,'nestedSourceHashesVerified':True,'promptChainsVerified':3,'pdfPages':[6,9],'personalFormGuideExcluded':True,'contestSubmitted':False,'paidServicesPurchased':False}
put(OUT/'最终整包验证.json',json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
