from pathlib import Path
import sys,json
sys.path.insert(0,'data/pdf-tools')
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4
from xml.sax.saxutils import escape
R=Path(__file__).resolve().parents[2];report=json.loads((R/'evidence/provincial-20261022/bp-comparison.json').read_text(encoding='utf8'))
pdfmetrics.registerFont(TTFont('CJK','C:/Windows/Fonts/msyh.ttc',subfontIndex=0));pdfmetrics.registerFont(TTFont('CJKB','C:/Windows/Fonts/msyhbd.ttc',subfontIndex=0))
styles={k:ParagraphStyle(k,fontName='CJKB'if k in ['title','h']else'CJK',fontSize=n,leading=n*1.65,spaceAfter=10,textColor=colors.HexColor('#172c40'),wordWrap='CJK')for k,n in [('title',23),('h',15),('body',10),('small',8)]};story=[]
def p(t,k='body'):story.append(Paragraph(escape(t).replace('\n','<br/>'),styles[k]))
def table(rows,widths):
 t=Table([[Paragraph(escape(str(c)),styles['small'])for c in row]for row in rows],colWidths=widths);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8f1f4')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#c0cbd4')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]));story.append(t);story.append(Spacer(1,12))
p('自在弈境 · 省赛评测补充','title');p('软件v0.26.0 | 材料2026-10-22\n蔡晨霖 · 西安交通大学人工智能2501','small');p('01 我们验证了什么','h')
p('本报告补充工程对照与真实试用计划。构造情境不是实际比赛，英雄池约束是规则而非用户效果，搜索改变首选不等于战术改进。当前没有职业级标注、训练或实战胜率结论。')
table([['项目','设置'],['数据来源','2026-10-14天元公开梯度归档，保存原文件SHA-256；并非今日实时榜'],['输入','24个固定种子构造局面、1个耗尽边界；构造选手只设池成员与main级别，不生成战绩/胜率/战力'],['比较','来源优先、来源加池、池约束教练1层、池约束教练3层，共100次调用'],['预算','教练宽度4，最多1000节点，1500ms保护；确定性评估时间固定在来源日期'],['独立检查','未选/未禁、目录支持分路、池归属；另用回溯匹配器检查当前局面本方剩余分工可完成'],['复现','node scripts/player/evaluate-provincial.mjs；协议、输入先保存再执行；所有逐条输出随包']],[85,390])
p('适用边界','h');p('来源两组只改变池过滤；教练两组只改变请求深度。跨家族同时改变启发式，不能作纯深度消融。来源基线对同英雄取最大已公布综合分，未虚构分路分数。目录与来源覆盖可能不同，未公布优先分的英雄不进入来源基线。')
p('构造池初始互不重叠，测试规模小；不是代表性用户样本或留出集。没有完成整场20手禁选评测，也未模拟未来对手抢选对可完成性的影响。','small')
story.append(PageBreak());p('02 实际结果与不能推出的结论','title')
labels={'source-only':'仅来源优先','pool-source':'来源+池','pool-coach-1':'教练1层','pool-coach-3':'教练3层'}
rows=[['策略','合法建议','已登记选手\n越池/涉及','可完成\n分工','中位ms','P95 ms']]
for s in report['summary']:rows.append([labels[s['policy']],f"{s['legalRecommendations']}/24",f"{s['outsideRegisteredPool']}/{s['assignedMemberRecommendations']}",f"{s['remainingFeasible']}/24",s['medianMs'],s['p95Ms']])
table(rows,[100,65,90,65,75,80])
p('来源优先涉及已登记选手的8次推荐有6次越池；加池后相应8次为0。教练两组各涉及16次，均未越池。未登记选手的池未知，不把未知当作合规；分母不同，不报告跨组的“提升百分比”。')
p('1层与3层在4/24个局面的首选不同，均完成请求深度。结果仅证明计算深度影响部分输出，不证明变化方向更好。当前Node进程中单次计时存在热身与硬件影响，不代表用户浏览器总延迟或服务时延保证。')
p('耗尽边界S25','h');p('两组教练拒绝推荐，并指出中路没有可用已登记英雄；来源排序仍能推荐其他空缺分路，但无法补齐整队。这是全局可行性预检的不同，不应描述成来源排序选出了重复/禁用英雄。')
p('推荐质量仍需独立评价','h');p('没有专家金标准，不能用教练自身评分证明自己正确。后续对相同局面进行匿名A/B评价，隐藏方法和分数，记录可执行性、分路合理性、英雄池约束、解释依据以及评价者分歧；当前尚未执行。')
p('固定选手英雄池推演与自动摇摆位搜索目前分模式实现。代码拒绝同时混用，不能把两条演示剪辑为“已完成联合求解”。','small')
story.append(PageBreak());p('03 真人试用与提交前闭环','title')
p('真实试用当前0份','h');p('已准备匿名本地记录器、六项任务、计时与JSON导出。建议先请2位同学试用发现问题，再累计5—8位不同熟悉程度的玩家。使用匿名代号，不收游戏密码和联系电话；原话公开需同意。')
table([['任务','独立成功标准'],['资料理解','找到赵怀真数据并说清日期、来源和综合梯度/分段三率差别'],['记录保存','添加本人真实常用英雄，刷新后仍可找到'],['逐手BP','完成至少四步，撤回一步后继续'],['摇摆调整','找到自动/手动分路，能解释当前分工'],['体系练习','使用1—3位成员，找到分工和训练缺口'],['备份','下载个人备份，找到恢复预览入口，不执行覆盖']],[95,380])
p('记录独立成功、帮助后成功、失败与未尝试，入口失败也保留。分别报告任务分母；没有计时的记录不填0秒。小样本反馈只作探索性可用性证据，不能推出普遍提升。')
p('本人需要完成的事项','h');p('①手机移动网络及同学校园网核验入口；②邀请真实玩家并把导出记录交回；③自己按稿彩排；④向官方核实UID、历史协作回看形式与正式提交时间；⑤决定提交后再登录网盘、视频平台和赛事表单。材料整理不能代替这些真人或官方动作。')
p('预指导截至2026-10-31 15:00（北京时间），最终省赛另行提交。表单要求网盘整包链接、单一介绍文档≤100MB、公开视频平台链接。当前未投稿、未提交、未购买服务。','small')
def frame(c,d):c.setFont('CJK',8);c.setFillColor(colors.HexColor('#53697b'));c.drawString(48,27,'自在弈境 | 工程评测与待执行真人试用 | 2026-10-22');c.drawRightString(547,27,str(d.page))
path=R/'output/pdf/自在弈境-省赛评测与验证补充.pdf';SimpleDocTemplate(str(path),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=48,bottomMargin=48,title='自在弈境省赛评测与验证补充',author='蔡晨霖').build(story,onFirstPage=frame,onLaterPages=frame)
print(path)
