import { useEffect, useState } from 'react';
import { Shield, Sparkles, Radio, RefreshCw } from 'lucide-react';
import { api } from '../../api.ts';
import { heroes, heroById } from '../catalog.ts';
import type { Hero } from '../model.ts';
import type { ResourceResult, UpdateArticle } from './resources.ts';
import SkinObservation from './SkinObservation.tsx';
let cached: ResourceResult | undefined, pending: Promise<ResourceResult> | undefined;
function requestResources() {
  if (pending) return pending;
  pending = api<ResourceResult>('/resources')
    .then((r) => {
      cached = r;
      return r;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
export function useResources() {
  const [result, setResult] = useState(cached),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(!cached);
  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await requestResources());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    const update = () =>
      requestResources()
        .then((r) => {
          if (active) {
            setResult(r);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    void update();
    const timer = setInterval(() => void update(), 15 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return { result, error, loading, refresh };
}
function Article({ article }: { article: UpdateArticle }) {
  return (
    <article className="update-card">
      <div>
        <span className={'outline-tag ' + (article.environment === '体验服' ? 'trial' : '')}>
          {article.environment}
        </span>
        <time>{article.publishedAt}</time>
      </div>
      <h3>
        <a href={article.source} target="_blank" rel="noreferrer">
          {article.title} ↗
        </a>
      </h3>
      {article.heroIds.length > 0 && (
        <p className="data-caption">
          正文提及：
          {article.heroIds
            .map((id) => heroById(id)?.name)
            .filter(Boolean)
            .join('、')}
          。提及不等于平衡性调整。
        </p>
      )}
      {article.text && (
        <details>
          <summary>阅读公告文字</summary>
          <p className="resource-description">{article.text}</p>
        </details>
      )}
    </article>
  );
}
export function HeroResources({ hero }: { hero: Hero }) {
  const { result, error } = useResources();
  const skins = result?.data.skins.filter((s) => s.heroId === hero.id) ?? [],
    updates = result?.data.updates.filter((u) => u.heroIds.includes(hero.id)) ?? [];
  return (
    <>
      <section id="hero-updates">
        <h3>版本追踪 · {hero.name}</h3>
        <p className="data-caption">
          公告与克制说明分开核验。检测到英雄名称后提示你查看原文，不自动改写克制权重或宣称新打法已验证。
        </p>
        {error && <p role="status">{error}</p>}
        {result?.stale && <p className="pro-notice">{result.warning}</p>}
        {updates.length ? (
          updates.map((u) => <Article key={u.id} article={u} />)
        ) : (
          <p className="muted">
            {result
              ? '本次最近 20 条公告未匹配到此英雄；不代表该英雄没有改动。'
              : '正在读取官方公告…'}
          </p>
        )}
      </section>
      <section id="hero-skins">
        <h3>皮肤图录 · {skins.length} 款已接入</h3>
        <SkinObservation heroId={hero.id} />
        <p className="data-caption">
          官方目录与文案。目录不保证覆盖全部历史皮肤；使用率与独立玩家评价尚缺可靠数据源。
        </p>
        <div className="skin-grid compact">
          {skins.map((s) => (
            <article key={s.id} className="skin-card">
              {s.image && <img loading="lazy" src={s.image} alt={hero.name + ' · ' + s.name} />}
              <div>
                <strong>{s.name}</strong>
                <small>
                  {s.quality || '官方未标注品质'} · {s.releasedOn || '上架日期未知'}
                </small>
                <p>{s.description || '暂无官方介绍'}</p>
                <span className="data-caption">使用率 — · 暂无来源</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
export default function ResourceCenter({ onOpen }: { onOpen: (hero: Hero) => void }) {
  const { result, error, loading, refresh } = useResources();
  const [tab, setTab] = useState('equipment'),
    [query, setQuery] = useState(''),
    [type, setType] = useState('全部'),
    [hero, setHero] = useState('全部'),
    [environment, setEnvironment] = useState('正式服'),
    [compared, setCompared] = useState<number[]>([]),
    [limit, setLimit] = useState(48);
  const data = result?.data;
  const equipment =
    data?.equipment.filter(
      (e) =>
        (type === '全部' || e.type === type) &&
        (!query || [e.name, e.description].some((t) => t.includes(query))),
    ) ?? [];
  const skins =
    data?.skins
      .filter(
        (s) =>
          (hero === '全部' || String(s.heroId) === hero) &&
          (!query || [s.name, s.heroName, s.quality].some((t) => t.includes(query))),
      )
      .sort((a, b) => b.releasedOn.localeCompare(a.releasedOn)) ?? [];
  const chosen = data?.equipment.filter((e) => compared.includes(e.id)) ?? [];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LOADOUT / PATCH WATCH</p>
          <h1>看装备，也看版本。</h1>
          <p>官方装备与皮肤图录，和有原文可查的版本动态。</p>
        </div>
        <button className="btn secondary" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw size={16} />
          {loading ? '正在读取…' : '检查更新'}
        </button>
      </div>
      <div className="resource-tabs" role="group" aria-label="资料分类">
        {[
          ['equipment', '装备库', Shield],
          ['skins', '皮肤图录', Sparkles],
          ['updates', '版本动态', Radio],
        ].map(([key, label, Icon]) => {
          const I = Icon as typeof Shield;
          return (
            <button
              key={String(key)}
              className={tab === key ? 'active' : ''}
              aria-pressed={tab === key}
              onClick={() => {
                setTab(String(key));
                setQuery('');
                setLimit(48);
              }}
            >
              <I size={18} />
              {String(label)}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="pro-notice">
          {error}
          <button className="text-btn" onClick={() => void refresh()}>
            重试
          </button>
        </p>
      )}
      {result?.stale && <p className="pro-notice">{result.warning}</p>}
      {data && (
        <>
          <p className="data-caption">
            最近成功获取：{new Date(data.fetchedAt).toLocaleString('zh-CN')} · 服务运行期间每 15
            分钟检查（缓存期内沿用本次数据）。获取时间不等于游戏更新日期。
          </p>
          {tab === 'equipment' && (
            <>
              <div className="pro-toolbar">
                <label>
                  搜索装备
                  <input
                    value={query}
                    placeholder="名称 / 属性 / 被动关键词"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label>
                  装备分类
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    {['全部', '攻击', '法术', '防御', '移动', '打野', '游走'].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <span>
                  {equipment.length} / {data.equipment.length} 件
                </span>
              </div>
              <p className="pro-notice">
                先比较机制，再决定出装。选择最多 3
                件装备并排查看总价和效果。装备胜率、出场率暂无可靠公开统计，不能用价格或英雄胜率代替。
              </p>
              {chosen.length > 0 && (
                <section className="surface equipment-compare" aria-label="装备对比">
                  <h2>装备对比</h2>
                  <div className="equipment-grid">
                    {chosen.map((e) => (
                      <article key={e.id}>
                        <h3>
                          {e.name} · {e.price} 金
                        </h3>
                        <p className="resource-description">{e.description}</p>
                        <button
                          className="text-btn"
                          onClick={() => setCompared(compared.filter((id) => id !== e.id))}
                        >
                          移除 {e.name}
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <div className="equipment-grid">
                {equipment.map((e) => (
                  <article className="surface equipment-card" key={e.id}>
                    <div className="section-title">
                      <span className="outline-tag">{e.type}</span>
                      <strong>{e.price} 金</strong>
                    </div>
                    <h2 className="equipment-name">
                      <img
                        loading="lazy"
                        src={`https://game.gtimg.cn/images/yxzj/img201606/itemimg/${e.id}.jpg`}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                      {e.name}
                    </h2>
                    <p className="resource-description">{e.description}</p>
                    <div className="equipment-actions">
                      <button
                        className="btn secondary"
                        aria-pressed={compared.includes(e.id)}
                        disabled={!compared.includes(e.id) && compared.length >= 3}
                        onClick={() =>
                          setCompared(
                            compared.includes(e.id)
                              ? compared.filter((id) => id !== e.id)
                              : [...compared, e.id],
                          )
                        }
                      >
                        {compared.includes(e.id) ? '取消对比' : '加入对比'}
                      </button>
                      <a href={e.source} target="_blank" rel="noreferrer">
                        官方来源 ↗
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === 'skins' && (
            <>
              <div className="pro-toolbar">
                <label>
                  搜索皮肤
                  <input
                    value={query}
                    placeholder="皮肤 / 英雄 / 品质"
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setLimit(48);
                    }}
                  />
                </label>
                <label>
                  皮肤所属英雄
                  <select
                    value={hero}
                    onChange={(e) => {
                      setHero(e.target.value);
                      setLimit(48);
                    }}
                  >
                    <option>全部</option>
                    {heroes.map((h) => (
                      <option value={h.id} key={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span>
                  {skins.length} / {data.skins.length} 款
                </span>
              </div>
              <p className="pro-notice">
                这里是官方目录已公开的皮肤，不保证等于游戏全量。文案为官方介绍；使用率、时间趋势和独立评价仍待接入可核验来源。
              </p>
              <div className="skin-grid">
                {skins.slice(0, limit).map((s) => (
                  <article className="skin-card surface" key={s.id}>
                    {s.image && (
                      <img src={s.image} loading="lazy" alt={s.heroName + ' · ' + s.name} />
                    )}
                    <div>
                      <small>
                        {s.quality || '品质未标注'} · {s.releasedOn || '日期未标注'}
                      </small>
                      <h2>{s.name}</h2>
                      <button
                        className="text-btn"
                        onClick={() => {
                          const h = heroById(s.heroId);
                          if (h) onOpen(h);
                        }}
                      >
                        {s.heroName} · 查看图鉴 ↗
                      </button>
                      <p>{s.description || '暂无官方介绍'}</p>
                      <p className="data-caption">使用率 — · 暂无来源</p>
                    </div>
                  </article>
                ))}
              </div>
              {skins.length > limit && (
                <button className="btn secondary" onClick={() => setLimit(limit + 48)}>
                  继续显示 48 款（已显示 {limit}）
                </button>
              )}
            </>
          )}
          {tab === 'updates' && (
            <>
              <div className="pro-toolbar">
                <label>
                  公告环境
                  <select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
                    <option>正式服</option>
                    <option>体验服</option>
                    <option>全部</option>
                  </select>
                </label>
                <label>
                  搜索公告
                  <input
                    value={query}
                    placeholder="英雄 / 装备 / 标题"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <p className="pro-notice">
                展示最近 20
                条官方公告，正文提及可定位到英雄。体验服调整与正式服分开；发布时间不等于生效时间，具体改动请查原文。本模块还不提供全网打法的实时验证。
              </p>
              <div className="updates-list">
                {data.updates
                  .filter(
                    (u) =>
                      (environment === '全部' || u.environment === environment) &&
                      (!query || (u.title + u.text).includes(query)),
                  )
                  .map((u) => (
                    <Article key={u.id} article={u} />
                  ))}
              </div>
            </>
          )}
          {((tab === 'equipment' && !equipment.length) || (tab === 'skins' && !skins.length)) && (
            <p className="pro-notice">没有符合筛选条件的资料，请调整关键词。</p>
          )}
          <details className="resource-sources">
            <summary>数据来源与目录质量说明</summary>
            {data.sources.map((s) => (
              <p key={s}>
                <a href={s} target="_blank" rel="noreferrer">
                  {s}
                </a>
              </p>
            ))}
            {data.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </details>
        </>
      )}
      {!data && loading && <p role="status">正在读取官方资料，首次加载可能需要十几秒…</p>}
    </>
  );
}
