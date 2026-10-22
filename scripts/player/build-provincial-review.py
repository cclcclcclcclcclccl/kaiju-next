from pathlib import Path
import re,html,json,shutil
R=Path(__file__).resolve().parents[2];folder=R/'submission/provincial-kit-20261022';web=R/'public/review';web.mkdir(parents=True,exist_ok=True)
style='body{margin:0;background:#0f1825;color:#e6edf5;font:16px/1.85 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1100px;margin:auto;padding:36px 22px}h1{font-size:36px}h2,h3{color:#e3c68b}a{color:#e1c07d}nav{display:flex;flex-wrap:wrap;gap:12px}details{background:#192738;border:1px solid #3c4c60;border-radius:10px;padding:16px;margin:18px 0}summary{font-size:20px;cursor:pointer;color:#f0d7a7}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:10px;border:1px solid #4b6078;text-align:left;vertical-align:top}.scroll{overflow:auto}p{overflow-wrap:anywhere}.notice{border-left:4px solid #c5a66b;padding:12px;background:#203248}*:focus-visible{outline:3px solid #f0c77d;outline-offset:4px}@media print{body{color:#172c40;background:white}details{break-before:page;background:white}summary{color:#172c40}nav{display:none}a{color:#172c40}}'
def render(md):
 lines=md.splitlines();parts=[];table=[]
 def flush():
  if table:
   rows=[]
   for i,row in enumerate(table):
    if re.fullmatch(r'[\s|:\-]+',row):continue
    tag='th'if i==0 else'td';rows.append('<tr>'+''.join(f'<{tag}>'+html.escape(c.strip())+f'</{tag}>'for c in row.strip('|').split('|'))+'</tr>')
   parts.append('<div class="scroll"><table>'+''.join(rows)+'</table></div>');table.clear()
 for line in lines:
  if line.startswith('|'):table.append(line);continue
  flush()
  if not line:continue
  if line.startswith('#'):
   n=min(3,len(line)-len(line.lstrip('#')));parts.append(f'<h{n}>'+html.escape(line.lstrip('#').strip())+f'</h{n}>')
  else:parts.append('<p>'+html.escape(line)+'</p>')
 flush();return ''.join(parts)
sections=''.join('<details id="guide'+p.name[:2]+'"><summary>'+html.escape(p.stem)+'</summary>'+render(p.read_text(encoding='utf8'))+'</details>'for p in sorted(folder.glob('0*.md')))
url='https://cclcclcclcclcclccl.github.io/kaiju-next/'
body=f'''<h1>自在弈境 · 省赛准备台</h1><p>蔡晨霖 · 西安交通大学人工智能2501 | 在线入口v0.26.1 | 原评测与视频v0.26.0 | 材料2026-10-22</p><p class="notice">应用与开发证据已准备，真人试用当前0份；没有专项训练或职业级效果结论。固定在线入口无需作者电脑开机，公开数据为发布快照；浏览器保存个人记录，好友/OCR/自动视觉服务未部署。当前未提交比赛、未购买服务。演示视频沿用2026-10-21真实录屏。</p><nav><a href="{html.escape(url)}">固定在线体验（浏览器保存）</a><a href="https://github.com/cclcclcclcclcclccl/kaiju-next">代码仓库</a><a href="试用记录器.html">打开匿名试用记录器</a><a href="#guide06">本人剩余操作</a></nav><p>核心主线：公开资料 → 个人英雄池 → 固定分工推演 / 独立逐手摇摆BP → 体系练习与证据记录。</p>'''
page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>自在弈境 · 省赛准备台</title><style>'+style+'</style><main>'+body+sections+'</main></html>'
(folder/'开始查看.html').write_text(page,encoding='utf8');(web/'index.html').write_text(page,encoding='utf8');shutil.copy2(folder/'试用记录器.html',web/'试用记录器.html')
print('Built offline and public review guides.')
