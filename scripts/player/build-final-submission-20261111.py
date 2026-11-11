from pathlib import Path
from xml.sax.saxutils import escape
import hashlib, json, shutil, subprocess, zipfile, sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'data' / 'pdf-tools'))

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image, Table, TableStyle
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'submission' / '省赛最终材料-20261111'
PDF = ROOT / 'output' / 'pdf'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / '单独上传').mkdir(exist_ok=True)
(OUT / '完整作品').mkdir(exist_ok=True)
(OUT / '验证').mkdir(exist_ok=True)
pdfmetrics.registerFont(TTFont('YaHei', 'C:/Windows/Fonts/msyh.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('YaHeiBold', 'C:/Windows/Fonts/msyhbd.ttc', subfontIndex=0))

styles = {
    'title': ParagraphStyle('title', fontName='YaHeiBold', fontSize=24, leading=32, textColor=colors.HexColor('#152a43'), spaceAfter=10),
    'h': ParagraphStyle('h', fontName='YaHeiBold', fontSize=16, leading=24, textColor=colors.HexColor('#152a43'), spaceAfter=10),
    'sub': ParagraphStyle('sub', fontName='YaHeiBold', fontSize=11, leading=18, spaceBefore=7, spaceAfter=4),
    'body': ParagraphStyle('body', fontName='YaHei', fontSize=10.5, leading=18, spaceAfter=7, wordWrap='CJK'),
    'small': ParagraphStyle('small', fontName='YaHei', fontSize=8.5, leading=14, textColor=colors.HexColor('#526477'), spaceAfter=6, wordWrap='CJK'),
}

def para(text, style='body'):
    return Paragraph(escape(text).replace('\n', '<br/>'), styles[style])

def make_pdf(path: Path, title: str, subtitle: str, pages: list[list], footer: str):
    story = []
    for i, page in enumerate(pages):
        if i: story.append(PageBreak())
        for item in page:
            if isinstance(item, tuple) and item[0] == 'img':
                p = ROOT / item[1]
                if p.exists():
                    im = Image(str(p)); iw, ih = im.imageWidth, im.imageHeight
                    ratio = min(item[2]/iw, 300/ih)
                    im.drawWidth, im.drawHeight = iw*ratio, ih*ratio
                    story += [im, Spacer(1, 5)]
            elif isinstance(item, tuple) and item[0] == 'table':
                rows, widths = item[1], item[2]
                t = Table([[para(str(c), 'small') for c in r] for r in rows], colWidths=widths, repeatRows=1)
                t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8eff5')),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#c2cfdd')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
                story += [t, Spacer(1, 6)]
            else:
                story.append(para(item[0], item[1]) if isinstance(item, tuple) else para(item))
    def footer_fn(c, d):
        c.saveState(); c.setFont('YaHei', 7.5); c.setFillColor(colors.HexColor('#627487')); c.drawString(40, 20, footer); c.drawRightString(555, 20, str(d.page)); c.restoreState()
    SimpleDocTemplate(str(path), pagesize=A4, leftMargin=38, rightMargin=38, topMargin=38, bottomMargin=35, title=title, author='蔡晨霖').build(story, onFirstPage=footer_fn, onLaterPages=footer_fn)
    reader = PdfReader(path)
    assert 1 <= len(reader.pages) <= 30 and path.stat().st_size < 100_000_000
    return len(reader.pages)

version = json.loads((ROOT/'package.json').read_text(encoding='utf8'))['version']
head = subprocess.check_output(['git','-c',f'safe.directory={ROOT.as_posix()}','rev-parse','HEAD'], text=True).strip()
site = 'https://cclcclcclcclcclccl.github.io/kaiju-next/'
intro_pages = [
 [('自在弈境数据站', 'title'), ('传智杯 AI创新应用挑战赛｜省赛作品介绍', 'h'), ('参赛者：蔡晨霖　学校：西安交通大学　人工智能2501', 'small'), ('版本 v0.28.0｜材料日期 2026年11月11日', 'small'), ('img','evidence/final-20261111/offline/home.png', 485), ('自在弈境把公开英雄资料、个人英雄池、逐手 BP、多人体系和对局证据放进一个工作台。玩家可以先看来源，再按自己的准备度决定这一局如何选；系统给出可解释候选，但每一步仍由人确认。', 'body'), ('固定在线入口：'+site, 'small')],
 [('一、项目详情及使用方式','h'), ('玩家常见的问题不是“完全没有数据”，而是资料、个人熟练度、队友分工和 BP 决策彼此分散。作品将“查看资料—登记英雄池—逐手禁选—体系练习—复盘记录”连接为一条可操作流程。', 'body'), ('启动：下载源码后在 package.json 所在目录执行 npm ci、npm run build、npm start，打开 http://127.0.0.1:4318/。固定在线版无需安装，个人记录保存在访问者浏览器。', 'body'), ('图鉴包含 133 位目录英雄及技能、装备、皮肤与公开统计入口；英雄池支持详细指标记录，本地服务另支持配置OCR后核对截图；阵容备战允许人类控制一方或双方，并支持摇摆位、手动锁定及逐手确认。体系练习允许 1–5 人使用。', 'body'), ('当前没有王者荣耀官方账号自动同步、没有取得私有后台接口。公开数据保留来源日期与缺失状态，不能把页面展示理解为实时官方后台。', 'small')],
 [('二、项目亮点','h'), ('1）把全局强度放回个人选择：候选同时读取公开统计、登记池、准备度与分路约束。\n2）BP具有过程控制：双方禁选、对手回应、摇摆分路和人类确认分开，AI不能静默替玩家落子。\n3）数据可追溯：不同来源、日期、分段和原始哈希分开保存，未知值不补造。\n4）多人体系不强制五人：根据当前成员数量和英雄池给出可用体系与缺口。\n5）复盘从证据开始：手记、关键帧、来源和待核对判断分开。', 'body'), ('img','evidence/final-20261111/personal/advice-desktop.png', 485), ('图：固定在线版 BP 页面。截图展示的是当前实际页面，方案值是有限搜索比较分，不是实战胜率。', 'small')],
 [('三、AI测试技术落地使用情况','h'), ('参赛者持续提出可观察的问题并要求 AI 辅助定位、修改、测试和整理。以下结论来自工程检查，不冒充真人试用或职业教练评价。', 'body'), ('table', [['问题','约束与实现','验证'],['英雄池记录不稳定','按英雄保存，保留版本并拒绝过期覆盖','刷新、冲突和备份测试'],['梯度显示可能误导','来源梯度与实验评分分开，未知不补造','133 位目录和来源快照检查'],['BP 禁用耗尽己方池','禁用前检查本方可行分工；对方耗尽只告警','133 项核心测试、80 组独立约束检查'],['上传超限连接重置','读取并丢弃剩余请求后返回 413','远端 CI 与分块测试通过']], [92, 196, 180]), ('本轮核心测试 133 项通过；独立构造 80 组与穷举可行性判断一致。两项均不能证明推荐胜率或职业水平。', 'small')],
 [('四、关键技术与边界','h'), ('React 19 + TypeScript + Vite 构成界面；Node.js 24 与 SQLite负责服务和持久化；Web Worker运行有限深度 BP 搜索；公开快照保留日期、来源和哈希；GitHub CI执行测试、构建和容器复现。', 'body'), ('数据来源：腾讯公开目录/资料、天元之弈公开统计和赛事公开页面，彼此口径分开。项目与腾讯、王者营地、天元之弈不存在隶属关系。', 'body'), ('未完成且不隐瞒：没有私有官方接口，没有官方账号同步，没有配置真实视觉模型，没有进行职业级复盘专项训练，没有真人试用样本，也不能证明实战胜率提升。', 'body'), ('img','evidence/bp-refinement-20261111/public-personal/pool-exhausted.png', 485), ('图：英雄池耗尽提示，系统解释原因并允许用户调整分路或补充池。', 'small')],
 [('六、发表与获奖情况','h'), ('参赛者此前确认项目没有其他参赛、获奖或发表记录；本项目已参加本届赛事预指导。源码公开仓库为 https://github.com/cclcclcclcclcclccl/kaiju-next；该公开事实在此披露。', 'body'), ('本作品借鉴天元之弈数据站、王者营地等同类产品的资料组织方式，同时加入个人池约束、可解释逐手 BP、多人体系适配和证据边界。通用 React、Vite、SQLite 等技术来自开源生态；素材和第三方数据保留各自来源与权利说明。', 'body'), ('正式提交需要本人完成：上传整包到主流网盘并生成可访问链接，上传本 PDF，发布演示视频并生成公开视频观看链接。GitHub 地址和固定网站地址不能代替表单第 5 项和第 7 项。', 'small')],
 [('七、在其他项目基础上的优化情况','h'), ('本项目从自身连续版本迭代，并非对已有成品网站简单换名。参赛者提出意图约束，AI辅助实现。相对早期版本，新版将个人英雄池与摇摆分路联合计算；禁用候选保护己方可行分工；可用英雄面板解释占用原因；保存采用逐项版本冲突保护；固定免费站点与预构建离线站共同提供体验入口。数据整合和第三方发布的梯度不作为原创算法成果。','body'), ('本套材料对应 WPS 表单：第 5 项填网盘整包链接；第 6 项只上传本 PDF（单文件、低于 100MB）；第 7 项填写 B 站/抖音等平台的普通观看页链接。UID、姓名、学校、手机号由参赛者本人核对填写。', 'body'), ('本 PDF 不包含账号、UID、手机号、密码、密钥或个人数据库。旧版本材料没有混入最终整包。视频于2026年11月11日重新录制当前版本页面；其中135秒为三条真实历史AI对话链回看，并明确标注，不伪装成当场实时生成代码。', 'body')]
]
intro_pages.insert(5, [('五、项目相关图片／照片','h'), ('img','evidence/final-20261111/offline/tier.png',485), ('图1：当前构建的梯度列表实机截图。数据仍按来源日期保留；截图不是模拟设计稿。','small'), ('img','evidence/final-20261111/personal/advice-desktop.png',485), ('图2：真实Worker返回的BP建议。使用明确构造的英雄池验证流程，不是真人比赛或战绩。','small')])
intro_pages=[intro_pages[0],intro_pages[1]+intro_pages[2][:2],intro_pages[3]+intro_pages[4][:4],intro_pages[5],intro_pages[6]+intro_pages[7]]
intro = PDF / '自在弈境-省赛作品介绍-v0.28.0.pdf'
intro_pages_count = make_pdf(intro, '自在弈境 省赛作品介绍', 'v0.28.0', intro_pages, '自在弈境数据站｜省赛作品介绍｜v0.28.0')

tech_pages = [
 [('自在弈境数据站｜技术文档', 'title'), ('版本 v0.28.0｜源码提交 '+head, 'small'), ('本文描述可复现的架构、数据口径、BP约束、AI辅助开发留痕和已知边界。', 'body'), ('img','evidence/final-20261111/personal/advice-desktop.png', 485)],
 [('1. 系统架构','h'), ('界面层：React 19 + TypeScript + Vite，页面按图鉴、梯度、装备、英雄池、BP、体系、复盘拆分。\n服务层：Node.js 24，负责参数校验、身份隔离、来源快照、备份和可选适配器。\n持久化层：SQLite 事务保存账号、英雄池、BP记录和复盘手记；静态入口使用浏览器本地存储。\n发布层：GitHub Pages提供不收费的公开静态入口；GitHub Actions完成测试、构建、容器复现。', 'body'), ('不把计划中的云服务、模型密钥或官方账号能力写入已实现范围。', 'small')],
 [('2. 数据与可信性','h'), ('默认公开快照日期 2026-11-09，发布索引 1675 项，目录 133 位英雄。数据来源、查询日期、响应哈希和缺失状态随发布快照保存。', 'body'), ('三率、出场率、禁用率、装备/皮肤数据按来源口径展示；未知分母不被合并成虚假 BP 率，装备胜率不解释为因果收益。梯度页面保留来源档位与排序依据，不把未经校准的实验分数冒充官方 T 档。', 'body'), ('公开资料可变、可能限流或滞后；固定快照保证可复现，不能声称实时后台。', 'small')],
 [('3. BP 算法与个人英雄池','h'), ('输入：当前禁选/已选序列、双方、分路、已登记成员、个人准备度、手动锁定。\n分配：根据英雄支持分路和池记录做联合匹配，保留摇摆英雄的候选分路；冲突时提示用户，不静默改写。\n搜索：有限宽度、有限深度的候选搜索，比较当前方案与对手后续回应；输出理由、风险、后续建议和计算深度。\n落子：推荐只进入“待确认”状态，确认后才写入序列。禁人时优先排除让己方已知分工无解的候选。', 'body'), ('边界：方案值不是胜率；未知队友不虚构资料；对方池耗尽只作假设警告；无法证明职业级 BP。', 'small')],
 [('4. AI辅助开发与测试','h'), ('Codex参与代码草拟、故障定位、测试设计、文档整理；参赛者负责需求方向、真实来源约束、人工判断和接受/拒绝修改。三条原始可见对话链随包提供。', 'body'), ('测试：133 项核心 Node 测试；真实浏览器检查公网首页、133 位梯度、英雄图鉴、英雄池刷新保存、BP真人确认和红方AI接续；80 组构造英雄池由独立穷举器复核可行性。', 'body'), ('这些证据证明软件行为和约束一致，不等于用户研究、比赛胜率或职业教练标注。真实玩家试用与独立推荐评价当前为 0 份。', 'small')],
 [('5. 复现与隐私','h'), ('本地复现：Node.js 24.16 或更新的 Node 24；npm ci；npm run build；npm start；打开 http://127.0.0.1:4318/。公网入口不要求评委安装。', 'body'), ('包内不含 node_modules、.env、密钥、个人数据库、账号、UID、手机号和私有复盘素材。个人记录通过浏览器或独立账号保存，备份/恢复需明确确认。', 'body'), ('如需截图 OCR，另安装本地识别依赖；未配置外部视觉模型时，页面应显示未配置，而不是虚构分析结果。', 'small')],
 [('6. 已知风险和后续工作','h'), ('优先补充真实玩家短任务和盲评，记录邀请数、完成数、卡点和原话；再用这些反馈调整推荐解释。持续数据刷新必须保留原始来源和日期，不能用搜索摘要替换数据证据。若要账号同步，需获得官方授权或由用户主动导入截图并核对。', 'body'), ('作品当前可评审、可复现、可免费访问，但不宣称已经达到职业级复盘、官方实时数据或真实胜率预测。', 'body'), ('img','evidence/final-20261111/personal/advice-desktop.png', 485)],
 [('7. 版本和材料清单','h'), ('源码提交：'+head+'\n固定在线站点：'+site+'\n完整包：自在弈境-省赛完整提交材料-v0.28.0.zip\n单独文档：自在弈境-省赛作品介绍-v0.28.0.pdf\n演示视频：随包提供，发布时生成平台观看页链接。', 'body'), ('校验结果、CI链接、浏览器验证、来源清单和已知边界放在“完整作品/验证”目录。所有哈希在最终材料生成后重新计算。', 'small')]
]
tech_pages[1].extend([('关键数据路径','sub'), ('公开来源 → 校验英雄身份/日期/查询参数 → 同查询快照和原始响应哈希 → 浏览器按所选口径读取。个人修改 → 校验当前版本 → 原子写入或明确拒绝冲突 → 刷新恢复。搜索在Worker中执行，输入变化时旧结果失效。','body'), ('模块位置：src/player/browserApi.ts（静态存储）；server/player/app.ts（服务边界）；src/player/pro/coach.ts（搜索）；rosterFlex.ts（成员分工）；strength.ts（实验强度）。','small')])
tech_pages[2].extend([('实验强度公式与参数敏感性','sub'), ('弈境强度v2.0先对胜率作稳健标准化，对出场与禁用率作log1p后标准化。非代理分段：S=clip(50+18×(0.70×zW×a+0.18×zP+0.12×zB),0,100)。a=sqrt(p/(p+k))，k=max(1,同组出场率中位数/2)。这是低出场衰减，不是有样本数的置信区间。','body'), ('千强在缺少同段胜率时只能显式选择代理，使用同日顶端排位胜率，权重0.60/0.24/0.16；缺少代理则不评分。27组参数扰动给出排名/分数范围；不能据此声称比来源榜更准确。生产代码：src/player/pro/strength.ts。','body'), ('来源核查：pvp.qq.com/web201605/js/herolist.json；camp.qq.com/h5/webdist/hero-rank/index.html；tianyuanzhiyi.com/heroes。腾讯部分榜与第三方全英雄统计不能混称官方全榜。','small')])
tech_pages[3].extend([('联合分配与独立验证','sub'), ('对最多5个已选英雄枚举可行分路，执行手动锁定与个人准备度约束；对剩余已登记分路与可用英雄做二分图匹配，保证两个成员不会同时只剩同一位英雄。未知成员不生成虚构档案。','body'), ('独立评测固定种子20261110，80组小规模构造英雄池另用完整穷举求解，不调用生产匹配函数生成答案。80组可行性判断一致；46组有解中，目录分路基线保留42组，新方法46组。只证明该约束任务上的改善。','body')])
tech_pages[4].extend([('意图控制的实际证据','sub'), ('用户要求禁止虚构数据、指出英雄池丢失和不合理T档，促使实现改为来源与模型边界分离。三条原始可见对话链保留当时产品旧名与时间，不改写为事后成功故事；Git历史和测试交叉验证。内部思考、密钥、私有数据库不在包内。','body'), ('修复链示例：CI暴露超大备份ECONNRESET → 分块测试固定“响应早于上传结束”的失败条件 → 超限清空缓冲并丢弃余下内容 → 返回413 → 本地与Linux测试再验。修复前日志和修改后的测试均留存。','body')])
tech_pages[5].extend([('无需联网安装依赖的备用体验','sub'), ('包内08-离线体验站包含已构建静态文件。已安装Node24时，在该目录运行 node serve-review.mjs site，打开127.0.0.1:4319/kaiju-next/。这不要求npm ci；目录、归档统计、个人池和BP可离线运行。第三方网页和未内置图片仍依赖网络。','body'), ('存储边界：本机服务账号与浏览器静态访客分别保存。浏览器记录不会自动跨设备同步，清除站点数据前应导出备份。程序对完整恢复要求预览与确认，拒绝过期修改。','body')])
tech_pages[6].extend([('未开展的效果评价','sub'), ('参赛者明确目前无法安排真实玩家试用或独立推荐评价，故本材料不填造满意度、用户数、训练轮数或胜率提升。工程基线及可复现实例支撑算法约束主张；实战效用仍需后续验证。','body')])
tech_pages=[tech_pages[0]+tech_pages[1],tech_pages[2],tech_pages[3],tech_pages[4]+tech_pages[5][:3],[('5. 复现与隐私（续）','h')]+tech_pages[5][3:]+tech_pages[6],tech_pages[7]]
tech = PDF / '自在弈境-技术文档-v0.28.0.pdf'
tech_pages_count = make_pdf(tech, '自在弈境 技术文档', 'v0.28.0', tech_pages, '自在弈境数据站｜技术文档｜v0.28.0')


# Render every page and retain a readable text source for review.
import fitz
from PIL import Image as PILImage, ImageDraw
qa=ROOT/'evidence/final-20261111/pdf';qa.mkdir(parents=True,exist_ok=True)
reports=[]
for path in [intro,tech]:
 doc=fitz.open(path);tiles=[]
 for i,pg in enumerate(doc):
  dst=qa/(path.stem+f'-{i+1}.png');pg.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False).save(dst)
  im=PILImage.open(dst).convert('RGB');im.thumbnail((390,550));tile=PILImage.new('RGB',(410,580),'#e4e9ef');tile.paste(im,((410-im.width)//2,6));ImageDraw.Draw(tile).text((12,563),str(i+1),fill='black');tiles.append(tile)
 sheet=PILImage.new('RGB',(1230,((len(tiles)+2)//3)*580),'white')
 for i,tile in enumerate(tiles):sheet.paste(tile,((i%3)*410,(i//3)*580))
 sheet.save(qa/(path.stem+'-contact.jpg'))
 text='\n\n'.join(pg.get_text() for pg in doc);(qa/(path.stem+'.txt')).write_text(text,encoding='utf8')
 if path==intro:
  for key in ['项目详情及使用方式','项目亮点','AI测试技术落地使用情况','关键技术','项目相关图片','发表与获奖情况','在其他项目基础上的优化情况']:assert key in text,key
 reports.append({'path':str(path),'pages':len(doc),'bytes':path.stat().st_size,'renderedPages':len(tiles)})
(qa/'verification.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(reports,ensure_ascii=False))
