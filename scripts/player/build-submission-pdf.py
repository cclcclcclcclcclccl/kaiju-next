"""Build the competition technical report from verified project evidence."""
from pathlib import Path
from xml.sax.saxutils import escape
import json
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/pdf';OUT.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('YaHei','C:/Windows/Fonts/msyh.ttc',subfontIndex=0))
pdfmetrics.registerFont(TTFont('YaHeiBold','C:/Windows/Fonts/msyhbd.ttc',subfontIndex=0))
W,H=A4
styles={
 'title':ParagraphStyle('title',fontName='YaHeiBold',fontSize=28,leading=40,textColor=colors.HexColor('#142a43'),spaceAfter=18),
 'h':ParagraphStyle('h',fontName='YaHeiBold',fontSize=17,leading=26,textColor=colors.HexColor('#142a43'),spaceAfter=14),
 'sub':ParagraphStyle('sub',fontName='YaHeiBold',fontSize=11.5,leading=19,spaceBefore=10,spaceAfter=5),
 'body':ParagraphStyle('body',fontName='YaHei',fontSize=10,leading=17,spaceAfter=10,wordWrap='CJK'),
 'small':ParagraphStyle('small',fontName='YaHei',fontSize=8,leading=13,textColor=colors.HexColor('#546579'),spaceAfter=8,wordWrap='CJK'),
}
story=[]
def p(text,style='body'):story.append(Paragraph(escape(text).replace('\n','<br/>'),styles[style]))
def heading(n,title):
 if story:story.append(PageBreak())
 p(f'{n:02d}  {title}','h')
def sub(t):p(t,'sub')
def picture(path,width=470):
 image=Image(str(ROOT/path));image.drawHeight=image.imageHeight*width/image.imageWidth;image.drawWidth=width;story.append(image);story.append(Spacer(1,9))
def table(rows,widths):
 data=[[Paragraph(escape(str(c)),styles['small']) for c in row]for row in rows]
 t=Table(data,colWidths=widths,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8eef5')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#c4d0dc')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),5)]));story.append(t)

p('自在弈境','title');p('有来源、懂英雄池、能解释的\n王者荣耀备战与复盘工作台','h')
p('传智杯 · AI创新应用挑战赛\n参赛者：蔡晨霖\n学校：西安交通大学\n专业班级：人工智能2501\n交付版本：v0.26.0 · 2026年10月21日')
picture(Path('evidence/final-v026/live/home.png'),470)
p('图：v0.26.0 本地实机页面。新名称取意赵怀真“自在之心”，强调以充分准备获得从容选择。133位英雄目录；临时公网需要分享电脑在线。','small')
p('作品以AI辅助编程完成。本文区分已实现的软件流程、公开数据来源、测试结果与尚未完成的专业能力验证。自动复盘未专项训练；不宣称KPL级别或保证比赛奖项。','small')

heading(2,'问题定义与产品闭环')
p('玩家不只需要知道“哪个英雄强”，还需要结合自己的英雄池、队友分工和对方阵容，决定本局适合拿什么、下一步练什么。现有资料查询与个人训练记录往往分散，容易把全局梯度直接当作个人最优选择。')
sub('主要用户与核心任务')
p('面向有排位备战、好友组队、英雄训练需求的玩家。任务链为：查看来源统计 → 核对截图与个人指标 → 建立英雄池 → 双方BP推演 → 按成员池适配体系 → 保存对局与关键帧 → 形成可检验的训练建议。')
table([['环节','软件行为','验收边界'],['资料','133位目录英雄、技能与攻略入口、公开三率及来源梯度','字段覆盖不等于逐版本机制均已人工校准'],['个人','截图识别后核对、详细指标、保存冲突保护','没有官方游戏账号自动同步'],['备战','双方有限搜索、候选解释、只应用一手后再算','不是职业级模型或全局最优保证'],['训练','好友共享池适配、体系模板、对局手记、复盘材料','不是实测胜率提升证明']],[65,235,170])
sub('为什么本作品不把“功能数量”当创新')
p('可展示的核心改进是把数据可信性与玩家决策连接起来：给每份来源保留日期、分段和原始凭据；让个人准备度限制推荐；让复盘结论指向具体证据。具体权重和打法仍需真实试用校准。')

heading(3,'意图控制：人如何约束AI')
p('开发不是让AI一次生成全部页面后就认定完成。参赛者持续提出可观察的问题：数据是否真的来自公开来源、英雄池保存是否可靠、梯度是否违背实际理解、图片和使用率是否在普通入口可见。这些反馈改变了实现和验收方式。')
table([['真实纠偏','对AI的约束','实现变化'],['英雄池记录看似消失','先定位原记录，不能删除或覆盖掩盖问题','区分访客/账号空间，增加找回入口及逐英雄冲突保护'],['梯度明显不合理','不能把未校准自研分数当事实','撤下默认实验T档，独立展示来源梯度与分段三率'],['皮肤率与图标缺失','普通入口应完整可用，不能只声称接通接口','保留来源图片字段，增加皮肤统计入口，旧缓存按原始哈希恢复'],['页面无法访问','恢复可访问性并改进启动流程','后台启动、健康检查、重复启动复用及异常退出恢复']],[100,180,190])
sub('过程证据')
p('submission/prompt-chains 保存三条原始用户/AI可见消息链，分别对应保存、梯度和皮肤图标。JSON包含时间与源记录行号，manifest记录导出时原文件哈希。文本未重写；内部摘要、系统环境块和工具输出不属于该转录。本机路径已标示省略，图片附件原件未嵌入。')
p('这些转录证明当时的请求、反馈与答复，不单独证明每个实现主张。实现和修复结果还需与Git差异、测试日志、原始来源响应和截图一起核对。','small')

heading(4,'架构与数据流')
table([['层','技术与职责'],['界面','React 19 + TypeScript + Vite；图鉴、统计、个人档案、BP、体系、复盘'],['本地算法','Web Worker运行有限深度对抗搜索，避免阻塞主界面；输入变化使旧结果失效'],['服务','Node.js 24原生TypeScript入口；请求校验、身份隔离、数据代理、缓存、可选模型适配'],['持久化','SQLite保存账号、英雄池、备战、手记与扩展档案；本地原始响应按SHA-256留存'],['外部来源','腾讯公开资料与部分榜，天元之弈公开统计，KPL官方回放索引；各自保留口径']],[85,385])
sub('普通查询路径')
p('浏览器选择英雄/日期 → 本地API校验参数 → 检查同一查询缓存 → 匿名读取固定公开地址 → 结构/身份/日期校验 → 归档原始响应与哈希 → 返回统计与来源 → 界面显示。失败时仅允许同一查询旧缓存，不跨日或跨英雄补数。')
sub('数据保存路径')
p('界面提交修改及原记录版本 → 服务校验身份与英雄ID → 检测并发冲突 → SQLite事务写入 → 返回保存结果。旧页面不能默默覆盖同一英雄的新修改。完整备份恢复前先预览，再明确确认，并保留恢复前备份。')
sub('AI与确定性逻辑的边界')
p('代码由AI协助生成，不表示每一功能都依赖在线模型。现有BP是本地搜索；截图为本地OCR；视觉复盘接口是可选服务。当前没有配置真实视觉模型，也没有执行专项训练。')
p('公网实例使用独立数据库，注册后按账号保存；访客不能写入个人数据，服务器本机复盘交接接口不向公网开放。可信代理地址与账号双重限流；在线备份包含已提交 WAL 数据，并校验完整性和 SHA-256。')

heading(5,'来源、梯度和可信性')
p('腾讯基础目录与公开分享榜、天元统计、KPL赛事素材具有不同覆盖范围。项目没有取得王者荣耀私有后台，也不把第三方数据宣称为腾讯官方认证。公开可读同样不等于获得商用授权；提交保留归属说明，图片引用来源URL。')
table([['来源','当前用途','关键限制'],['腾讯公开目录/分享榜','基础英雄资料、装备图录、部分分段分路榜','部分榜非全榜；目录可能滞后'],['天元之弈公开统计','四分段三率、综合梯度、皮肤、装备、时长、关系','综合梯度不随分段改变；部分窗口和分母未知'],['KPL官方公开页面接口','比赛和逐局回放链接、候选复盘素材','索引不等于已观看、标注或训练']],[100,185,185])
sub('默认梯度如何处理')
p('默认展示天元原始综合分及发布档位规则，不再把弈境实验v2作为权威T档。综合梯度日期与三率查询日期分别显示。三率可按出场率、胜率等排序；形态记录与基础英雄数量分开，零值与未知值分开。')
sub('本轮对比与体验改进')
p('实查天元之弈与Lolalytics，补齐页面定位链接、刷新/后退恢复、拼音搜索、筛选记忆/重置、出场率过滤和表格头像/胜率条。OP.GG返回403，营地旧入口404，未声称完成体验。未公开样本量时不复制其样本阈值或置信度。')
sub('历史来源核验与当前边界')
p('2026年10月18日重新请求查询日2026-10-17的四分段统计和来源梯度，共5项查询全部成功。原始响应、获取时间与哈希保存在 evidence/recovery-20261018/sources。此检查不证明所有英雄其他明细接口在所有日期都完整可用。')
p('未公开样本量时不制造置信区间；出场率与禁用率分母未核实时不相加冒充BP率；装备胜率不推断因果收益；皮肤使用率不推断皮肤强度。')

heading(6,'BP、个性化与复盘')
sub('双方教练搜索')
p('搜索结合双方已选、禁用、分路覆盖、玩家准备度、来源统计与定性关系。不同候选向前展开对手可能回应，再比较己方后续方案。计算受深度、候选宽度和预算限制；只应用当前一步，实际阵容变化后重新计算。')
p('逐手 BP 支持双方人工操作与人机模式、十次禁用与十次选择、撤回、系列赛及历史编辑。摇摆英雄随本方后续选择重新分配分路，人类可锁定或交换位置；对方不必选择同位置回应。体系适配支持 1-5 人，不强制凑齐五人。')
p('反例与测试重点是选序合法性、双方回应是否真的影响建议、指定选手池是否约束选择、超时是否只提交完整算完的层。现有合成模拟不证明实际比赛胜率，更不能作为职业级能力证据。')
p('实现采用迭代加深与alpha-beta剪枝。稳健模式在己方回合取最大方案值、对方回合取最小值；倾向模式对对方候选按 exp((prior-priorMax)/8) 归一化加权。候选截断前优先保留每个空缺分路的最佳应对，降低单路高分占满候选的风险。上述先验及权重尚未实战拟合。','small')
sub('英雄池与体系适配')
p('详细指标包括场次、近期表现、胜率、战力和玩家习惯等；未知项允许留空。截图先识别为待核对字段，不自动写入档案。好友关系需双向确认，共享可撤销；体系根据各成员实际英雄池给出分工和训练缺口。')
sub('录像复盘的证据协议')
p('本机载入真实视频、截取关键帧并标注时间，整理为当前聊天可读取的复盘包。三轮核查依次是事实核对、战术替代方案、反证条件；分别考虑兵线、视野、资源、技能装备、团战职责和沟通。未知冷却或经济不能凭空填写。')
p('每个决策材料仅列截至该时刻的事件，减少事后结果干扰；材料组织不是模型的严格信息隔离。必须区分观战全图与选手视野。模型生成结果需引用帧并通过结构校验；不完整时返回证据不足。')
sub('未完成的专业评测')
p('尚缺真实玩家试用、当前版本教练标注、按整场划分的独立验证集、复盘事实错误率和训练建议有效性评测。无法用增加视频链接或重复提示替代训练。')

heading(7,'启动、恢复与10分钟复现')
p('环境：Node.js 24.16或更新的Node 24、npm；Windows可使用已安装Edge做浏览器检查。首次安装需要依赖下载网络。无需注册、无需模型密钥即可运行核心功能；OCR另需Python及OCR依赖。')
table([['步骤','命令/行为'],['安装','npm ci'],['构建','npm run build'],['前台运行','npm start；打开 http://127.0.0.1:4318'],['Windows日常使用','双击 start-kaiju.cmd，检查成功后自动打开页面'],['后台启动','npm run open；自动检查依赖、源文件变化和服务状态'],['诊断','data/launcher.log 查看错误；data/launcher.json 查看当前进程'],['数据迁移','界面完整备份与恢复；避免直接复制仍在写入的单个SQLite文件']],[110,360])
sub('故障恢复行为')
p('启动器将服务放到后台，关闭启动窗口后仍可用；重复启动会复用已运行实例。异常退出最多尝试恢复三次，避免无限重启。电脑关机或重启后仍需双击启动；未安装开机自启动、未配置云端托管。')
p('已打开页面每15秒及重新获得焦点时检查服务。断开时提示启动步骤，并保留当前页面输入；连接恢复不会自动覆盖正在编辑的内容。浏览器无法访问的空白页不能自行启动本机进程，仍需启动文件。')
sub('干净目录复现结果')
repro=json.loads((ROOT/'evidence/final-v026/reproduction.json').read_text(encoding='utf-8'))
p(f'本轮新目录安装、类型检查、构建及空数据库启动共 {repro["elapsedSeconds"]} 秒。使用本机预装Node/npm和已有依赖缓存，不等于全新操作系统。未把OCR安装、外部数据源网络、模型申请计入此时间。')

heading(8,'验证策略与证据目录')
p('测试按证据能力分层：单元/接口验证边界和持久化；浏览器验证真实操作链；实时来源检查验证当前可访问性；实战效果仍须独立评估。这四类证据不能互相替代。')
p('本轮119项核心测试、3项浏览器专项与生产构建通过。14项既有浏览器回归首轮12项通过，修正异步加载等待与旧文案断言后，所属4项通过。此前v0.25.1的Linux容器持久化检查仍保留原版记录；本版CI以最终归档报告为准。')
table([['检查','证据位置','能证明什么'],['核心测试','final-v026/core.txt','119项通过；解析、存储、算法、代理与备份'],['公网真实流程','public-reliability-v0251/verification.json','两账号注册、保存刷新、隔离、好友共享和撤销'],['断线故障注入','recovery-verification.json','保留输入、恢复加载、中文错误、不自动重复写入'],['本机浏览器回归','local-regressions.txt','4项通过，含存储冲突与装备统计'],['新目录复现','final-v026/reproduction.json','新依赖安装、构建、空数据库启动'],['真实在线备份','live-backup.json','SQLite完整性和SHA-256通过']],[100,190,180])
sub('历史回归中的实际失败')
p('首次全量浏览器测试50项通过、2项失败。一个是把截图输入夹具错误地跟随新证据输出目录迁移；另一个是新增皮肤加载状态使旧测试的通用status选择器不再唯一。修复固定输入路径与保存提示定位后重跑，保留首轮日志。没有把测试失败隐藏为通过。')
sub('需要持续观察的工程问题')
p('本轮10个非首页页面按需加载，主入口由约822KB降至592KB；英雄资料仍约1.23MB，尚未实现按英雄拆分；外部图片和公开接口可能波动；临时公网可用性依赖电脑运行。服务器容器、持久化和HTTPS配置已准备，实际持续托管仍需要外部账号及目标环境验证。')

heading(9,'提交材料对应与剩余条件')
table([['赛题要求','本次交付','提交前确认'],['代码仓库与细粒度历史','原有40次提交及当前版本真实归档，不倒填日期','GitHub评审仓库以提交清单记录为准'],['至少3条AI核心链','三条原始用户/AI文本转录与来源索引','核对导出删减标记及是否需补原工具截图'],['10分钟复现指南','README、启动器、新目录实测报告','预装Node/npm、缓存与网络条件明确'],['不超过30页技术PDF','本技术文档','最终页数由生成器核对，不超过30页'],['5-8分钟1080p MP4','v0.26.0字幕实录，含135秒真实历史协作回看','不是现场重新生成；具体审核要求以平台为准'],['最终提交','提交清单、完整源码和Git历史包','实际报名信息及上传仍由参赛者本人完成']],[100,185,185])
sub('实际表单与参赛信息')
p('报名截图确认A组。2026-10-21已读取省赛预指导表单：截至2026-10-31 15:00，每人一次；第5项为主流网盘完整作品链接，第6项单个介绍文档≤100MB，第7项为B站/抖音等公开可播放视频链接。GitHub下载或本地地址不能替代上述链接；最终省赛另行提交。')
p('公开仓库：github.com/cclcclcclcclcclccl/kaiju-next。原始三条Prompt链保留旧名和真实历史。本版演示为1920×1080，含135秒明确标注的历史协作回看；实际长度、解码与分辨率见随包视频验证报告。UID、联系人手机号及平台上传由本人处理，当前未提交。')
sub('使用与归属')
p('王者荣耀及英雄、皮肤、装备内容归相应权利人所有。项目与腾讯、王者营地、天元之弈无隶属关系；对公开资料注明来源。本项目自身实现与依赖边界在源码中可查；不以复制第三方榜单作为算法原创性主张。')
p('重点展示：用户纠错如何改变实现、可核验数据如何进入普通入口、个人池如何约束备战、保存失败如何恢复。模型训练、职业效果和未取得的私有数据明确列为未完成。')

def frame(c,doc):
 c.setStrokeColor(colors.HexColor('#c7a264'));c.setLineWidth(1);c.line(48,H-36,W-48,H-36)
 c.setFont('YaHei',8);c.setFillColor(colors.HexColor('#56667b'));c.drawString(48,25,'自在弈境 | 传智杯 AI创新应用挑战赛 | v0.26.0 · 2026-10-21');c.drawRightString(W-48,25,str(doc.page))
path=OUT/'自在弈境-技术文档.pdf'
SimpleDocTemplate(str(path),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=54,bottomMargin=48,title='自在弈境 技术文档',author='蔡晨霖').build(story,onFirstPage=frame,onLaterPages=frame)
reader=PdfReader(path);assert len(reader.pages)<=30
print(json.dumps({'path':str(path),'pages':len(reader.pages),'textCharacters':sum(len(page.extract_text()) for page in reader.pages)},ensure_ascii=False))
