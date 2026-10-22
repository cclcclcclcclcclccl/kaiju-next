import { defaultSourceDate } from './tianyuan.ts';
import { useState } from 'react';
import type { z } from 'zod';
import { heroes, heroById } from '../catalog.ts';
import { sourceDate, tianyuanSkinSchema } from './tianyuan.ts';
import { useSource, Provenance } from './TianyuanLive.tsx';
import { SkinDistribution } from './SourceMedia.tsx';

export default function SkinStats({ heroId: fixedHeroId }: { heroId?: number }) {
  const [selectedHero, setSelectedHero] = useState(544);
  const heroId = fixedHeroId ?? selectedHero;
  const [date, setDate] = useState(defaultSourceDate());
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date &&
    date <= sourceDate();
  const source = useSource<z.infer<typeof tianyuanSkinSchema>>(
    valid ? { kind: 'skin', heroId, date } : undefined,
  );
  return (
    <section className="surface skin-statistics" aria-label="英雄皮肤使用率">
      <h3>皮肤使用率 · {heroById(heroId)?.name}</h3>
      <div className="pro-toolbar">
        {fixedHeroId == null && (
          <label>
            皮肤统计英雄
            <select value={heroId} onChange={(e) => setSelectedHero(Number(e.target.value))}>
              {heroes.map((hero) => (
                <option key={hero.id} value={hero.id}>
                  {hero.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          皮肤统计日期
          <input
            type="date"
            value={date}
            max={sourceDate()}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button
          className="btn secondary"
          disabled={!valid || source.loading}
          onClick={source.reload}
        >
          重新读取皮肤统计
        </button>
      </div>
      {!valid && <p role="alert">请选择有效日期，最晚可查询 {sourceDate()}。</p>}
      {source.loading && <p role="status">正在读取皮肤使用率…</p>}
      {source.error && (
        <p role="alert">皮肤统计未能读取：{source.error}。可重试或选择其他查询日。</p>
      )}
      {source.packet && (
        <>
          {source.packet.cache === 'stale' && (
            <p role="status">本次更新失败，显示同一英雄、同一日期的旧缓存。</p>
          )}
          <SkinDistribution
            rows={source.packet.data.skinDistribution}
            date={source.packet.data.queryDate}
          />
          <Provenance packet={source.packet} />
        </>
      )}
    </section>
  );
}
