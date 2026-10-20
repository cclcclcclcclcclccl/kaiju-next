import { useState } from 'react';
import type { z } from 'zod';
import type { tianyuanSkinSchema } from './tianyuan.ts';
import { heroByName } from '../catalog.ts';
import { mediaUrl } from '../media.ts';
import skillMedia from '../data/hero-media.json' with { type: 'json' };

export function NamedIcon({ name, icon }: { name: string; icon?: string }) {
  return (
    <span className="source-item-identity">
      <SourceImage key={icon ?? name} src={icon} name={name} />
      <span>{name}</span>
    </span>
  );
}
export function HeroIdentity({ name }: { name: string }) {
  return <NamedIcon name={name} icon={heroByName(name)?.portrait} />;
}
export function SkillIdentity({ heroId, name }: { heroId: number; name: string }) {
  const media: Record<string, Record<string, string>> = skillMedia;
  return <NamedIcon name={name} icon={media[heroId]?.[name]} />;
}
export function RuneIdentity({ id, name }: { id: number; name: string }) {
  return (
    <NamedIcon name={name} icon={`https://game.gtimg.cn/images/yxzj/img201606/mingwen/${id}.png`} />
  );
}
export function RateBar({
  value,
  win = false,
  label = '胜率',
}: {
  value?: number | null;
  win?: boolean;
  label?: string;
}) {
  if (value == null || !Number.isFinite(value)) return <span className="muted">未公布</span>;
  const tone = !win
    ? 'neutral'
    : value < 48
      ? 'low'
      : value < 50
        ? 'below'
        : value < 52
          ? 'above'
          : 'high';
  const text = win
    ? (
        { low: '低于48%', below: '48%–50%', above: '50%–52%', high: '至少52%' } as Record<
          string,
          string
        >
      )[tone]
    : label;
  return (
    <span className={'rate-display rate-' + tone} title={`${label} ${value.toFixed(2)}% · ${text}`}>
      <strong>{value.toFixed(2)}%</strong>
      <span
        className="rate-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span style={{ width: Math.min(100, Math.max(0, value)) + '%' }} />
      </span>
    </span>
  );
}
export function RateLegend() {
  return (
    <p className="data-caption rate-legend">
      <span className="rate-low">● &lt;48%</span>
      <span className="rate-below">● 48%–50%</span>
      <span className="rate-above">● 50%–52%</span>
      <span className="rate-high">● ≥52%</span>
      颜色仅辅助阅读胜率，不代表梯度或因果强度；横条统一使用 0–100% 刻度。
    </p>
  );
}

export function SourceImage({
  src,
  name,
  fallback,
}: {
  src?: string;
  name: string;
  fallback?: string;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const current = [
    src ? mediaUrl(src) : undefined,
    src,
    fallback ? mediaUrl(fallback) : undefined,
    fallback,
  ].find((url) => url && !failed.includes(url));
  return current ? (
    <img
      className="source-item-image"
      src={current}
      alt={name + '图标'}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed((urls) => [...urls, current])}
    />
  ) : (
    <span className="source-image-missing" role="img" aria-label={name + '图片暂不可用'}>
      {name.slice(0, 1)}
    </span>
  );
}

export function EquipmentIdentity({ id, name, icon }: { id: number; name: string; icon?: string }) {
  return (
    <span className="source-item-identity">
      <SourceImage
        key={id + ':' + (icon ?? '')}
        src={icon}
        name={name}
        fallback={`https://game.gtimg.cn/images/yxzj/img201606/itemimg/${id}.jpg`}
      />
      <span>{name}</span>
    </span>
  );
}

export function SkinDistribution({
  rows,
  date,
}: {
  rows: z.infer<typeof tianyuanSkinSchema>['skinDistribution'];
  date: string;
}) {
  const [sort, setSort] = useState('rate');
  const sorted = [...rows].sort((a, b) =>
    sort === 'name'
      ? a.skinName.localeCompare(b.skinName, 'zh-CN')
      : (b.pickRate ?? -1) - (a.pickRate ?? -1) || a.skinName.localeCompare(b.skinName, 'zh-CN'),
  );
  return (
    <div className="skin-distribution">
      <div className="pro-toolbar">
        <p className="data-caption">
          查询日 {date} · {rows.length} 款来源皮肤 · 使用率在该英雄内部比较
        </p>
        <label>
          皮肤使用率排序
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="rate">使用率 · 从高到低</option>
            <option value="name">皮肤名称</option>
          </select>
        </label>
      </div>
      <div className="skin-usage-grid">
        {sorted.map((skin) => (
          <article className="skin-usage-card" key={skin.skinName}>
            <SourceImage
              key={skin.skinName + skin.skinIcon}
              src={skin.skinIcon}
              name={skin.skinName}
            />
            <div>
              <strong>{skin.skinName}</strong>
              <span className="skin-usage-rate">
                {skin.pickRate == null ? '未公布' : skin.pickRate.toFixed(2) + '%'}
                <small> 来源使用率</small>
              </span>
              {skin.pickRate != null && (
                <div className="skin-usage-track" aria-hidden="true">
                  <span style={{ width: skin.pickRate + '%' }} />
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {!rows.length && (
        <p role="status">来源没有返回该英雄在此日期的皮肤使用率，请尝试其他查询日。</p>
      )}
      <p className="data-caption">
        来源：天元之弈数据站。接口未公布样本场次、完整分母或分段定义；不随英雄三率分段变化。使用率不代表皮肤强度或胜率。
      </p>
    </div>
  );
}
