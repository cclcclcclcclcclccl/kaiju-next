from pathlib import Path
import json,sys
sys.path.insert(0,'data/pdf-tools')
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak,Image,Table,TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from xml.sax.saxutils import escape
from pypdf import PdfReader
import fitz
from PIL import Image as PILImage,ImageOps,ImageDraw
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/pdf';OUT.mkdir(parents=True,exist_ok=True)
QA=ROOT/'evidence/final-v026/pdf-introduction';QA.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('YaHei','C:/Windows/Fonts/msyh.ttc',subfontIndex=0))
pdfmetrics.registerFont(TTFont('YaHeiBold','C:/Windows/Fonts/msyhbd.ttc',subfontIndex=0))
styles={
 'title':ParagraphStyle('title',fontName='YaHeiBold',fontSize=25,leading=35,spaceAfter=12,textColor=colors.HexColor('#172c40')),
 'h':ParagraphStyle('h',fontName='YaHeiBold',fontSize=17,leading=26,spaceAfter=14,textColor=colors.HexColor('#172c40')),
 'sub':ParagraphStyle('sub',fontName='YaHeiBold',fontSize=11,leading=18,spaceBefore=9,spaceAfter=5),
 'body':ParagraphStyle('body',fontName='YaHei',fontSize=10.5,leading=18,spaceAfter=9,wordWrap='CJK'),
 'small':ParagraphStyle('small',fontName='YaHei',fontSize=8.5,leading=14,spaceAfter=8,textColor=colors.HexColor('#526475'),wordWrap='CJK')}
s=[]
def p(t,sty='body'):s.append(Paragraph(escape(t).replace('\n','<br/>'),styles[sty]))
def page(title):
 if s:s.append(PageBreak())
 p(title,'h')
def sub(t):p(t,'sub')
def pic(path,width=475):
 im=Image(str(ROOT/path));im.drawHeight=im.imageHeight*width/im.imageWidth;im.drawWidth=width;s.append(im);s.append(Spacer(1,7))
def table(rows,widths):
 t=Table([[Paragraph(escape(str(c)),styles['small'])for c in row]for row in rows],colWidths=widths,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8eff5')),('GRID',(0,0),(-1,-1),.5,colors.HexColor('#d1dce6')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]));s.append(t);s.append(Spacer(1,10))
p('自在弈境 作品介绍','title')
p('传智杯 AI创新应用挑战赛 · 省赛作品预指导\n蔡晨霖 · 西安交通大学 · 人工智能2501 · A组\n软件版本 v0.26.0 · 材料日期 2026年10月21日','small')
p('本作品将公开英雄资料、个人英雄池、好友协作、逐手BP和复盘证据整合为王者荣耀玩家的备战工作台。核心应用可在本地运行，无需付费模型密钥。本说明逐项回应预指导表单要求的七项内容。')
sub('一 项目详情及使用方式')
p('玩家的实际问题是：资料查询、个人准备度与队友分工彼此分散，看到全局强度排名后，仍难决定自己这一局适合使用什么英雄。作品把“查资料—建英雄池—逐手BP—练体系—记录复盘证据”连接起来。')
p('应用收录133位目录英雄，提供技能与图片、公开来源梯度及部分分段统计、装备和皮肤数据入口。不同来源、日期和分段保留各自口径；缺失统计不会补造。')
sub('基础启动')
p('安装 Node.js 24.16 或更新的 Node 24（小于25），解压源码，在含package.json的目录依次执行 npm ci、npm run build、npm start，浏览器打开 http://127.0.0.1:4318/。首次安装依赖需要网络。README、依赖锁文件及.env.example均随源码提供。')
sub('首次使用建议')
p('先在图鉴查看一个熟悉英雄的数据与来源；进入英雄池添加记录并刷新确认保存；再开始逐手BP，选择双方人工或人机模式，按阵容调整分路；随后使用1–5名成员英雄池选择体系，最后保存对局手记与关键帧。截图OCR另需Python和本地识别依赖。')
p('本地地址只供当前电脑使用，不是公网网站。独立账号是本作品账号，不是王者荣耀账号；项目未取得官方游戏账号自动同步能力。','small')
page('二 项目亮点')
sub('从全局资料走向个人选择')
p('推荐既考虑公开资料，也考虑成员英雄池、准备度和分工。玩家可以记录场次、胜率、战力等指标，或先通过本地截图识别再人工核对。这样避免把“全局热门”直接当成“本人最适合”。记录与推荐不能代替对实际水平的专业测评。')
sub('逐手BP支持摇摆位和人工调整')
p('双方可人工逐手禁选，也可由人类控制一方、程序控制另一方。分路随阵容更新，诸葛亮等摇摆英雄可以在后续选择后再确定分工，也允许人工锁定。对抗搜索比较候选及对手可能回应，不要求双方同时选择相同位置。搜索评分是辅助判断，不是实战胜率。')
sub('从单人到多人体系适配')
p('体系推荐可使用1–5人的成员池；好友共享需要确认，并可撤销。作品把可选英雄、成员位置与体系玩法提示放在同一流程，不以凑齐五人为使用前提。')
sub('数据口径和缺失状态可见')
p('默认来源梯度与实验自研评分分开，公开统计保留来源及日期。不同来源的未知分母不能相加生成BP率；装备胜率也不能直接解释为该装备带来的因果收益。第三方资料整合本身不作为原创算法主张。')
sub('保存可靠性也是产品能力')
p('明确区分本机访客与独立账号；按英雄更新，并检测记录版本冲突，避免多页面整表覆盖。新增找回访客记录、备份与共享撤销流程。能力验证指向具体测试，不以界面展示替代保存结果。')
p('本作品的特色集中在玩家任务的连接、人工可控制的决策流程和可审查工程实现。尚未证明职业级决策效果或实际胜率提升。','small')
page('三 AI测试技术落地使用情况概述')
p('按表单第（3）项，本节同时说明AI辅助测试与实际AI应用边界。开发工具为Codex；参赛者提出需求、纠正方向并规定“不能编造数据”，AI辅助完成代码、定位问题、设计检查和整理证据。')
sub('真实问题驱动的AI修复链')
table([['迭代问题','AI协助与人的约束','验证结果'],['英雄池看似丢失','先定位原记录与身份，不允许删库掩盖；调整逐英雄保存与冲突检测','保留访客记录，验证并发保护和重新打开后的持久化'],['梯度与图鉴数据不一致','纠正未校准评分的默认展示，分别展示来源梯度与统计口径','检查来源字段、接口结果和界面入口，不以自研分数冒充权威T档'],['皮肤率及装备图标缺失','检查接口、缓存及界面，要求普通入口可见','保留原始来源字段，补齐展示并做浏览器回归']],[90,205,180])
sub('已执行的检查')
p('本轮通过119项核心测试、生产构建与3项浏览器专项检查；既有14项回归首轮12项通过，修正异步等待与旧文案断言后，所属4项通过。以前版本的Linux容器检查保留原日期；本版远端验证以归档报告为准。')
p('本轮新目录完成依赖安装、类型检查、构建和空数据库启动，133位目录英雄可加载；本机耗时39秒，使用预装Node/npm及依赖缓存。最终源码包另行检查并附验证报告，不以工作目录结果代替包内检查。')
sub('未实施的能力不作为测试结论')
p('本地OCR识别需用户核对；基础BP使用确定性有限搜索。视觉模型适配接口存在，但体验版未配置外部模型、未进行专项模型训练，也没有以KPL复盘专家为标准完成效果评测。测试通过证明软件行为符合已有断言，不证明职业水平或资料永久准确。')
p('三组原始可见对话、来源索引、Git差异和测试证据共同支持审查。相同Prompt再次运行不能保证生成逐字相同代码；可复现对象是固定版本源码与可追踪的演进。','small')
page('四 项目涉及的关键技术')
table([['层次','实现及作用'],['前端','React 19、TypeScript、Vite；统一图鉴、资料查询、个人档案、BP、体系和对局记录'],['计算','Web Worker运行有限深度对抗搜索；候选宽度和计算预算受限，输入变化后旧结果失效'],['后端','Node.js 24；请求校验、身份隔离、来源代理、缓存与可选模型适配'],['持久化','SQLite事务、逐英雄版本冲突检测、按账号隔离、在线备份'],['数据可信性','固定公开来源、参数校验、同查询旧缓存回退、原始响应SHA-256留存'],['部署及复现','npm锁定依赖，Docker配置，GitHub CI；核心流程不依赖付费服务']],[90,385])
sub('资料查询路径')
p('用户选择英雄、日期和分段后，服务检查参数与同查询缓存，读取公开来源并校验结构，保留来源日期与原始响应凭据。失败时仅回退同一查询旧数据；不能跨英雄、跨分段补数。')
sub('保存路径')
p('界面提交修改与记录版本，服务检查身份和英雄ID，检测冲突后以SQLite事务更新。过期页面不能默默覆盖新记录；访客池与账号池有明确归属。')
sub('低成本与可维护性')
p('核心资料展示、基础BP、英雄池和手记可在普通电脑运行；可选OCR本地执行。项目没有购买服务器、域名或模型API。免费材料分发与完整应用运行分开，当前不宣称已部署永久在线网站。')
p('公网部署配置只是可复用工程文件，不等于云服务已部署。外部数据源仍可能限流、变更或不可用，界面应如实显示来源和缺失状态。','small')
page('五 项目相关图片')
p('以下图片来自本作品v0.26.0实际本地截图，展示真实界面。画面中的英雄、装备与皮肤素材归相应权利人所有。','small')
pic(Path('evidence/final-v026/live/home.png'),425)
p('图1 备战工作台入口。玩家从图鉴、英雄池、BP和对局记录进入对应任务。','small')
pic(Path('evidence/final-v026/video-frames/frame-6.png'),425)
p('图2 逐手BP操作台。双方禁选与分路同屏展示，支持摇摆位更新及人工调整；界面评分不解释为真实比赛胜率。','small')
page('六 发表与获奖情况')
p('截至2026年10月21日，经参赛者确认，本项目没有其他参赛、获奖或发表记录。项目源码已经公开于GitHub；这一公开事实在此披露，不表述为“从未公开”。')
p('公开仓库：https://github.com/cclcclcclcclcclccl/kaiju-next\n软件版本：v0.26.0\n固定源码提交与文件哈希：见完整作品包版本清单','small')
sub('七 在其他项目基础上的优化情况')
p('新名称取意赵怀真“自在之心”，全称自在弈境数据站；旧名开局 NEXT保留在历史记录。本作品沿用本参赛项目自身的连续开发版本，不作为某个已有成品开源项目的简单换名包装。使用React、Vite、SQLite等通用开源技术；借鉴天元之弈数据站、王者营地等产品的资料组织和玩家任务，并引用腾讯公开资料及天元之弈公开统计，保留来源与归属。')
p('相对于本项目早期版本，本次实现的具体改进包括：将简化熟练度扩展为详细个人指标与截图核对流程；把静态阵容建议改为逐手禁选、摇摆位动态分配及人工锁定；支持1–5人体系适配；修复访客与账号身份混淆、并发保存覆盖和断线恢复；补齐图标、来源说明及装备、皮肤数据入口；本轮再增加链接定位、刷新恢复、拼音筛选、表格头像与胜率条、按需页面加载。')
p('公开梯度、英雄素材、游戏机制及第三方统计不作为本项目自有原创成果；程序中的实验评分也未得到独立实战校准。与腾讯、王者营地、天元之弈不存在隶属关系。完整历史随包提供真实提交日志，后期部分积累修改按实际时间归档，未倒填时间。')
sub('材料与版本核查')
p('完整作品包附技术文档、演示视频、三组原始AI对话链、源码、README、环境变量模板、Git历史备份及校验清单。Git历史可离线恢复，无需从GitHub另下；首次npm依赖安装仍需网络。')
p('本文件对应预指导表单“作品介绍文档”栏目。预指导提交不能替代省赛最终提交；正式作品入口公布后需按新要求另行提交。','small')
def footer(c,d):
 c.saveState();c.setFont('YaHei',8);c.setFillColor(colors.HexColor('#617384'));c.drawString(48,815,'自在弈境 | 省赛预指导作品介绍 | v0.26.0');c.drawRightString(547,27,str(d.page));c.restoreState()
path=OUT/'自在弈境-预指导作品介绍.pdf'
SimpleDocTemplate(str(path),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=48,bottomMargin=45,title='自在弈境 预指导作品介绍',author='蔡晨霖').build(s,onFirstPage=footer,onLaterPages=footer)
r=PdfReader(path);assert len(r.pages)==6
assert path.stat().st_size<100_000_000
text='\n'.join(p.extract_text() or '' for p in r.pages)
for key in ['项目详情及使用方式','项目亮点','AI测试技术落地使用情况概述','项目涉及的关键技术','项目相关图片','发表与获奖情况','在其他项目基础上的优化情况']:assert key in text,key
pdf=fitz.open(path);thumbs=[]
for i,page in enumerate(pdf):
 pix=page.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False);file=QA/f'page-{i+1}.png';pix.save(file)
 im=PILImage.open(file).convert('RGB');im.thumbnail((400,570));tile=PILImage.new('RGB',(420,600),'#dfe5ed');tile.paste(im,((420-im.width)//2,8));ImageDraw.Draw(tile).text((12,580),f'Page {i+1}',fill='black');thumbs.append(tile)
contact=PILImage.new('RGB',(1260,1200),'white')
for i,im in enumerate(thumbs):contact.paste(im,((i%3)*420,(i//3)*600))
contact.save(QA/'contact-sheet.jpg')
report={'path':str(path),'pages':len(r.pages),'bytes':path.stat().st_size,'under100MB':True,'sevenRequiredSectionsPresent':True,'screenshots':2,'publicationHistoryConfirmedByUser':True}
(QA/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report))
