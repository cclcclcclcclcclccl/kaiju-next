# 固定域名与持续在线部署

这些配置用于独立 Linux 云服务器（systemd + Caddy + Node 24.16 或更新的 Node 24），不是已经上线的云服务。当前开发电脑没有 Linux/systemd/Caddy 环境，配置尚需在目标服务器验收；本机已经验证的是应用、备份程序及公网临时服务。

## 需要提供的资源

一台持续在线、能运行 Node 24 的 Linux 服务器；一个指向该服务器的域名；放通 80/443 端口。只允许本机访问应用的 4320 端口。境内服务器的域名和备案要求以云厂商为准；网络位置应在校园网和手机流量下实测。服务器和域名尚未购买，不虚构固定地址。

## 安装顺序

1. 安装 Node 24.16+（24.x）及 Caddy。配置中的 Node 路径为 `/usr/bin/node`，必须用 `command -v node` 核对，不同时调整两个 service 文件。
2. 创建专用系统账号 `kaiju`，将审核后的源码放到 `/opt/kaiju`，在该目录运行 `npm ci` 和 `npm run build`。只上传源码和所需公开资源，不上传开发机的 `data/`、`.env`、private、evidence、个人导出、测试账号和 tools 下的 Windows 隧道程序。不要使用 `scp -r` 将整个工作目录原样公开部署。
3. 将 `kaiju.env.example` 复制为 `/etc/kaiju.env`（root 所有，权限 600），修改 `KAIJU_PUBLIC_ORIGIN` 为真实 HTTPS 来源地址，不带末尾 `/`。本服务只监听回环地址，Caddy 在同一台主机转发。`KAIJU_TRUSTED_PROXY=caddy` 与本配置的 `X-Forwarded-For` 覆盖规则配套使用，不要在未经核对的远端代理拓扑中照搬。
4. 将 `kaiju.service`、`kaiju-backup.service`、`kaiju-backup.timer` 放入 `/etc/systemd/system/`。运行 `systemctl daemon-reload`、`systemctl enable --now kaiju`。systemd 创建 `/var/lib/kaiju`，存放独立数据库、缓存和备份。
5. 将 Caddyfile 的 `play.example.com` 替换为相同域名，配置 DNS 后，运行 `caddy validate --config /etc/caddy/Caddyfile`，验证成功再重载 Caddy。它申请并续期 HTTPS 证书。
6. 验证本机 `http://127.0.0.1:4320/api/status` 与外部 `https://你的域名/api/status`；产品应为“自在弈境”，`publicSharing` 为 true，`publicUrl` 与域名完全一致。确认注册、登录、保存和刷新通过后，再启用 `systemctl enable --now kaiju-backup.timer`。

站点内容包括 `public/` 中已有的公开素材和构建产物。不要通过反向代理暴露 `/var/lib/kaiju` 或项目源码目录。新部署未配置 OCR 时截图识别会显示未安装；未配置模型时不提供大模型分析。可另行安装 OCR，但应在目标 Linux 环境实际验证，不能认为 Windows 上能运行就等同于服务器也可用。

## 数据迁移与备份

当前 Windows 分享实例可运行 `node scripts/player/backup-public.mjs`。默认备份 `data/public-site/kaiju.sqlite`，输出到同目录 `backups/`；使用 SQLite 在线备份 API，覆盖已经提交但尚在 WAL 中的数据。文件旁保留 SHA-256、时间和完整性检查报告，不打印账号或密钥。文件名唯一，不覆盖旧备份。

云端同一脚本根据 `/etc/kaiju.env` 中的目录运行，每天约服务器本地时间 03:30–03:40 执行。使用 `systemctl list-timers kaiju-backup.timer` 核对时区和下一次运行；没有默认删除历史备份。应检查磁盘空间并额外复制到另一个受限存储位置；同一磁盘上的备份不能防止整盘故障。

迁移时先停止旧站点写入，再生成最后一次在线备份；在**新的空目标数据目录**放置为 `kaiju.sqlite`，设置专用账号所有权后启动。需要完整保留原实例时，账号和好友记录会随数据库迁移；不同域名需要重新登录，浏览器未上传的草稿不会自动迁移。数据库包含个人资料，不能作为公开下载附件。

恢复前停止应用，先保留完整旧数据目录，包括 `.sqlite-wal` 和 `.sqlite-shm`；不要把旧 WAL 文件与新的备份数据库混用。将验证通过的备份放入新的空数据目录，指向该目录启动并检查资料。不得在运行中的原数据库上直接覆盖。

## 正式验收清单

- 从校园网和手机流量打开固定域名，两个账号分别保存自己的资料。
- 双向添加好友，只有明确共享后才能看到对方资料，撤销共享后消失。
- 重启服务器，确认服务自动启动、原网址不变、账号和英雄池保留。
- 执行一次备份，在隔离目录恢复，核对资料后才能宣布备份可用。
- 模拟短暂断网，保留页面输入，恢复后先检查保存结果；不要自动重复提交。
- 查看 `journalctl -u kaiju` 与备份日志，检查资源、错误和磁盘空间。

完成这些检查后才能将临时 Cloudflare 地址替换为正式提交地址。
