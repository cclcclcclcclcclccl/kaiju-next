import { reviewConfig } from './reviewMode.ts';
import ShareLink from './ShareLink.tsx';
export default function OnlineNotice() {
  if (!reviewConfig) return null;
  return (
    <aside className="pro-notice" aria-label="固定在线版说明">
      <strong>固定在线体验版 · 无需安装和登录</strong>
      <p>
        可直接体验英雄图鉴、公开数据查询、BP 推演和个人记录。数据为有来源的发布快照，默认{' '}
        {reviewConfig.statsDate} 完整批次；各项实际日期以来源说明为准，不是实时数据。
      </p>
      <details>
        <summary>保存位置与功能范围</summary>
        <p>
          英雄池、档案和手动复盘仅保存在当前浏览器，不会上传。清除网站数据或更换设备后无法自动找回，请通过右上角“备份与恢复”导出。账号联机、服务器
          OCR、自动 AI 复盘未在此免费入口部署。
        </p>
        <p>
          <a
            href="https://github.com/cclcclcclcclcclccl/kaiju-next/releases"
            target="_blank"
            rel="noreferrer"
          >
            下载完整作品与演示材料 ↗
          </a>
        </p>
      </details>
      <ShareLink />
    </aside>
  );
}
