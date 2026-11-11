"""Prepare one submission tree; pack only an explicit allowlist after validation."""
from pathlib import Path
import hashlib, html, json, shutil, subprocess, sys, zipfile

R = Path(__file__).resolve().parents[2]
O = R / 'submission/省赛最终材料-20261111'
C, U = O/'完整作品', O/'单独上传'
V = C/'验证'
for p in [O,C,U,V]: p.mkdir(parents=True,exist_ok=True)
git = ['git','-c','safe.directory='+R.as_posix()]
head = subprocess.check_output(git+['rev-parse','HEAD'],cwd=R,text=True).strip()
site = 'https://cclcclcclcclcclccl.github.io/kaiju-next/'
archive = O/'自在弈境-省赛完整提交材料-v0.28.0.zip'
video = R/'artifacts/final-video-20261111/自在弈境-v0.28.0-演示与真实协作记录.mp4'
def sha(p):
    with p.open('rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()
def copy(src,dst):
    dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)

if '--pack' not in sys.argv:
    assert json.loads((R/'package.json').read_text(encoding='utf8'))['version']=='0.28.0'
    video_check=json.loads((R/'evidence/final-20261111/video/verification.json').read_text(encoding='utf8'))
    assert video.exists() and sha(video)==video_check['sha256'] and video_check['fullDecodePassed']
    assert 300<=video_check['durationSeconds']<=480 and video_check['collaborationSeconds']>=120
    for name in ['自在弈境-省赛作品介绍-v0.28.0.pdf','自在弈境-技术文档-v0.28.0.pdf']:
        copy(R/'output/pdf'/name,C/name)
    copy(C/'自在弈境-省赛作品介绍-v0.28.0.pdf',U/'自在弈境-省赛作品介绍-v0.28.0.pdf')
    copy(video,U/'自在弈境-演示视频-v0.28.0.mp4')
    copy(video,C/'04-演示视频-v0.28.0.mp4')
    copy(R/'artifacts/final-video-20261111/视频封面.jpg',U/'视频封面.jpg')
    shutil.copytree(R/'submission/prompt-chains',C/'05-真实AI对话链',dirs_exist_ok=True)
    source=O/'源码发布'
    check=json.loads((source/'archive-verification.json').read_text(encoding='utf8'))
    assert check['gitHead']==head
    for row in check['artifacts']:
        p=R/row['path'];assert sha(p)==row['sha256']
        copy(p,C/('06-源码-v0.28.0.zip' if p.suffix=='.zip' else '07-Git完整历史-v0.28.0.bundle'))
    copy(source/'archive-verification.json',V/'源码包校验.json')
    offline=C/'08-离线体验站'
    shutil.copytree(R/'dist-review',offline/'site',dirs_exist_ok=True)
    copy(R/'scripts/player/serve-review.mjs',offline/'serve-review.mjs')
    (offline/'启动离线体验.cmd').write_text('@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (echo Install Node.js 24 from https://nodejs.org/ first. & pause & exit /b 1)\r\necho Open http://127.0.0.1:4319/kaiju-next/ after the server starts.\r\nnode serve-review.mjs site\r\npause\r\n',encoding='ascii')
    (offline/'使用说明.txt').write_text('先安装Node.js 24。Windows双击启动离线体验.cmd；其他系统在本目录执行 node serve-review.mjs site。\n打开 http://127.0.0.1:4319/kaiju-next/ ，使用期间保持启动窗口开启。关闭窗口停止服务。\n无需npm安装，内置目录、归档统计、个人池和BP可离线使用；外部图片及第三方网页仍需联网。\n4319端口被占用时先关闭此前离线服务；不要关闭不明进程。个人记录保存在本浏览器，请从页面导出备份。\n',encoding='utf8')
    for src,name in [
        ('evidence/final-20261111/core.txt','核心测试.txt'),
        ('evidence/final-20261111/offline/verification.json','断网验证.json'),
        ('evidence/final-20261111/personal/verification.json','个人BP验证.json'),
        ('evidence/final-20261111/browser/browser-verification.json','全站浏览器验证.json'),
        ('evidence/final-20261111/video/verification.json','视频校验.json'),
        ('evidence/final-20261111/pdf/verification.json','PDF校验.json'),
        ('evidence/bp-refinement-20261111/roster-benchmark.json','独立构造约束评测.json'),
        ('artifacts/final-video-20261111/recording.json','录制场景.json'),
    ]:copy(R/src,V/name)
    (C/'版本与交付状态.json').write_text(json.dumps({'version':'0.28.0','sourceCommit':head,'materialsDate':'2026-11-11','defaultDataDate':'2026-11-09','site':site,'realPlayerTrials':0,'independentRecommendationReviews':0,'paidServicesPurchased':False,'formalSubmissionPerformedByAgent':False},ensure_ascii=False,indent=2),encoding='utf8')
    log=subprocess.check_output(git+['log','HEAD','--date=iso-strict','--format=%H %ad %s'],cwd=R,encoding='utf8')
    (C/'开发历史与复现.txt').write_text('固定源码：'+head+'\n源码解压后，在package.json目录执行 npm ci、npm test、npm run build、npm start。需Node24.16或更新Node24，首次安装依赖需联网。\nGit历史恢复：git clone 07-Git完整历史-v0.28.0.bundle zizai\n进入目录后 git checkout '+head+'\n\n'+log,encoding='utf8')
    steps='''# 本人一步一步提交

先准备两种公开链接，最后填表。所有服务采用免费功能；不要购买托管或会员。

1. **找到文件。** 只使用本目录“省赛最终材料-20261111”。第5项用根目录完整ZIP；第6项用“单独上传”中的作品介绍PDF；视频和封面也在“单独上传”。
2. **上传网盘整包。** 登录你已有的百度网盘、夸克或阿里云盘，新建“传智杯-自在弈境-v0.28.0”文件夹，上传完整ZIP。等上传完成后点“分享”，选择允许他人访问、长期有效或覆盖评审期的时限，复制分享链接及提取码。不要使用仅自己可见的文件管理页。用无痕窗口打开并确认文件名、大小和下载入口。
3. **发布演示视频。** 登录B站，进入“创作中心→投稿→上传视频”，选择单独上传目录中的MP4和视频封面。复制“视频发布文案.txt”的标题、简介；内容分区按平台实际选“知识/科技/软件演示”等合适项。按实际情况勾选平台AI创作标识。设置公开并提交审核，不使用私密或仅自己可见。抖音等赛事接受的平台也可以。
4. **取得视频观看链接。** 等平台审核通过，打开普通播放页，复制完整https链接（B站通常为 /video/BV...）。用未登录/无痕窗口打开，确认能播放开头、BP段和AI协作段。不要填创作后台、下载地址或网盘链接。
5. **核对比赛入口和身份。** 从你已报名的赛事个人中心进入正式省赛提交入口，确认赛项为“AI创新应用挑战赛”。截图显示的WPS路径为 https://f.kdocs.cn/ksform/w/write/CZ14BoMv#routePromt ，若与个人中心最新入口不一致，使用个人中心跳转的正式入口。UID在赛事个人中心复制，不填学号、微信号或猜测值；截止时间以你报名页为准。
6. **逐项填表。** ①本人UID；②蔡晨霖；③西安交通大学；④本人常用联系人手机号；⑤粘贴网盘分享链接和提取码；⑥单独上传“自在弈境-省赛作品介绍-v0.28.0.pdf”（只上传这个PDF，不能传总ZIP）；⑦粘贴审核通过的公开视频观看页链接。
7. **最后检查并提交。** 网盘仍可访问、视频可播放、PDF上传完成、UID和手机号无误后点击提交。保存“提交成功”回执及表单截图到你自己的位置。若平台允许更新，也先保存旧回执再修改。

固定在线体验：https://cclcclcclcclcclccl.github.io/kaiju-next/
源码仓库：https://github.com/cclcclcclcclcclccl/kaiju-next

网站打不开的备用方式：完整作品/08-离线体验站；先装Node24，再双击启动脚本。无需npm安装，核心目录、归档统计和BP可离线体验。

本轮没有组织真实玩家试用或独立推荐评价，材料已如实说明。这两项不需要你现在额外完成才能按截图提交。网盘、视频平台登录/实名、UID核对和最终表单提交只能使用你的真实账号；软件工程验证不能代替这些发布动作。
'''
    (O/'本人一步一步提交.md').write_text(steps,encoding='utf8')
    (U/'视频发布文案.txt').write_text('标题：自在弈境数据站｜个人英雄池与可解释BP｜传智杯AI创新应用挑战赛\n\n简介：蔡晨霖，西安交通大学人工智能2501。2026年11月11日录制v0.28.0当前页面，展示真实公开资料、个人英雄池、摇摆分路和逐手BP。示例个人记录是演示构造数据，不是真人战绩；其中135秒为明确标注的真实历史AI协作回看，不是当场实时生成代码。未做职业级训练、未证明实战胜率提升；数据保留来源日期。\n在线体验：'+site+'\n源码：https://github.com/cclcclcclcclcclccl/kaiju-next\n游戏素材及统计归对应权利人所有，与腾讯、王者营地、天元之弈无隶属关系。\n\n按平台实际规则填写AI辅助创作标识；等公开审核通过再复制普通观看页链接。\n',encoding='utf8')
    (O/'表单复制文本.txt').write_text('姓名：蔡晨霖\n学校：西安交通大学\n作品名：自在弈境数据站\n赛道：AI创新应用挑战赛\n在线体验：'+site+'\n源码：https://github.com/cclcclcclcclcclccl/kaiju-next\n\nUID、手机号、网盘分享链接、提取码和视频观看链接请本人实际核对后填写，本文不编造示例值。\n',encoding='utf8')
    (C/'能力与证据说明.md').write_text('''# 已实现与不能宣称的能力

- 固定在线版及离线包：133位目录英雄、已收录来源统计、个人池、档案、逐手BP、手动复盘。浏览器保存不跨设备同步。
- 本机完整服务：独立账号、SQLite、可配置OCR、来源采集和可选视觉模型适配。默认没有视觉模型密钥，静态站不提供服务器OCR、好友账号联机或官方账号同步。
- 本轮133项核心测试、独立80组构造约束与真实浏览器操作证明工程行为；真人试用与独立推荐质量评价0份。方案值不是实战胜率，不能声称职业级复盘或专业BP。
- 默认公开数据日2026-11-09；第三方公开数据不是官方私有后台。部分样本量、分母、分段统计缺失，保持未知。
- 基础英雄素材和来源统计非本项目原创，资料组织借鉴天元之弈与王者营地；原创实现集中在个人约束、联合分路、操作和证据流程。
''',encoding='utf8')
    (O/'README.md').write_text('自在弈境v0.28.0省赛最终材料，2026-11-11。\n先打开“开始查看.html”。网盘上传根目录完整ZIP；表单第6项上传单独PDF；视频须本人发到公开视频平台后填观看链接。\n新录屏1080p、5–8分钟，含135秒真实历史AI对话回看。没有实际代为提交赛事，没有购买服务。\n源码提交：'+head+'\n',encoding='utf8')
    links=[('1 · 按顺序操作与填写','本人一步一步提交.md'),('2 · 第6项作品介绍PDF','单独上传/自在弈境-省赛作品介绍-v0.28.0.pdf'),('3 · 第7项待投稿视频','单独上传/自在弈境-演示视频-v0.28.0.mp4'),('4 · 视频标题、简介与说明','单独上传/视频发布文案.txt'),('5 · 技术文档','完整作品/自在弈境-技术文档-v0.28.0.pdf'),('6 · 离线备用体验说明','完整作品/08-离线体验站/使用说明.txt'),('7 · 固定在线站点',site)]
    page='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>自在弈境最终提交材料</title><style>body{max-width:900px;margin:36px auto;padding:0 22px 50px;background:#101925;color:#e8eef5;font:17px/1.8 system-ui}a{color:#edcc86}.link{display:block;padding:12px 16px;border:1px solid #425269;margin:12px 0}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}h1{line-height:1.4}</style><h1>自在弈境 · 省赛最终材料</h1><p>v0.28.0 · 2026-11-11 · 零新增费用</p>'+''.join('<a class="link" href="'+html.escape(u,quote=True)+'">'+html.escape(label)+'</a>' for label,u in links)+'<h2>逐项提交步骤</h2><pre>'+html.escape(steps)+'</pre></html>'
    (O/'开始查看.html').write_text(page,encoding='utf8')
    for _,link in links:
        if not link.startswith('https:'):assert (O/link).exists(),link
    print('Prepared final material tree for source commit '+head)
else:
    # No broad rglob of the staging root: videos, old ZIPs and temporary source
    # copies must never get included accidentally or include the output itself.
    status=json.loads((C/'版本与交付状态.json').read_text(encoding='utf8'));assert status['sourceCommit']==head
    allowed=[O/'README.md',O/'开始查看.html',O/'本人一步一步提交.md',O/'表单复制文本.txt']
    allowed += [p for folder in [C,U] for p in folder.rglob('*') if p.is_file()]
    for p in allowed:
        assert not any(x in ['private','.git','node_modules'] for x in p.relative_to(O).parts)
        assert p.suffix not in ['.sqlite','.webm'] and p.name!='.env'
    assert sha(C/'04-演示视频-v0.28.0.mp4')==sha(video)
    rows=[{'path':p.relative_to(O).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(allowed)]
    manifest={'version':'0.28.0','sourceCommit':head,'files':rows,'publicSite':site,'realPlayerTrials':0,'independentRecommendationReviews':0}
    (O/'材料校验.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=4) as z:
        for p in allowed+[O/'材料校验.json']:
            z.write(p,p.relative_to(O).as_posix(),compress_type=zipfile.ZIP_STORED if p.suffix in ['.zip','.bundle','.mp4','.pdf'] else zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for row in rows:assert hashlib.sha256(z.read(row['path'])).hexdigest()==row['sha256'],row['path']
    result={'archive':str(archive),'sourceCommit':head,'bytes':archive.stat().st_size,'sha256':sha(archive),'files':len(rows)+1,'crcVerified':True,'allHashesVerified':True}
    (O/'最终材料验证.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=False))
