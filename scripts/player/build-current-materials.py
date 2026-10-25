"""Current dated PDFs; original videos and evaluation reports retain their actual dates."""
from pathlib import Path
import sys,json,math
from xml.sax.saxutils import escape
R=Path(__file__).resolve().parents[2];sys.path.insert(0,str(R/'data/pdf-tools'))
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak,Image,Table,TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader
import fitz
from PIL import Image as PILImage,ImageDraw
OUT=R/'output/pdf/20261025';OUT.mkdir(parents=True,exist_ok=True)
QA=R/'evidence/refresh-20261025/pdf';QA.mkdir(parents=True,exist_ok=True)
manifest=json.loads((R/'public/review-data/manifest.json').read_text(encoding='utf8'))
version=json.loads((R/'package.json').read_text(encoding='utf8'))['version']
date=manifest['defaultDate'];count=len(manifest['entries']);url='https://cclcclcclcclcclccl.github.io/kaiju-next/'
pdfmetrics.registerFont(TTFont('CJK','C:/Windows/Fonts/msyh.ttc',subfontIndex=0));pdfmetrics.registerFont(TTFont('CJKB','C:/Windows/Fonts/msyhbd.ttc',subfontIndex=0))
styles={k:ParagraphStyle(k,fontName='CJKB'if k in ['title','h','sub']else'CJK',fontSize=size,leading=lead,spaceAfter=10,textColor=colors.HexColor('#172c40'),wordWrap='CJK')for k,size,lead in [('title',25,36),('h',18,27),('sub',12,20),('body',10.5,18),('small',8.5,14)]}
story=[]
def p(t,k='body'):story.append(Paragraph(escape(t).replace('\n','<br/>'),styles[k]))
def page(title):
 if story:story.append(PageBreak())
 p(title,'h')
def table(rows,widths=[125,350]):
 t=Table([[Paragraph(escape(str(c)),styles['small'])for c in row]for row in rows],colWidths=widths,repeatRows=1);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8f1f4')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#bdcbd8')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]));story.append(t);story.append(Spacer(1,10))
def picture(path,caption,maxheight=235):
 im=Image(str(R/path));ratio=min(475/im.imageWidth,maxheight/im.imageHeight);im.drawWidth=im.imageWidth*ratio;im.drawHeight=im.imageHeight*ratio;story.append(im);p(caption,'small')
def frame(c,d):
 c.setStrokeColor(colors.HexColor('#b89659'));c.line(48,808,547,808);c.setFont('CJK',8);c.setFillColor(colors.HexColor('#546579'));c.drawString(48,27,f'自在弈境 | v{version} | 材料2026-10-25');c.drawRightString(547,27,str(d.page))
def finish(name,required=()):
 path=OUT/name;SimpleDocTemplate(str(path),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=52,bottomMargin=46,title=name[:-4],author='蔡晨霖').build(story,onFirstPage=frame,onLaterPages=frame)
 reader=PdfReader(path);assert len(reader.pages)<=30 and path.stat().st_size<100_000_000
 text='\n'.join(x.extract_text()or''for x in reader.pages)
 for key in required:assert key in text,key
 doc=fitz.open(path);tiles=[]
 for i,pg in enumerate(doc):
  f=QA/(name[:-4]+f'-{i+1}.png');pg.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False).save(f)
  im=PILImage.open(f).convert('RGB');im.thumbnail((380,540));tile=PILImage.new('RGB',(400,570),'#dce4ec');tile.paste(im,((400-im.width)//2,7));ImageDraw.Draw(tile).text((12,550),f'Page {i+1}',fill='black');tiles.append(tile)
 contact=PILImage.new('RGB',(1200,math.ceil(len(tiles)/3)*570),'white')
 for i,im in enumerate(tiles):contact.paste(im,((i%3)*400,(i//3)*570))
 contact.save(QA/(name[:-4]+'-contact.jpg'))
 return {'path':str(path),'pages':len(reader.pages),'bytes':path.stat().st_size,'requiredSections':list(required),'renderedPages':len(tiles)}

p('自在弈境 数据站','title');p('作品介绍 · 省赛预指导','h')
p(f'传智杯 AI创新应用挑战赛 A组\n蔡晨霖 · 西安交通大学 · 人工智能2501\n软件 v{version} · 材料核对日期 2026年10月25日','small')
p('让“全局强度”回到“我这一局怎么选”。本作品将有来源的英雄资料、个人英雄池、逐手BP与复盘证据组织在同一工作台。核心特色是把个人约束与可解释决策连接起来，尚不声称职业级战术效果。')
p('一 项目详情及使用方式','sub');p('在线体验：'+url)
p('评委可直接打开固定HTTPS网址，无需安装、注册或等待作者电脑开机。进入英雄图鉴查熟悉英雄，查看来源日期；在英雄池保存个人选择并刷新确认，再进入阵容备战开始逐手BP。')
p(f'目录包含133位英雄及技能文本。在线版提供{count}个已校验公开查询快照，默认完整批次为{date}；四种已取得分段及其他查询的实际范围以页面为准，不把未取得的分段补成真实数据。')
table([['版本','访问与保存方式'],['固定在线版','GitHub Pages免费托管；英雄池、档案和手动复盘保存到当前浏览器，可导出备份。'],['完整本机版','解压源码，安装Node24.16或更新Node24，执行npm ci、npm run build、npm start；打开127.0.0.1:4318。使用SQLite，支持独立账号及本机OCR配置。']])
p('在线版未部署好友账号联机、服务器OCR、后台自动抓取或外部视觉模型；这些限制在页面明示。清除浏览器网站数据会删除个人记录，请先导出备份。','small')
page('二 项目亮点')
for title,body in [
 ('个人英雄池参与选择','把玩家填写或核对后的场次、胜率、战力、习惯等用于准备度与推荐。未知指标保持未知，不能把榜单强度等同于本人水平。'),
 ('逐手BP与摇摆位','支持人工操控双方或人机对抗，浏览器Worker计算可能回应；不强制双方同位置选人。分路随后续阵容推断，并可手动锁定。固定成员池搜索与自动摇摆搜索目前分开，不能同时联合优化。'),
 ('多人体系练习','1—5名成员即可配置英雄池与分工，查看体系思路、执行任务和缺口，不强制五人齐备。'),
 ('有来源的数据与清晰边界','保留来源URL、实际数据日、获取时间和原始响应SHA-256。来源梯度和实验自研强度分开展示，第三方榜单不当作原创算法。装备胜率不是购买装备的因果收益。'),
 ('可直接打开与可恢复保存','免费固定在线版不依赖作者电脑。浏览器隔离个人记录，锁定并发更新，过期修改会被拒绝；完整备份支持预览、确认和恢复前备份。')]:p(title,'sub');p(body)
p('借鉴天元之弈、王者营地的资料组织，原创实现聚焦个人约束、人工可控决策和证据工作流；不声称拥有腾讯后台或专有游戏数据授权。','small')
page('三 AI测试技术落地使用情况概述')
p('按提交表原文，本节说明AI辅助测试及应用边界。使用Codex进行需求迭代、实现、故障定位、测试设计和材料整理；参赛者持续纠正方向、验证需求并要求禁止虚构数据。原始AI对话链与真实Git历史随包提供。')
table([['问题与约束','落地实现与验证'],['英雄池刷新/多窗口覆盖','完整服务测试存储与身份边界；在线版验证刷新保留、多标签并发冲突与不同浏览器隔离。'],['缺失或过期数据被误当成今日数据','逐查询来源校验、原始响应哈希、缺失提示；默认批次只有在全英雄指定类别均齐全后才推进。'],['电脑重启后评委无法打开','免费固定托管；分别验证静态构建、发布物、CI和未登录公网浏览器，保留失败与最终通过记录。'],['BP看似会计算但不可用','119项核心回归；静态浏览器及公网验证蓝方人工操作后红方Worker计算推进回合。']])
p('BP工程对照','sub');p('2026-10-22使用24个构造局面和1个耗尽边界比较四策略，共100次调用。来源两组只切换池过滤，教练两组只切换深度。结果证明约束与搜索会影响输出，不能推出实战胜率提升。原报告保留实际测试日期与构造性质。')
p('模型与真实效果','sub');p('当前没有完成王者荣耀专项模型训练、职业教练标注验证或真实玩家效果研究。BP主要为可解释规则与搜索。录像可截取关键帧、填写观察并保存证据；自动视觉模型未配置，不能称为自动KPL级复盘。')
page('四 项目涉及的关键技术')
table([['技术','作用'],['React / TypeScript / Vite','模块化页面、类型校验、按需加载与固定子路径发布。'],['参数与来源校验','Zod校验输入、英雄ID、日期和数据结构；公开缓存原始SHA-256核对后进入发布索引。'],['BP与分路推断','有界对抗搜索、候选排序、剩余分工可行性检查、动态分路与人工锁定；Worker避免阻塞主界面。'],['两种存储实现','完整服务SQLite按身份隔离；在线版IndexedDB和Web Locks，校验预期值后更新并检测冲突。'],['免费交付与持续集成','公开Git仓库、GitHub Actions测试与构建、Pages HTTPS部署；源码包与Git bundle可校验、可恢复。']])
p('核心数据链','sub');p('公开来源 → 限速获取 → 原始响应哈希 → 结构与查询校验 → 带日期快照 → 图鉴、榜单、出装与皮肤页面。公开资料既可能滞后也可能缺失；抓取日期不等于游戏版本日期。')
p('隐私与成本','sub');p('公开发布仅包含明确允许的公开资料，不包含本人数据库、聊天密钥、好友关系或账户令牌。没有购买服务器、域名、API或付费托管。公网访问仍受托管平台和访问者网络条件影响。')
page('五 项目相关图片')
picture(Path('evidence/refresh-20261025/browser/home-desktop.png'),'图1 当前构建的固定在线版首页。截图来自实际静态服务浏览器，不依赖模拟API。',220)
picture(Path('evidence/refresh-20261025/browser/bp-viewport.png'),'图2 当前版本人机BP。人工完成蓝方禁用后，计算机给出红方应对并推进回合。评分不等同于真实胜率。',220)
page('六 发表与获奖情况')
p('参赛者此前明确确认：除本项目公开GitHub仓库外，没有其他参赛、获奖或发表记录。本轮新增的固定在线入口与GitHub Release是本项目持续公开交付的一部分，不表述为“从未公开”。')
p('仓库：https://github.com/cclcclcclcclcclccl/kaiju-next\n固定在线入口：'+url,'small')
p('七 在其他项目基础上的优化情况','sub');p('项目原名“开局 NEXT”，现名取意赵怀真“自在之心”。沿用自身连续开发历史，原始对话和旧提交保留原名；不是把其他成品项目简单换名。使用通用开源依赖，公开英雄、皮肤、装备素材与统计归对应权利人。与腾讯、王者营地、天元之弈无隶属关系。')
p('相对自身早期版本：从三个粗略熟练度扩展到详细指标与核对流程；从静态推荐发展为逐手BP、摇摆位和手动分路；加入多人体系；修复保存和身份混淆；补充图标、出装位置和数据来源。当前版重点实现不依赖作者电脑的免费在线入口、独立浏览器保存、数据完整批次门槛及本轮公开数据更新。')
p('材料对应','sub');p('完整包包括本介绍、技术文档、历史工程评测报告、演示视频、三条原始AI对话链、源码、环境说明、Git历史及校验记录。视频中的历史协作段落保留实际日期与旧名称。网盘链接、公开视频链接和本人UID/手机号仍需本人登录平台完成；没有代替本人提交赛事。')
p('官方预指导表单2026-10-25重新核对：截止2026-10-31 15:00（北京时间），每位选手一次；省赛最终作品还需在最终入口另行提交。','small')
required=['项目详情及使用方式','项目亮点','AI测试技术落地使用情况概述','项目涉及的关键技术','项目相关图片','发表与获奖情况','在其他项目基础上的优化情况']
reports=[finish('自在弈境-作品介绍.pdf',required)]
story=[]
p('自在弈境 技术文档','title');p('有来源的资料 × 个人英雄池 × 可解释备战','h');p(f'传智杯 AI创新应用挑战赛 | 蔡晨霖 | 西安交通大学\nv{version} | 2026-10-25','small')
p('01 系统与运行边界','sub');p('同一前端有两种运行方式。完整服务端通过Node HTTP与SQLite提供本机/账号空间、资料更新和可选OCR。固定在线版由GitHub Pages提供静态文件，API适配层把个人操作落到浏览器IndexedDB，把公共查询映射到已校验发布索引；BP Worker直接在访问者浏览器运行。')
table([['操作','固定在线版 / 完整服务端'],['图鉴、BP、体系','均可运行；规则与搜索能力一致，保存位置不同。'],['数据更新','在线版随发布更新快照；完整服务可按限速检查公开来源。'],['个人记录','浏览器本地且可导出 / SQLite按本机或账户保存。'],['好友、OCR、模型','在线入口未部署；完整服务账号功能可用，OCR需依赖，模型需有效配置。']])
p('本轮不迁移本人账户或改写私人记录，更新前分别做本机及分享数据库在线备份。备份不得混入公开包。')
page('02 公开数据、完整性与梯度口径')
p(f'当前目录133位英雄；发布索引{count}项查询，默认{date}。对四个公开统计模式、来源梯度、每位英雄皮肤/装备/组合、无日期的分析/时长逐项检查；只有真实取得且校验通过的日期才成为完整默认批次。无日期接口不补造数据日期。')
p('每个数据包保留原来源URL、原始SHA-256、获取时间、查询日期和缓存状态。静态文件另有SHA-256，用于检测发布传输与文件一致性。源码仓库不包含私人数据库；公开索引排除邀请码、可识别玩家和具体对局查询。')
p('梯度与实验分数','sub');p('来源梯度保留发布者规则并明确标注。自研评分为实验性多指标排序，胜率、选禁信息与口径核对分开；不能把来源全局胜率混作各分段胜率，也不能把不同分母选禁率直接相加。无真实样本量时，不补造置信区间或对局数。')
p('兼容与异常','sub');p('来源结构校验失败、未知英雄、查询未收录均明确报错。静态在线版只读同一查询的文件，不静默换英雄、换分段或换日期。官方资料更新可能仍滞后游戏，警告与未解析记录保留。')
page('03 BP、个人准备度与可解释性')
p('逐手BP维护合法禁选序列与唯一英雄约束。每手可优先选择任意可用分路英雄；同队后续选人重新计算分路匹配，用户可锁定或解除锁定。AI采用有界候选搜索，比较对手可能回应与己方阵容适配，计算超时会暂停而不自动判输。')
p('固定分路成员池约束和自动摇摆位搜索是不同模式，当前拒绝同时启用，不能称为已完成联合最优化。对局评估为启发式适配说明，并非经职业比赛样本校准的获胜概率。')
p('准备度使用玩家自填或确认的指标及习惯。缺失、历史峰值、当前战力与近期发挥分别处理；不把缺失当零、不把历史最高等同于当下实力。1—5名成员的体系配队输出分工、英雄池缺口与练习思路。')
p('工程评测记录','sub');p('2026-10-22的24个固定种子构造局面加1边界，共100次调用。来源优先涉及已登记选手8次，6次越池；来源加池0/8，两教练策略各0/16；1层与3层有4/24首选不同。分母不同，不能直接当作提升率；不存在专家金标准。完整原报告保留，不伪称本轮新实战数据。')
page('04 持久化、隔离与复盘证据')
p('在线版通过IndexedDB事务保存完整个人状态，Web Locks串行化同源多标签操作；池修改包含预期旧值，档案与复盘包含版本条件。冲突时拒绝覆盖并提示先导出输入。不同浏览器上下文起始空记录，网站没有收集这些个人资料。')
p('完整个人备份经过结构和英雄ID校验，恢复前显示条目差异，要求显式确认并留下恢复前备份。原始视频不随备份导出；关键帧会占用浏览器存储空间。隐私模式、存储配额、清除网站数据或更换设备都可能影响持久性。')
p('完整后端SQLite按访客或本作品账号隔离；与王者游戏账号无授权互通。私人数据更新前使用SQLite在线备份，包含WAL已提交记录，不以直接复制单个运行中数据库文件代替。')
p('复盘证据','sub');p('录像选择、画面截取、观察和时间点记录、备份导出可用。自动视觉模型未配置；当前聊天分析不是网站API。未完成专项模型训练、独立教练标注或KPL级评测，不把视频索引数量当训练样本数。')
page('05 构建、部署与复现')
table([['步骤','操作'],['立即体验',url],['本机安装','Node.js 24.16或更新Node24；npm ci'],['构建和运行','npm run build；npm start；访问127.0.0.1:4318'],['在线静态构建','PowerShell设置 $env:ZIZAI_REVIEW_BUILD=\'1\' 后npm run build；产物dist-review，路径/kaiju-next/。'],['检查','npm test；node scripts/player/verify-review-artifact.mjs'],['日常重启','双击“启动自在弈境.cmd”；无需重建个人档案。'],['开发历史','随包Git bundle恢复后checkout版本清单中的精确提交。']])
p('GitHub Actions在main更新后执行核心测试、静态构建、资料校验和Pages部署；另有完整服务Docker验证。依赖锁文件随包，首次安装依赖需要网络；OCR与外部模型不包含在10分钟核心复现时间内。')
p('免费托管不保证所有地区网络永久可达。公网入口应从未登录浏览器检查，并补手机移动网络/校园网实测；本机正常访问不能替代这些不同网络证据。')
page('06 验证证据、限制与提交对应')
table([['证据','证明范围'],['核心测试','输入解析、数据口径、BP合法性、保存、身份、备份等119项回归。'],['无后端浏览器测试','实际静态构建、图片子路径、个人保存刷新、并发冲突、不同访客隔离、备份、手动复盘、BP Worker。'],['公网浏览器与CI','以本轮随包JSON和Actions结果为准；源文件、构建成功和实际访问分别核对。'],['源码包复现','解压文件哈希与Git提交对应；独立目录安装、测试、构建、空数据库启动；保留耗时和前置条件。'],['真实用户效果','目前没有实际试用或独立教练评价，相关模板留空，不由自动化测试替代。']])
p('尚不能通过整理材料解决','sub');p('官方账号自动同步需合法开放接口；模型服务需真实配置；职业级BP与复盘需要训练/标注/独立评测；个人身份、网盘分享、公开视频与最终表单必须由本人登录确认。没有购买服务，没有替本人投稿。')
p('实际表单第5项为主流网盘完整作品链接，第6项单个作品介绍文档≤100MB，第7项公开可播放视频平台链接。固定网站和GitHub不替代上述两种发布。预指导截至2026-10-31 15:00，最终省赛需按官方后续入口再提交。')
p('演示原片录制于2026-10-21，386.46秒、1920×1080，其中135秒为标注过的真实历史AI协作回看。若附本轮更新片段，保留段落日期，不改写原片成新录屏。历史回看是否满足官方形式要求需本人确认。','small')
reports.append(finish('自在弈境-技术文档.pdf'))
(QA/'verification.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(reports,ensure_ascii=False))
