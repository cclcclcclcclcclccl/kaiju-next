# 2026-10-22 分享中断恢复

实际原因：电脑于当日12:19:35启动；检查时4318、4320均未监听，旧隧道进程不存在，旧域名不能解析。

已恢复本机与独立分享服务，新地址由 data/public-site/PUBLIC_URL.txt 保存。公网HTTPS首页和英雄图鉴经过Edge浏览器检查，HTTP200、无页面脚本错误。此检查来自本机访问公网域名，不代表已在同学的校园网或移动网络上验证。

新增 scripts/player/restore-sharing.ps1，并在当前用户Windows启动文件夹安装 ZizaiYijing Sharing.lnk。登录后隐藏运行恢复分享，网络启动较慢时最多尝试3次，间隔20秒。脚本已在当前会话实际执行通过；未为验证而重启电脑。

日志：data/public-site/login-recovery.log。关闭电脑、睡眠或断网仍会中断分享。重建免费通道仍可能更换地址，旧域名不可由本项目接管；需重新发送PUBLIC_URL.txt中的最新地址。没有购买托管。

手动恢复：双击根目录“分享自在弈境.cmd”。
撤销登录启动：Win+R输入shell:startup，删除“ZizaiYijing Sharing”快捷方式。该操作不删除账号数据。
